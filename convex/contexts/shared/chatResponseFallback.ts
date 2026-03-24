'use node';

import { resolveChatResponseSlot } from '../../ai/modelConfig';

export interface ChatResponseFallbackMetadata {
  attemptedResponseModelSlot: number;
  attemptedResponseModelSpec: string;
  finalResponseModelSlot: number;
  finalResponseModelSpec: string;
  fallbackUsed: boolean;
}

export async function runWithChatResponseFallback<T>(input: {
  preferredSlot?: number;
  responseModelOverride?: string;
  invoke: (responseModel: string) => Promise<T>;
}): Promise<{ result: T; metadata: ChatResponseFallbackMetadata }> {
  const attemptedSlot = resolveChatResponseSlot(input.preferredSlot);
  const attemptedSpec = input.responseModelOverride?.trim() || attemptedSlot.spec;

  try {
    const result = await input.invoke(attemptedSpec);
    return {
      result,
      metadata: {
        attemptedResponseModelSlot: attemptedSlot.slot,
        attemptedResponseModelSpec: attemptedSpec,
        finalResponseModelSlot: attemptedSlot.slot,
        finalResponseModelSpec: attemptedSpec,
        fallbackUsed: false,
      },
    };
  } catch (error) {
    if (attemptedSlot.slot === 1) {
      throw error;
    }

    const fallbackSlot = resolveChatResponseSlot(1);
    const result = await input.invoke(fallbackSlot.spec);
    return {
      result,
      metadata: {
        attemptedResponseModelSlot: attemptedSlot.slot,
        attemptedResponseModelSpec: attemptedSpec,
        finalResponseModelSlot: fallbackSlot.slot,
        finalResponseModelSpec: fallbackSlot.spec,
        fallbackUsed: true,
      },
    };
  }
}
