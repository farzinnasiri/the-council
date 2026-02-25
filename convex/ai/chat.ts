'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { contextMessageValidator } from '../contexts/shared/contracts';
import { chatWithMemberUseCase } from '../contexts/chamber/application/chatWithMember';
import { compactConversationUseCase } from '../contexts/chamber/application/compactConversation';

export const chatWithMember = action({
  args: {
    conversationId: v.id('conversations'),
    memberId: v.id('members'),
    message: v.string(),
    previousSummary: v.optional(v.string()),
    contextMessages: v.optional(v.array(contextMessageValidator)),
    hallContext: v.optional(v.string()),
    chatModel: v.optional(v.string()),
    retrievalModel: v.optional(v.string()),
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
