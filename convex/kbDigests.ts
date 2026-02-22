import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const digestStatus = v.union(v.literal('active'), v.literal('deleted'));

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

export const upsertForDocument = mutation({
  args: {
    memberId: v.id('members'),
    kbStoreName: v.string(),
    kbDocumentName: v.optional(v.string()),
    displayName: v.string(),
    storageId: v.optional(v.id('_storage')),
    topics: v.array(v.string()),
    entities: v.array(v.string()),
    lexicalAnchors: v.array(v.string()),
    styleAnchors: v.array(v.string()),
    digestSummary: v.string(),
    status: v.optional(digestStatus),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  },
  returns: v.id('kbDocumentDigests'),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const now = args.updatedAt ?? Date.now();
    let existing: any = null;

    if (args.kbDocumentName) {
      const byDocument = await ctx.db
        .query('kbDocumentDigests')
        .withIndex('by_member_document', (q: any) =>
          q.eq('memberId', args.memberId).eq('kbDocumentName', args.kbDocumentName)
        )
        .collect();
      existing = byDocument.find((row: any) => row.userId === userId) ?? null;
    }

    if (!existing) {
      const candidates = await ctx.db
        .query('kbDocumentDigests')
        .withIndex('by_user_member_status', (q: any) =>
          q.eq('userId', userId).eq('memberId', args.memberId).eq('status', 'active')
        )
        .collect();
      const normalizedDisplay = args.displayName.trim().toLowerCase();
      existing =
        candidates.find((row: any) => {
          const sameDisplay = (row.displayName ?? '').trim().toLowerCase() === normalizedDisplay;
          const sameStore = row.kbStoreName === args.kbStoreName;
          return sameDisplay && sameStore;
        }) ?? null;
    }

    const patch = {
      kbStoreName: args.kbStoreName,
      kbDocumentName: args.kbDocumentName,
      displayName: args.displayName,
      storageId: args.storageId,
      topics: args.topics,
      entities: args.entities,
      lexicalAnchors: args.lexicalAnchors,
      styleAnchors: args.styleAnchors,
      digestSummary: args.digestSummary,
      status: args.status ?? 'active',
      updatedAt: now,
      deletedAt: args.deletedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert('kbDocumentDigests', {
      userId,
      memberId: args.memberId,
      ...patch,
    });
  },
});

export const listByMember = query({
  args: {
    memberId: v.id('members'),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      _id: v.id('kbDocumentDigests'),
      _creationTime: v.number(),
      userId: v.id('users'),
      memberId: v.id('members'),
      kbStoreName: v.string(),
      kbDocumentName: v.optional(v.string()),
      displayName: v.string(),
      storageId: v.optional(v.id('_storage')),
      topics: v.array(v.string()),
      entities: v.array(v.string()),
      lexicalAnchors: v.array(v.string()),
      styleAnchors: v.array(v.string()),
      digestSummary: v.string(),
      status: digestStatus,
      updatedAt: v.number(),
      deletedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const includeDeleted = args.includeDeleted ?? false;
    const statuses: Array<'active' | 'deleted'> = includeDeleted ? ['active', 'deleted'] : ['active'];
    const rows = await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query('kbDocumentDigests')
          .withIndex('by_user_member_status', (q: any) =>
            q.eq('userId', userId).eq('memberId', args.memberId).eq('status', status)
          )
          .collect()
      )
    );

    return rows
      .flat()
      .filter((row: any) => includeDeleted || !row.deletedAt)
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  },
});

export const markDeletedByDocument = mutation({
  args: {
    memberId: v.id('members'),
    kbDocumentName: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const rows = await ctx.db
      .query('kbDocumentDigests')
      .withIndex('by_member_document', (q: any) =>
        q.eq('memberId', args.memberId).eq('kbDocumentName', args.kbDocumentName)
      )
      .collect();

    let count = 0;

    for (const row of rows) {
      if (row.userId !== userId) continue;
      await ctx.db.delete(row._id);
      count += 1;
    }

    return count;
  },
});

export const updateDigestMetadata = mutation({
  args: {
    digestId: v.id('kbDocumentDigests'),
    displayName: v.optional(v.string()),
    topics: v.optional(v.array(v.string())),
    entities: v.optional(v.array(v.string())),
    lexicalAnchors: v.optional(v.array(v.string())),
    styleAnchors: v.optional(v.array(v.string())),
    digestSummary: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  },
  returns: v.id('kbDocumentDigests'),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const digest = await ctx.db.get(args.digestId);
    if (!digest || digest.userId !== userId) {
      throw new Error('Knowledge digest not found');
    }
    await assertOwnedMember(ctx, userId, digest.memberId);

    const now = args.updatedAt ?? Date.now();
    const patch: Record<string, any> = {
      updatedAt: now,
    };

    if (args.displayName !== undefined) patch.displayName = args.displayName;
    if (args.topics !== undefined) patch.topics = args.topics;
    if (args.entities !== undefined) patch.entities = args.entities;
    if (args.lexicalAnchors !== undefined) patch.lexicalAnchors = args.lexicalAnchors;
    if (args.styleAnchors !== undefined) patch.styleAnchors = args.styleAnchors;
    if (args.digestSummary !== undefined) patch.digestSummary = args.digestSummary;

    await ctx.db.patch(args.digestId, patch);
    return args.digestId;
  },
});
