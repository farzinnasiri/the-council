'use node';

import { resolveModelTarget } from '../modelConfig';
import { createChatModel } from '../runtime/modelFactory';
import { invokeText } from '../runtime/structured';

export async function runHallClosureGraph(input: {
  hallTitle: string;
  hallMode: 'advisory' | 'roundtable';
  transcript: string;
  model?: string;
}): Promise<{ text: string; model: string }> {
  const target = resolveModelTarget('hallClosure', input.model);
  const model = createChatModel(target, { temperature: 0.1, thinkingBudget: 8192 });
  const prompt = [
    'You are closing a council table.',
    `Hall title: ${input.hallTitle}`,
    `Hall mode: ${input.hallMode}`,
    '',
    'Read the full raw transcript below.',
    'The transcript only contains the actual user and member dialogue.',
    'Extract the key and important material from the discussion.',
    'Include verbatim quotes, lines, and ideas when they matter.',
    'Surface the strongest claims, tensions, turning points, and recurring themes.',
    'End with a free-form concluding synthesis.',
    'Do not return JSON, XML, or any rigid schema.',
    '',
    '[Full Hall Transcript]',
    input.transcript,
  ].join('\n');

  const text = await invokeText(model, prompt);
  return {
    text,
    model: target.model,
  };
}
