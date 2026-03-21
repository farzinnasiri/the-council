'use node';

import type { Id } from '../../../_generated/dataModel';
import { resolveRoundtableMaxSpeakers } from '../../../ai/roundtablePolicy';
import { buildRoundContext } from '../../../ai/orchestration/roundtableHall';
import { assertHallConversationOpen, requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import { createAiProvider, withTimeout } from '../../shared/convexGateway';
import type { RoundtableState } from '../../shared/types';
import { normalizeHallMode } from '../domain/hallMode';
import { allocateRoundCandidates, type RoundBidDraft } from '../domain/roundtableAllocator';
import type { PrepareRoundtableRoundInput } from '../contracts';
import { loadActiveMembersMap } from '../infrastructure/membersRepo';
import { listActiveMessages } from '../infrastructure/messagesRepo';
import { listActiveParticipants } from '../infrastructure/participantsRepo';
import { createRoundWithCandidates, getRoundtableState } from '../infrastructure/roundtableRepo';
import { setMainSpanAttributes } from '../../../observability/wideEvents';
import { wideEventError } from '../../../observability/errors';

const BID_TIMEOUT_MS = 3000;

export async function prepareRoundtableRoundUseCase(
  ctx: any,
  args: PrepareRoundtableRoundInput
): Promise<RoundtableState> {
  await requireAuthUser(ctx);
  const conversation = await requireOwnedConversation(ctx, args.conversationId);

  if (conversation.kind !== 'hall') {
    throw wideEventError('roundtable-prepare-conversation-kind-invalid', 'Roundtable rounds are only supported for hall conversations', {
      statusCode: 400,
    });
  }
  assertHallConversationOpen(conversation, {
    errorCode: 'roundtable-prepare-conversation-closed',
    message: 'This table is closed.',
  });

  if (normalizeHallMode(conversation) !== 'roundtable') {
    throw wideEventError('roundtable-prepare-mode-invalid', 'Conversation is not in roundtable mode', {
      statusCode: 400,
    });
  }
  setMainSpanAttributes({ 'hall.round.trigger': args.trigger });

  const [membersById, participants, activeMessages] = await Promise.all([
    loadActiveMembersMap(ctx),
    listActiveParticipants(ctx, args.conversationId),
    listActiveMessages(ctx, args.conversationId),
  ]);

  const activeMemberIds = participants.map((row) => row.memberId);
  const [existingRoundState, configuredMaxSpeakers] = await Promise.all([
    getRoundtableState(ctx, args.conversationId),
    resolveRoundtableMaxSpeakers(ctx),
  ]);
  const isOpeningRound = !existingRoundState;
  const maxSpeakers = isOpeningRound
    ? Math.max(1, activeMemberIds.length)
    : Math.max(1, Math.min(configuredMaxSpeakers, activeMemberIds.length));

  const triggerMessage = args.triggerMessageId
    ? activeMessages.find((message) => message._id === args.triggerMessageId)
    : undefined;

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

  const roundContext = buildRoundContext({
    userMessage: triggerMessage?.content,
    recentMessages,
  });

  if (isOpeningRound) {
    return await createRoundWithCandidates(ctx, {
      conversationId: args.conversationId,
      trigger: args.trigger,
      triggerMessageId: args.triggerMessageId,
      maxSpeakers,
      bids: [],
      candidates: activeMemberIds.map((memberId, index) => ({
        memberId,
        rank: index + 1,
        status: 'shortlisted' as const,
        moveType: 'synthesis' as const,
        targetMemberId: undefined,
        rationaleTag: 'new angle' as const,
        allocatorReason: 'Opening round: give your initial position.',
        score: 1,
        selectedBy: 'allocator' as const,
      })),
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
            message.roundNumber >= Math.max(1, (existingRoundState?.round.roundNumber ?? 1) - 3)
        )
        .map((message) => message.authorMemberId)
        .filter(Boolean)
    )
  ) as Id<'members'>[];
  const provider = createAiProvider();

  const bids = await Promise.all(
    activeMemberIds.map(async (memberId) => {
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
            mentionedMemberIds: args.mentionedMemberIds?.map((id) => id as string),
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
    currentRound: (existingRoundState?.round.roundNumber ?? 0) + 1,
    maxSpeakers,
    mentionedMemberIds: args.mentionedMemberIds,
    recentMessages: activeMessages,
  });

  return await createRoundWithCandidates(ctx, {
    conversationId: args.conversationId,
    trigger: args.trigger,
    triggerMessageId: args.triggerMessageId,
    maxSpeakers,
    initialStatus: 'awaiting_user',
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
    candidates: allocated.candidates.map((row) => ({
      memberId: row.memberId,
      rank: row.rank,
      status: row.status,
      moveType: row.moveType,
      targetMemberId: row.targetMemberId,
      rationaleTag: row.rationaleTag,
      allocatorReason: row.allocatorReason,
      score: row.score,
      selectedBy: row.selectedBy,
    })),
  });
}
