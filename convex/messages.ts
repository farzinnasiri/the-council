import { getAuthUserId } from '@convex-dev/auth/server';
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

const routingValidator = v.object({
  memberIds: v.array(v.id('members')),
  source: v.union(
    v.literal('llm'),
    v.literal('fallback'),
    v.literal('chamber-fixed'),
  ),
});

const messageDoc = v.object({
  _id: v.id('messages'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  role: v.union(v.literal('user'), v.literal('member'), v.literal('system')),
  authorMemberId: v.optional(v.id('members')),
  content: v.string(),
  status: v.union(v.literal('sent'), v.literal('error')),
  compacted: v.boolean(),
  deletedAt: v.optional(v.number()),
  routing: v.optional(routingValidator),
  inReplyToMessageId: v.optional(v.id('messages')),
  originConversationId: v.optional(v.id('conversations')),
  originMessageId: v.optional(v.id('messages')),
  mentionedMemberIds: v.optional(v.array(v.id('members'))),
  roundNumber: v.optional(v.number()),
  roundIntent: v.optional(v.union(v.literal('speak'), v.literal('challenge'), v.literal('support'))),
  roundTargetMemberId: v.optional(v.id('members')),
  error: v.optional(v.string()),
});

const messageInputValidator = v.object({
  conversationId: v.id('conversations'),
  role: v.union(v.literal('user'), v.literal('member'), v.literal('system')),
  authorMemberId: v.optional(v.id('members')),
  content: v.string(),
  status: v.union(v.literal('sent'), v.literal('error')),
  routing: v.optional(routingValidator),
  inReplyToMessageId: v.optional(v.id('messages')),
  originConversationId: v.optional(v.id('conversations')),
  originMessageId: v.optional(v.id('messages')),
  mentionedMemberIds: v.optional(v.array(v.id('members'))),
  roundNumber: v.optional(v.number()),
  roundIntent: v.optional(v.union(v.literal('speak'), v.literal('challenge'), v.literal('support'))),
  roundTargetMemberId: v.optional(v.id('members')),
  error: v.optional(v.string()),
});

const conversationCounts = v.object({
  totalNonSystem: v.number(),
  activeNonSystem: v.number(),
});

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function getOwnedConversation(ctx: any, userId: any, conversationId: any) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.userId !== userId || conversation.deletedAt) {
    throw new Error('Conversation not found');
  }
  return conversation;
}

async function assertOwnedMember(ctx: any, userId: any, memberId: any) {
  if (!memberId) return;
  const member = await ctx.db.get(memberId);
  if (!member || member.userId !== userId || member.deletedAt) throw new Error('Member not found');
}

export const listActive = query({
  args: { conversationId: v.id('conversations') },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query('messages')
      .withIndex('by_conversation_active', (q) =>
        q.eq('conversationId', args.conversationId).eq('compacted', false)
      )
      .order('asc')
      .collect();
    return rows.filter((row) => !row.deletedAt);
  },
});

export const listActivePage = query({
  args: {
    conversationId: v.id('conversations'),
    beforeCreatedAt: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    messages: v.array(messageDoc),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const limit = Math.max(10, Math.min(args.limit ?? 40, 120));
    let queryBuilder = ctx.db
      .query('messages')
      .withIndex('by_conversation_active', (q) =>
        q.eq('conversationId', args.conversationId).eq('compacted', false)
      )
      .order('desc');

    const beforeCreatedAt = args.beforeCreatedAt;
    if (typeof beforeCreatedAt === 'number') {
      queryBuilder = queryBuilder.filter((q) => q.lt(q.field('_creationTime'), beforeCreatedAt));
    }

    const rows = await queryBuilder.take(limit + 1);
    const filtered = rows.filter((row) => !row.deletedAt);
    const hasMore = rows.length > limit;

    return {
      messages: filtered.slice(0, limit).reverse(),
      hasMore,
    };
  },
});

export const listAll = query({
  args: { conversationId: v.id('conversations') },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query('messages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('asc')
      .collect();
    return rows.filter((row) => !row.deletedAt);
  },
});

export const listReplies = query({
  args: { conversationId: v.id('conversations'), parentMessageId: v.id('messages') },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query('messages')
      .withIndex('by_conversation_parent', (q) =>
        q.eq('conversationId', args.conversationId).eq('inReplyToMessageId', args.parentMessageId)
      )
      .order('asc')
      .collect();
    return rows.filter((row) => !row.deletedAt);
  },
});

export const getConversationCounts = query({
  args: { conversationId: v.id('conversations') },
  returns: conversationCounts,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query('messages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect();
    const nonDeleted = rows.filter((row) => row.userId === userId && !row.deletedAt && row.role !== 'system');
    return {
      totalNonSystem: nonDeleted.length,
      activeNonSystem: nonDeleted.filter((row) => !row.compacted).length,
    };
  },
});

export const appendMany = mutation({
  args: { messages: v.array(messageInputValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.messages.length === 0) return null;

    const conversationId = args.messages[0].conversationId;
    await getOwnedConversation(ctx, userId, conversationId);

    const now = Date.now();

    for (const msg of args.messages) {
      if (msg.conversationId !== conversationId) {
        throw new Error('All messages must target the same conversation');
      }

      await assertOwnedMember(ctx, userId, msg.authorMemberId);
      await assertOwnedMember(ctx, userId, msg.roundTargetMemberId);

      if (msg.mentionedMemberIds?.length) {
        await Promise.all(msg.mentionedMemberIds.map((memberId) => assertOwnedMember(ctx, userId, memberId)));
      }

      if (msg.roundIntent && typeof msg.roundNumber !== 'number') {
        throw new Error('roundNumber is required when roundIntent is set');
      }

      if (msg.inReplyToMessageId) {
        const parent = await ctx.db.get(msg.inReplyToMessageId);
        if (!parent || parent.userId !== userId || parent.conversationId !== conversationId) {
          throw new Error('Invalid reply target');
        }
      }

      if (msg.originConversationId || msg.originMessageId) {
        if (!msg.originConversationId || !msg.originMessageId) {
          throw new Error('originConversationId and originMessageId must be provided together');
        }

        const originConversation = await ctx.db.get(msg.originConversationId);
        const originMessage = await ctx.db.get(msg.originMessageId);
        if (!originConversation || originConversation.userId !== userId) {
          throw new Error('Invalid origin conversation');
        }
        if (!originMessage || originMessage.userId !== userId || originMessage.conversationId !== msg.originConversationId) {
          throw new Error('Invalid origin message');
        }
      }

      await ctx.db.insert('messages', {
        userId,
        ...msg,
        compacted: false,
      });
    }

    await ctx.db.patch(conversationId, {
      updatedAt: now,
      lastMessageAt: now,
    });
    return null;
  },
});

export const clearConversation = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query('messages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect();

    const now = Date.now();
    await Promise.all(rows
      .filter((row) => row.userId === userId && !row.deletedAt)
      .map((row) => ctx.db.patch(row._id, { deletedAt: now })));

    const logs = await ctx.db
      .query('conversationMemoryLogs')
      .withIndex('by_user_conversation', (q: any) =>
        q.eq('userId', userId).eq('conversationId', args.conversationId)
      )
      .collect();
    await Promise.all(logs
      .filter((row: any) => !row.deletedAt)
      .map((row: any) => ctx.db.patch(row._id, { deletedAt: now })));

    await ctx.db.patch(args.conversationId, {
      lastMessageAt: undefined,
    });
    return null;
  },
});
