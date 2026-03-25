'use node';

import { action } from '../_generated/server';
import { api } from '../_generated/api';
import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { extractTextFromStorage } from './ragExtraction';
import { deletePersonalSourceChunks, indexPersonalSourceChunks } from './personalSourceStore';
import { runPersonalSourceDigestGraph } from './graphs/personalSourceDigestGraph';
import { resolveKbChunkConfig } from './ragConfig';
import { sanitizeLabel } from './graphs/utils';
import { observeAction, setMainSpanAttributes } from '../observability/wideEvents';
import { wideEventError } from '../observability/errors';

type ProcessingMode = 'all' | 'index-only' | 'metadata-only';
type PersonalSourceRow = Doc<'personalSourceDocuments'>;

function buildPersonalSourceName(file: { displayName: string; storageId: string }): string {
  const display = sanitizeLabel(file.displayName || 'source');
  const suffix = `${file.storageId}`.slice(-12).replace(/[^a-z0-9]+/gi, '').toLowerCase();
  return `personal-sources/${display}-${suffix || 'file'}`;
}

async function processPersonalSourceLifecycle(
  ctx: any,
  personalSourceDocumentId: Id<'personalSourceDocuments'>,
  mode: ProcessingMode,
): Promise<PersonalSourceRow | null> {
  const row = (await ctx.runQuery(api.personalSourceDocuments.getById as any, {
    personalSourceDocumentId,
    includeDeleted: false,
  })) as PersonalSourceRow | null;
  if (!row) {
    throw wideEventError('personal-source-not-found', 'Personal source not found', { statusCode: 404 });
  }

  const chunkConfig = resolveKbChunkConfig({
    chunkSizeChars: row.chunkSizeChars,
    chunkOverlapChars: row.chunkOverlapChars,
  });
  const runIndex = mode !== 'metadata-only';
  const runMetadata = mode !== 'index-only';

  const extractedText = await extractTextFromStorage(ctx, {
    storageId: row.storageId,
    displayName: row.displayName,
    mimeType: row.mimeType,
  });

  if (runIndex) {
    await ctx.runMutation(api.personalSourceDocuments.patchRecord as any, {
      personalSourceDocumentId,
      chunkingStatus: 'running',
      indexingStatus: 'pending',
      ingestErrorChunking: '',
      ingestErrorIndexing: '',
    });
    try {
      const indexed = await indexPersonalSourceChunks(ctx, {
        personalSourceName: row.personalSourceName,
        displayName: row.displayName,
        text: extractedText,
        chunkConfig,
      });
      await ctx.runMutation(api.personalSourceDocuments.patchRecord as any, {
        personalSourceDocumentId,
        chunkingStatus: 'completed',
        indexingStatus: 'completed',
        chunkCountTotal: indexed.chunkCount,
        chunkCountIndexed: indexed.chunkCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Personal source indexing failed';
      await ctx.runMutation(api.personalSourceDocuments.patchRecord as any, {
        personalSourceDocumentId,
        chunkingStatus: 'failed',
        indexingStatus: 'failed',
        ingestErrorChunking: message,
        ingestErrorIndexing: message,
      });
    }
  }

  if (runMetadata) {
    await ctx.runMutation(api.personalSourceDocuments.patchRecord as any, {
      personalSourceDocumentId,
      metadataStatus: 'running',
      ingestErrorMetadata: '',
    });
    try {
      const digest = await runPersonalSourceDigestGraph({
        displayName: row.displayName,
        sampleText: extractedText.slice(0, 12000),
      });
      await ctx.runMutation(api.personalSourceDigests.upsertForDocument as any, {
        personalSourceName: row.personalSourceName,
        displayName: row.displayName,
        storageId: row.storageId,
        metadata: {
          documentKinds: digest.documentKinds,
          semanticClasses: digest.semanticClasses,
          queryHints: digest.queryHints,
          voice: digest.voice,
        },
      });
      await ctx.runMutation(api.personalSourceDocuments.patchRecord as any, {
        personalSourceDocumentId,
        metadataStatus: 'completed',
        ingestErrorMetadata: '',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Personal source metadata failed';
      await ctx.runMutation(api.personalSourceDocuments.patchRecord as any, {
        personalSourceDocumentId,
        metadataStatus: 'failed',
        ingestErrorMetadata: message,
      });
    }
  }

  return (await ctx.runQuery(api.personalSourceDocuments.getById as any, {
    personalSourceDocumentId,
    includeDeleted: false,
  })) as PersonalSourceRow | null;
}

export const createPersonalSourceRecord = action({
  args: {
    stagedFile: v.object({
      storageId: v.id('_storage'),
      displayName: v.string(),
      mimeType: v.optional(v.string()),
      sizeBytes: v.optional(v.number()),
    }),
    chunkConfig: v.optional(v.object({
      chunkSizeChars: v.optional(v.number()),
      chunkOverlapChars: v.optional(v.number()),
    })),
  },
  returns: v.object({
    personalSourceDocumentId: v.id('personalSourceDocuments'),
    document: v.any(),
  }),
  handler: observeAction('ai.personalSources.createRecord', async (
    ctx,
    args,
  ): Promise<{ personalSourceDocumentId: Id<'personalSourceDocuments'>; document: PersonalSourceRow | null }> => {
    const personalSourceName = buildPersonalSourceName({
      displayName: args.stagedFile.displayName,
      storageId: args.stagedFile.storageId,
    });
    const personalSourceDocumentId: Id<'personalSourceDocuments'> = await ctx.runMutation(api.personalSourceDocuments.createRecord as any, {
      storageId: args.stagedFile.storageId,
      displayName: args.stagedFile.displayName,
      mimeType: args.stagedFile.mimeType,
      sizeBytes: args.stagedFile.sizeBytes,
      personalSourceName,
      chunkSizeChars: args.chunkConfig?.chunkSizeChars,
      chunkOverlapChars: args.chunkConfig?.chunkOverlapChars,
    });
    const document: PersonalSourceRow | null = await ctx.runQuery(api.personalSourceDocuments.getById as any, {
      personalSourceDocumentId,
      includeDeleted: false,
    });
    return {
      personalSourceDocumentId,
      document,
    };
  }),
});

export const processPersonalSource = action({
  args: {
    personalSourceDocumentId: v.id('personalSourceDocuments'),
  },
  returns: v.object({
    ok: v.boolean(),
    document: v.any(),
  }),
  handler: observeAction('ai.personalSources.process', async (ctx, args) => {
    setMainSpanAttributes({ 'personal_source.document_id': String(args.personalSourceDocumentId) });
    const document = await processPersonalSourceLifecycle(ctx, args.personalSourceDocumentId, 'all');
    return {
      ok: Boolean(document),
      document,
    };
  }),
});

export const reprocessPersonalSource = action({
  args: {
    personalSourceDocumentId: v.id('personalSourceDocuments'),
    chunkConfig: v.optional(v.object({
      chunkSizeChars: v.optional(v.number()),
      chunkOverlapChars: v.optional(v.number()),
    })),
  },
  returns: v.object({
    ok: v.boolean(),
    document: v.any(),
  }),
  handler: observeAction('ai.personalSources.reprocess', async (ctx, args) => {
    if (args.chunkConfig) {
      await ctx.runMutation(api.personalSourceDocuments.patchRecord as any, {
        personalSourceDocumentId: args.personalSourceDocumentId,
        chunkSizeChars: args.chunkConfig.chunkSizeChars,
        chunkOverlapChars: args.chunkConfig.chunkOverlapChars,
      });
    }
    const document = await processPersonalSourceLifecycle(ctx, args.personalSourceDocumentId, 'all');
    return {
      ok: Boolean(document),
      document,
    };
  }),
});

export const listPersonalSources = action({
  args: {},
  returns: v.array(v.any()),
  handler: observeAction('ai.personalSources.list', async (ctx): Promise<PersonalSourceRow[]> => {
    return (await ctx.runQuery(api.personalSourceDocuments.listByUser as any, {
      includeDeleted: false,
    })) as PersonalSourceRow[];
  }),
});

export const deletePersonalSource = action({
  args: {
    personalSourceDocumentId: v.id('personalSourceDocuments'),
  },
  returns: v.object({
    ok: v.boolean(),
  }),
  handler: observeAction('ai.personalSources.delete', async (ctx, args) => {
    const row = (await ctx.runQuery(api.personalSourceDocuments.getById as any, {
      personalSourceDocumentId: args.personalSourceDocumentId,
      includeDeleted: false,
    })) as PersonalSourceRow | null;
    if (!row) {
      return { ok: true };
    }
    await ctx.runMutation(api.personalSourceDocuments.markDeleted as any, {
      personalSourceDocumentId: args.personalSourceDocumentId,
    });
    await ctx.runMutation(api.personalSourceDigests.markDeletedBySource as any, {
      personalSourceName: row.personalSourceName,
    });
    await deletePersonalSourceChunks(ctx, {
      personalSourceName: row.personalSourceName,
    });
    return { ok: true };
  }),
});
