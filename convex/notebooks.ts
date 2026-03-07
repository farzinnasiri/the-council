import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const notebookDoc = v.object({
  _id: v.id('conversationNotebooks'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  content: v.string(),
  updatedAt: v.number(),
  archivedAt: v.optional(v.number()),
});

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function getOwnedConversation(ctx: any, userId: any, conversationId: any) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.userId !== userId) {
    throw new Error('Conversation not found');
  }
  return conversation;
}

async function listNotebookRows(ctx: any, conversationId: any) {
  return await ctx.db
    .query('conversationNotebooks')
    .withIndex('by_conversation', (q: any) => q.eq('conversationId', conversationId))
    .collect();
}

function sortByFreshness(rows: any[]) {
  return [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function archiveNotebookForConversation(
  ctx: any,
  userId: any,
  conversationId: any,
  archivedAt = Date.now()
) {
  await getOwnedConversation(ctx, userId, conversationId);
  const rows = await listNotebookRows(ctx, conversationId);
  await Promise.all(
    rows
      .filter((row: any) => row.userId === userId && !row.archivedAt)
      .map((row: any) =>
        ctx.db.patch(row._id, {
          archivedAt,
          updatedAt: archivedAt,
        })
      )
  );
}

export const getNotebookByConversation = query({
  args: { conversationId: v.id('conversations') },
  returns: v.union(notebookDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.deletedAt) return null;

    const rows = await listNotebookRows(ctx, args.conversationId);
    return sortByFreshness(rows).find((row: any) => row.userId === userId && !row.archivedAt) ?? null;
  },
});

export const listActiveNotebooks = query({
  args: {},
  returns: v.array(notebookDoc),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query('conversationNotebooks')
      .withIndex('by_user_updated', (q: any) => q.eq('userId', userId))
      .order('desc')
      .collect();

    return rows.filter((row: any) => !row.archivedAt);
  },
});

export const upsertNotebookContent = mutation({
  args: {
    conversationId: v.id('conversations'),
    content: v.string(),
  },
  returns: v.union(notebookDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.deletedAt) {
      throw new Error('Conversation not found');
    }

    const rows = sortByFreshness(await listNotebookRows(ctx, args.conversationId))
      .filter((row: any) => row.userId === userId);
    const [current, ...duplicates] = rows;

    if (args.content.trim().length === 0) {
      await Promise.all(rows.map((row: any) => ctx.db.delete(row._id)));
      return null;
    }

    const now = Date.now();
    if (current) {
      await ctx.db.patch(current._id, {
        content: args.content,
        updatedAt: now,
        archivedAt: undefined,
      });
      await Promise.all(duplicates.map((row: any) => ctx.db.delete(row._id)));
      return {
        ...current,
        content: args.content,
        updatedAt: now,
        archivedAt: undefined,
      } as any;
    }

    const notebookId = await ctx.db.insert('conversationNotebooks', {
      userId,
      conversationId: args.conversationId,
      content: args.content,
      updatedAt: now,
    });
    return (await ctx.db.get(notebookId as any)) as any;
  },
});

export const archiveNotebookByConversation = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await archiveNotebookForConversation(ctx, userId, args.conversationId);
    return null;
  },
});
