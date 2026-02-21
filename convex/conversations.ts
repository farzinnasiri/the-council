import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const conversationDoc = v.object({
  _id: v.id('conversations'),
  _creationTime: v.number(),
  userId: v.id('users'),
  kind: v.union(v.literal('hall'), v.literal('chamber')),
  title: v.string(),
  chamberMemberId: v.optional(v.id('members')),
  // Legacy compatibility while old rows still include status.
  status: v.optional(v.union(v.literal('active'), v.literal('archived'))),
  deletedAt: v.optional(v.number()),
  lastMessageAt: v.optional(v.number()),
  updatedAt: v.number(),
});

const participantDoc = v.object({
  _id: v.id('conversationParticipants'),
  _creationTime: v.number(),
  conversationId: v.id('conversations'),
  userId: v.id('users'),
  memberId: v.id('members'),
  status: v.union(v.literal('active'), v.literal('removed')),
  joinedAt: v.number(),
  leftAt: v.optional(v.number()),
});

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function assertOwnedMember(ctx: any, userId: any, memberId: any) {
  const member = await ctx.db.get(memberId);
  if (!member || member.userId !== userId || member.deletedAt) {
    throw new Error('Member not found');
  }
  return member;
}

async function getOwnedConversation(ctx: any, userId: any, conversationId: any) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.userId !== userId) {
    throw new Error('Conversation not found');
  }
  return conversation;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(conversationDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .order('desc')
      .collect();

    return args.includeArchived ? rows : rows.filter((row: any) => !row.deletedAt);
  },
});

export const listHalls = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(conversationDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_user_kind', (q: any) => q.eq('userId', userId).eq('kind', 'hall'))
      .order('desc')
      .collect();

    return args.includeArchived ? rows : rows.filter((row: any) => !row.deletedAt);
  },
});

export const listChambers = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(conversationDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_user_kind', (q: any) => q.eq('userId', userId).eq('kind', 'chamber'))
      .order('desc')
      .collect();

    return args.includeArchived ? rows : rows.filter((row: any) => !row.deletedAt);
  },
});

export const getById = query({
  args: { conversationId: v.id('conversations') },
  returns: v.union(conversationDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(args.conversationId);
    if (!doc || doc.userId !== userId || doc.deletedAt) return null;
    return doc;
  },
});

export const getChamberByMember = query({
  args: { memberId: v.id('members') },
  returns: v.union(conversationDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_user_kind_member', (q: any) =>
        q.eq('userId', userId).eq('kind', 'chamber').eq('chamberMemberId', args.memberId)
      )
      .collect();
    const existing = rows.find((row: any) => !row.deletedAt) ?? null;
    return existing;
  },
});

export const createHall = mutation({
  args: {
    title: v.string(),
    memberIds: v.array(v.id('members')),
  },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    const uniqueMemberIds = Array.from(new Set(args.memberIds));

    await Promise.all(uniqueMemberIds.map((memberId) => assertOwnedMember(ctx, userId, memberId)));

    const conversationId = await ctx.db.insert('conversations', {
      userId,
      kind: 'hall',
      title: args.title,
      updatedAt: now,
    });

    await Promise.all(
      uniqueMemberIds.map((memberId) =>
        ctx.db.insert('conversationParticipants', {
          conversationId,
          userId,
          memberId,
          status: 'active',
          joinedAt: now,
        })
      )
    );

    return (await ctx.db.get(conversationId))!;
  },
});

export const getOrCreateChamber = mutation({
  args: { memberId: v.id('members') },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const member = await assertOwnedMember(ctx, userId, args.memberId);

    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_user_kind_member', (q: any) =>
        q.eq('userId', userId).eq('kind', 'chamber').eq('chamberMemberId', args.memberId)
      )
      .collect();

    const existing = rows.find((row: any) => !row.deletedAt);
    if (existing) return existing;

    const now = Date.now();
    const conversationId = await ctx.db.insert('conversations', {
      userId,
      kind: 'chamber',
      // Chamber title is derived at read time from member data.
      title: 'Chamber',
      chamberMemberId: args.memberId,
      updatedAt: now,
    });

    await ctx.db.insert('conversationParticipants', {
      conversationId,
      userId,
      memberId: args.memberId,
      status: 'active',
      joinedAt: now,
    });

    return (await ctx.db.get(conversationId))!;
  },
});

export const renameHall = mutation({
  args: { conversationId: v.id('conversations'), title: v.string() },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'hall' || conversation.deletedAt) throw new Error('Hall not found');

    await ctx.db.patch(args.conversationId, {
      title: args.title.trim() || conversation.title,
      updatedAt: Date.now(),
    });

    return (await ctx.db.get(args.conversationId))!;
  },
});

export const archiveHall = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'hall' || conversation.deletedAt) throw new Error('Hall not found');

    await ctx.db.patch(args.conversationId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const addHallParticipant = mutation({
  args: { conversationId: v.id('conversations'), memberId: v.id('members') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'hall' || conversation.deletedAt) {
      throw new Error('Only active hall conversations support participants');
    }
    await assertOwnedMember(ctx, userId, args.memberId);

    const existing = await ctx.db
      .query('conversationParticipants')
      .withIndex('by_user_conversation', (q: any) => q.eq('userId', userId).eq('conversationId', args.conversationId))
      .collect();

    const current = existing.find((p: any) => p.memberId === args.memberId);
    if (current?.status === 'active') return null;

    if (current) {
      await ctx.db.patch(current._id, {
        status: 'active',
        joinedAt: Date.now(),
        leftAt: undefined,
      });
    } else {
      await ctx.db.insert('conversationParticipants', {
        conversationId: args.conversationId,
        userId,
        memberId: args.memberId,
        status: 'active',
        joinedAt: Date.now(),
      });
    }

    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });
    return null;
  },
});

export const removeHallParticipant = mutation({
  args: { conversationId: v.id('conversations'), memberId: v.id('members') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'hall' || conversation.deletedAt) {
      throw new Error('Only active hall conversations support participants');
    }

    const existing = await ctx.db
      .query('conversationParticipants')
      .withIndex('by_user_conversation', (q: any) => q.eq('userId', userId).eq('conversationId', args.conversationId))
      .collect();

    const current = existing.find((p: any) => p.memberId === args.memberId && p.status === 'active');
    if (!current) return null;
    const activeCount = existing.filter((p: any) => p.status === 'active').length;
    if (activeCount <= 1) {
      throw new Error('Hall must keep at least one active member');
    }

    await ctx.db.patch(current._id, {
      status: 'removed',
      leftAt: Date.now(),
    });
    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });
    return null;
  },
});

export const listParticipants = query({
  args: {
    conversationId: v.id('conversations'),
    includeRemoved: v.optional(v.boolean()),
  },
  returns: v.array(participantDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.deletedAt) return [];

    if (args.includeRemoved) {
      return await ctx.db
        .query('conversationParticipants')
        .withIndex('by_user_conversation', (q: any) => q.eq('userId', userId).eq('conversationId', args.conversationId))
        .collect();
    }

    return await ctx.db
      .query('conversationParticipants')
      .withIndex('by_conversation_status', (q: any) =>
        q.eq('conversationId', args.conversationId).eq('status', 'active')
      )
      .collect();
  },
});

export const applyCompaction = mutation({
  args: {
    conversationId: v.id('conversations'),
    summary: v.string(),
    compactedMessageIds: v.array(v.id('messages')),
    recentRawTail: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.deletedAt) throw new Error('Conversation not found');

    const messages = await Promise.all(args.compactedMessageIds.map((id) => ctx.db.get(id)));
    for (const row of messages) {
      if (!row) continue;
      if (row.conversationId !== conversation._id || row.userId !== userId) {
        throw new Error('Invalid compacted messages');
      }
    }

    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });

    await Promise.all(
      args.compactedMessageIds.map(async (id) => {
        const row = await ctx.db.get(id);
        if (row && row.conversationId === conversation._id && row.userId === userId) {
          await ctx.db.patch(id, { compacted: true });
        }
      })
    );

    if (conversation.kind === 'chamber') {
      const rows = await ctx.db
        .query('messages')
        .withIndex('by_conversation', (q: any) => q.eq('conversationId', args.conversationId))
        .collect();
      const nonDeleted = rows.filter((row: any) => row.userId === userId && !row.deletedAt && row.role !== 'system');
      const activeNonSystem = nonDeleted.filter((row: any) => !row.compacted);

      await ctx.db.insert('conversationMemoryLogs', {
        userId,
        conversationId: args.conversationId,
        scope: 'chamber',
        memory: args.summary,
        totalMessagesAtRun: nonDeleted.length,
        activeMessagesAtRun: activeNonSystem.length,
        compactedMessageCount: args.compactedMessageIds.length,
        recentRawTail: args.recentRawTail ?? 0,
      });
    }

    return null;
  },
});

export const clearChamberSummary = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'chamber' || conversation.deletedAt) {
      throw new Error('Chamber not found');
    }

    await ctx.db.patch(args.conversationId, {
      lastMessageAt: undefined,
    });

    return null;
  },
});
