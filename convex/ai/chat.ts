'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { contextMessageValidator } from '../contexts/shared/contracts';
import { chatWithMemberUseCase } from '../contexts/chamber/application/chatWithMember';
import { compactConversationUseCase } from '../contexts/chamber/application/compactConversation';
import type { StartHallFollowUpThreadResult } from '../contexts/chamber/contracts';
import { startHallFollowUpThreadUseCase } from '../contexts/chamber/application/startHallFollowUpThread';
import { createAiProvider } from '../contexts/shared/convexGateway';
import { requireAuthUser, requireOwnedConversation } from '../contexts/shared/auth';

export const chatWithMember = action({
  args: {
    conversationId: v.id('conversations'),
    memberId: v.id('members'),
    message: v.string(),
    previousSummary: v.optional(v.string()),
    contextMessages: v.optional(v.array(contextMessageValidator)),
    hallContext: v.optional(v.string()),
    chatModel: v.optional(v.string()),
    chatProfile: v.optional(
      v.union(v.literal('instant'), v.literal('short'), v.literal('think'), v.literal('deep_dive'))
    ),
    retrievalModel: v.optional(v.string()),
    retrievalProfile: v.optional(v.union(v.literal('default'), v.literal('deep_dive'))),
    turnDirective: v.optional(v.union(v.literal('shorter'), v.literal('elaborate'))),
  },
  handler: async (ctx, args) => await chatWithMemberUseCase(ctx, args),
});

export const compactConversation = action({
  args: {
    conversationId: v.id('conversations'),
    previousSummary: v.optional(v.string()),
    messageIds: v.array(v.id('messages')),
    messages: v.array(contextMessageValidator),
    memoryScope: v.optional(v.union(v.literal('chamber'), v.literal('hall'))),
    memoryContext: v.optional(
      v.object({
        conversationId: v.string(),
        memberName: v.string(),
        memberSpecialties: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => await compactConversationUseCase(ctx, args),
});

export const summarizeHallRound = action({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    messages: v.array(
      v.object({
        author: v.string(),
        content: v.string(),
      })
    ),
    model: v.optional(v.string()),
  },
  returns: v.object({ summary: v.string() }),
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const conversation = await requireOwnedConversation(ctx, args.conversationId);
    if (conversation.kind !== 'hall') {
      throw new Error('Hall round summaries are only supported for hall conversations');
    }
    const provider = createAiProvider();
    const summary = await provider.summarizeHallRound({
      roundNumber: args.roundNumber,
      messages: args.messages,
      model: args.model,
    });
    return { summary };
  },
});

export const startHallFollowUpThread = action({
  args: {
    hallConversationId: v.id('conversations'),
    hallMessageId: v.id('messages'),
  },
  handler: async (ctx, args): Promise<StartHallFollowUpThreadResult> =>
    await startHallFollowUpThreadUseCase(ctx, args),
});
