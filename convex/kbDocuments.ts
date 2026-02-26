import { getAuthUserId } from '@convex-dev/auth/server';
import { internalMutation, mutation, query } from './_generated/server';
import { v } from 'convex/values';

const uploadStatusValidator = v.union(v.literal('uploaded'), v.literal('failed'));
const stageStatusValidator = v.union(v.literal('pending'), v.literal('running'), v.literal('completed'), v.literal('failed'));
const lifecycleStatusValidator = v.union(v.literal('active'), v.literal('deleted'));

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function assertOwnedMember(ctx: any, userId: any, memberId: any) {
  const member = await ctx.db.get(memberId);
  if (!member || member.userId !== userId) {
    throw new Error('Member not found');
  }
  return member;
}

export const createRecord = mutation({
  args: {
    memberId: v.id('members'),
    storageId: v.id('_storage'),
    displayName: v.string(),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    kbStoreName: v.string(),
    kbDocumentName: v.string(),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const existing = await ctx.db
      .query('kbDocuments')
      .withIndex('by_member_storage', (q: any) => q.eq('memberId', args.memberId).eq('storageId', args.storageId))
      .collect();

    const activeExisting = existing.find((row: any) => row.userId === userId && row.status === 'active' && !row.deletedAt);
    if (activeExisting) {
      await ctx.db.patch(activeExisting._id, {
        displayName: args.displayName,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        kbStoreName: args.kbStoreName,
        kbDocumentName: args.kbDocumentName,
        uploadStatus: 'uploaded',
        updatedAt: Date.now(),
      });
      return activeExisting._id;
    }

    const now = args.createdAt ?? Date.now();
    return await ctx.db.insert('kbDocuments', {
      userId,
      memberId: args.memberId,
      storageId: args.storageId,
      displayName: args.displayName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      kbStoreName: args.kbStoreName,
      kbDocumentName: args.kbDocumentName,
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
    kbDocumentId: v.id('kbDocuments'),
    uploadStatus: v.optional(uploadStatusValidator),
    chunkingStatus: v.optional(stageStatusValidator),
    indexingStatus: v.optional(stageStatusValidator),
    metadataStatus: v.optional(stageStatusValidator),
    chunkCountTotal: v.optional(v.number()),
    chunkCountIndexed: v.optional(v.number()),
    ingestErrorChunking: v.optional(v.string()),
    ingestErrorIndexing: v.optional(v.string()),
    ingestErrorMetadata: v.optional(v.string()),
    kbDocumentName: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db.get(args.kbDocumentId);
    if (!row || row.userId !== userId) {
      throw new Error('KB document not found');
    }
    if (row.deletedAt || row.status === 'deleted') {
      return null;
    }

    await ctx.db.patch(args.kbDocumentId, {
      uploadStatus: args.uploadStatus ?? row.uploadStatus,
      chunkingStatus: args.chunkingStatus ?? row.chunkingStatus,
      indexingStatus: args.indexingStatus ?? row.indexingStatus,
      metadataStatus: args.metadataStatus ?? row.metadataStatus,
      chunkCountTotal: args.chunkCountTotal ?? row.chunkCountTotal,
      chunkCountIndexed: args.chunkCountIndexed ?? row.chunkCountIndexed,
      ingestErrorChunking: args.ingestErrorChunking ?? row.ingestErrorChunking,
      ingestErrorIndexing: args.ingestErrorIndexing ?? row.ingestErrorIndexing,
      ingestErrorMetadata: args.ingestErrorMetadata ?? row.ingestErrorMetadata,
      kbDocumentName: args.kbDocumentName ?? row.kbDocumentName,
      updatedAt: args.updatedAt ?? Date.now(),
    });

    return null;
  },
});

export const getById = query({
  args: {
    kbDocumentId: v.id('kbDocuments'),
    includeDeleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db.get(args.kbDocumentId);
    if (!row || row.userId !== userId) return null;
    if (!args.includeDeleted && (row.deletedAt || row.status === 'deleted')) return null;
    return row;
  },
});

export const listByMember = query({
  args: {
    memberId: v.id('members'),
    includeDeleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const includeDeleted = args.includeDeleted ?? false;
    const statuses: Array<'active' | 'deleted'> = includeDeleted ? ['active', 'deleted'] : ['active'];
    const rows = await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query('kbDocuments')
          .withIndex('by_member_status', (q: any) => q.eq('memberId', args.memberId).eq('status', status))
          .collect()
      )
    );

    return rows
      .flat()
      .filter((row: any) => row.userId === userId)
      .filter((row: any) => includeDeleted || (!row.deletedAt && row.status !== 'deleted'))
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  },
});

export const markDeleted = mutation({
  args: {
    kbDocumentId: v.id('kbDocuments'),
    deletedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db.get(args.kbDocumentId);
    if (!row || row.userId !== userId) throw new Error('KB document not found');
    if (row.deletedAt || row.status === 'deleted') return null;

    const deletedAt = args.deletedAt ?? Date.now();
    await ctx.db.patch(args.kbDocumentId, {
      status: 'deleted',
      deletedAt,
      updatedAt: deletedAt,
    });
    return null;
  },
});

export const countActiveByMember = query({
  args: {
    memberId: v.id('members'),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const rows = await ctx.db
      .query('kbDocuments')
      .withIndex('by_member_status', (q: any) => q.eq('memberId', args.memberId).eq('status', 'active'))
      .collect();

    return rows.filter((row: any) => row.userId === userId && !row.deletedAt).length;
  },
});

export const findByMemberStorage = query({
  args: {
    memberId: v.id('members'),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const rows = await ctx.db
      .query('kbDocuments')
      .withIndex('by_member_storage', (q: any) => q.eq('memberId', args.memberId).eq('storageId', args.storageId))
      .collect();

    return rows.find((row: any) => row.userId === userId && row.status === 'active' && !row.deletedAt) ?? null;
  },
});

export const patchRecordInternal = internalMutation({
  args: {
    kbDocumentId: v.id('kbDocuments'),
    uploadStatus: v.optional(uploadStatusValidator),
    chunkingStatus: v.optional(stageStatusValidator),
    indexingStatus: v.optional(stageStatusValidator),
    metadataStatus: v.optional(stageStatusValidator),
    chunkCountTotal: v.optional(v.number()),
    chunkCountIndexed: v.optional(v.number()),
    ingestErrorChunking: v.optional(v.string()),
    ingestErrorIndexing: v.optional(v.string()),
    ingestErrorMetadata: v.optional(v.string()),
    kbDocumentName: v.optional(v.string()),
    status: v.optional(lifecycleStatusValidator),
    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.kbDocumentId);
    if (!row) return null;

    await ctx.db.patch(args.kbDocumentId, {
      uploadStatus: args.uploadStatus ?? row.uploadStatus,
      chunkingStatus: args.chunkingStatus ?? row.chunkingStatus,
      indexingStatus: args.indexingStatus ?? row.indexingStatus,
      metadataStatus: args.metadataStatus ?? row.metadataStatus,
      chunkCountTotal: args.chunkCountTotal ?? row.chunkCountTotal,
      chunkCountIndexed: args.chunkCountIndexed ?? row.chunkCountIndexed,
      ingestErrorChunking: args.ingestErrorChunking ?? row.ingestErrorChunking,
      ingestErrorIndexing: args.ingestErrorIndexing ?? row.ingestErrorIndexing,
      ingestErrorMetadata: args.ingestErrorMetadata ?? row.ingestErrorMetadata,
      kbDocumentName: args.kbDocumentName ?? row.kbDocumentName,
      status: args.status ?? row.status,
      deletedAt: args.deletedAt ?? row.deletedAt,
      updatedAt: args.updatedAt ?? Date.now(),
    });
    return null;
  },
});
