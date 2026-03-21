import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

const roundStatusValidator = v.union(
  v.literal('awaiting_user'),
  v.literal('in_progress'),
  v.literal('completed'),
  v.literal('superseded'),
);

const roundTriggerValidator = v.union(v.literal('user_message'), v.literal('continue'));

const roundBidMoveTypeValidator = v.union(
  v.literal('rebuttal'),
  v.literal('caveat'),
  v.literal('synthesis'),
  v.literal('evidence'),
  v.literal('reframing'),
  v.literal('clarification'),
  v.literal('agreement'),
  v.literal('pass'),
);

const roundtableRationaleTagValidator = v.union(
  v.literal('pushback'),
  v.literal('new angle'),
  v.literal('evidence'),
  v.literal('synthesis'),
  v.literal('clarify'),
);

const roundtableCandidateStatusValidator = v.union(
  v.literal('shortlisted'),
  v.literal('speaking'),
  v.literal('spoken'),
  v.literal('dismissed'),
);

const roundtableCandidateSelectedByValidator = v.union(
  v.literal('allocator'),
  v.literal('mention_boost'),
  v.literal('user_manual_fallback'),
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

const roundCandidateDoc = v.object({
  _id: v.id('hallRoundCandidates'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  roundNumber: v.number(),
  memberId: v.id('members'),
  rank: v.number(),
  status: roundtableCandidateStatusValidator,
  moveType: roundBidMoveTypeValidator,
  targetMemberId: v.optional(v.id('members')),
  rationaleTag: roundtableRationaleTagValidator,
  allocatorReason: v.string(),
  score: v.number(),
  selectedBy: roundtableCandidateSelectedByValidator,
  updatedAt: v.number(),
});

const roundState = v.object({
  round: roundDoc,
  candidates: v.array(roundCandidateDoc),
  spokenMemberIds: v.array(v.id('members')),
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

function assertHallConversationWritable(conversation: { closedAt?: number }) {
  if (conversation.closedAt) {
    throw new Error('This table is closed.');
  }
}

async function assertOwnedMember(ctx: any, userId: any, memberId: any) {
  const member = await ctx.db.get(memberId);
  if (!member || member.userId !== userId || member.deletedAt) {
    throw new Error('Member not found');
  }
  return member;
}

async function loadSpokenMemberIds(ctx: any, conversationId: any, roundNumber: number) {
  const spokenMessages = await ctx.db
    .query('messages')
    .withIndex('by_conversation', (q: any) => q.eq('conversationId', conversationId))
    .collect();

  return Array.from(
    new Set(
      spokenMessages
        .filter(
          (row: any) =>
            !row.deletedAt &&
            !row.supersededAt &&
            row.role === 'member' &&
            row.roundNumber === roundNumber &&
            row.authorMemberId
        )
        .map((row: any) => row.authorMemberId)
    )
  ) as Id<'members'>[];
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

  const candidates = await ctx.db
    .query('hallRoundCandidates')
    .withIndex('by_conversation_round', (q: any) =>
      q.eq('conversationId', conversationId).eq('roundNumber', roundNumber)
    )
    .collect();

  const spokenMemberIds = await loadSpokenMemberIds(ctx, conversationId, roundNumber);

  return {
    round,
    candidates: candidates.sort((a: any, b: any) => {
      if ((a.rank ?? 0) !== (b.rank ?? 0)) {
        return (a.rank ?? 0) - (b.rank ?? 0);
      }
      return a._creationTime - b._creationTime;
    }),
    spokenMemberIds,
  };
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
    const conversation = await assertOwnedHallConversation(ctx, userId, args.conversationId);
    assertHallConversationWritable(conversation);

    const rows = await ctx.db
      .query('hallRounds')
      .withIndex('by_conversation_round', (q: any) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .take(20);

    const latest = rows.find((row: any) => row.status !== 'superseded');
    if (!latest) {
      return null;
    }

    return await loadRoundState(ctx, args.conversationId, latest.roundNumber);
  },
});

export const createRoundWithCandidates = mutation({
  args: {
    conversationId: v.id('conversations'),
    trigger: roundTriggerValidator,
    triggerMessageId: v.optional(v.id('messages')),
    maxSpeakers: v.number(),
    initialStatus: v.optional(v.union(v.literal('awaiting_user'), v.literal('completed'))),
    bids: v.array(
      v.object({
        memberId: v.id('members'),
        wantsToSpeak: v.boolean(),
        moveType: roundBidMoveTypeValidator,
        targetMemberId: v.optional(v.id('members')),
        noveltyClaim: v.string(),
        confidence: v.number(),
        estimatedValue: v.number(),
        relevanceScore: v.number(),
        noveltyScore: v.number(),
        tensionScore: v.number(),
        coverageScore: v.number(),
        recencyPenalty: v.number(),
        dominancePenalty: v.number(),
        mentionBoost: v.number(),
        overlapPenalty: v.number(),
        allocatorScore: v.number(),
        allocatorReason: v.string(),
      })
    ),
    candidates: v.array(
      v.object({
        memberId: v.id('members'),
        rank: v.number(),
        status: roundtableCandidateStatusValidator,
        moveType: roundBidMoveTypeValidator,
        targetMemberId: v.optional(v.id('members')),
        rationaleTag: roundtableRationaleTagValidator,
        allocatorReason: v.string(),
        score: v.number(),
        selectedBy: roundtableCandidateSelectedByValidator,
      })
    ),
  },
  returns: roundState,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await assertOwnedHallConversation(ctx, userId, args.conversationId);
    assertHallConversationWritable(conversation);

    const uniqueMembers = new Set<string>();
    for (const row of [...args.bids, ...args.candidates]) {
      if (uniqueMembers.has(row.memberId)) {
        continue;
      }
      uniqueMembers.add(row.memberId);
      await assertOwnedMember(ctx, userId, row.memberId);
      if ('targetMemberId' in row && row.targetMemberId) {
        await assertOwnedMember(ctx, userId, row.targetMemberId);
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
      status: args.initialStatus ?? 'awaiting_user',
      trigger: args.trigger,
      triggerMessageId: args.triggerMessageId,
      maxSpeakers: Math.max(1, args.maxSpeakers),
      updatedAt: now,
    });

    await Promise.all(
      args.bids.map((bid) =>
        ctx.db.insert('hallRoundBids', {
          userId,
          conversationId: args.conversationId,
          roundNumber: nextRoundNumber,
          memberId: bid.memberId,
          wantsToSpeak: bid.wantsToSpeak,
          moveType: bid.moveType,
          targetMemberId: bid.targetMemberId,
          noveltyClaim: bid.noveltyClaim,
          confidence: bid.confidence,
          estimatedValue: bid.estimatedValue,
          relevanceScore: bid.relevanceScore,
          noveltyScore: bid.noveltyScore,
          tensionScore: bid.tensionScore,
          coverageScore: bid.coverageScore,
          recencyPenalty: bid.recencyPenalty,
          dominancePenalty: bid.dominancePenalty,
          mentionBoost: bid.mentionBoost,
          overlapPenalty: bid.overlapPenalty,
          allocatorScore: bid.allocatorScore,
          allocatorReason: bid.allocatorReason,
          updatedAt: now,
        })
      )
    );

    await Promise.all(
      args.candidates.map((candidate) =>
        ctx.db.insert('hallRoundCandidates', {
          userId,
          conversationId: args.conversationId,
          roundNumber: nextRoundNumber,
          memberId: candidate.memberId,
          rank: candidate.rank,
          status: candidate.status,
          moveType: candidate.moveType,
          targetMemberId: candidate.targetMemberId,
          rationaleTag: candidate.rationaleTag,
          allocatorReason: candidate.allocatorReason,
          score: candidate.score,
          selectedBy: candidate.selectedBy,
          updatedAt: now,
        })
      )
    );

    return await loadRoundState(ctx, args.conversationId, nextRoundNumber);
  },
});

export const updateRoundSnapshot = mutation({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    nextStatus: v.union(v.literal('awaiting_user'), v.literal('completed')),
    bids: v.array(
      v.object({
        memberId: v.id('members'),
        wantsToSpeak: v.boolean(),
        moveType: roundBidMoveTypeValidator,
        targetMemberId: v.optional(v.id('members')),
        noveltyClaim: v.string(),
        confidence: v.number(),
        estimatedValue: v.number(),
        relevanceScore: v.number(),
        noveltyScore: v.number(),
        tensionScore: v.number(),
        coverageScore: v.number(),
        recencyPenalty: v.number(),
        dominancePenalty: v.number(),
        mentionBoost: v.number(),
        overlapPenalty: v.number(),
        allocatorScore: v.number(),
        allocatorReason: v.string(),
      })
    ),
    candidates: v.array(
      v.object({
        memberId: v.id('members'),
        rank: v.number(),
        status: roundtableCandidateStatusValidator,
        moveType: roundBidMoveTypeValidator,
        targetMemberId: v.optional(v.id('members')),
        rationaleTag: roundtableRationaleTagValidator,
        allocatorReason: v.string(),
        score: v.number(),
        selectedBy: roundtableCandidateSelectedByValidator,
      })
    ),
  },
  returns: roundState,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await assertOwnedHallConversation(ctx, userId, args.conversationId);
    assertHallConversationWritable(conversation);

    const { round } = await loadRoundState(ctx, args.conversationId, args.roundNumber);
    if (round.status === 'superseded') {
      throw new Error('Cannot update a superseded round');
    }

    const now = Date.now();
    const existingBids = await ctx.db
      .query('hallRoundBids')
      .withIndex('by_conversation_round', (q: any) =>
        q.eq('conversationId', args.conversationId).eq('roundNumber', args.roundNumber)
      )
      .collect();
    const existingCandidates = await ctx.db
      .query('hallRoundCandidates')
      .withIndex('by_conversation_round', (q: any) =>
        q.eq('conversationId', args.conversationId).eq('roundNumber', args.roundNumber)
      )
      .collect();

    const bidByMember = new Map(existingBids.map((row: any) => [row.memberId as string, row]));
    const candidateByMember = new Map(existingCandidates.map((row: any) => [row.memberId as string, row]));

    await Promise.all(
      args.bids.map(async (bid) => {
        const existing = bidByMember.get(bid.memberId as string);
        const patch = {
          wantsToSpeak: bid.wantsToSpeak,
          moveType: bid.moveType,
          targetMemberId: bid.targetMemberId,
          noveltyClaim: bid.noveltyClaim,
          confidence: bid.confidence,
          estimatedValue: bid.estimatedValue,
          relevanceScore: bid.relevanceScore,
          noveltyScore: bid.noveltyScore,
          tensionScore: bid.tensionScore,
          coverageScore: bid.coverageScore,
          recencyPenalty: bid.recencyPenalty,
          dominancePenalty: bid.dominancePenalty,
          mentionBoost: bid.mentionBoost,
          overlapPenalty: bid.overlapPenalty,
          allocatorScore: bid.allocatorScore,
          allocatorReason: bid.allocatorReason,
          updatedAt: now,
        };
        if (existing) {
          await ctx.db.patch(existing._id, patch);
          return;
        }
        await ctx.db.insert('hallRoundBids', {
          userId,
          conversationId: args.conversationId,
          roundNumber: args.roundNumber,
          memberId: bid.memberId,
          ...patch,
        });
      })
    );

    await Promise.all(
      args.candidates.map(async (candidate) => {
        const existing = candidateByMember.get(candidate.memberId as string);
        const patch = {
          rank: candidate.rank,
          status: candidate.status,
          moveType: candidate.moveType,
          targetMemberId: candidate.targetMemberId,
          rationaleTag: candidate.rationaleTag,
          allocatorReason: candidate.allocatorReason,
          score: candidate.score,
          selectedBy: candidate.selectedBy,
          updatedAt: now,
        };
        if (existing) {
          await ctx.db.patch(existing._id, patch);
          return;
        }
        await ctx.db.insert('hallRoundCandidates', {
          userId,
          conversationId: args.conversationId,
          roundNumber: args.roundNumber,
          memberId: candidate.memberId,
          ...patch,
        });
      })
    );

    await ctx.db.patch(round._id, {
      status: args.nextStatus,
      updatedAt: now,
    });

    return await loadRoundState(ctx, args.conversationId, args.roundNumber);
  },
});

export const markRoundInProgress = mutation({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    speakingMemberId: v.optional(v.id('members')),
    selectedBy: v.optional(roundtableCandidateSelectedByValidator),
  },
  returns: roundState,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await assertOwnedHallConversation(ctx, userId, args.conversationId);
    assertHallConversationWritable(conversation);

    const { round } = await loadRoundState(ctx, args.conversationId, args.roundNumber);
    if (round.status !== 'awaiting_user') {
      throw new Error('Round is not awaiting user approval');
    }

    const now = Date.now();
    if (args.speakingMemberId) {
      const existing = await ctx.db
        .query('hallRoundCandidates')
        .withIndex('by_round_member', (q: any) =>
          q.eq('conversationId', args.conversationId).eq('roundNumber', args.roundNumber).eq('memberId', args.speakingMemberId)
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          status: 'speaking',
          selectedBy: args.selectedBy ?? existing.selectedBy,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(round._id, {
      status: 'in_progress',
      updatedAt: now,
    });

    return await loadRoundState(ctx, args.conversationId, args.roundNumber);
  },
});

export const supersedeOpenRounds = mutation({
  args: {
    conversationId: v.id('conversations'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedHallConversation(ctx, userId, args.conversationId);
    await supersedePendingRounds(ctx, args.conversationId);
    return null;
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

    const { round, candidates } = await loadRoundState(ctx, args.conversationId, args.roundNumber);

    if (round.status === 'superseded') {
      throw new Error('Cannot complete a superseded round');
    }

    const spokenSet = new Set(await loadSpokenMemberIds(ctx, args.conversationId, args.roundNumber));
    const now = Date.now();

    await Promise.all(
      candidates.map((candidate: any) =>
        ctx.db.patch(candidate._id, {
          status: spokenSet.has(candidate.memberId) ? 'spoken' : 'dismissed',
          updatedAt: now,
        })
      )
    );

    await ctx.db.patch(round._id, {
      status: 'completed',
      updatedAt: now,
    });

    return await loadRoundState(ctx, args.conversationId, args.roundNumber);
  },
});
