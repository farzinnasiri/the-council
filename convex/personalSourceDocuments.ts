import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { resolveKbChunkConfig } from './ai/ragConfig';

const uploadStatusValidator = v.union(v.literal('uploaded'), v.literal('failed'));
const stageStatusValidator = v.union(v.literal('pending'), v.literal('running'), v.literal('completed'), v.literal('failed'));
const lifecycleStatusValidator = v.union(v.literal('active'), v.literal('deleted'));

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

export const createRecord = mutation({
  args: {
    storageId: v.id('_storage'),
    displayName: v.string(),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    personalSourceName: v.string(),
    chunkSizeChars: v.optional(v.number()),
    chunkOverlapChars: v.optional(v.number()),
    createdAt: v.optional(v.number()),
  },
  returns: v.id('personalSourceDocuments'),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const chunkConfig = resolveKbChunkConfig({
      chunkSizeChars: args.chunkSizeChars,
      chunkOverlapChars: args.chunkOverlapChars,
    });
    const existing = await ctx.db
      .query('personalSourceDocuments')
      .withIndex('by_user_storage', (q: any) => q.eq('userId', userId).eq('storageId', args.storageId))
      .collect();
    const activeExisting = existing.find((row: any) => row.status === 'active' && !row.deletedAt);
    if (activeExisting) {
      await ctx.db.patch(activeExisting._id, {
        displayName: args.displayName,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        personalSourceName: args.personalSourceName,
        chunkSizeChars: chunkConfig.chunkSizeChars,
        chunkOverlapChars: chunkConfig.chunkOverlapChars,
        uploadStatus: 'uploaded',
        updatedAt: Date.now(),
      });
      return activeExisting._id;
    }

    const now = args.createdAt ?? Date.now();
    return await ctx.db.insert('personalSourceDocuments', {
      userId,
      storageId: args.storageId,
      displayName: args.displayName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      personalSourceName: args.personalSourceName,
      chunkSizeChars: chunkConfig.chunkSizeChars,
      chunkOverlapChars: chunkConfig.chunkOverlapChars,
      uploadStatus: 'uploaded',
      chunkingStatus: 'pending',
      indexingStatus: 'pending',
      metadataStatus: 'pending',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const patchRecord = mutation({
  args: {
    personalSourceDocumentId: v.id('personalSourceDocuments'),
    uploadStatus: v.optional(uploadStatusValidator),
    chunkingStatus: v.optional(stageStatusValidator),
    indexingStatus: v.optional(stageStatusValidator),
    metadataStatus: v.optional(stageStatusValidator),
    chunkSizeChars: v.optional(v.number()),
    chunkOverlapChars: v.optional(v.number()),
    chunkCountTotal: v.optional(v.number()),
    chunkCountIndexed: v.optional(v.number()),
    ingestErrorChunking: v.optional(v.string()),
    ingestErrorIndexing: v.optional(v.string()),
    ingestErrorMetadata: v.optional(v.string()),
    personalSourceName: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db.get(args.personalSourceDocumentId);
    if (!row || row.userId !== userId) throw new Error('Personal source not found');
    if (row.deletedAt || row.status === 'deleted') return null;

    await ctx.db.patch(args.personalSourceDocumentId, {
      uploadStatus: 'uploadStatus' in args ? args.uploadStatus : row.uploadStatus,
      chunkingStatus: 'chunkingStatus' in args ? args.chunkingStatus : row.chunkingStatus,
      indexingStatus: 'indexingStatus' in args ? args.indexingStatus : row.indexingStatus,
      metadataStatus: 'metadataStatus' in args ? args.metadataStatus : row.metadataStatus,
      chunkSizeChars: 'chunkSizeChars' in args ? args.chunkSizeChars : row.chunkSizeChars,
      chunkOverlapChars: 'chunkOverlapChars' in args ? args.chunkOverlapChars : row.chunkOverlapChars,
      chunkCountTotal: 'chunkCountTotal' in args ? args.chunkCountTotal : row.chunkCountTotal,
      chunkCountIndexed: 'chunkCountIndexed' in args ? args.chunkCountIndexed : row.chunkCountIndexed,
      ingestErrorChunking: 'ingestErrorChunking' in args ? args.ingestErrorChunking : row.ingestErrorChunking,
      ingestErrorIndexing: 'ingestErrorIndexing' in args ? args.ingestErrorIndexing : row.ingestErrorIndexing,
      ingestErrorMetadata: 'ingestErrorMetadata' in args ? args.ingestErrorMetadata : row.ingestErrorMetadata,
      personalSourceName: 'personalSourceName' in args ? args.personalSourceName : row.personalSourceName,
      updatedAt: 'updatedAt' in args ? args.updatedAt : Date.now(),
    });
    return null;
  },
});

export const getById = query({
  args: {
    personalSourceDocumentId: v.id('personalSourceDocuments'),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db.get(args.personalSourceDocumentId);
    if (!row || row.userId !== userId) return null;
    if (!args.includeDeleted && (row.deletedAt || row.status === 'deleted')) return null;
    return row;
  },
});

export const getDownloadUrl = query({
  args: {
    personalSourceDocumentId: v.id('personalSourceDocuments'),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db.get(args.personalSourceDocumentId);
    if (!row || row.userId !== userId || row.deletedAt || row.status === 'deleted') return null;
    return await ctx.storage.getUrl(row.storageId);
  },
});

export const listByUser = query({
  args: {
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const includeDeleted = args.includeDeleted ?? false;
    const statuses: Array<'active' | 'deleted'> = includeDeleted ? ['active', 'deleted'] : ['active'];
    const rows = await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query('personalSourceDocuments')
          .withIndex('by_user_status', (q: any) => q.eq('userId', userId).eq('status', status))
          .collect(),
      ),
    );
    return rows
      .flat()
      .filter((row: any) => includeDeleted || (!row.deletedAt && row.status !== 'deleted'))
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  },
});

export const markDeleted = mutation({
  args: {
    personalSourceDocumentId: v.id('personalSourceDocuments'),
    deletedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db.get(args.personalSourceDocumentId);
    if (!row || row.userId !== userId) throw new Error('Personal source not found');
    if (row.deletedAt || row.status === 'deleted') return null;

    const deletedAt = args.deletedAt ?? Date.now();
    await ctx.db.patch(args.personalSourceDocumentId, {
      status: 'deleted',
      deletedAt,
      updatedAt: deletedAt,
    });
    return null;
  },
});
