'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';
import {
  roundBidMoveTypeValidator,
  roundtableCandidateSelectedByValidator,
  roundtableCandidateStatusValidator,
  roundtableRationaleTagValidator,
  roundtableSpeakIntentValidator,
  roundTriggerValidator,
} from '../contexts/shared/contracts';
import { prepareRoundtableRoundUseCase } from '../contexts/hall/application/prepareRoundtableRound';
import { refreshRoundtableRoundUseCase } from '../contexts/hall/application/refreshRoundtableRound';
import { chatRoundtableSpeakersUseCase } from '../contexts/hall/application/chatRoundtableSpeakers';
import { chatRoundtableSpeakerUseCase } from '../contexts/hall/application/chatRoundtableSpeaker';
import { observeAction, setMainSpanAttributes } from '../observability/wideEvents';
import { promptTraceDraftValidator } from '../promptTraceValidators';

export const prepareRoundtableRound = action({
  args: {
    conversationId: v.id('conversations'),
    trigger: roundTriggerValidator,
    triggerMessageId: v.optional(v.id('messages')),
    mentionedMemberIds: v.optional(v.array(v.id('members'))),
  },
  returns: v.object({
    round: v.object({
      _id: v.id('hallRounds'),
      _creationTime: v.number(),
      userId: v.id('users'),
      conversationId: v.id('conversations'),
      roundNumber: v.number(),
      status: v.union(
        v.literal('awaiting_user'),
        v.literal('in_progress'),
        v.literal('completed'),
        v.literal('superseded')
      ),
      trigger: roundTriggerValidator,
      triggerMessageId: v.optional(v.id('messages')),
      maxSpeakers: v.number(),
      updatedAt: v.number(),
    }),
    spokenMemberIds: v.array(v.id('members')),
    candidates: v.array(
      v.object({
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
      })
    ),
  }),
  handler: observeAction('ai.roundtable.prepareRoundtableRound', async (ctx, args) => {
    setMainSpanAttributes({
      'conversation.id': String(args.conversationId),
      'hall.round.trigger': args.trigger,
      'hall.round.mentioned_member_count': args.mentionedMemberIds?.length ?? 0,
    });
    return await prepareRoundtableRoundUseCase(ctx, args);
  }),
});

export const refreshRoundtableRound = action({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
  },
  returns: v.object({
    round: v.object({
      _id: v.id('hallRounds'),
      _creationTime: v.number(),
      userId: v.id('users'),
      conversationId: v.id('conversations'),
      roundNumber: v.number(),
      status: v.union(
        v.literal('awaiting_user'),
        v.literal('in_progress'),
        v.literal('completed'),
        v.literal('superseded')
      ),
      trigger: roundTriggerValidator,
      triggerMessageId: v.optional(v.id('messages')),
      maxSpeakers: v.number(),
      updatedAt: v.number(),
    }),
    spokenMemberIds: v.array(v.id('members')),
    candidates: v.array(
      v.object({
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
      })
    ),
  }),
  handler: observeAction('ai.roundtable.refreshRoundtableRound', async (ctx, args) => {
    setMainSpanAttributes({
      'conversation.id': String(args.conversationId),
      'hall.round_number': args.roundNumber,
    });
    return await refreshRoundtableRoundUseCase(ctx, args);
  }),
});

export const chatRoundtableSpeaker = action({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    memberId: v.id('members'),
    force: v.optional(v.boolean()),
    retrievalModel: v.optional(v.string()),
    chatModel: v.optional(v.string()),
    debugPromptTrace: v.optional(v.boolean()),
  },
  returns: v.object({
    answer: v.string(),
    grounded: v.boolean(),
    citations: v.array(v.object({ title: v.string(), uri: v.optional(v.string()) })),
    model: v.string(),
    retrievalModel: v.string(),
    usedKnowledgeBase: v.boolean(),
    intent: v.union(v.literal('speak'), v.literal('challenge'), v.literal('support')),
    targetMemberId: v.optional(v.id('members')),
    attemptedResponseModelSlot: v.optional(v.number()),
    attemptedResponseModelSpec: v.optional(v.string()),
    finalResponseModelSlot: v.optional(v.number()),
    finalResponseModelSpec: v.optional(v.string()),
    fallbackUsed: v.optional(v.boolean()),
    promptTraceDraft: v.optional(promptTraceDraftValidator),
  }),
  handler: observeAction('ai.roundtable.chatRoundtableSpeaker', async (ctx, args) => {
    setMainSpanAttributes({
      'conversation.id': String(args.conversationId),
      'hall.round_number': args.roundNumber,
      'member.id': String(args.memberId),
      'hall.force': Boolean(args.force),
    });
    return await chatRoundtableSpeakerUseCase(ctx, args);
  }),
});

export const chatRoundtableSpeakers = action({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    retrievalModel: v.optional(v.string()),
    chatModel: v.optional(v.string()),
    debugPromptTrace: v.optional(v.boolean()),
  },
  returns: v.object({
    results: v.array(
      v.object({
        memberId: v.id('members'),
        status: v.union(v.literal('sent'), v.literal('error')),
        answer: v.string(),
        intent: roundtableSpeakIntentValidator,
        targetMemberId: v.optional(v.id('members')),
        error: v.optional(v.string()),
        attemptedResponseModelSlot: v.optional(v.number()),
        attemptedResponseModelSpec: v.optional(v.string()),
        finalResponseModelSlot: v.optional(v.number()),
        finalResponseModelSpec: v.optional(v.string()),
        fallbackUsed: v.optional(v.boolean()),
        promptTraceDraft: v.optional(promptTraceDraftValidator),
      })
    ),
  }),
  handler: observeAction('ai.roundtable.chatRoundtableSpeakers', async (ctx, args) => {
    setMainSpanAttributes({
      'conversation.id': String(args.conversationId),
      'hall.round_number': args.roundNumber,
    });
    return await chatRoundtableSpeakersUseCase(ctx, args);
  }),
});
