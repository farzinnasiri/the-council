'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';
import {
  roundIntentValidator,
  roundtableSpeakIntentValidator,
  roundTriggerValidator,
} from '../contexts/shared/contracts';
import { prepareRoundtableRoundUseCase } from '../contexts/hall/application/prepareRoundtableRound';
import { refreshRoundtableRoundUseCase } from '../contexts/hall/application/refreshRoundtableRound';
import { chatRoundtableSpeakerUseCase } from '../contexts/hall/application/chatRoundtableSpeaker';

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
    intents: v.array(
      v.object({
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
        source: v.union(v.literal('mention'), v.literal('intent_default'), v.literal('user_manual')),
        updatedAt: v.number(),
      })
    ),
  }),
  handler: async (ctx, args) => await prepareRoundtableRoundUseCase(ctx, args),
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
    intents: v.array(
      v.object({
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
        source: v.union(v.literal('mention'), v.literal('intent_default'), v.literal('user_manual')),
        updatedAt: v.number(),
      })
    ),
  }),
  handler: async (ctx, args) => await refreshRoundtableRoundUseCase(ctx, args),
});

export const chatRoundtableSpeaker = action({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    memberId: v.id('members'),
    force: v.optional(v.boolean()),
    retrievalModel: v.optional(v.string()),
    chatModel: v.optional(v.string()),
  },
  returns: v.object({
    answer: v.string(),
    grounded: v.boolean(),
    citations: v.array(v.object({ title: v.string(), uri: v.optional(v.string()) })),
    model: v.string(),
    retrievalModel: v.string(),
    usedKnowledgeBase: v.boolean(),
    debug: v.optional(v.any()),
    intent: v.union(v.literal('speak'), v.literal('challenge'), v.literal('support')),
    targetMemberId: v.optional(v.id('members')),
  }),
  handler: async (ctx, args) => await chatRoundtableSpeakerUseCase(ctx, args),
});
