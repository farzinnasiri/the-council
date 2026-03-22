import { getAuthUserId } from '@convex-dev/auth/server';
import { internalMutation, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { archiveNotebookForConversation } from './notebooks';

const conversationDoc = v.object({
  _id: v.id('conversations'),
  _creationTime: v.number(),
  userId: v.id('users'),
  kind: v.union(v.literal('hall'), v.literal('chamber')),
  hallMode: v.optional(v.union(v.literal('advisory'), v.literal('roundtable'))),
  chamberResponseMode: v.optional(
    v.union(
      v.literal('instant'),
      v.literal('short'),
      v.literal('think'),
      v.literal('brainstorm'),
      v.literal('deep_dive')
    )
  ),
  timeAwareReentryEnabled: v.optional(v.boolean()),
  timeAwareReentryState: v.optional(
    v.object({
      gapBucket: v.union(
        v.literal('mild'),
        v.literal('medium'),
        v.literal('strong'),
        v.literal('very_strong')
      ),
      repliesRemaining: v.union(v.literal(1), v.literal(2)),
      explicitContinuation: v.boolean(),
      activatedAt: v.number(),
    })
  ),
    timeAwareReentryNoticeSeenAt: v.optional(v.number()),
    guidanceLastReflectedUserTurnCount: v.optional(v.number()),
    title: v.string(),
  chamberMemberId: v.optional(v.id('members')),
  closedAt: v.optional(v.number()),
  closedReason: v.optional(v.literal('user_closed')),
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

const messageDoc = v.object({
  _id: v.id('messages'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  role: v.union(v.literal('user'), v.literal('member'), v.literal('system')),
  systemKind: v.optional(v.union(v.literal('routing'), v.literal('hall_followup_context'), v.literal('hall_closure'))),
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
      v.literal('elaborate')
    )
  ),
  generationProfile: v.optional(
    v.union(
      v.literal('instant'),
      v.literal('short'),
      v.literal('think'),
      v.literal('brainstorm'),
      v.literal('deep_dive')
    )
  ),
  routing: v.optional(v.object({
    memberIds: v.array(v.id('members')),
    source: v.union(v.literal('llm'), v.literal('fallback'), v.literal('chamber-fixed')),
  })),
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

function assertHallConversationOpen(conversation: any) {
  if (conversation.kind === 'hall' && conversation.closedAt) {
    throw new Error('This table is closed.');
  }
}

async function createChamberThreadDoc(ctx: any, userId: any, memberId: any) {
  const now = Date.now();
  const conversationId = await ctx.db.insert('conversations', {
    userId,
    kind: 'chamber',
    chamberResponseMode: 'instant',
    timeAwareReentryEnabled: true,
    title: 'New Thread',
    chamberMemberId: memberId,
    updatedAt: now,
  });

  await ctx.db.insert('conversationParticipants', {
    conversationId,
    userId,
    memberId,
    status: 'active',
    joinedAt: now,
  });

  return (await ctx.db.get(conversationId))!;
}

async function renameConversationDoc(ctx: any, conversationId: any, title: string, fallbackTitle: string) {
  await ctx.db.patch(conversationId, {
    title: title.trim() || fallbackTitle,
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(conversationId))!;
}

async function archiveConversationDoc(ctx: any, conversationId: any) {
  const now = Date.now();
  const conversation = await ctx.db.get(conversationId);
  await ctx.db.patch(conversationId, {
    deletedAt: now,
    updatedAt: now,
  });
  if (conversation?.userId) {
    await archiveNotebookForConversation(ctx, conversation.userId, conversationId, now);
  }
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

export const listChambersByMember = query({
  args: {
    memberId: v.id('members'),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(conversationDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);
    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_user_kind_member_updated', (q: any) =>
        q.eq('userId', userId).eq('kind', 'chamber').eq('chamberMemberId', args.memberId)
      )
      .order('desc')
      .collect();
    return args.includeArchived ? rows : rows.filter((row: any) => !row.deletedAt);
  },
});

export const getLatestChamberByMember = query({
  args: { memberId: v.id('members') },
  returns: v.union(conversationDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);
    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_user_kind_member_updated', (q: any) =>
        q.eq('userId', userId).eq('kind', 'chamber').eq('chamberMemberId', args.memberId)
      )
      .order('desc')
      .collect();
    return rows.find((row: any) => !row.deletedAt) ?? null;
  },
});

export const createHall = mutation({
  args: {
    title: v.string(),
    memberIds: v.array(v.id('members')),
    hallMode: v.optional(v.union(v.literal('advisory'), v.literal('roundtable'))),
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
      hallMode: args.hallMode ?? 'advisory',
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

export const createChamberThread = mutation({
  args: { memberId: v.id('members') },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);
    return await createChamberThreadDoc(ctx, userId, args.memberId);
  },
});

export const renameConversation = mutation({
  args: { conversationId: v.id('conversations'), title: v.string() },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.deletedAt) throw new Error('Conversation not found');
    return await renameConversationDoc(ctx, args.conversationId, args.title, conversation.title);
  },
});

export const setChamberResponseMode = mutation({
  args: {
    conversationId: v.id('conversations'),
    mode: v.union(
      v.literal('instant'),
      v.literal('short'),
      v.literal('think'),
      v.literal('brainstorm'),
      v.literal('deep_dive')
    ),
  },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'chamber' || conversation.deletedAt) {
      throw new Error('Chamber conversation not found');
    }
    await ctx.db.patch(args.conversationId, {
      chamberResponseMode: args.mode,
      updatedAt: Date.now(),
    });
    return (await ctx.db.get(args.conversationId))!;
  },
});

export const setChamberTimeAwareReentryEnabled = mutation({
  args: {
    conversationId: v.id('conversations'),
    enabled: v.boolean(),
  },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'chamber' || conversation.deletedAt) {
      throw new Error('Chamber conversation not found');
    }
    await ctx.db.patch(args.conversationId, {
      timeAwareReentryEnabled: args.enabled,
      timeAwareReentryState: args.enabled ? conversation.timeAwareReentryState : undefined,
      updatedAt: Date.now(),
    });
    return (await ctx.db.get(args.conversationId))!;
  },
});

export const setChamberTimeAwareReentryState = mutation({
  args: {
    conversationId: v.id('conversations'),
    state: v.optional(
      v.object({
        gapBucket: v.union(
          v.literal('mild'),
          v.literal('medium'),
          v.literal('strong'),
          v.literal('very_strong')
        ),
        repliesRemaining: v.union(v.literal(1), v.literal(2)),
        explicitContinuation: v.boolean(),
        activatedAt: v.number(),
      })
    ),
  },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'chamber' || conversation.deletedAt) {
      throw new Error('Chamber conversation not found');
    }
    await ctx.db.patch(args.conversationId, {
      timeAwareReentryState: args.state,
    });
    return (await ctx.db.get(args.conversationId))!;
  },
});

export const markChamberTimeAwareReentryNoticeSeen = mutation({
  args: {
    conversationId: v.id('conversations'),
  },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'chamber' || conversation.deletedAt) {
      throw new Error('Chamber conversation not found');
    }
    await ctx.db.patch(args.conversationId, {
      timeAwareReentryNoticeSeenAt: Date.now(),
    });
    return (await ctx.db.get(args.conversationId))!;
  },
});

export const setGuidanceLastReflectedUserTurnCount = mutation({
  args: {
    conversationId: v.id('conversations'),
    userTurnCount: v.number(),
  },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'chamber' || conversation.deletedAt) {
      throw new Error('Chamber conversation not found');
    }
    await ctx.db.patch(args.conversationId, {
      guidanceLastReflectedUserTurnCount: Math.max(0, args.userTurnCount),
      updatedAt: Date.now(),
    });
    return (await ctx.db.get(args.conversationId))!;
  },
});

export const archiveConversation = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.deletedAt) return null;
    await archiveConversationDoc(ctx, args.conversationId);

    return null;
  },
});

export const clearChamberByMember = mutation({
  args: { memberId: v.id('members') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const chamberThreads = await ctx.db
      .query('conversations')
      .withIndex('by_user_kind_member', (q: any) =>
        q.eq('userId', userId).eq('kind', 'chamber').eq('chamberMemberId', args.memberId)
      )
      .collect();

    const activeThreads = chamberThreads.filter((conversation: any) => !conversation.deletedAt);
    if (activeThreads.length === 0) return null;

    const now = Date.now();
    for (const conversation of activeThreads) {
      await ctx.db.patch(conversation._id, {
        deletedAt: now,
        updatedAt: now,
        lastMessageAt: undefined,
      });
      await archiveNotebookForConversation(ctx, userId, conversation._id, now);

      const rows = await ctx.db
        .query('messages')
        .withIndex('by_conversation', (q: any) => q.eq('conversationId', conversation._id))
        .collect();
      await Promise.all(
        rows
          .filter((row: any) => row.userId === userId && !row.deletedAt)
          .map((row: any) => ctx.db.patch(row._id, { deletedAt: now }))
      );

      const logs = await ctx.db
        .query('conversationMemoryLogs')
        .withIndex('by_user_conversation', (q: any) =>
          q.eq('userId', userId).eq('conversationId', conversation._id)
        )
        .collect();
      await Promise.all(
        logs
          .filter((row: any) => !row.deletedAt)
          .map((row: any) => ctx.db.patch(row._id, { deletedAt: now }))
      );

      const directives = await ctx.db
        .query('conversationGuidanceDirectives')
        .withIndex('by_conversation', (q: any) => q.eq('conversationId', conversation._id))
        .collect();
      await Promise.all(directives.map((row: any) => ctx.db.delete(row._id)));

      const feedbackRows = await ctx.db
        .query('messageFeedback')
        .withIndex('by_conversation', (q: any) => q.eq('conversationId', conversation._id))
        .collect();
      await Promise.all(feedbackRows.map((row: any) => ctx.db.delete(row._id)));
    }

    return null;
  },
});

// Legacy wrappers kept to avoid runtime breakage across partially deployed clients.
export const getChamberByMember = getLatestChamberByMember;
export const getOrCreateChamber = mutation({
  args: { memberId: v.id('members') },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query('conversations')
      .withIndex('by_user_kind_member_updated', (q: any) =>
        q.eq('userId', userId).eq('kind', 'chamber').eq('chamberMemberId', args.memberId)
      )
      .order('desc')
      .collect();
    const active = existing.find((row: any) => !row.deletedAt);
    if (active) return active;
    await assertOwnedMember(ctx, userId, args.memberId);
    return await createChamberThreadDoc(ctx, userId, args.memberId);
  },
});
export const renameHall = mutation({
  args: { conversationId: v.id('conversations'), title: v.string() },
  returns: conversationDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'hall' || conversation.deletedAt) throw new Error('Hall not found');
    return await renameConversationDoc(ctx, args.conversationId, args.title, conversation.title);
  },
});
export const archiveHall = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'hall' || conversation.deletedAt) throw new Error('Hall not found');
    await archiveConversationDoc(ctx, args.conversationId);
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
    assertHallConversationOpen(conversation);
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
    assertHallConversationOpen(conversation);

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
        if (row && row.conversationId === conversation._id && row.userId === userId && !row.pinnedAt) {
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

export const createHallFollowUpThreadInternal = internalMutation({
  args: {
    userId: v.id('users'),
    memberId: v.id('members'),
    summary: v.string(),
    originConversationId: v.id('conversations'),
    originMessageId: v.id('messages'),
    originMessageContent: v.string(),
  },
  returns: v.object({
    conversation: conversationDoc,
    messages: v.array(messageDoc),
    memory: v.string(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const member = await ctx.db.get(args.memberId);
    if (!member || member.userId !== args.userId || member.deletedAt) {
      throw new Error('Member not found');
    }

    const conversationId = await ctx.db.insert('conversations', {
      userId: args.userId,
      kind: 'chamber',
      chamberResponseMode: 'instant',
      title: 'New Thread',
      chamberMemberId: args.memberId,
      updatedAt: now,
    });

    await ctx.db.insert('conversationParticipants', {
      conversationId,
      userId: args.userId,
      memberId: args.memberId,
      status: 'active',
      joinedAt: now,
    });

    await ctx.db.insert('conversationMemoryLogs', {
      userId: args.userId,
      conversationId,
      scope: 'chamber',
      memory: args.summary,
      totalMessagesAtRun: 1,
      activeMessagesAtRun: 1,
      compactedMessageCount: 0,
      recentRawTail: 1,
    });

    const summaryMessageId = await ctx.db.insert('messages', {
      userId: args.userId,
      conversationId,
      role: 'system',
      systemKind: 'hall_followup_context',
      content: args.summary,
      status: 'sent',
      compacted: false,
    });

    const anchorMessageId = await ctx.db.insert('messages', {
      userId: args.userId,
      conversationId,
      role: 'member',
      authorMemberId: args.memberId,
      content: args.originMessageContent,
      status: 'sent',
      compacted: false,
      originConversationId: args.originConversationId,
      originMessageId: args.originMessageId,
    });

    const conversation = await ctx.db.get(conversationId);
    const summaryMessage = await ctx.db.get(summaryMessageId);
    const anchorMessage = await ctx.db.get(anchorMessageId);
    if (!conversation || !summaryMessage || !anchorMessage) {
      throw new Error('Failed to create follow-up thread');
    }

    return {
      conversation,
      messages: [summaryMessage, anchorMessage],
      memory: args.summary,
    };
  },
});

export const closeHallFinalize = mutation({
  args: {
    conversationId: v.id('conversations'),
    closureContent: v.string(),
  },
  returns: v.object({
    conversation: conversationDoc,
    closingMessage: messageDoc,
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'hall' || conversation.deletedAt) {
      throw new Error('Hall not found');
    }
    if (conversation.closedAt) {
      throw new Error('This table is closed.');
    }

    const now = Date.now();
    const messageId = await ctx.db.insert('messages', {
      userId,
      conversationId: args.conversationId,
      role: 'system',
      systemKind: 'hall_closure',
      content: args.closureContent.trim(),
      status: 'sent',
      compacted: false,
    });

    await ctx.db.patch(args.conversationId, {
      closedAt: now,
      closedReason: 'user_closed',
      updatedAt: now,
      lastMessageAt: now,
    });

    const [updatedConversation, closingMessage] = await Promise.all([
      ctx.db.get(args.conversationId),
      ctx.db.get(messageId),
    ]);

    if (!updatedConversation || !closingMessage) {
      throw new Error('Failed to close hall');
    }

    return {
      conversation: updatedConversation,
      closingMessage,
    };
  },
});
