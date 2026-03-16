'use node';

import { api, internal } from '../../../_generated/api';
import { createAiProvider } from '../../shared/convexGateway';
import { requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import type { MessageRow } from '../../shared/types';
import type { StartHallFollowUpThreadInput, StartHallFollowUpThreadResult } from '../contracts';
import { listAllMessages } from '../../hall/infrastructure/messagesRepo';
import { listActiveParticipants } from '../../hall/infrastructure/participantsRepo';
import { listHallRoundSummaries } from '../../hall/infrastructure/memoryRepo';
import { wideEventError } from '../../../observability/errors';

function isActiveMessage(message: MessageRow) {
  return !message.deletedAt && !message.compacted && message.status !== 'error';
}

function buildTranscript(messages: MessageRow[], memberNames: Map<string, string>) {
  return messages
    .filter((message) => isActiveMessage(message) && message.role !== 'system')
    .map((message) => ({
      author:
        message.role === 'user'
          ? 'User'
          : memberNames.get(message.authorMemberId as string) ?? 'Member',
      content: message.content,
    }));
}

function findPairedUserMessage(messages: MessageRow[], anchor: MessageRow) {
  const ordered = messages
    .filter((message) => isActiveMessage(message) && message.role !== 'system')
    .sort((a, b) => a._creationTime - b._creationTime);
  const anchorIndex = ordered.findIndex((message) => message._id === anchor._id);
  if (anchorIndex <= 0) return undefined;
  for (let index = anchorIndex - 1; index >= 0; index -= 1) {
    const candidate = ordered[index];
    if (candidate.role === 'user') {
      return candidate.content;
    }
  }
  return undefined;
}

export async function startHallFollowUpThreadUseCase(
  ctx: any,
  args: StartHallFollowUpThreadInput
): Promise<StartHallFollowUpThreadResult> {
  const userId = await requireAuthUser(ctx);
  const conversation = await requireOwnedConversation(ctx, args.hallConversationId);
  if (conversation.kind !== 'hall') {
    throw wideEventError('hall-follow-up-conversation-not-found', 'Hall conversation not found', { statusCode: 404 });
  }

  const [messages, participants, roundSummaries] = await Promise.all([
    listAllMessages(ctx, args.hallConversationId),
    listActiveParticipants(ctx, args.hallConversationId),
    listHallRoundSummaries(ctx, args.hallConversationId),
  ]);

  const anchorMessage = messages.find((message) => message._id === args.hallMessageId);
  if (!anchorMessage || !isActiveMessage(anchorMessage) || anchorMessage.role !== 'member' || !anchorMessage.authorMemberId) {
    throw wideEventError('hall-follow-up-message-not-found', 'Hall member message not found', { statusCode: 404 });
  }

  const memberIds = Array.from(
    new Set([
      ...participants.map((participant) => participant.memberId),
      ...messages
        .filter((message) => message.role === 'member' && message.authorMemberId)
        .map((message) => message.authorMemberId as typeof anchorMessage.authorMemberId),
    ])
  );
  const memberRows = await Promise.all(
    memberIds.map((memberId) =>
      ctx.runQuery(api.members.getById, {
        memberId,
        includeArchived: true,
      })
    )
  );
  const memberNames = new Map(
    memberRows
      .filter((row: any) => row && !row.deletedAt)
      .map((row: any) => [row._id as string, row.name as string])
  );
  const memberName = memberNames.get(anchorMessage.authorMemberId) ?? 'Member';

  const provider = createAiProvider();
  const generatedSummary = await provider.summarizeHallFollowUpThread({
    memberName,
    hallMode: conversation.hallMode ?? 'advisory',
    participants: Array.from(new Set(memberNames.values())),
    roundSummaries: roundSummaries
      .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0))
      .map((row) => row.memory?.trim())
      .filter((value): value is string => Boolean(value)),
    transcript: buildTranscript(messages, memberNames),
    pairedUserMessage: findPairedUserMessage(messages, anchorMessage),
    anchorMemberMessage: anchorMessage.content,
  });
  const summary =
    generatedSummary.trim() ||
    [
      `Private follow-up with ${memberName} after a ${conversation.hallMode ?? 'advisory'} hall conversation.`,
      `Selected reply: ${anchorMessage.content}`,
      `Paired user message: ${findPairedUserMessage(messages, anchorMessage) ?? '(none found)'}`,
    ].join('\n');

  const result: StartHallFollowUpThreadResult = await ctx.runMutation(internal.conversations.createHallFollowUpThreadInternal, {
    userId,
    memberId: anchorMessage.authorMemberId,
    summary,
    originConversationId: args.hallConversationId,
    originMessageId: args.hallMessageId,
    originMessageContent: anchorMessage.content,
  });

  return result;
}
