import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const roundStatusValidator = v.union(
  v.literal('awaiting_user'),
  v.literal('in_progress'),
  v.literal('completed'),
  v.literal('superseded'),
);

const roundTriggerValidator = v.union(v.literal('user_message'), v.literal('continue'));

const roundIntentValidator = v.union(
  v.literal('speak'),
  v.literal('challenge'),
  v.literal('support'),
  v.literal('pass'),
);

const roundIntentSourceValidator = v.union(
  v.literal('mention'),
  v.literal('intent_default'),
  v.literal('user_manual'),
);

const roundDoc = v.object({
  _id: v.id('hallRounds'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  roundNumber: v.number(),
  status: roundStatusValidator,
  trigger: roundTriggerValidator,
  triggerMessageId: v.optional(v.id('messages')),
  maxSpeakers: v.number(),
  updatedAt: v.number(),
});

const roundIntentDoc = v.object({
  _id: v.id('hallRoundIntents'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  roundNumber: v.number(),
  memberId: v.id('members'),
  intent: roundIntentValidator,
  targetMemberId: v.optional(v.id('members')),
  rationale: v.string(),
  selected: v.boolean(),
  source: roundIntentSourceValidator,
  updatedAt: v.number(),
});

const roundState = v.object({
  round: roundDoc,
  intents: v.array(roundIntentDoc),
});

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function assertOwnedHallConversation(ctx: any, userId: any, conversationId: any) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.userId !== userId || conversation.deletedAt || conversation.kind !== 'hall') {
    throw new Error('Hall conversation not found');
  }
  return conversation;
}

async function assertOwnedMember(ctx: any, userId: any, memberId: any) {
  const member = await ctx.db.get(memberId);
  if (!member || member.userId !== userId || member.deletedAt) {
    throw new Error('Member not found');
  }
  return member;
}

async function loadRoundState(ctx: any, conversationId: any, roundNumber: number) {
  const rounds = await ctx.db
    .query('hallRounds')
    .withIndex('by_conversation_round', (q: any) =>
      q.eq('conversationId', conversationId).eq('roundNumber', roundNumber)
    )
    .collect();

  const round = rounds[0];
  if (!round) {
    throw new Error('Round not found');
  }

  const intents = await ctx.db
    .query('hallRoundIntents')
    .withIndex('by_conversation_round', (q: any) =>
      q.eq('conversationId', conversationId).eq('roundNumber', roundNumber)
    )
    .collect();

  return { round, intents };
}

async function supersedePendingRounds(ctx: any, conversationId: any) {
  const pendingAwaiting = await ctx.db
    .query('hallRounds')
    .withIndex('by_conversation_status', (q: any) =>
      q.eq('conversationId', conversationId).eq('status', 'awaiting_user')
    )
    .collect();

  const pendingInProgress = await ctx.db
    .query('hallRounds')
    .withIndex('by_conversation_status', (q: any) =>
      q.eq('conversationId', conversationId).eq('status', 'in_progress')
    )
    .collect();

  const now = Date.now();
  await Promise.all(
    [...pendingAwaiting, ...pendingInProgress].map((row: any) =>
      ctx.db.patch(row._id, {
        status: 'superseded',
        updatedAt: now,
      })
    )
  );
}

export const getRoundtableState = query({
  args: {
    conversationId: v.id('conversations'),
  },
  returns: v.union(roundState, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedHallConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query('hallRounds')
      .withIndex('by_conversation_round', (q: any) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .take(20);

    const latest = rows.find((row: any) => row.status !== 'superseded');
    if (!latest) {
      return null;
    }

    const intents = await ctx.db
      .query('hallRoundIntents')
      .withIndex('by_conversation_round', (q: any) =>
        q.eq('conversationId', args.conversationId).eq('roundNumber', latest.roundNumber)
      )
      .collect();

    return {
      round: latest,
      intents,
    };
  },
});

export const createRoundWithIntents = mutation({
  args: {
    conversationId: v.id('conversations'),
    trigger: roundTriggerValidator,
    triggerMessageId: v.optional(v.id('messages')),
    maxSpeakers: v.number(),
    intents: v.array(
      v.object({
        memberId: v.id('members'),
        intent: roundIntentValidator,
        targetMemberId: v.optional(v.id('members')),
        rationale: v.string(),
        selected: v.boolean(),
        source: roundIntentSourceValidator,
      })
    ),
  },
  returns: roundState,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedHallConversation(ctx, userId, args.conversationId);

    const uniqueMemberIds = new Set<string>();
    for (const intent of args.intents) {
      if (uniqueMemberIds.has(intent.memberId)) {
        throw new Error('Duplicate member intents are not allowed');
      }
      uniqueMemberIds.add(intent.memberId);
      await assertOwnedMember(ctx, userId, intent.memberId);
      if (intent.targetMemberId) {
        await assertOwnedMember(ctx, userId, intent.targetMemberId);
      }
    }

    await supersedePendingRounds(ctx, args.conversationId);

    const latest = await ctx.db
      .query('hallRounds')
      .withIndex('by_conversation_round', (q: any) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .take(1);

    const nextRoundNumber = (latest[0]?.roundNumber ?? 0) + 1;
    const now = Date.now();

    await ctx.db.insert('hallRounds', {
      userId,
      conversationId: args.conversationId,
      roundNumber: nextRoundNumber,
      status: 'awaiting_user',
      trigger: args.trigger,
      triggerMessageId: args.triggerMessageId,
      maxSpeakers: Math.max(1, args.maxSpeakers),
      updatedAt: now,
    });

    await Promise.all(
      args.intents.map((intent) =>
        ctx.db.insert('hallRoundIntents', {
          userId,
          conversationId: args.conversationId,
          roundNumber: nextRoundNumber,
          memberId: intent.memberId,
          intent: intent.intent,
          targetMemberId: intent.targetMemberId,
          rationale: intent.rationale,
          selected: intent.selected,
          source: intent.source,
          updatedAt: now,
        })
      )
    );

    return await loadRoundState(ctx, args.conversationId, nextRoundNumber);
  },
});

export const setRoundSelections = mutation({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    selectedMemberIds: v.array(v.id('members')),
  },
  returns: roundState,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedHallConversation(ctx, userId, args.conversationId);

    const { round, intents } = await loadRoundState(ctx, args.conversationId, args.roundNumber);
    if (round.status !== 'awaiting_user') {
      throw new Error('Only awaiting_user rounds can be edited');
    }

    const uniqueSelections = Array.from(new Set(args.selectedMemberIds.map((id) => id as string)));
    if (uniqueSelections.length > round.maxSpeakers) {
      throw new Error(`At most ${round.maxSpeakers} speakers can be selected`);
    }

    const selectableIds = new Set(
      intents.map((row: any) => row.memberId as string)
    );

    for (const memberId of uniqueSelections) {
      if (!selectableIds.has(memberId)) {
        throw new Error('Selected member is not eligible for this round');
      }
    }

    const now = Date.now();
    await Promise.all(
      intents.map((row: any) =>
        ctx.db.patch(row._id, {
          selected: uniqueSelections.includes(row.memberId as string),
          source: 'user_manual',
          updatedAt: now,
        })
      )
    );

    await ctx.db.patch(round._id, { updatedAt: now });
    return await loadRoundState(ctx, args.conversationId, args.roundNumber);
  },
});

export const markRoundInProgress = mutation({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
  },
  returns: roundState,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedHallConversation(ctx, userId, args.conversationId);

    const { round } = await loadRoundState(ctx, args.conversationId, args.roundNumber);
    if (round.status !== 'awaiting_user') {
      throw new Error('Round is not awaiting user approval');
    }

    await ctx.db.patch(round._id, {
      status: 'in_progress',
      updatedAt: Date.now(),
    });

    return await loadRoundState(ctx, args.conversationId, args.roundNumber);
  },
});

export const markRoundCompleted = mutation({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
  },
  returns: roundState,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedHallConversation(ctx, userId, args.conversationId);

    const { round } = await loadRoundState(ctx, args.conversationId, args.roundNumber);

    if (round.status === 'superseded') {
      throw new Error('Cannot complete a superseded round');
    }

    await ctx.db.patch(round._id, {
      status: 'completed',
      updatedAt: Date.now(),
    });

    return await loadRoundState(ctx, args.conversationId, args.roundNumber);
  },
});
