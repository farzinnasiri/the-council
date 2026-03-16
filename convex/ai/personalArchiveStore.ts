'use node';

import type { Id } from '../_generated/dataModel';
import { embedText, embedTexts } from './openaiEmbeddings';
import type { PersonalArchiveBucket } from '../personalArchiveShared';
import { wideEventError } from '../observability/errors';

const ARCHIVE_CHUNK_SIZE = 420;
const ARCHIVE_CHUNK_OVERLAP = 60;
const ARCHIVE_MAX_CHUNKS = 64;
const ARCHIVE_RETRIEVAL_LIMIT = 3;
const ARCHIVE_VECTOR_PROBE_LIMIT = 12;
const EMBEDDING_BATCH_SIZE = 16;

export function splitPersonalArchiveChunks(text: string): string[] {
  const cleaned = text.trim();
  const out: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + ARCHIVE_CHUNK_SIZE, cleaned.length);
    out.push(cleaned.slice(start, end));
    if (end >= cleaned.length) break;
    start = end - ARCHIVE_CHUNK_OVERLAP;
  }
  return out;
}

export async function indexPersonalArchiveEntry(
  ctx: any,
  input: {
    entryId: Id<'personalArchiveEntries'>;
    bucket: PersonalArchiveBucket;
    title?: string;
    text: string;
  }
): Promise<{ chunkCount: number }> {
  const splitChunks = splitPersonalArchiveChunks(input.text).filter(Boolean);
  if (!splitChunks.length) {
    await ctx.runMutation('personalArchiveChunks:deleteEntryChunks', {
      entryId: input.entryId,
    });
    return { chunkCount: 0 };
  }
  if (splitChunks.length > ARCHIVE_MAX_CHUNKS) {
    throw wideEventError(
      'archive-entry-too-large-to-index',
      `Personal Archive entry is too large to index (${splitChunks.length} chunks).`
    );
  }

  const embedded: Array<{ chunkIndex: number; text: string; embedding: number[] }> = [];
  for (let index = 0; index < splitChunks.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = splitChunks.slice(index, index + EMBEDDING_BATCH_SIZE);
    const vectors = await embedTexts(batch);
    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      embedded.push({
        chunkIndex: index + batchIndex,
        text: batch[batchIndex].trim(),
        embedding: vectors[batchIndex],
      });
    }
  }

  const inserted = (await ctx.runMutation('personalArchiveChunks:replaceEntryChunks', {
    entryId: input.entryId,
    bucket: input.bucket,
    title: input.title,
    chunks: embedded,
  })) as number;

  return { chunkCount: inserted };
}

export async function deletePersonalArchiveEntryIndex(
  ctx: any,
  input: {
    entryId: Id<'personalArchiveEntries'>;
  }
): Promise<void> {
  await ctx.runMutation('personalArchiveChunks:deleteEntryChunks', {
    entryId: input.entryId,
  });
}

export async function searchPersonalArchiveChunks(
  ctx: any,
  input: {
    userId: Id<'users'>;
    query: string;
    allowedBuckets: PersonalArchiveBucket[];
    limit?: number;
  }
): Promise<{
  retrievalText: string;
  citations: Array<{ title: string; uri?: string }>;
  snippets: Array<{ text: string; citationIndices: number[] }>;
  grounded: boolean;
}> {
  if (!input.allowedBuckets.length || !input.query.trim()) {
    return {
      retrievalText: 'NO_EVIDENCE',
      citations: [],
      snippets: [],
      grounded: false,
    };
  }

  const queryEmbedding = await embedText(input.query.trim());
  const vectorResults = await ctx.vectorSearch('personalArchiveChunks', 'by_embedding', {
    vector: queryEmbedding,
    limit: Math.max(input.limit ?? ARCHIVE_VECTOR_PROBE_LIMIT, ARCHIVE_VECTOR_PROBE_LIMIT),
    filter: (q: any) => q.eq('userId', input.userId),
  });

  return (await ctx.runQuery('personalArchiveChunks:hydrateVectorResults', {
    vectorResults,
    allowedBuckets: input.allowedBuckets,
    limit: input.limit ?? ARCHIVE_RETRIEVAL_LIMIT,
  })) as {
    retrievalText: string;
    citations: Array<{ title: string; uri?: string }>;
    snippets: Array<{ text: string; citationIndices: number[] }>;
    grounded: boolean;
  };
}
