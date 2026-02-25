'use node';

import { ChatGoogle } from '@langchain/google';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ModelTarget } from '../modelConfig';

function resolveOpenAiKey(): string {
  const key = process.env.OPENAI_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_KEY (or OPENAI_API_KEY) is not set in Convex runtime env');
  }
  return key;
}

function resolveGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set in Convex runtime env');
  }
  return key;
}

export function createChatModel(target: ModelTarget, options?: { temperature?: number }): BaseChatModel {
  const temperature = options?.temperature;
  if (target.provider === 'openai') {
    // GPT-5.2 chat models in this project deployment currently reject custom temperature values.
    // Let the provider use its model default instead of forcing a value.
    return new ChatOpenAI({
      apiKey: resolveOpenAiKey(),
      model: target.model,
    });
  }

  return new ChatGoogle({
    apiKey: resolveGeminiKey(),
    model: target.model,
    temperature,
  });
}
