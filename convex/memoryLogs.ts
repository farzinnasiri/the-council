import { getAuthUserId } from '@convex-dev/auth/server';
import { query } from './_generated/server';
import { v } from 'convex/values';

const memoryLogDoc = v.object({
  _id: v.id('conversationMemoryLogs'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  scope: v.literal('chamber'),
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

export const getLatestByConversation = query({
  args: { conversationId: v.id('conversations') },
  returns: v.union(memoryLogDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId || conversation.deletedAt) {
      return null;
    }

    const rows = await ctx.db
      .query('conversationMemoryLogs')
      .withIndex('by_user_conversation', (q: any) =>
        q.eq('userId', userId).eq('conversationId', args.conversationId)
      )
      .order('desc')
      .collect();

    return rows.find((row: any) => !row.deletedAt) ?? null;
  },
});
