'use node';

import type { Id } from '../../_generated/dataModel';
import type { ProviderChatResponse } from '../../ai/provider/types';
import type { ContextMessageInput } from '../shared/types';

export interface ChatWithMemberInput {
  conversationId: Id<'conversations'>;
  memberId: Id<'members'>;
  message: string;
  previousSummary?: string;
  contextMessages?: ContextMessageInput[];
  hallContext?: string;
  chatModel?: string;
  retrievalModel?: string;
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

export interface ChamberApplicationService {
  chatWithMember(input: ChatWithMemberInput): Promise<ChatWithMemberResult>;
  compactConversation(input: CompactConversationInput): Promise<CompactConversationResult>;
}
