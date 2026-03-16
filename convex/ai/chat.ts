'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { contextMessageValidator } from '../contexts/shared/contracts';
import { chatWithMemberUseCase } from '../contexts/chamber/application/chatWithMember';
import { compactConversationUseCase } from '../contexts/chamber/application/compactConversation';
import type { StartHallFollowUpThreadResult } from '../contexts/chamber/contracts';
import {
  activeGuidanceDirectiveValidator,
  timeAwareReentryDirectiveValidator,
} from '../contexts/chamber/contracts';
import { startHallFollowUpThreadUseCase } from '../contexts/chamber/application/startHallFollowUpThread';
import { createAiProvider } from '../contexts/shared/convexGateway';
import { requireAuthUser, requireOwnedConversation } from '../contexts/shared/auth';
import { observeAction, setMainSpanAttributes } from '../observability/wideEvents';
import { wideEventError } from '../observability/errors';

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
    timeAwareReentry: v.optional(timeAwareReentryDirectiveValidator),
    guidanceDirectives: v.optional(v.array(activeGuidanceDirectiveValidator)),
  },
  handler: observeAction('ai.chat.chatWithMember', async (ctx, args) => {
    setMainSpanAttributes({
      'conversation.id': String(args.conversationId),
      'member.id': String(args.memberId),
    });
    return await chatWithMemberUseCase(ctx, args);
  }),
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
  handler: observeAction('ai.chat.compactConversation', async (ctx, args) => {
    setMainSpanAttributes({
      'conversation.id': String(args.conversationId),
      'memory.scope': args.memoryScope ?? 'unknown',
      'stats.message.count': args.messages.length,
    });
    return await compactConversationUseCase(ctx, args);
  }),
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
  handler: observeAction('ai.chat.summarizeHallRound', async (ctx, args) => {
    setMainSpanAttributes({
      'conversation.id': String(args.conversationId),
      'hall.round_number': args.roundNumber,
      'stats.message.count': args.messages.length,
    });
    await requireAuthUser(ctx);
    const conversation = await requireOwnedConversation(ctx, args.conversationId);
    if (conversation.kind !== 'hall') {
      throw wideEventError(
        'hall-round-summary-conversation-invalid',
        'Hall round summaries are only supported for hall conversations',
        { statusCode: 400 }
      );
    }
    const provider = createAiProvider();
    const summary = await provider.summarizeHallRound({
      roundNumber: args.roundNumber,
      messages: args.messages,
      model: args.model,
    });
    return { summary };
  }),
});

export const startHallFollowUpThread = action({
  args: {
    hallConversationId: v.id('conversations'),
    hallMessageId: v.id('messages'),
  },
  handler: observeAction('ai.chat.startHallFollowUpThread', async (ctx, args): Promise<StartHallFollowUpThreadResult> => {
    setMainSpanAttributes({
      'conversation.id': String(args.hallConversationId),
      'message.id': String(args.hallMessageId),
    });
    return await startHallFollowUpThreadUseCase(ctx, args);
  }),
});
