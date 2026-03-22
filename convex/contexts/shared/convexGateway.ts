'use node';

import type { Id } from '../../_generated/dataModel';
import { createCouncilAiProvider } from '../../ai/provider/factory';
import type {
  CouncilKBDocumentDigestHint,
  CouncilPersonalArchiveAccess,
} from '../../ai/provider/types';
import { listMemberChunkDocuments, searchMemberChunks } from '../../ai/ragStore';
import { searchPersonalArchiveChunks } from '../../ai/personalArchiveStore';
import type { ActionCtxLike, KBDigestRow } from './types';
import { setMainSpanAttributes } from '../../observability/wideEvents';
import { wideEventError } from '../../observability/errors';

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
      setTimeout(() => reject(wideEventError('runtime-timeout', `Timed out after ${timeoutMs}ms`)), timeoutMs)
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
      documentNames,
      limit,
      traceId: _traceId,
    }: {
      storeName: string;
      query: string;
      documentNames?: string[];
      limit?: number;
      traceId: string;
    }) => {
      setMainSpanAttributes({
        'knowledge.member_id': String(memberId),
        'knowledge.query.length': query.trim().length,
        'knowledge.document_filter_count': documentNames?.length ?? 0,
      });
      return await searchMemberChunks(ctx, {
        memberId,
        query,
        documentNames,
        limit,
      });
    },
  };
}

export function createPersonalArchiveRetriever(ctx: ActionCtxLike & { vectorSearch?: any }, userId: Id<'users'>) {
  return {
    listSources: async ({ access }: { access: CouncilPersonalArchiveAccess }) =>
      await runNamedQuery<{ availableBuckets: Array<'reflection' | 'cookie_jar' | 'accountability' | 'world_model'>; totalEntries: number }>(
        ctx,
        'personalArchive:getAccessibleSummary',
        { access },
      ),
    retrieve: async ({
      query,
      buckets,
      limit,
      traceId: _traceId,
    }: {
      query: string;
      buckets: Array<'reflection' | 'cookie_jar' | 'accountability' | 'world_model'>;
      limit?: number;
      traceId: string;
    }) => {
      setMainSpanAttributes({
        'archive.bucket_count': buckets.length,
        'archive.query.length': query.trim().length,
      });
      return await searchPersonalArchiveChunks(ctx, {
        userId,
        query,
        allowedBuckets: buckets,
        limit,
      });
    },
  };
}

export function toKBDigestHints(rows: KBDigestRow[]): CouncilKBDocumentDigestHint[] {
  return rows.map((item) => ({
    displayName: item.displayName,
    kbDocumentName: item.kbDocumentName,
    documentCard: {
      docType: item.documentCard?.docType ?? 'other',
      about: item.documentCard?.about ?? '',
      bestFor: item.documentCard?.bestFor ?? [],
      evidenceKinds: item.documentCard?.evidenceKinds ?? [],
      notFor: item.documentCard?.notFor ?? [],
    },
    queryHints: item.queryHints ?? [],
  }));
}
