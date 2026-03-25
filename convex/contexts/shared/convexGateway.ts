'use node';

import { api } from '../../_generated/api';
import type { Id } from '../../_generated/dataModel';
import { createCouncilAiProvider } from '../../ai/provider/factory';
import type {
  CouncilKBDocumentDigestHint,
  CouncilPersonalSourceDigestHint,
} from '../../ai/provider/types';
import { listMemberChunkDocuments, searchMemberChunks } from '../../ai/ragStore';
import { searchPersonalSourceChunks } from '../../ai/personalSourceStore';
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

export function createPersonalSourceRetriever(
  ctx: ActionCtxLike & { vectorSearch?: any },
  userId: Id<'users'>,
  userName?: string,
) {
  return {
    listSources: async () => {
      const rows = (await runApiQuery<any[]>(ctx, api.personalSourceDigests.listByUser, {
        includeDeleted: false,
      })) as any[];
      const sources: CouncilPersonalSourceDigestHint[] = rows.map((row) => ({
        displayName: row.displayName,
        personalSourceName: row.personalSourceName,
        documentKinds: row.metadata?.documentKinds ?? [],
        semanticClasses: row.metadata?.semanticClasses ?? [],
        queryHints: row.metadata?.queryHints ?? [],
      }));
      return { sources };
    },
    retrieve: async ({
      query,
      targetDocumentKinds,
      targetSemanticClasses,
      candidateSourceCount,
      chunkLimitPerQuery,
      injectedSourceGroupCount,
      chunksPerSourceGroup,
      traceId: _traceId,
    }: {
      query: string;
      targetDocumentKinds?: string[];
      targetSemanticClasses?: string[];
      candidateSourceCount?: number;
      chunkLimitPerQuery?: number;
      injectedSourceGroupCount?: number;
      chunksPerSourceGroup?: number;
      traceId?: string;
    }) => {
      setMainSpanAttributes({
        'personal_source.query.length': query.trim().length,
      });
      return await searchPersonalSourceChunks(ctx, {
        userId,
        userName,
        query,
        targetDocumentKinds,
        targetSemanticClasses,
        candidateSourceCount,
        chunkLimitPerQuery,
        injectedSourceGroupCount,
        chunksPerSourceGroup,
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
