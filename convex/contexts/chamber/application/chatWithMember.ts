'use node';

import { requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import { createAiProvider, createKnowledgeRetriever, toKBDigestHints } from '../../shared/convexGateway';
import type { ChatWithMemberInput, ChatWithMemberResult } from '../contracts';
import { ensureChamberMemberStore, listMemberDigests } from '../infrastructure/chamberRepo';

export async function chatWithMemberUseCase(ctx: any, args: ChatWithMemberInput): Promise<ChatWithMemberResult> {
  await requireAuthUser(ctx);
  const [conversation, ensured] = await Promise.all([
    requireOwnedConversation(ctx, args.conversationId),
    ensureChamberMemberStore(ctx, args.memberId),
  ]);
  const member = ensured.member;
  const effectiveStoreName = ensured.storeName;

  if (conversation.kind === 'chamber' && conversation.chamberMemberId !== args.memberId) {
    throw new Error('Member does not match chamber conversation');
  }

  const hallBlock = args.hallContext?.trim()
    ? `[Hall Context Addendum]\n${args.hallContext.trim()}`
    : '';
  const summaryBlock = args.previousSummary?.trim()
    ? `[Conversation Memory]\n${args.previousSummary.trim()}`
    : '';
  const effectiveSystemPrompt = [
    member.systemPrompt.trim(),
    hallBlock,
    summaryBlock,
  ]
    .filter(Boolean)
    .join('\n\n');

  const kbDigests = member.deletedAt ? [] : await listMemberDigests(ctx, args.memberId);

  const provider = createAiProvider();
  return await provider.chatMember({
    query: args.message,
    storeName: effectiveStoreName,
    knowledgeRetriever: createKnowledgeRetriever(ctx, args.memberId),
    memoryHint: args.previousSummary,
    kbDigests: toKBDigestHints(kbDigests),
    responseModel: args.chatModel,
    retrievalModel: args.retrievalModel,
    temperature: 0.35,
    personaPrompt: effectiveSystemPrompt,
    contextMessages: (args.contextMessages ?? []).slice(-12),
    includeConversationContext: args.hallContext?.trim() ? false : true,
  });
}
