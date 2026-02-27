import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const memoryScopeValidator = v.union(v.literal('chamber'), v.literal('hall'));

const memoryLogDoc = v.object({
  _id: v.id('conversationMemoryLogs'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  scope: memoryScopeValidator,
  roundNumber: v.optional(v.number()),
  memory: v.optional(v.string()),
  totalMessagesAtRun: v.number(),
  activeMessagesAtRun: v.number(),
  compactedMessageCount: v.number(),
  recentRawTail: v.number(),
  deletedAt: v.optional(v.number()),
});

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function getOwnedConversation(ctx: any, userId: any, conversationId: any) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.userId !== userId || conversation.deletedAt) {
    return null;
  }
  return conversation;
}

export const getLatestByConversation = query({
  args: { conversationId: v.id('conversations') },
  returns: v.union(memoryLogDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (!conversation) {
      return null;
    }

    const rows = await ctx.db
      .query('conversationMemoryLogs')
      .withIndex('by_user_conversation', (q: any) =>
        q.eq('userId', userId).eq('conversationId', args.conversationId)
      )
      .order('desc')
      .collect();

    return rows.find((row: any) => !row.deletedAt && row.scope === 'chamber') ?? null;
  },
});

export const listByConversationScope = query({
  args: {
    conversationId: v.id('conversations'),
    scope: memoryScopeValidator,
  },
  returns: v.array(memoryLogDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (!conversation) {
      return [];
    }

    const rows = await ctx.db
      .query('conversationMemoryLogs')
      .withIndex('by_user_conversation', (q: any) =>
        q.eq('userId', userId).eq('conversationId', args.conversationId)
      )
      .order('asc')
      .collect();

    return rows.filter((row: any) => !row.deletedAt && row.scope === args.scope);
  },
});

export const upsertHallRoundSummary = mutation({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    memory: v.string(),
    recentRawTail: v.number(),
    totalMessagesAtRun: v.number(),
    activeMessagesAtRun: v.number(),
    compactedMessageCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (!conversation || conversation.kind !== 'hall') {
      throw new Error('Hall conversation not found');
    }

    const existing = await ctx.db
      .query('conversationMemoryLogs')
      .withIndex('by_user_conversation', (q: any) =>
        q.eq('userId', userId).eq('conversationId', args.conversationId)
      )
      .collect();
    const current = existing.find(
      (row: any) => !row.deletedAt && row.scope === 'hall' && row.roundNumber === args.roundNumber
    );

    const payload = {
      memory: args.memory,
      totalMessagesAtRun: Math.max(0, args.totalMessagesAtRun),
      activeMessagesAtRun: Math.max(0, args.activeMessagesAtRun),
      compactedMessageCount: Math.max(0, args.compactedMessageCount),
      recentRawTail: Math.max(1, args.recentRawTail),
    };

    if (current) {
      await ctx.db.patch(current._id, payload);
      return null;
    }

    await ctx.db.insert('conversationMemoryLogs', {
      userId,
      conversationId: args.conversationId,
      scope: 'hall',
      roundNumber: args.roundNumber,
      ...payload,
    });
    return null;
  },
});
