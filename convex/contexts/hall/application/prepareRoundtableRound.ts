'use node';

import type { Id } from '../../../_generated/dataModel';
import { resolveRoundtableMaxSpeakers } from '../../../ai/roundtablePolicy';
import { applyRoundDefaultSelection, buildRoundContext } from '../../../ai/orchestration/roundtableHall';
import type { RoundIntentProposal } from '../../../ai/provider/types';
import { requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import { createAiProvider, withTimeout } from '../../shared/convexGateway';
import type { PreparedRoundIntent, RoundtableState } from '../../shared/types';
import { normalizeHallMode } from '../domain/hallMode';
import type { PrepareRoundtableRoundInput } from '../contracts';
import { loadActiveMembersMap } from '../infrastructure/membersRepo';
import { listActiveMessages } from '../infrastructure/messagesRepo';
import { listActiveParticipants } from '../infrastructure/participantsRepo';
import { createRoundWithIntents, getRoundtableState } from '../infrastructure/roundtableRepo';
import { setMainSpanAttributes } from '../../../observability/wideEvents';
import { wideEventError } from '../../../observability/errors';

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
    return await createRoundWithIntents(ctx, {
      conversationId: args.conversationId,
      trigger: args.trigger,
      triggerMessageId: args.triggerMessageId,
      maxSpeakers,
      intents: activeMemberIds.map((memberId) => ({
        memberId,
        intent: 'speak' as const,
        targetMemberId: undefined,
        rationale: 'Opening round: give your initial position.',
        selected: true,
        source: 'intent_default' as const,
      })),
    });
  }

  const provider = createAiProvider();

  const proposed = await Promise.all(
    activeMemberIds.map(async (memberId) => {
      const member = membersById.get(memberId as string);
      if (!member) {
        return {
          memberId: memberId as string,
          intent: 'pass' as const,
          rationale: 'Member unavailable.',
        } satisfies RoundIntentProposal & { memberId: string };
      }

      try {
        const intent = await withTimeout(
          provider.proposeRoundIntentPromptOnly({
            member: {
              id: member._id as string,
              name: member.name,
              specialties: member.specialties ?? [],
              systemPrompt: member.systemPrompt,
            },
            conversationContext: roundContext,
            memberIds: activeMemberIds.map((id) => id as string),
          }),
          2500
        );

        return {
          memberId: memberId as string,
          intent: intent.intent,
          targetMemberId: intent.targetMemberId,
          rationale: intent.rationale,
        };
      } catch {
        return {
          memberId: memberId as string,
          intent: 'pass' as const,
          rationale: 'Will listen unless a clearer opening emerges.',
        };
      }
    })
  );

  const preparedIntents = applyRoundDefaultSelection({
    intents: proposed.map((row) => ({
      memberId: row.memberId,
      intent: row.intent,
      targetMemberId: row.targetMemberId,
      rationale: row.rationale,
      selected: false,
      source: 'intent_default',
    })),
    maxSpeakers,
  }) as PreparedRoundIntent[];

  if (args.trigger === 'user_message' && preparedIntents.every((row) => !row.selected) && preparedIntents.length > 0) {
    for (const row of preparedIntents.slice(0, Math.min(2, maxSpeakers, preparedIntents.length))) {
      row.intent = 'speak';
      row.targetMemberId = undefined;
      row.rationale = 'Fresh user message: respond instead of deferring.';
      row.selected = true;
    }
  }

  return await createRoundWithIntents(ctx, {
    conversationId: args.conversationId,
    trigger: args.trigger,
    triggerMessageId: args.triggerMessageId,
    maxSpeakers,
    initialStatus: 'awaiting_user',
    intents: preparedIntents.map((row) => ({
      memberId: row.memberId as Id<'members'>,
      intent: row.intent,
      targetMemberId: row.targetMemberId as Id<'members'> | undefined,
      rationale: row.rationale,
      selected: row.selected,
      source: row.source,
    })),
  });
}
