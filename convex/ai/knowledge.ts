'use node';

import { action } from '../_generated/server';
import { api } from '../_generated/api';
import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { ActionCtx } from '../_generated/server';
import { stagedUploadInputValidator } from '../contexts/shared/contracts';
import { ensureMemberKnowledgeStoreUseCase } from '../contexts/knowledge/application/ensureMemberKnowledgeStore';
import { uploadMemberDocumentsUseCase } from '../contexts/knowledge/application/uploadMemberDocuments';
import { listMemberKnowledgeDocumentsUseCase } from '../contexts/knowledge/application/listMemberKnowledgeDocuments';
import { deleteMemberKnowledgeDocumentUseCase } from '../contexts/knowledge/application/deleteMemberKnowledgeDocument';
import { rehydrateMemberKnowledgeStoreUseCase } from '../contexts/knowledge/application/rehydrateMemberKnowledgeStore';
import { purgeExpiredStagedKnowledgeDocumentsUseCase } from '../contexts/knowledge/application/purgeExpiredStagedKnowledgeDocuments';
import { rebuildMemberKnowledgeDigestsUseCase } from '../contexts/knowledge/application/rebuildMemberKnowledgeDigests';
import { requireOwnedMember } from '../contexts/shared/auth';
import { createKnowledgeAiProvider } from '../contexts/knowledge/infrastructure/knowledgeIngestGateway';
import { KB_RETENTION_MS, ensureMemberStore } from './kbIngest';
import { extractTextFromStorage } from './ragExtraction';
import { deleteDocumentChunks, indexDocumentChunks, listMemberChunkDocuments, searchMemberChunks, splitIntoChunks } from './ragStore';
import { sanitizeLabel } from './graphs/utils';

const DIGEST_SAMPLE_CHAR_LIMIT = 6000;

type ProcessingMode = 'all' | 'index-only' | 'metadata-only';
type KbDocumentRow = Doc<'kbDocuments'>;

function normalizeDigestItems(items: string[], min: number, max: number): string[] {
  return items
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => item.slice(0, 80))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, max)
    .slice(0, Math.max(min, Math.min(max, items.length || min)));
}

function buildDocumentName(storeName: string, file: { displayName: string; storageId: string }): string {
  const display = sanitizeLabel(file.displayName || 'document');
  const suffix = `${file.storageId}`.slice(-12).replace(/[^a-z0-9]+/gi, '').toLowerCase();
  return `${storeName}/documents/${display}-${suffix || 'file'}`;
}

async function processKbDocumentLifecycle(
  ctx: ActionCtx,
  kbDocumentId: Id<'kbDocuments'>,
  mode: ProcessingMode
): Promise<KbDocumentRow | null> {
  const row = (await ctx.runQuery(api.kbDocuments.getById as any, {
    kbDocumentId,
    includeDeleted: false,
  })) as KbDocumentRow | null;
  if (!row) {
    throw new Error('KB document not found');
  }

  await requireOwnedMember(ctx, row.memberId);

  const runIndex = mode !== 'metadata-only';
  const runMetadata = mode !== 'index-only';

  let extractedText: string;
  try {
    extractedText = await extractTextFromStorage(ctx, {
      storageId: row.storageId,
      displayName: row.displayName,
      mimeType: row.mimeType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Document extraction failed';
    if (runIndex) {
      await ctx.runMutation(api.kbDocuments.patchRecord as any, {
        kbDocumentId,
        chunkingStatus: 'failed',
        indexingStatus: 'failed',
        ingestErrorChunking: message,
        ingestErrorIndexing: message,
      });
    }
    if (runMetadata) {
      await ctx.runMutation(api.kbDocuments.patchRecord as any, {
        kbDocumentId,
        metadataStatus: 'failed',
        ingestErrorMetadata: message,
      });
    }
    return (await ctx.runQuery(api.kbDocuments.getById as any, {
      kbDocumentId,
      includeDeleted: false,
    })) as KbDocumentRow | null;
  }

  const tasks: Array<Promise<void>> = [];

  if (runIndex) {
    tasks.push(
      (async () => {
        await ctx.runMutation(api.kbDocuments.patchRecord as any, {
          kbDocumentId,
          chunkingStatus: 'running',
          indexingStatus: 'pending',
          ingestErrorChunking: '',
          ingestErrorIndexing: '',
        });

        try {
          const chunkCountTotal = splitIntoChunks(extractedText).length;
          await ctx.runMutation(api.kbDocuments.patchRecord as any, {
            kbDocumentId,
            chunkCountTotal,
            chunkingStatus: 'completed',
            indexingStatus: 'running',
          });

          const indexed = await indexDocumentChunks(ctx, {
            memberId: row.memberId,
            storeName: row.kbStoreName,
            documentName: row.kbDocumentName,
            displayName: row.displayName,
            text: extractedText,
          });

          await ctx.runMutation(api.kbDocuments.patchRecord as any, {
            kbDocumentId,
            indexingStatus: 'completed',
            chunkCountIndexed: indexed.chunkCount,
            ingestErrorIndexing: '',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Indexing failed';
          await ctx.runMutation(api.kbDocuments.patchRecord as any, {
            kbDocumentId,
            chunkingStatus: row.chunkingStatus === 'completed' ? 'completed' : 'failed',
            indexingStatus: 'failed',
            ingestErrorIndexing: message,
            ingestErrorChunking: row.chunkingStatus === 'completed' ? '' : message,
          });
        }
      })()
    );
  }

  if (runMetadata) {
    tasks.push(
      (async () => {
        await ctx.runMutation(api.kbDocuments.patchRecord as any, {
          kbDocumentId,
          metadataStatus: 'running',
          ingestErrorMetadata: '',
        });

        try {
          const provider = createKnowledgeAiProvider();
          const digest = await provider.summarizeDocumentDigest({
            displayName: row.displayName,
            sampleText: extractedText.slice(0, DIGEST_SAMPLE_CHAR_LIMIT),
          });

          await ctx.runMutation(api.kbDigests.upsertForDocument as any, {
            memberId: row.memberId,
            kbStoreName: row.kbStoreName,
            kbDocumentName: row.kbDocumentName,
            displayName: row.displayName,
            storageId: row.storageId,
            topics: normalizeDigestItems(digest.topics, 3, 8),
            entities: normalizeDigestItems(digest.entities, 3, 12),
            lexicalAnchors: normalizeDigestItems(digest.lexicalAnchors, 3, 12),
            styleAnchors: normalizeDigestItems(digest.styleAnchors, 3, 8),
            digestSummary: digest.digestSummary.slice(0, 300),
            status: 'active',
            updatedAt: Date.now(),
            deletedAt: undefined,
          });

          await ctx.runMutation(api.kbDocuments.patchRecord as any, {
            kbDocumentId,
            metadataStatus: 'completed',
            ingestErrorMetadata: '',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Metadata extraction failed';
          await ctx.runMutation(api.kbDocuments.patchRecord as any, {
            kbDocumentId,
            metadataStatus: 'failed',
            ingestErrorMetadata: message,
          });
        }
      })()
    );
  }

  await Promise.all(tasks);

  await ctx.runMutation(api.kbStagedDocuments.markDeletedByDocument as any, {
    memberId: row.memberId,
    kbDocumentName: row.kbDocumentName,
    storageId: row.storageId,
    deletedAt: Date.now(),
  });

  return (await ctx.runQuery(api.kbDocuments.getById as any, {
    kbDocumentId,
    includeDeleted: false,
  })) as KbDocumentRow | null;
}

export const ensureMemberKnowledgeStore = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => await ensureMemberKnowledgeStoreUseCase(ctx, args),
});

export const uploadMemberDocuments = action({
  args: {
    memberId: v.id('members'),
    stagedFiles: v.array(stagedUploadInputValidator),
  },
  handler: async (ctx, args) => await uploadMemberDocumentsUseCase(ctx, args),
});

export const listMemberKnowledgeDocuments = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => await listMemberKnowledgeDocumentsUseCase(ctx, args),
});

export const deleteMemberKnowledgeDocument = action({
  args: {
    memberId: v.id('members'),
    documentName: v.string(),
  },
  handler: async (ctx, args) => await deleteMemberKnowledgeDocumentUseCase(ctx, args),
});

export const rehydrateMemberKnowledgeStore = action({
  args: {
    memberId: v.id('members'),
    mode: v.optional(v.union(v.literal('missing-only'), v.literal('all'))),
  },
  handler: async (ctx, args) => await rehydrateMemberKnowledgeStoreUseCase(ctx, args),
});

export const purgeExpiredStagedKnowledgeDocuments = action({
  args: {
    memberId: v.optional(v.id('members')),
  },
  handler: async (ctx, args) => await purgeExpiredStagedKnowledgeDocumentsUseCase(ctx, args),
});

export const rebuildMemberKnowledgeDigests = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => await rebuildMemberKnowledgeDigestsUseCase(ctx, args),
});

export const createKbDocumentRecord = action({
  args: {
    memberId: v.id('members'),
    stagedFile: stagedUploadInputValidator,
  },
  handler: async (
    ctx,
    args
  ): Promise<{ kbDocumentId: Id<'kbDocuments'>; document: KbDocumentRow | null }> => {
    const ensured = await ensureMemberStore(ctx, args.memberId);
    const storeName = ensured.storeName;
    const documentName = buildDocumentName(storeName, {
      displayName: args.stagedFile.displayName,
      storageId: args.stagedFile.storageId,
    });

    const kbDocumentId = (await ctx.runMutation(api.kbDocuments.createRecord as any, {
      memberId: args.memberId,
      storageId: args.stagedFile.storageId,
      displayName: args.stagedFile.displayName,
      mimeType: args.stagedFile.mimeType,
      sizeBytes: args.stagedFile.sizeBytes,
      kbStoreName: storeName,
      kbDocumentName: documentName,
      createdAt: Date.now(),
    })) as Id<'kbDocuments'>;

    await ctx.runMutation(api.kbStagedDocuments.createRecord as any, {
      memberId: args.memberId,
      storageId: args.stagedFile.storageId,
      displayName: args.stagedFile.displayName,
      mimeType: args.stagedFile.mimeType,
      sizeBytes: args.stagedFile.sizeBytes,
      kbStoreName: storeName,
      status: 'staged',
      kbDocumentName: documentName,
      createdAt: Date.now(),
      expiresAt: Date.now() + KB_RETENTION_MS,
    });

    const row = (await ctx.runQuery(api.kbDocuments.getById as any, {
      kbDocumentId,
      includeDeleted: false,
    })) as KbDocumentRow | null;
    return {
      kbDocumentId,
      document: row,
    };
  },
});

export const startKbDocumentProcessing = action({
  args: {
    kbDocumentId: v.id('kbDocuments'),
  },
  handler: async (ctx, args): Promise<{ ok: true; document: KbDocumentRow | null }> => ({
    ok: true,
    document: await processKbDocumentLifecycle(ctx, args.kbDocumentId, 'all'),
  }),
});

export const retryKbDocumentIndexing = action({
  args: {
    kbDocumentId: v.id('kbDocuments'),
  },
  handler: async (ctx, args): Promise<{ ok: true; document: KbDocumentRow | null }> => ({
    ok: true,
    document: await processKbDocumentLifecycle(ctx, args.kbDocumentId, 'index-only'),
  }),
});

export const retryKbDocumentMetadata = action({
  args: {
    kbDocumentId: v.id('kbDocuments'),
  },
  handler: async (ctx, args): Promise<{ ok: true; document: KbDocumentRow | null }> => ({
    ok: true,
    document: await processKbDocumentLifecycle(ctx, args.kbDocumentId, 'metadata-only'),
  }),
});

export const listKbDocumentsByMember = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args): Promise<KbDocumentRow[]> => {
    await requireOwnedMember(ctx, args.memberId);
    return (await ctx.runQuery(api.kbDocuments.listByMember as any, {
      memberId: args.memberId,
      includeDeleted: false,
    })) as KbDocumentRow[];
  },
});

export const deleteKbDocument = action({
  args: {
    kbDocumentId: v.id('kbDocuments'),
  },
  handler: async (
    ctx,
    args
  ): Promise<
    | { ok: true; alreadyDeleted: true; deletedChunkCount: 0; clearedStoreName: false }
    | { ok: true; alreadyDeleted: false; deletedChunkCount: number; clearedStoreName: boolean }
    | { ok: false; error: string }
  > => {
    const row = (await ctx.runQuery(api.kbDocuments.getById as any, {
      kbDocumentId: args.kbDocumentId,
      includeDeleted: true,
    })) as KbDocumentRow | null;
    if (!row || row.deletedAt || row.status === 'deleted') {
      return { ok: true, alreadyDeleted: true, deletedChunkCount: 0, clearedStoreName: false };
    }

    await requireOwnedMember(ctx, row.memberId);

    try {
      let deletedChunkCount = 0;
      if (row.kbDocumentName) {
        const deleted = await deleteDocumentChunks(ctx, {
          memberId: row.memberId,
          documentName: row.kbDocumentName,
        });
        deletedChunkCount = deleted.deletedCount;
        await ctx.runMutation(api.kbDigests.markDeletedByDocument as any, {
          memberId: row.memberId,
          kbDocumentName: row.kbDocumentName,
        });
      }

      await ctx.runMutation(api.kbStagedDocuments.markDeletedByDocument as any, {
        memberId: row.memberId,
        kbDocumentName: row.kbDocumentName,
        storageId: row.storageId,
        deletedAt: Date.now(),
      });

      await ctx.storage.delete(row.storageId);

      await ctx.runMutation(api.kbDocuments.markDeleted as any, {
        kbDocumentId: args.kbDocumentId,
        deletedAt: Date.now(),
      });

      const activeCount = await ctx.runQuery(api.kbDocuments.countActiveByMember as any, {
        memberId: row.memberId,
      });

      let clearedStoreName = false;
      if (activeCount === 0) {
        await ctx.runMutation(api.members.clearStoreName as any, {
          memberId: row.memberId,
        });
        clearedStoreName = true;
      }

      return {
        ok: true,
        alreadyDeleted: false,
        deletedChunkCount,
        clearedStoreName,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Delete failed',
      };
    }
  },
});

export const queryMemberKnowledgeChunks = action({
  args: {
    memberId: v.id('members'),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwnedMember(ctx, args.memberId);

    const docs = await listMemberChunkDocuments(ctx, { memberId: args.memberId });
    const evidence = await searchMemberChunks(ctx, {
      memberId: args.memberId,
      query: args.query,
      limit: args.limit,
    });

    return {
      docsCount: docs.length,
      ...evidence,
    };
  },
});
