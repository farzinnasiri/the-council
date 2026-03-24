'use node';

import { ChatGoogle } from '@langchain/google';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOpenRouter } from '@langchain/openrouter';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ModelTarget } from '../modelConfig';
import { wideEventError } from '../../observability/errors';

function shouldForceResponsesApi(target: ModelTarget): boolean {
  return target.provider === 'openai' && target.model.startsWith('gpt-5');
}

function resolveOpenAiKey(): string {
  const key = process.env.OPENAI_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw wideEventError(
      'runtime-openai-key-missing',
      'OPENAI_KEY (or OPENAI_API_KEY) is not set in Convex runtime env'
    );
  }
  return key;
}

function resolveGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw wideEventError('runtime-gemini-key-missing', 'GEMINI_API_KEY is not set in Convex runtime env');
  }
  return key;
}

function resolveOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw wideEventError(
      'runtime-openrouter-key-missing',
      'OPENROUTER_API_KEY is not set in Convex runtime env'
    );
  }
  return key;
}

function normalizeOpenRouterModel(model: string): string {
  const [provider, ...rest] = model.split(':');
  if (!provider || rest.length === 0) {
    return model;
  }
  return `${provider}/${rest.join(':')}`;
}

export function createChatModel(
  target: ModelTarget,
  options?: { temperature?: number; thinkingBudget?: number }
): BaseChatModel {
  const temperature = options?.temperature;
  if (target.provider === 'openai') {
    const useResponsesApi = shouldForceResponsesApi(target);
    // GPT-5.2 chat models in this project deployment currently reject custom temperature values.
    // Let the provider use its model default instead of forcing a value.
    return new ChatOpenAI({
      apiKey: resolveOpenAiKey(),
      model: target.model,
      useResponsesApi,
    });
  }

  if (target.provider === 'openrouter') {
    return new ChatOpenRouter({
      apiKey: resolveOpenRouterKey(),
      model: normalizeOpenRouterModel(target.model),
      temperature,
    });
  }

  return new ChatGoogle({
    apiKey: resolveGeminiKey(),
    model: target.model,
    temperature,
    ...(typeof options?.thinkingBudget === 'number'
      ? { thinkingConfig: { thinkingBudget: options.thinkingBudget } }
      : {}),
  });
}
