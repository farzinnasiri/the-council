'use node';

import { resolveModel } from '../../../ai/modelConfig';
import { resolveHallRawRoundTail } from '../../../ai/hallMemoryPolicy';
import { chatWithMemberUseCase } from '../../chamber/application/chatWithMember';
import { requireOwnedConversation, requireOwnedMember } from '../../shared/auth';
import { normalizeHallMode } from '../domain/hallMode';
import type { ChatRoundtableSpeakerInput, RoundtableSingleSpeakerResponse } from '../contracts';
import { buildContextMessages, buildHallContextAddendum } from '../domain/hallPrompt';
import { listHallRoundSummaries } from '../infrastructure/memoryRepo';
import { loadActiveMembersMap } from '../infrastructure/membersRepo';
import { listActiveMessages, listAllMessages } from '../infrastructure/messagesRepo';
import { listActiveParticipants } from '../infrastructure/participantsRepo';
import { getRoundtableState } from '../infrastructure/roundtableRepo';
import { buildRoundtableHallContext } from './chatRoundtableSpeakers';

export async function chatRoundtableSpeakerUseCase(
  ctx: any,
  args: ChatRoundtableSpeakerInput
): Promise<RoundtableSingleSpeakerResponse> {
  const [conversation] = await Promise.all([
    requireOwnedConversation(ctx, args.conversationId),
    requireOwnedMember(ctx, args.memberId),
  ]);

  if (conversation.kind !== 'hall') {
    throw new Error('Roundtable speaking is only supported for hall conversations');
  }

  if (normalizeHallMode(conversation) !== 'roundtable') {
    throw new Error('Conversation is not in roundtable mode');
  }

  const state = await getRoundtableState(ctx, args.conversationId);

  if (!state || state.round.roundNumber !== args.roundNumber) {
    throw new Error('Round not found');
  }

  if (state.round.status !== 'awaiting_user' && state.round.status !== 'in_progress') {
    throw new Error('Round is not open for speaking');
  }

  const persistedIntentRow = state.intents.find((row) => row.memberId === args.memberId);

  if (!persistedIntentRow) {
    throw new Error('Member is not part of this round');
  }

  if (!persistedIntentRow.selected && !args.force) {
    throw new Error('Member is not selected for this round');
  }

  const intentRow: typeof persistedIntentRow = persistedIntentRow.selected
    ? persistedIntentRow
    : {
        ...persistedIntentRow,
        intent: 'speak' as const,
        targetMemberId: undefined,
        rationale: persistedIntentRow.rationale || 'User forced this member to speak in the round.',
      };

  const [participants, membersById, activeMessages, allMessages, hallSummaryRows, rawRoundTail] = await Promise.all([
    listActiveParticipants(ctx, args.conversationId),
    loadActiveMembersMap(ctx),
    listActiveMessages(ctx, args.conversationId),
    listAllMessages(ctx, args.conversationId),
    listHallRoundSummaries(ctx, args.conversationId),
    resolveHallRawRoundTail(ctx),
  ]);

  const activeMembers = participants
    .map((row) => membersById.get(row.memberId as string))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const latestUserMessage = [...allMessages]
    .reverse()
    .find((message) => message.role === 'user' && message.status !== 'error');
  const { rawContextMessages, roundSummaries } = buildRoundtableHallContext({
    activeMessages,
    hallSummaryRows,
    roundNumber: args.roundNumber,
    rawRoundTail,
  });
  const member = membersById.get(args.memberId as string);
  if (!member) {
    throw new Error('Member not found');
  }

  const effectiveIntent = intentRow.intent === 'pass' ? 'speak' : intentRow.intent;
  const targetName = intentRow.targetMemberId
    ? (membersById.get(intentRow.targetMemberId as string)?.name ?? 'another member')
    : undefined;

  const hallContext = [
    buildHallContextAddendum({
      member,
      participants: activeMembers,
      hallMode: 'roundtable',
      roundSummaries,
      rawMessages: rawContextMessages,
      conversationId: args.conversationId,
    }),
    '',
    '[Roundtable Turn]',
    `Round #${args.roundNumber}.`,
    `Your move in this round: ${effectiveIntent}.`,
    targetName ? `Address or react to: ${targetName}.` : '',
    'Give one concise contribution for this turn.',
  ]
    .filter(Boolean)
    .join('\n');

  const single = await chatWithMemberUseCase(ctx, {
    conversationId: args.conversationId,
    memberId: args.memberId,
    message: latestUserMessage?.content ?? 'Continue deliberation.',
    contextMessages: buildContextMessages({
      messages: rawContextMessages,
      membersById,
      selfMemberId: args.memberId,
      omitLatestUserMessage: true,
    }),
    hallContext,
    retrievalModel: args.retrievalModel,
    chatModel: args.chatModel,
  });

  return {
    answer: single.answer,
    grounded: single.grounded,
    citations: single.citations,
    model: single.model ?? resolveModel('chatResponse', args.chatModel),
    retrievalModel: single.retrievalModel ?? resolveModel('retrieval', args.retrievalModel),
    usedKnowledgeBase: typeof single.usedKnowledgeBase === 'boolean' ? single.usedKnowledgeBase : true,
    debug: single.debug,
    intent: effectiveIntent,
    targetMemberId: intentRow.targetMemberId,
  };
}
