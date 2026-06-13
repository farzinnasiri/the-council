import type { ModelTarget } from '../modelConfig';

export type ResponseReasoningMode = 'standard' | 'thinking';
export type ResponseReasoningEffort = 'low' | 'medium' | 'high';

export function shouldUseResponseReasoning(input: {
  chatProfile: 'instant' | 'short' | 'think';
  retrievalStrategy: 'instant' | 'brainstorm' | 'deep_dive';
}): boolean {
  return input.chatProfile === 'think' || input.retrievalStrategy === 'brainstorm' || input.retrievalStrategy === 'deep_dive';
}

export function resolveResponseReasoningEffort(
  target: ModelTarget,
  mode: ResponseReasoningMode,
): ResponseReasoningEffort | undefined {
  if (mode !== 'thinking') return undefined;

  if (target.provider === 'openai') return 'low';
  if (target.provider === 'google') return 'medium';
  if (target.provider === 'openrouter' && (target.model.startsWith('x-ai/') || target.model.startsWith('x-ai:'))) {
    return 'medium';
  }
  if (target.provider === 'openrouter' && target.model.startsWith('google/')) return 'medium';

  return undefined;
}
