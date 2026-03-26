'use node';

import { api } from '../../../_generated/api';
import { resolveChatResponseSlot, resolveModel } from '../../../ai/modelConfig';
import { resolveHallRawRoundTail } from '../../../ai/hallMemoryPolicy';
import { assertHallConversationOpen, requireOwnedConversation, requireOwnedMember } from '../../shared/auth';
import { normalizeHallMode } from '../domain/hallMode';
import { moveTypeToRoundIntent } from '../domain/roundtableAllocator';
import type { ChatRoundtableSpeakerInput, RoundtableSingleSpeakerResponse } from '../contracts';
import { listHallRoundSummaries } from '../infrastructure/memoryRepo';
import { loadActiveMembersMap } from '../infrastructure/membersRepo';
import { listActiveMessages, listAllMessages } from '../infrastructure/messagesRepo';
import { listActiveParticipants } from '../infrastructure/participantsRepo';
import { getRoundtableState } from '../infrastructure/roundtableRepo';
import { buildRoundtableHallContext, runRoundtableSpeakerContribution } from './chatRoundtableSpeakers';
import { setMainSpanAttributes } from '../../../observability/wideEvents';
import { wideEventError } from '../../../observability/errors';

export async function chatRoundtableSpeakerUseCase(
  ctx: any,
  args: ChatRoundtableSpeakerInput
): Promise<RoundtableSingleSpeakerResponse> {
  const [conversation] = await Promise.all([
    requireOwnedConversation(ctx, args.conversationId),
    requireOwnedMember(ctx, args.memberId),
  ]);

  if (conversation.kind !== 'hall') {
    throw wideEventError('roundtable-conversation-kind-invalid', 'Roundtable speaking is only supported for hall conversations', {
      statusCode: 400,
    });
  }
  assertHallConversationOpen(conversation, {
    errorCode: 'roundtable-speaker-conversation-closed',
    message: 'This table is closed.',
  });

  if (normalizeHallMode(conversation) !== 'roundtable') {
    throw wideEventError('roundtable-mode-invalid', 'Conversation is not in roundtable mode', { statusCode: 400 });
  }

  await ctx.runMutation(api.conversations.ensureHallParticipantResponseSlots, {
    conversationId: args.conversationId,
  });

  const state = await getRoundtableState(ctx, args.conversationId);

  if (!state || state.round.roundNumber !== args.roundNumber) {
    throw wideEventError('roundtable-round-not-found', 'Round not found', { statusCode: 404 });
  }

  if (state.round.status !== 'awaiting_user' && state.round.status !== 'in_progress') {
    throw wideEventError('roundtable-round-not-open', 'Round is not open for speaking', { statusCode: 409 });
  }

  const persistedCandidateRow = state.candidates.find((row) => row.memberId === args.memberId);

  if (!persistedCandidateRow) {
    throw wideEventError('roundtable-member-not-in-round', 'Member is not part of this round', { statusCode: 404 });
  }

  if (
    persistedCandidateRow.status !== 'shortlisted' &&
    persistedCandidateRow.status !== 'speaking' &&
    !args.force
  ) {
    throw wideEventError('roundtable-member-not-selected', 'Member is not selected for this round', { statusCode: 409 });
  }

  const candidateRow: typeof persistedCandidateRow = persistedCandidateRow.status === 'shortlisted' || persistedCandidateRow.status === 'speaking'
    ? persistedCandidateRow
    : {
        ...persistedCandidateRow,
        moveType: 'clarification' as const,
        targetMemberId: undefined,
        allocatorReason: persistedCandidateRow.allocatorReason || 'User forced this member to speak in the round.',
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
  const participantSlotsByMemberId = new Map(
    participants.map((row) => [String(row.memberId), row.chatResponseModelSlot ?? 1])
  );

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
    throw wideEventError('roundtable-member-not-found', 'Member not found', { statusCode: 404 });
  }

  const effectiveIntent = moveTypeToRoundIntent(candidateRow.moveType);
  setMainSpanAttributes({
    'hall.round_number': args.roundNumber,
    'hall.intent': effectiveIntent,
    'hall.force': Boolean(args.force),
  });
  const single = await runRoundtableSpeakerContribution({
    ctx,
    conversationId: args.conversationId,
    roundNumber: args.roundNumber,
    memberId: args.memberId,
    candidateRow,
    membersById,
    rawContextMessages,
    roundSummaries,
    latestUserMessage,
    activeMembers,
    chatResponseModelSlot: participantSlotsByMemberId.get(String(args.memberId)) ?? 1,
    retrievalModel: args.retrievalModel,
    chatModel: args.chatModel,
    debugPromptTrace: args.debugPromptTrace,
  });

  if (single.status !== 'sent') {
    throw wideEventError(
      'roundtable-speaker-generation-failed',
      single.error || 'Roundtable speaker generation failed',
      { statusCode: 500 }
    );
  }

  return {
    answer: single.answer,
    grounded: Boolean(single.grounded),
    citations: single.citations ?? [],
    model: single.model ?? resolveChatResponseSlot(participantSlotsByMemberId.get(String(args.memberId)) ?? 1).spec,
    retrievalModel: single.retrievalModel ?? resolveModel('retrieval', args.retrievalModel),
    usedKnowledgeBase: typeof single.usedKnowledgeBase === 'boolean' ? single.usedKnowledgeBase : true,
    intent: effectiveIntent,
    targetMemberId: candidateRow.targetMemberId,
    attemptedResponseModelSlot: single.attemptedResponseModelSlot,
    attemptedResponseModelSpec: single.attemptedResponseModelSpec,
    finalResponseModelSlot: single.finalResponseModelSlot,
    finalResponseModelSpec: single.finalResponseModelSpec,
    fallbackUsed: single.fallbackUsed,
    promptTraceDraft: single.promptTraceDraft,
  };
}
