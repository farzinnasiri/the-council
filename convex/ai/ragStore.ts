'use node';

import type { Id } from '../_generated/dataModel';
import { embedText, embedTexts } from './openaiEmbeddings';
import {
  CHUNK_OVERLAP,
  CHUNK_SIZE,
  EMBEDDING_BATCH_SIZE,
  MAX_INDEXED_CHUNKS,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
  UPSERT_BATCH_SIZE,
} from './ragConfig';

export interface RAGGroundedSnippet {
  text: string;
  citationIndices: number[];
}

export interface RAGEvidenceResult {
  retrievalText: string;
  citations: Array<{ title: string; uri?: string }>;
  snippets: RAGGroundedSnippet[];
  grounded: boolean;
}

export function splitIntoChunks(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    out.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return out;
}

export async function indexDocumentChunks(
  ctx: any,
  input: {
    memberId: Id<'members'>;
    storeName: string;
    documentName: string;
    displayName: string;
    text: string;
  }
): Promise<{ chunkCount: number }> {
  const cleaned = input.text.trim();
  if (!cleaned) {
    throw new Error(`No text to index for "${input.displayName}"`);
  }

  const splitChunks = splitIntoChunks(cleaned);
  if (splitChunks.length > MAX_INDEXED_CHUNKS) {
    throw new Error(
      `Document "${input.displayName}" is too large to index (${splitChunks.length} chunks > ${MAX_INDEXED_CHUNKS}).`
    );
  }

  const chunkSpecs = splitChunks
    .map((text, chunkIndex) => ({
      chunkIndex,
      text: text.trim(),
    }))
    .filter((chunk) => chunk.text.length > 0);

  if (chunkSpecs.length === 0) {
    throw new Error(`No non-empty chunks generated for "${input.displayName}"`);
  }

  await deleteDocumentChunks(ctx, {
    memberId: input.memberId,
    documentName: input.documentName,
  });

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
    const insertedBatch = await ctx.runMutation('kbDocumentChunks:upsertDocumentChunks', {
      memberId: input.memberId,
      kbStoreName: input.storeName,
      kbDocumentName: input.documentName,
      displayName: input.displayName,
      chunks: batch,
    });
    inserted += insertedBatch as number;
  }

  return { chunkCount: inserted };
}

export async function deleteDocumentChunks(
  ctx: any,
  input: {
    memberId: Id<'members'>;
    documentName: string;
  }
): Promise<{ deletedCount: number }> {
  let deletedCount = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = (await ctx.runMutation('kbDocumentChunks:deleteDocumentChunksBatch', {
      memberId: input.memberId,
      kbDocumentName: input.documentName,
      limit: 64,
    })) as { deletedCount: number; hasMore: boolean };
    deletedCount += batch.deletedCount ?? 0;
    hasMore = Boolean(batch.hasMore);
  }

  return { deletedCount };
}

export async function listMemberChunkDocuments(
  ctx: any,
  input: {
    memberId: Id<'members'>;
  }
): Promise<Array<{ name?: string; displayName?: string }>> {
  const digests = (await ctx.runQuery('kbDigests:listByMember', {
    memberId: input.memberId,
    includeDeleted: false,
  })) as Array<{ kbDocumentName?: string; displayName?: string }>;

  return digests.map((digest) => ({
    name: digest.kbDocumentName,
    displayName: digest.displayName ?? digest.kbDocumentName,
  }));
}

export async function searchMemberChunks(
  ctx: any,
  input: {
    memberId: Id<'members'>;
    query: string;
    limit?: number;
  }
): Promise<RAGEvidenceResult> {
  const normalizedQuery = input.query.trim();
  if (!normalizedQuery) {
    return {
      retrievalText: 'NO_EVIDENCE',
      citations: [],
      snippets: [],
      grounded: false,
    };
  }

  const limit = Math.min(Math.max(input.limit ?? SEARCH_LIMIT_DEFAULT, 1), SEARCH_LIMIT_MAX);
  const queryEmbedding = await embedText(normalizedQuery);
  const vectorResults = await ctx.vectorSearch('kbDocumentChunks', 'by_embedding', {
    vector: queryEmbedding,
    limit,
    filter: (q: any) => q.eq('memberId', input.memberId),
  });

  return (await ctx.runQuery('kbDocumentChunks:hydrateVectorResults', {
    memberId: input.memberId,
    vectorResults,
  })) as RAGEvidenceResult;
}
