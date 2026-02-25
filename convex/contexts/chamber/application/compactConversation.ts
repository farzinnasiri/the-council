'use node';

import { requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import { createAiProvider } from '../../shared/convexGateway';
import type { CompactConversationInput, CompactConversationResult } from '../contracts';

export async function compactConversationUseCase(
  ctx: any,
  args: CompactConversationInput
): Promise<CompactConversationResult> {
  await requireAuthUser(ctx);
  await requireOwnedConversation(ctx, args.conversationId);

  if (!args.messages.length || !args.messageIds.length) {
    throw new Error('messages and messageIds are required');
  }

  const provider = createAiProvider();
  const summary =
    args.memoryScope === 'chamber' && args.memoryContext?.memberName
      ? await provider.summarizeChamberMemory({
          messages: args.messages,
          previousSummary: args.previousSummary,
          memberName: args.memoryContext.memberName,
          memberSpecialties: args.memoryContext.memberSpecialties,
        })
      : await provider.summarizeConversation({
          messages: args.messages,
          previousSummary: args.previousSummary,
        });

  return { summary };
}
