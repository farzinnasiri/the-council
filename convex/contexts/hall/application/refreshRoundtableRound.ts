'use node';

import type { Id } from '../../../_generated/dataModel';
import { buildRoundContext } from '../../../ai/orchestration/roundtableHall';
import { assertHallConversationOpen, requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import { createAiProvider, withTimeout } from '../../shared/convexGateway';
import type { RoundtableState, RoundtableCandidateStatus } from '../../shared/types';
import { normalizeHallMode } from '../domain/hallMode';
import { allocateRoundCandidates, type RoundBidDraft } from '../domain/roundtableAllocator';
import type { RefreshRoundtableRoundInput } from '../contracts';
import { loadActiveMembersMap } from '../infrastructure/membersRepo';
import { listActiveMessages } from '../infrastructure/messagesRepo';
import { listActiveParticipants } from '../infrastructure/participantsRepo';
import { getRoundtableState, updateRoundSnapshot } from '../infrastructure/roundtableRepo';
import { setMainSpanAttributes } from '../../../observability/wideEvents';
import { wideEventError } from '../../../observability/errors';

const BID_TIMEOUT_MS = 3000;

export async function refreshRoundtableRoundUseCase(
  ctx: any,
  args: RefreshRoundtableRoundInput
): Promise<RoundtableState> {
  await requireAuthUser(ctx);
  const conversation = await requireOwnedConversation(ctx, args.conversationId);

  if (conversation.kind !== 'hall') {
    throw wideEventError('roundtable-refresh-conversation-kind-invalid', 'Roundtable rounds are only supported for hall conversations', {
      statusCode: 400,
    });
  }
  assertHallConversationOpen(conversation, {
    errorCode: 'roundtable-refresh-conversation-closed',
    message: 'This table is closed.',
  });

  if (normalizeHallMode(conversation) !== 'roundtable') {
    throw wideEventError('roundtable-refresh-mode-invalid', 'Conversation is not in roundtable mode', {
      statusCode: 400,
    });
  }

  const [state, membersById, activeMessages, participants] = await Promise.all([
    getRoundtableState(ctx, args.conversationId),
    loadActiveMembersMap(ctx),
    listActiveMessages(ctx, args.conversationId),
    listActiveParticipants(ctx, args.conversationId),
  ]);

  if (!state || state.round.roundNumber !== args.roundNumber) {
    throw wideEventError('roundtable-refresh-round-not-found', 'Round not found', { statusCode: 404 });
  }

  if (state.round.status !== 'in_progress' && state.round.status !== 'awaiting_user') {
    throw wideEventError('roundtable-refresh-round-not-open', 'Round is not open for refresh', { statusCode: 409 });
  }
  setMainSpanAttributes({ 'hall.round_number': args.roundNumber });

  const activeMemberIds = participants.map((row) => row.memberId);
  const spokenSet = new Set(state.spokenMemberIds.map((memberId) => String(memberId)));
  const recentMessages = activeMessages
    .filter((message) => message.role !== 'system' && message.status !== 'error')
    .slice(-12)
    .map((message) => ({
      author:
        message.role === 'user'
          ? 'User'
          : (membersById.get(message.authorMemberId as string)?.name ?? 'Member'),
      content: message.content,
    }));
  const latestUserMessage = [...activeMessages]
    .reverse()
    .find((message) => message.role === 'user' && message.status !== 'error');
  const roundContext = buildRoundContext({
    userMessage: latestUserMessage?.content,
    recentMessages,
  });

  const remainingUnspoken = activeMemberIds.filter((memberId) => !spokenSet.has(String(memberId)));
  if (state.spokenMemberIds.length >= state.round.maxSpeakers || remainingUnspoken.length === 0) {
    const completedCandidates = state.candidates.map((candidate) => ({
      memberId: candidate.memberId as Id<'members'>,
      rank: candidate.rank,
      status: spokenSet.has(String(candidate.memberId)) ? ('spoken' as const) : ('dismissed' as const),
      moveType: candidate.moveType,
      targetMemberId: candidate.targetMemberId as Id<'members'> | undefined,
      rationaleTag: candidate.rationaleTag,
      allocatorReason: candidate.allocatorReason,
      score: candidate.score,
      selectedBy: candidate.selectedBy,
    }));

    return await updateRoundSnapshot(ctx, {
      conversationId: args.conversationId,
      roundNumber: args.roundNumber,
      nextStatus: 'completed',
      bids: [],
      candidates: completedCandidates,
    });
  }

  const recentSpeakerIds = Array.from(
    new Set(
      activeMessages
        .filter(
          (message) =>
            message.role === 'member' &&
            message.status !== 'error' &&
            typeof message.roundNumber === 'number' &&
            message.roundNumber >= Math.max(1, args.roundNumber - 3)
        )
        .map((message) => message.authorMemberId)
        .filter(Boolean)
    )
  ) as Id<'members'>[];
  const provider = createAiProvider();

  const bids = await Promise.all(
    remainingUnspoken.map(async (memberId) => {
      const member = membersById.get(memberId as string);
      if (!member) {
        return {
          memberId,
          wantsToSpeak: false,
          moveType: 'pass' as const,
          targetMemberId: undefined,
          noveltyClaim: 'Member unavailable.',
          confidence: 0.1,
          estimatedValue: 0.05,
        } satisfies RoundBidDraft;
      }

      try {
        const bid = await withTimeout(
          provider.proposeRoundBidPromptOnly({
            member: {
              id: member._id as string,
              name: member.name,
              specialties: member.specialties ?? [],
              systemPrompt: member.systemPrompt,
            },
            conversationContext: roundContext,
            memberIds: activeMemberIds.map((id) => id as string),
            recentSpeakerIds: recentSpeakerIds.map((id) => id as string),
          }),
          BID_TIMEOUT_MS
        );

        return {
          memberId,
          wantsToSpeak: bid.wantsToSpeak,
          moveType: bid.moveType,
          targetMemberId: bid.targetMemberId as Id<'members'> | undefined,
          noveltyClaim: bid.noveltyClaim,
          confidence: bid.confidence,
          estimatedValue: bid.estimatedValue,
        } satisfies RoundBidDraft;
      } catch {
        return {
          memberId,
          wantsToSpeak: false,
          moveType: 'pass' as const,
          targetMemberId: undefined,
          noveltyClaim: 'No reliable bid available.',
          confidence: 0.15,
          estimatedValue: 0.1,
        } satisfies RoundBidDraft;
      }
    })
  );

  const allocated = allocateRoundCandidates({
    bids,
    activeMemberIds,
    currentRound: args.roundNumber,
    maxSpeakers: Math.max(1, state.round.maxSpeakers - state.spokenMemberIds.length),
    recentMessages: activeMessages,
    spokenMemberIds: state.spokenMemberIds,
    existingCandidatesByMemberId: new Map(
      state.candidates.map((candidate) => [String(candidate.memberId), { selectedBy: candidate.selectedBy }])
    ),
  });

  const mergedCandidates: Array<{
    memberId: Id<'members'>;
    rank: number;
    status: RoundtableCandidateStatus;
    moveType: typeof state.candidates[number]['moveType'];
    targetMemberId?: Id<'members'>;
    rationaleTag: typeof state.candidates[number]['rationaleTag'];
    allocatorReason: string;
    score: number;
    selectedBy: typeof state.candidates[number]['selectedBy'];
  }> = state.candidates
    .filter((candidate) => spokenSet.has(String(candidate.memberId)))
    .map((candidate) => ({
      memberId: candidate.memberId as Id<'members'>,
      rank: 0,
      status: 'spoken' as const,
      moveType: candidate.moveType,
      targetMemberId: candidate.targetMemberId as Id<'members'> | undefined,
      rationaleTag: candidate.rationaleTag,
      allocatorReason: candidate.allocatorReason,
      score: candidate.score,
      selectedBy: candidate.selectedBy,
    }));

  for (const candidate of allocated.candidates) {
    if (spokenSet.has(String(candidate.memberId))) continue;
    mergedCandidates.push({
      memberId: candidate.memberId,
      rank: candidate.rank,
      status: candidate.status,
      moveType: candidate.moveType,
      targetMemberId: candidate.targetMemberId,
      rationaleTag: candidate.rationaleTag,
      allocatorReason: candidate.allocatorReason,
      score: candidate.score,
      selectedBy: candidate.selectedBy,
    });
  }

  return await updateRoundSnapshot(ctx, {
    conversationId: args.conversationId,
    roundNumber: args.roundNumber,
    nextStatus: 'awaiting_user',
    bids: allocated.bids.map((row) => ({
      memberId: row.memberId,
      wantsToSpeak: row.wantsToSpeak,
      moveType: row.moveType,
      targetMemberId: row.targetMemberId,
      noveltyClaim: row.noveltyClaim,
      confidence: row.confidence,
      estimatedValue: row.estimatedValue,
      relevanceScore: row.relevanceScore,
      noveltyScore: row.noveltyScore,
      tensionScore: row.tensionScore,
      coverageScore: row.coverageScore,
      recencyPenalty: row.recencyPenalty,
      dominancePenalty: row.dominancePenalty,
      mentionBoost: row.mentionBoost,
      overlapPenalty: row.overlapPenalty,
      allocatorScore: row.allocatorScore,
      allocatorReason: row.allocatorReason,
    })),
    candidates: mergedCandidates,
  });
}
