'use node';

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import type { ZodType } from 'zod';

export async function invokeText(model: BaseChatModel, prompt: string): Promise<string> {
  const response = await model.invoke([new HumanMessage(prompt)]);
  const content = typeof response.content === 'string'
    ? response.content
    : Array.isArray(response.content)
      ? response.content
          .map((part) => {
            if (typeof part === 'string') return part;
            if (typeof part === 'object' && part && 'text' in part) {
              return String((part as { text?: string }).text ?? '');
            }
            return '';
          })
          .join('')
      : '';
  return content.trim();
}

export async function invokeStructured<T>(
  model: BaseChatModel,
  prompt: string,
  schema: ZodType<T>,
): Promise<T> {
  const runnable = model.withStructuredOutput(schema);
  return (await runnable.invoke([new HumanMessage(prompt)])) as T;
}

export function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
