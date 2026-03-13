'use node';

import type { Id } from '../../../_generated/dataModel';
import { buildRoundContext } from '../../../ai/orchestration/roundtableHall';
import { requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import { createAiProvider, withTimeout } from '../../shared/convexGateway';
import type { RoundtableState } from '../../shared/types';
import { normalizeHallMode } from '../domain/hallMode';
import type { RefreshRoundtableRoundInput } from '../contracts';
import { loadActiveMembersMap } from '../infrastructure/membersRepo';
import { listActiveMessages } from '../infrastructure/messagesRepo';
import { updateRoundAfterTurn, getRoundtableState } from '../infrastructure/roundtableRepo';

export async function refreshRoundtableRoundUseCase(
  ctx: any,
  args: RefreshRoundtableRoundInput
): Promise<RoundtableState> {
  await requireAuthUser(ctx);
  const conversation = await requireOwnedConversation(ctx, args.conversationId);

  if (conversation.kind !== 'hall') {
    throw new Error('Roundtable rounds are only supported for hall conversations');
  }

  if (normalizeHallMode(conversation) !== 'roundtable') {
    throw new Error('Conversation is not in roundtable mode');
  }

  const [state, membersById, activeMessages] = await Promise.all([
    getRoundtableState(ctx, args.conversationId),
    loadActiveMembersMap(ctx),
    listActiveMessages(ctx, args.conversationId),
  ]);

  if (!state || state.round.roundNumber !== args.roundNumber) {
    throw new Error('Round not found');
  }

  if (state.round.status !== 'in_progress' && state.round.status !== 'awaiting_user') {
    throw new Error('Round is not open for refresh');
  }

  const spokenSet = new Set(state.spokenMemberIds.map((memberId) => memberId as string));
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

  const speakerRows = state.intents.filter((row) => spokenSet.has(row.memberId as string));
  const pendingCandidates = state.intents.filter(
    (row) => row.intent !== 'pass' && !spokenSet.has(row.memberId as string)
  );
  const remainingUnspoken = state.intents.filter((row) => !spokenSet.has(row.memberId as string));

  if (state.spokenMemberIds.length >= state.round.maxSpeakers || remainingUnspoken.length === 0) {
    return await updateRoundAfterTurn(ctx, {
      conversationId: args.conversationId,
      roundNumber: args.roundNumber,
      nextStatus: 'completed',
      updates: speakerRows.map((row) => ({
        memberId: row.memberId,
        selected: false,
      })),
    });
  }

  const provider = createAiProvider();
  const reevaluated = await Promise.all(
    pendingCandidates.map(async (row) => {
      const member = membersById.get(row.memberId as string);
      if (!member) {
        return {
          memberId: row.memberId,
          intent: row.intent,
          targetMemberId: row.targetMemberId,
          rationale: 'Member unavailable.',
          selected: false,
        };
      }

      try {
        const next = await withTimeout(
          provider.proposeRoundIntentPromptOnly({
            member: {
              id: member._id as string,
              name: member.name,
              specialties: member.specialties ?? [],
              systemPrompt: member.systemPrompt,
            },
            conversationContext: roundContext,
            memberIds: state.intents.map((item) => item.memberId as string),
          }),
          2500
        );

        if (next.intent === 'pass') {
          return {
            memberId: row.memberId,
            intent: row.intent,
            targetMemberId: row.targetMemberId,
            rationale: next.rationale,
            selected: false,
          };
        }

        return {
          memberId: row.memberId,
          intent: next.intent,
          targetMemberId: next.targetMemberId as Id<'members'> | undefined,
          rationale: next.rationale,
          selected: true,
        };
      } catch {
        return {
          memberId: row.memberId,
          intent: row.intent,
          targetMemberId: row.targetMemberId,
          rationale: 'Will keep listening for now.',
          selected: false,
        };
      }
    })
  );

  return await updateRoundAfterTurn(ctx, {
    conversationId: args.conversationId,
    roundNumber: args.roundNumber,
    nextStatus: 'awaiting_user',
    updates: [
      ...speakerRows.map((row) => ({
        memberId: row.memberId,
        selected: false,
      })),
      ...reevaluated,
    ],
  });
}
