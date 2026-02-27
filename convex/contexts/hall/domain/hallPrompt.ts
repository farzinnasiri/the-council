'use node';

import type { Id } from '../../../_generated/dataModel';
import type { CouncilContextMessage } from '../../../ai/provider/types';
import type { MemberListRow, MessageRow } from '../../shared/types';

export function buildContextMessages(options: {
  messages: MessageRow[];
  membersById: Map<string, MemberListRow>;
  selfMemberId: Id<'members'>;
  omitLatestUserMessage?: boolean;
}): CouncilContextMessage[] {
  const sourceMessages = options.messages.filter((message) => message.role !== 'system' && message.status !== 'error');
  const latestUserMessageId = options.omitLatestUserMessage
    ? [...sourceMessages].reverse().find((message) => message.role === 'user')?._id
    : undefined;

  return sourceMessages
    .filter((message) => !(latestUserMessageId && message._id === latestUserMessageId))
    .map((message) => {
      if (message.role === 'user') {
        return {
          role: 'user' as const,
          content: message.content,
        };
      }

      const authorName = message.authorMemberId
        ? (options.membersById.get(message.authorMemberId as string)?.name ?? 'Member')
        : 'Member';
      const selfSuffix = message.authorMemberId === options.selfMemberId ? ' (you)' : '';

      return {
        role: 'assistant' as const,
        content: `${authorName}${selfSuffix}: ${message.content}`,
      };
    });
}

export function buildHallSystemPrompt(options: {
  member: MemberListRow;
  participants: MemberListRow[];
  hallMode: 'advisory' | 'roundtable';
  roundSummaries: string[];
  rawMessages: MessageRow[];
  conversationId: Id<'conversations'>;
}): string {
  const presentMemberNames = options.participants.map((member) => member.name);
  const otherNames = options.participants
    .filter((member) => member._id !== options.member._id)
    .map((member) => member.name);

  const latestInteractions = options.rawMessages
    .filter(
      (message) =>
        message.conversationId === options.conversationId &&
        message.role !== 'system' &&
        message.status !== 'error'
    )
    .slice(-10)
    .map((message) => {
      const author =
        message.role === 'user'
          ? 'User'
          : (options.participants.find((item) => item._id === message.authorMemberId)?.name ?? 'Member');
      return `${author}: ${message.content}`;
    });

  const modeLine =
    options.hallMode === 'roundtable'
      ? 'Mode: roundtable (selected speakers contribute each round).'
      : 'Mode: advisory (multiple members respond to the same user turn).';

  const hallAddendum = [
    '[Hall Deliberation Context]',
    'You are participating in a live council discussion.',
    modeLine,
    `Participants: ${presentMemberNames.join(', ') || options.member.name}.`,
    `Other members currently present: ${otherNames.join(', ') || 'none'}.`,
    '',
    '[Completed Round Summaries]',
    options.roundSummaries.length > 0 ? options.roundSummaries.join('\n\n') : '(none yet)',
    '',
    '[Latest Interactions]',
    latestInteractions.length > 0 ? latestInteractions.join('\n') : '(none yet)',
    '',
    '[Response Rules]',
    'Use the context above to align with the ongoing discussion.',
    "Do not prefix your reply with your name or any speaker label (for example, do not write 'Name:').",
    'Give one concise contribution unless the user explicitly asks for detailed elaboration.',
  ].join('\n');

  return [options.member.systemPrompt.trim(), hallAddendum].filter(Boolean).join('\n\n');
}
