'use node';

import type { Id } from '../../_generated/dataModel';
import type { ProviderChatResponse } from '../../ai/provider/types';
import type { ContextMessageInput } from '../shared/types';
import { v } from 'convex/values';

export const timeAwareReentryDirectiveValidator = v.object({
  gapBucket: v.union(
    v.literal('mild'),
    v.literal('medium'),
    v.literal('strong'),
    v.literal('very_strong')
  ),
  repliesRemaining: v.union(v.literal(1), v.literal(2)),
  explicitContinuation: v.boolean(),
});

export type TimeAwareReentryDirective = {
  gapBucket: 'mild' | 'medium' | 'strong' | 'very_strong';
  repliesRemaining: 1 | 2;
  explicitContinuation: boolean;
};

export interface ChatWithMemberInput {
  conversationId: Id<'conversations'>;
  memberId: Id<'members'>;
  message: string;
  previousSummary?: string;
  contextMessages?: ContextMessageInput[];
  hallContext?: string;
  chatModel?: string;
  chatProfile?: 'instant' | 'short' | 'think' | 'deep_dive';
  retrievalModel?: string;
  retrievalProfile?: 'default' | 'deep_dive';
  turnDirective?: 'shorter' | 'elaborate';
  timeAwareReentry?: TimeAwareReentryDirective;
}

export type ChatWithMemberResult = ProviderChatResponse;

export interface CompactConversationInput {
  conversationId: Id<'conversations'>;
  previousSummary?: string;
  messageIds: Id<'messages'>[];
  messages: ContextMessageInput[];
  memoryScope?: 'chamber' | 'hall';
  memoryContext?: {
    conversationId: string;
    memberName: string;
    memberSpecialties: string[];
  };
}

export interface CompactConversationResult {
  summary: string;
}

export interface StartHallFollowUpThreadInput {
  hallConversationId: Id<'conversations'>;
  hallMessageId: Id<'messages'>;
}

export interface StartHallFollowUpThreadResult {
  conversation: Record<string, unknown>;
  messages: Array<Record<string, unknown>>;
  memory: string;
}

export interface ChamberApplicationService {
  chatWithMember(input: ChatWithMemberInput): Promise<ChatWithMemberResult>;
  compactConversation(input: CompactConversationInput): Promise<CompactConversationResult>;
  suggestChamberTitle(input: { message: string; model?: string }): Promise<{ title: string; model: string }>;
}
