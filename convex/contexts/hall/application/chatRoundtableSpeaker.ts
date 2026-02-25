'use node';

import { resolveModel } from '../../../ai/modelConfig';
import { requireAuthUser, requireOwnedConversation, requireOwnedMember } from '../../shared/auth';
import { normalizeHallMode } from '../domain/hallMode';
import type { ChatRoundtableSpeakerInput, RoundtableSingleSpeakerResponse } from '../contracts';
import { loadActiveMembersMap } from '../infrastructure/membersRepo';
import { listActiveMessages, listAllMessages } from '../infrastructure/messagesRepo';
import { listActiveParticipants } from '../infrastructure/participantsRepo';
import { getRoundtableState } from '../infrastructure/roundtableRepo';
import { runRoundtableSpeakerContribution } from './chatRoundtableSpeakers';

export async function chatRoundtableSpeakerUseCase(
  ctx: any,
  args: ChatRoundtableSpeakerInput
): Promise<RoundtableSingleSpeakerResponse> {
  await requireAuthUser(ctx);
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

  const intentRow = state.intents.find((row) => row.memberId === args.memberId && row.selected);

  if (!intentRow) {
    throw new Error('Member is not selected for this round');
  }

  const [participants, membersById, activeMessages, allMessages] = await Promise.all([
    listActiveParticipants(ctx, args.conversationId),
    loadActiveMembersMap(ctx),
    listActiveMessages(ctx, args.conversationId),
    listAllMessages(ctx, args.conversationId),
  ]);

  const activeMembers = participants
    .map((row) => membersById.get(row.memberId as string))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const latestUserMessage = [...allMessages]
    .reverse()
    .find((message) => message.role === 'user' && message.status !== 'error');

  const single = await runRoundtableSpeakerContribution({
    ctx,
    conversationId: args.conversationId,
    roundNumber: args.roundNumber,
    memberId: args.memberId,
    intentRow,
    membersById,
    activeMessages,
    latestUserMessage,
    activeMembers,
    retrievalModel: args.retrievalModel,
    chatModel: args.chatModel,
  });

  if (single.status === 'error') {
    throw new Error(single.error ?? 'Roundtable speaker failed');
  }

  return {
    answer: single.answer,
    grounded: false,
    citations: [],
    model: resolveModel('chatResponse', args.chatModel),
    retrievalModel: resolveModel('retrieval', args.retrievalModel),
    usedKnowledgeBase: true,
    intent: single.intent,
    targetMemberId: single.targetMemberId,
  };
}
