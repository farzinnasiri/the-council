import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ModelSlot, ModelTarget } from '../modelConfig';

export type { ModelSlot, ModelTarget };

export interface CouncilContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TraceState {
  traceId: string;
  mode: 'with-kb' | 'prompt-only';
  reason?: string;
  answerPrompt: string;
}

export type ChatModel = BaseChatModel;
