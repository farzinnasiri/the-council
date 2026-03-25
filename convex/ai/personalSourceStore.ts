'use node';

import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { embedText, embedTexts } from './openaiEmbeddings';
import {
  EMBEDDING_BATCH_SIZE,
  MAX_INDEXED_CHUNKS,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
  UPSERT_BATCH_SIZE,
  type KBChunkConfig,
  resolveKbChunkConfig,
  validateKbChunkConfig,
} from './ragConfig';
import { wideEventError } from '../observability/errors';

export function splitPersonalSourceChunks(text: string, chunkConfig?: Partial<KBChunkConfig> | null): string[] {
  const resolved = resolveKbChunkConfig(chunkConfig);
  const validationError = validateKbChunkConfig(resolved);
  if (validationError) {
    throw wideEventError('personal-source-chunk-config-invalid', validationError, {
      statusCode: 400,
    });
  }
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + resolved.chunkSizeChars, text.length);
    out.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - resolved.chunkOverlapChars;
  }
  return out;
}

export async function indexPersonalSourceChunks(
  ctx: any,
  input: {
    personalSourceName: string;
    displayName: string;
    text: string;
    chunkConfig?: Partial<KBChunkConfig> | null;
  },
): Promise<{ chunkCount: number }> {
  const cleaned = input.text.trim();
  if (!cleaned) {
    throw wideEventError('personal-source-index-text-missing', `No text to index for "${input.displayName}"`);
  }
  const splitChunks = splitPersonalSourceChunks(cleaned, input.chunkConfig);
  if (splitChunks.length > MAX_INDEXED_CHUNKS) {
    throw wideEventError(
      'personal-source-index-too-large',
      `Document "${input.displayName}" is too large to index (${splitChunks.length} chunks > ${MAX_INDEXED_CHUNKS}).`,
    );
  }

  await deletePersonalSourceChunks(ctx, { personalSourceName: input.personalSourceName });
  const chunkSpecs = splitChunks
    .map((text, chunkIndex) => ({ chunkIndex, text: text.trim() }))
    .filter((chunk) => chunk.text.length > 0);

  const chunks: Array<{ chunkIndex: number; text: string; embedding: number[] }> = [];
  for (let index = 0; index < chunkSpecs.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = chunkSpecs.slice(index, index + EMBEDDING_BATCH_SIZE);
    const vectors = await embedTexts(batch.map((item) => item.text));
    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      chunks.push({
        chunkIndex: batch[batchIndex].chunkIndex,
        text: batch[batchIndex].text,
        embedding: vectors[batchIndex],
      });
    }
  }

  let inserted = 0;
  for (let index = 0; index < chunks.length; index += UPSERT_BATCH_SIZE) {
    const batch = chunks.slice(index, index + UPSERT_BATCH_SIZE);
    inserted += await ctx.runMutation(api.personalSourceChunks.upsertSourceChunks as any, {
      personalSourceName: input.personalSourceName,
      displayName: input.displayName,
      chunks: batch,
    });
  }
  return { chunkCount: inserted };
}

export async function deletePersonalSourceChunks(
  ctx: any,
  input: {
    personalSourceName: string;
  },
): Promise<void> {
  let hasMore = true;
  while (hasMore) {
    const batch = await ctx.runMutation(api.personalSourceChunks.deleteSourceChunksBatch as any, {
      personalSourceName: input.personalSourceName,
      limit: 64,
    });
    hasMore = Boolean((batch as any).hasMore);
  }
}

function scorePersonalSourceDigest(
  digest: {
    personalSourceName: string;
    displayName: string;
    metadata?: {
      documentKinds?: string[];
      semanticClasses?: string[];
      queryHints?: string[];
    };
  },
  query: string,
  targetDocumentKinds?: string[],
  targetSemanticClasses?: string[],
): number {
  const normalizedQuery = query.toLowerCase();
  const documentKinds = digest.metadata?.documentKinds ?? [];
  const semanticClasses = digest.metadata?.semanticClasses ?? [];
  const queryHints = digest.metadata?.queryHints ?? [];
  let score = 0;
  if (targetDocumentKinds?.length) {
    score += documentKinds.filter((kind) => targetDocumentKinds.includes(kind)).length * 2.2;
  }
  if (targetSemanticClasses?.length) {
    score += semanticClasses.filter((kind) => targetSemanticClasses.includes(kind)).length * 2.6;
  }
  if (digest.displayName.toLowerCase().includes(normalizedQuery)) score += 1.5;
  score += queryHints.filter((hint) => normalizedQuery.includes(hint) || hint.includes(normalizedQuery)).length * 0.7;
  return score;
}

function buildFramingLine(input: {
  userName?: string;
  documentKinds: string[];
  semanticClasses: string[];
}): string {
  const userLabel = input.userName?.trim() || 'The user';
  const kind = input.documentKinds[0];
  const classes = input.semanticClasses.slice(0, 2);
  if (kind && classes.length) {
    return `${userLabel}, in a ${kind.replace(/_/g, '-')}-style personal document discussing ${classes.join(' and ')}, wrote:`;
  }
  if (kind) {
    return `${userLabel}, in a ${kind.replace(/_/g, '-')}-style personal document, wrote:`;
  }
  if (classes.length) {
    return `${userLabel}, in a personal document discussing ${classes.join(' and ')}, wrote:`;
  }
  return `${userLabel}, in a personal document, wrote:`;
}

export async function searchPersonalSourceChunks(
  ctx: any,
  input: {
    userId: Id<'users'>;
    userName?: string;
    query: string;
    targetDocumentKinds?: string[];
    targetSemanticClasses?: string[];
    candidateSourceCount?: number;
    chunkLimitPerQuery?: number;
    injectedSourceGroupCount?: number;
    chunksPerSourceGroup?: number;
  },
): Promise<{
    retrievalText: string;
    citations: Array<{ title: string; uri?: string }>;
    snippets: Array<{ text: string; citationIndices: number[] }>;
    grounded: boolean;
  }> {
  const normalizedQuery = input.query.trim();
  if (!normalizedQuery) {
    return { retrievalText: 'NO_EVIDENCE', citations: [], snippets: [], grounded: false };
  }

  const digests = (await ctx.runQuery(api.personalSourceDigests.listByUser as any, {
    includeDeleted: false,
  })) as Array<any>;
  const rankedDigests = digests
    .map((digest) => ({
      digest,
      score: scorePersonalSourceDigest(digest, normalizedQuery, input.targetDocumentKinds, input.targetSemanticClasses),
    }))
    .sort((left, right) => right.score - left.score);
  const shortlisted = rankedDigests
    .filter((row) => row.score > 0)
    .slice(0, Math.max(1, input.candidateSourceCount ?? 3))
    .map((row) => row.digest);
  const fallbackShortlist =
    shortlisted.length > 0
      ? shortlisted
      : rankedDigests.slice(0, Math.max(1, input.candidateSourceCount ?? 3)).map((row) => row.digest);

  if (!fallbackShortlist.length) {
    return { retrievalText: 'NO_EVIDENCE', citations: [], snippets: [], grounded: false };
  }

  const queryEmbedding = await embedText(normalizedQuery, { source: 'personal_source_query' });
  const vectorResults = await ctx.vectorSearch('personalSourceChunks', 'by_embedding', {
    vector: queryEmbedding,
    limit: Math.min(Math.max(input.chunkLimitPerQuery ?? SEARCH_LIMIT_DEFAULT, 1), SEARCH_LIMIT_MAX),
      filter: (q: any) =>
        q.or(
          ...fallbackShortlist.map((digest: any) => q.eq('personalSourceName', digest.personalSourceName)),
        ),
  });
  const hydrated = (await ctx.runQuery(api.personalSourceChunks.hydrateVectorResults as any, {
    vectorResults,
  })) as Array<any>;

  const hydratedBySource = new Map<string, Array<any>>();
  for (const row of hydrated) {
    const bucket = hydratedBySource.get(row.personalSourceName) ?? [];
    bucket.push(row);
    hydratedBySource.set(row.personalSourceName, bucket);
  }

  const selectedSources = fallbackShortlist.slice(0, Math.max(1, input.injectedSourceGroupCount ?? 2));
  const citations: Array<{ title: string; uri?: string }> = [];
  const snippets: Array<{ text: string; citationIndices: number[] }> = [];

  for (const source of selectedSources) {
    const sourceChunks = (hydratedBySource.get(source.personalSourceName) ?? []).slice(
      0,
      Math.max(1, input.chunksPerSourceGroup ?? 1),
    );
    if (!sourceChunks.length) continue;
    const citationIndex = citations.length;
    citations.push({
      title: source.displayName,
      uri: undefined,
    });
    snippets.push({
      text: [
        buildFramingLine({
          userName: input.userName,
          documentKinds: source.metadata?.documentKinds ?? [],
          semanticClasses: source.metadata?.semanticClasses ?? [],
        }),
        ...sourceChunks.map((chunk: any) => `"${chunk.text}"`),
      ].join('\n'),
      citationIndices: [citationIndex],
    });
  }

  const retrievalText = snippets.length
    ? snippets
        .map((snippet, index) => {
          const ref = snippet.citationIndices.map((value) => `S${value + 1}`).join(',');
          return `[${ref}] ${snippet.text}`;
        })
        .join('\n\n')
    : 'NO_EVIDENCE';

  return {
    retrievalText,
    citations,
    snippets,
    grounded: snippets.length > 0,
  };
}
