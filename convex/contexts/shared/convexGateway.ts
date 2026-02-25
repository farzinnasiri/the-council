'use node';

import type { Id } from '../../_generated/dataModel';
import { createCouncilAiProvider } from '../../ai/provider/factory';
import type { CouncilKBDocumentDigestHint } from '../../ai/provider/types';
import { listMemberChunkDocuments, searchMemberChunks } from '../../ai/ragStore';
import type { ActionCtxLike, KBDigestRow } from './types';

export async function runApiQuery<TResult>(
  ctx: ActionCtxLike,
  reference: unknown,
  args: Record<string, unknown>
): Promise<TResult> {
  return (await ctx.runQuery(reference, args)) as TResult;
}

export async function runNamedQuery<TResult>(
  ctx: ActionCtxLike,
  reference: string,
  args: Record<string, unknown>
): Promise<TResult> {
  return (await ctx.runQuery(reference, args)) as TResult;
}

export async function runNamedMutation<TResult>(
  ctx: ActionCtxLike,
  reference: string,
  args: Record<string, unknown>
): Promise<TResult> {
  return (await ctx.runMutation(reference, args)) as TResult;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

export function createAiProvider() {
  return createCouncilAiProvider();
}

export function createKnowledgeRetriever(ctx: ActionCtxLike, memberId: Id<'members'>) {
  return {
    listDocuments: async ({ storeName: _storeName }: { storeName: string }) =>
      await listMemberChunkDocuments(ctx, { memberId }),
    retrieve: async ({
      storeName: _storeName,
      query,
      limit,
      metadataFilter: _metadataFilter,
      traceId: _traceId,
    }: {
      storeName: string;
      query: string;
      limit?: number;
      metadataFilter?: string;
      traceId: string;
    }) =>
      await searchMemberChunks(ctx, {
        memberId,
        query,
        limit,
      }),
  };
}

export function toKBDigestHints(rows: KBDigestRow[]): CouncilKBDocumentDigestHint[] {
  return rows.map((item) => ({
    displayName: item.displayName,
    kbDocumentName: item.kbDocumentName,
    topics: item.topics ?? [],
    entities: item.entities ?? [],
    lexicalAnchors: item.lexicalAnchors ?? [],
    styleAnchors: item.styleAnchors ?? [],
    digestSummary: item.digestSummary ?? '',
  }));
}
