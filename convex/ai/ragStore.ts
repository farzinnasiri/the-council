'use node';

import type { Id } from '../_generated/dataModel';
import { embedText } from './openaiEmbeddings';
import {
  CHUNK_OVERLAP,
  CHUNK_SIZE,
  MAX_EMBEDDED_CHUNKS,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
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

export function sampleChunks(chunks: string[]): Array<{ text: string; chunkIndex: number }> {
  if (chunks.length <= MAX_EMBEDDED_CHUNKS) {
    return chunks.map((text, index) => ({ text, chunkIndex: index }));
  }
  return Array.from({ length: MAX_EMBEDDED_CHUNKS }, (_, index) => {
    const chunkIndex = Math.floor((index * (chunks.length - 1)) / (MAX_EMBEDDED_CHUNKS - 1));
    return { text: chunks[chunkIndex], chunkIndex };
  });
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

  const chunkSpecs = sampleChunks(splitIntoChunks(cleaned));
  const chunks: Array<{ chunkIndex: number; text: string; embedding: number[] }> = [];
  for (const chunk of chunkSpecs) {
    const normalized = chunk.text.trim();
    if (!normalized) continue;
    const embedding = await embedText(normalized);
    chunks.push({
      chunkIndex: chunk.chunkIndex,
      text: normalized,
      embedding,
    });
  }

  if (chunks.length === 0) {
    throw new Error(`No non-empty chunks generated for "${input.displayName}"`);
  }

  const inserted = await ctx.runMutation('kbDocumentChunks:upsertDocumentChunks', {
    memberId: input.memberId,
    kbStoreName: input.storeName,
    kbDocumentName: input.documentName,
    displayName: input.displayName,
    chunks,
  });

  return { chunkCount: inserted as number };
}

export async function deleteDocumentChunks(
  ctx: any,
  input: {
    memberId: Id<'members'>;
    documentName: string;
  }
): Promise<{ deletedCount: number }> {
  const deleted = await ctx.runMutation('kbDocumentChunks:deleteDocumentChunks', {
    memberId: input.memberId,
    kbDocumentName: input.documentName,
  });
  return { deletedCount: deleted as number };
}

export async function listMemberChunkDocuments(
  ctx: any,
  input: {
    memberId: Id<'members'>;
  }
): Promise<Array<{ name?: string; displayName?: string }>> {
  return (await ctx.runQuery('kbDocumentChunks:listDocumentsByMember', {
    memberId: input.memberId,
  })) as Array<{ name?: string; displayName?: string }>;
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
