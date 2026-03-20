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
  systemKind: v.optional(v.union(v.literal('routing'), v.literal('hall_followup_context'))),
  authorMemberId: v.optional(v.id('members')),
  content: v.string(),
  status: v.union(v.literal('sent'), v.literal('error')),
  compacted: v.boolean(),
  deletedAt: v.optional(v.number()),
  supersededAt: v.optional(v.number()),
  supersededByMessageId: v.optional(v.id('messages')),
  supersedesMessageId: v.optional(v.id('messages')),
  revisionKind: v.optional(
    v.union(
      v.literal('think_harder'),
      v.literal('deep_dive'),
      v.literal('shorter'),
      v.literal('elaborate'),
    ),
  ),
  generationProfile: v.optional(
    v.union(v.literal('instant'), v.literal('short'), v.literal('think'), v.literal('deep_dive')),
  ),
  routing: v.optional(routingValidator),
  inReplyToMessageId: v.optional(v.id('messages')),
  originConversationId: v.optional(v.id('conversations')),
  originMessageId: v.optional(v.id('messages')),
  mentionedMemberIds: v.optional(v.array(v.id('members'))),
  roundNumber: v.optional(v.number()),
  roundIntent: v.optional(v.union(v.literal('speak'), v.literal('challenge'), v.literal('support'))),
  roundTargetMemberId: v.optional(v.id('members')),
  pinnedAt: v.optional(v.number()),
  error: v.optional(v.string()),
});

const messageInputValidator = v.object({
  conversationId: v.id('conversations'),
  role: v.union(v.literal('user'), v.literal('member'), v.literal('system')),
  systemKind: v.optional(v.union(v.literal('routing'), v.literal('hall_followup_context'))),
  authorMemberId: v.optional(v.id('members')),
  content: v.string(),
  status: v.union(v.literal('sent'), v.literal('error')),
  deletedAt: v.optional(v.number()),
  supersededAt: v.optional(v.number()),
  supersededByMessageId: v.optional(v.id('messages')),
  supersedesMessageId: v.optional(v.id('messages')),
  revisionKind: v.optional(
    v.union(
      v.literal('think_harder'),
      v.literal('deep_dive'),
      v.literal('shorter'),
      v.literal('elaborate'),
    ),
  ),
  generationProfile: v.optional(
    v.union(v.literal('instant'), v.literal('short'), v.literal('think'), v.literal('deep_dive')),
  ),
  routing: v.optional(routingValidator),
  inReplyToMessageId: v.optional(v.id('messages')),
  originConversationId: v.optional(v.id('conversations')),
  originMessageId: v.optional(v.id('messages')),
  mentionedMemberIds: v.optional(v.array(v.id('members'))),
  roundNumber: v.optional(v.number()),
  roundIntent: v.optional(v.union(v.literal('speak'), v.literal('challenge'), v.literal('support'))),
  roundTargetMemberId: v.optional(v.id('members')),
  pinnedAt: v.optional(v.number()),
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

async function getOwnedMessage(ctx: any, userId: any, messageId: any) {
  const message = await ctx.db.get(messageId);
  if (!message || message.userId !== userId) {
    throw new Error('Message not found');
  }
  return message;
}

function isVisibleHistoryRow(row: { deletedAt?: number; supersededAt?: number }) {
  return !row.deletedAt && !row.supersededAt;
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
    return rows.filter(isVisibleHistoryRow);
  },
});

export const listVisible = query({
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
    return rows.filter(isVisibleHistoryRow);
  },
});

export const listActivePage = query({
  args: {
    conversationId: v.id('conversations'),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    messages: v.array(messageDoc),
    continueCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const limit = Math.max(10, Math.min(args.limit ?? 40, 120));
    let cursor = args.cursor ?? null;
    let hasMore = true;
    const collected: any[] = [];

    while (collected.length < limit && hasMore) {
      const page = await ctx.db
        .query('messages')
        .withIndex('by_conversation_active', (q) =>
          q.eq('conversationId', args.conversationId).eq('compacted', false)
        )
        .order('desc')
        .paginate({
          numItems: limit - collected.length,
          cursor,
        });

      const visibleRows = page.page.filter(isVisibleHistoryRow);
      collected.push(...visibleRows);
      cursor = page.continueCursor;
      hasMore = !page.isDone;

      if (page.page.length === 0) {
        break;
      }
    }

    return {
      messages: collected.slice(0, limit).reverse(),
      continueCursor: hasMore ? cursor : null,
      hasMore,
    };
  },
});

export const listPage = query({
  args: {
    conversationId: v.id('conversations'),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    messages: v.array(messageDoc),
    continueCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const limit = Math.max(10, Math.min(args.limit ?? 40, 120));
    let cursor = args.cursor ?? null;
    let hasMore = true;
    const collected: any[] = [];

    while (collected.length < limit && hasMore) {
      const page = await ctx.db
        .query('messages')
        .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
        .order('desc')
        .paginate({
          numItems: limit - collected.length,
          cursor,
        });

      const visibleRows = page.page.filter(isVisibleHistoryRow);
      collected.push(...visibleRows);
      cursor = page.continueCursor;
      hasMore = !page.isDone;

      if (page.page.length === 0) {
        break;
      }
    }

    return {
      messages: collected.slice(0, limit).reverse(),
      continueCursor: hasMore ? cursor : null,
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
    return rows.filter(isVisibleHistoryRow);
  },
});

export const listPinned = query({
  args: { conversationId: v.id('conversations') },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query('messages')
      .withIndex('by_conversation_pinned', (q) => q.eq('conversationId', args.conversationId))
      .order('asc')
      .collect();
    return rows.filter((row) => isVisibleHistoryRow(row) && row.role !== 'system' && typeof row.pinnedAt === 'number');
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
    return rows.filter(isVisibleHistoryRow);
  },
});

export const getById = query({
  args: {
    conversationId: v.id('conversations'),
    messageId: v.id('messages'),
  },
  returns: v.union(messageDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const message = await getOwnedMessage(ctx, userId, args.messageId);
    if (!message || message.conversationId !== args.conversationId) {
      return null;
    }
    return message;
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
      activeNonSystem: nonDeleted.filter((row) => !row.compacted && !row.supersededAt).length,
    };
  },
});

export const appendMany = mutation({
  args: { messages: v.array(messageInputValidator) },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.messages.length === 0) return [];

    const conversationId = args.messages[0].conversationId;
    await getOwnedConversation(ctx, userId, conversationId);

    const now = Date.now();
    const inserted: Array<any> = [];

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

      const insertedId = await ctx.db.insert('messages', {
        userId,
        ...msg,
        systemKind: msg.role === 'system' ? msg.systemKind ?? (msg.routing ? 'routing' : undefined) : undefined,
        compacted: false,
      });
      inserted.push(await ctx.db.get(insertedId));
    }

    await ctx.db.patch(conversationId, {
      updatedAt: now,
      lastMessageAt: now,
    });
    return inserted.filter(Boolean);
  },
});

export const setPinned = mutation({
  args: {
    messageId: v.id('messages'),
    active: v.boolean(),
  },
  returns: v.union(messageDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const message = await getOwnedMessage(ctx, userId, args.messageId);
    const conversation = await getOwnedConversation(ctx, userId, message.conversationId);

    if (conversation.kind !== 'chamber') {
      throw new Error('Pinned thread context is only available in chamber threads');
    }
    if (message.role === 'system' || message.deletedAt || message.supersededAt) {
      throw new Error('Message cannot be pinned');
    }

    await ctx.db.patch(args.messageId, {
      pinnedAt: args.active ? Date.now() : undefined,
    });
    return await ctx.db.get(args.messageId);
  },
});

export const discard = mutation({
  args: {
    messageId: v.id('messages'),
  },
  returns: v.union(messageDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const message = await getOwnedMessage(ctx, userId, args.messageId);
    if (message.role === 'system') {
      throw new Error('System messages cannot be discarded');
    }
    const now = Date.now();
    await ctx.db.patch(args.messageId, {
      deletedAt: now,
      pinnedAt: undefined,
    });
    return await ctx.db.get(args.messageId);
  },
});

export const replaceWithRefinement = mutation({
  args: {
    targetMessageId: v.id('messages'),
    replacement: messageInputValidator,
  },
  returns: v.object({
    superseded: messageDoc,
    replacement: messageDoc,
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const target = await getOwnedMessage(ctx, userId, args.targetMessageId);
    await getOwnedConversation(ctx, userId, target.conversationId);

    if (target.deletedAt || target.supersededAt) {
      throw new Error('Message is no longer active');
    }
    if (target.role !== 'member') {
      throw new Error('Only member replies can be refined');
    }
    if (args.replacement.conversationId !== target.conversationId) {
      throw new Error('Replacement must target the same conversation');
    }

    await assertOwnedMember(ctx, userId, args.replacement.authorMemberId);
    const now = Date.now();
    const replacementId = await ctx.db.insert('messages', {
      userId,
      ...args.replacement,
      compacted: false,
      pinnedAt: target.pinnedAt,
      supersedesMessageId: args.targetMessageId,
    });

    await ctx.db.patch(args.targetMessageId, {
      pinnedAt: undefined,
      supersededAt: now,
      supersededByMessageId: replacementId,
    });
    await ctx.db.patch(target.conversationId, {
      updatedAt: now,
      lastMessageAt: now,
    });

    return {
      superseded: (await ctx.db.get(args.targetMessageId))!,
      replacement: (await ctx.db.get(replacementId))!,
    };
  },
});

export const appendElaborationReply = mutation({
  args: {
    targetMessageId: v.id('messages'),
    reply: messageInputValidator,
  },
  returns: messageDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const target = await getOwnedMessage(ctx, userId, args.targetMessageId);
    await getOwnedConversation(ctx, userId, target.conversationId);

    if (target.deletedAt || target.supersededAt) {
      throw new Error('Message is no longer active');
    }
    if (target.role !== 'member') {
      throw new Error('Only member replies can be elaborated');
    }
    if (args.reply.conversationId !== target.conversationId) {
      throw new Error('Reply must target the same conversation');
    }

    await assertOwnedMember(ctx, userId, args.reply.authorMemberId);
    const now = Date.now();
    const replyId = await ctx.db.insert('messages', {
      userId,
      ...args.reply,
      compacted: false,
      inReplyToMessageId: args.reply.inReplyToMessageId ?? args.targetMessageId,
    });
    await ctx.db.patch(target.conversationId, {
      updatedAt: now,
      lastMessageAt: now,
    });
    return (await ctx.db.get(replyId))!;
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

    const directives = await ctx.db
      .query('conversationGuidanceDirectives')
      .withIndex('by_conversation', (q: any) => q.eq('conversationId', args.conversationId))
      .collect();
    await Promise.all(directives.map((row: any) => ctx.db.delete(row._id)));

    const feedbackRows = await ctx.db
      .query('messageFeedback')
      .withIndex('by_conversation', (q: any) => q.eq('conversationId', args.conversationId))
      .collect();
    await Promise.all(feedbackRows.map((row: any) => ctx.db.delete(row._id)));

    await ctx.db.patch(args.conversationId, {
      lastMessageAt: undefined,
    });
    return null;
  },
});
