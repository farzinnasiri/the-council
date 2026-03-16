'use node';

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import type { ZodType } from 'zod';
import { appendMainList, measureMainStage, incrementMainStat } from '../../observability/wideEvents';

function resolveModelName(model: BaseChatModel): string {
  const candidate =
    (model as { model?: string }).model ??
    (model as { modelName?: string }).modelName ??
    ((model as { lc_kwargs?: { model?: string; modelName?: string } }).lc_kwargs?.model ??
      (model as { lc_kwargs?: { model?: string; modelName?: string } }).lc_kwargs?.modelName);
  return candidate ? String(candidate) : 'unknown';
}

export async function invokeText(model: BaseChatModel, prompt: string): Promise<string> {
  incrementMainStat('stats.ai.text.count', 1);
  const response = await measureMainStage('external_ai.text', async () =>
    await model.invoke([new HumanMessage(prompt)])
  );
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
  const trimmed = content.trim();
  appendMainList('llm.calls', {
    kind: 'text',
    model: resolveModelName(model),
    prompt,
    response: trimmed,
  });
  return trimmed;
}

export async function invokeStructured<T>(
  model: BaseChatModel,
  prompt: string,
  schema: ZodType<T>,
): Promise<T> {
  const runnable = model.withStructuredOutput(schema);
  incrementMainStat('stats.ai.structured.count', 1);
  const output = (await measureMainStage('external_ai.structured', async () =>
    await runnable.invoke([new HumanMessage(prompt)])
  )) as T;
  appendMainList('llm.calls', {
    kind: 'structured',
    model: resolveModelName(model),
    prompt,
    response: JSON.stringify(output),
  });
  return output;
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
