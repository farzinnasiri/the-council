import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const stagedStatus = v.union(
  v.literal('staged'),
  v.literal('ingested'),
  v.literal('skipped_duplicate'),
  v.literal('failed'),
  v.literal('rehydrated'),
  v.literal('purged')
);

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
    status: stagedStatus,
    kbDocumentName: v.optional(v.string()),
    ingestError: v.optional(v.string()),
    createdAt: v.number(),
    ingestedAt: v.optional(v.number()),
    expiresAt: v.number(),
  },
  returns: v.id('kbStagedDocuments'),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    return await ctx.db.insert('kbStagedDocuments', {
      userId,
      memberId: args.memberId,
      storageId: args.storageId,
      displayName: args.displayName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      kbStoreName: args.kbStoreName,
      status: args.status,
      kbDocumentName: args.kbDocumentName,
      ingestError: args.ingestError,
      createdAt: args.createdAt,
      ingestedAt: args.ingestedAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const updateRecord = mutation({
  args: {
    recordId: v.id('kbStagedDocuments'),
    status: stagedStatus,
    kbDocumentName: v.optional(v.string()),
    ingestError: v.optional(v.string()),
    ingestedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db.get(args.recordId);
    if (!row || row.userId !== userId) {
      throw new Error('Record not found');
    }

    await ctx.db.patch(args.recordId, {
      status: args.status,
      kbDocumentName: args.kbDocumentName,
      ingestError: args.ingestError,
      ingestedAt: args.ingestedAt,
      deletedAt: args.deletedAt,
    });

    return null;
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

    const rows = await ctx.db
      .query('kbStagedDocuments')
      .withIndex('by_user_member_status', (q: any) => q.eq('userId', userId).eq('memberId', args.memberId))
      .collect();

    const includeDeleted = args.includeDeleted ?? false;
    return rows
      .filter((row: any) => includeDeleted || !row.deletedAt)
      .sort((a: any, b: any) => b.createdAt - a.createdAt);
  },
});

export const listRehydratableByMember = query({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const rows = await ctx.db
      .query('kbStagedDocuments')
      .withIndex('by_member_createdAt', (q: any) => q.eq('memberId', args.memberId))
      .collect();

    return rows
      .filter((row: any) => row.userId === userId && !row.deletedAt)
      .filter((row: any) => row.status !== 'failed' && row.status !== 'purged')
      .sort((a: any, b: any) => a.createdAt - b.createdAt);
  },
});

export const listExpired = query({
  args: {
    memberId: v.optional(v.id('members')),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.memberId) {
      await assertOwnedMember(ctx, userId, args.memberId);
    }

    const statuses: Array<'staged' | 'ingested' | 'skipped_duplicate' | 'failed' | 'rehydrated'> = [
      'staged',
      'ingested',
      'skipped_duplicate',
      'failed',
      'rehydrated',
    ];

    const batches = await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query('kbStagedDocuments')
          .withIndex('by_status_expiresAt', (q: any) => q.eq('status', status).lt('expiresAt', args.now))
          .collect()
      )
    );

    return batches
      .flat()
      .filter((row: any) => row.userId === userId && !row.deletedAt)
      .filter((row: any) => !args.memberId || row.memberId === args.memberId);
  },
});

export const markPurged = mutation({
  args: {
    recordIds: v.array(v.id('kbStagedDocuments')),
    purgedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    let count = 0;

    for (const recordId of args.recordIds) {
      const row = await ctx.db.get(recordId);
      if (!row || row.userId !== userId || row.deletedAt) continue;
      await ctx.db.patch(recordId, {
        status: 'purged',
        deletedAt: args.purgedAt,
        ingestError: undefined,
      });
      count += 1;
    }

    return count;
  },
});

export const markDeletedByDocument = mutation({
  args: {
    memberId: v.id('members'),
    kbDocumentName: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    deletedAt: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const deletedAt = args.deletedAt ?? Date.now();
    let rows: any[] = [];

    if (args.kbDocumentName) {
      rows = await ctx.db
        .query('kbStagedDocuments')
        .withIndex('by_kb_document_name', (q: any) => q.eq('kbDocumentName', args.kbDocumentName))
        .collect();
    } else if (args.storageId) {
      rows = await ctx.db
        .query('kbStagedDocuments')
        .withIndex('by_member_createdAt', (q: any) => q.eq('memberId', args.memberId))
        .collect();
      rows = rows.filter((row: any) => row.storageId === args.storageId);
    } else {
      return 0;
    }

    let count = 0;
    for (const row of rows) {
      if (row.userId !== userId || row.memberId !== args.memberId) continue;
      if (row.deletedAt || row.status === 'purged') continue;
      await ctx.db.patch(row._id, {
        status: 'purged',
        deletedAt,
        ingestError: undefined,
      });
      count += 1;
    }

    return count;
  },
});
