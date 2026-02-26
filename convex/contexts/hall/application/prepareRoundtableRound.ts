'use node';

import type { Id } from '../../../_generated/dataModel';
import { applyRoundDefaultSelection, buildRoundContext } from '../../../ai/orchestration/roundtableHall';
import type { RoundIntentProposal } from '../../../ai/provider/types';
import { requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import { createAiProvider, withTimeout } from '../../shared/convexGateway';
import type { MessageRow, PreparedRoundIntent, RoundtableState } from '../../shared/types';
import { normalizeHallMode } from '../domain/hallMode';
import type { PrepareRoundtableRoundInput } from '../contracts';
import { loadActiveMembersMap } from '../infrastructure/membersRepo';
import { listActiveMessages } from '../infrastructure/messagesRepo';
import { listActiveParticipants } from '../infrastructure/participantsRepo';
import { createRoundWithIntents } from '../infrastructure/roundtableRepo';

export async function prepareRoundtableRoundUseCase(
  ctx: any,
  args: PrepareRoundtableRoundInput
): Promise<RoundtableState> {
  await requireAuthUser(ctx);
  const conversation = await requireOwnedConversation(ctx, args.conversationId);

  if (conversation.kind !== 'hall') {
    throw new Error('Roundtable rounds are only supported for hall conversations');
  }

  if (normalizeHallMode(conversation) !== 'roundtable') {
    throw new Error('Conversation is not in roundtable mode');
  }

  const [membersById, participants, activeMessages] = await Promise.all([
    loadActiveMembersMap(ctx),
    listActiveParticipants(ctx, args.conversationId),
    listActiveMessages(ctx, args.conversationId),
  ]);

  const activeMemberIds = participants.map((row) => row.memberId);
  const filteredMentioned = (args.mentionedMemberIds ?? []).filter((memberId) => activeMemberIds.includes(memberId));
  const maxSpeakers = Math.max(1, activeMemberIds.length);

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
          intent: 'speak' as const,
          rationale: 'Can add one point.',
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
    mentionedMemberIds: filteredMentioned.map((id) => id as string),
    maxSpeakers,
  }) as PreparedRoundIntent[];

  return await createRoundWithIntents(ctx, {
    conversationId: args.conversationId,
    trigger: args.trigger,
    triggerMessageId: args.triggerMessageId,
    maxSpeakers,
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
