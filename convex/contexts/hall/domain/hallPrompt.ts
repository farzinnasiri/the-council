'use node';

import type { Id } from '../../../_generated/dataModel';
import type { CouncilContextMessage } from '../../../ai/provider/types';
import type { MemberListRow, MessageRow } from '../../shared/types';

export function buildContextMessages(options: {
  messages: MessageRow[];
  membersById: Map<string, MemberListRow>;
  selfMemberId: Id<'members'>;
}): CouncilContextMessage[] {
  return options.messages
    .filter((message) => message.role !== 'system' && message.status !== 'error')
    .slice(-12)
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
  messages: MessageRow[];
  conversationId: Id<'conversations'>;
}): string {
  const presentMemberNames = options.participants.map((member) => member.name);
  const otherNames = options.participants
    .filter((member) => member._id !== options.member._id)
    .map((member) => member.name);

  const recentOtherOpinions = options.messages
    .filter(
      (message) =>
        message.conversationId === options.conversationId &&
        message.role === 'member' &&
        message.status !== 'error' &&
        message.authorMemberId &&
        message.authorMemberId !== options.member._id
    )
    .slice(-6)
    .map((message) => {
      const author = options.participants.find((item) => item._id === message.authorMemberId)?.name ?? 'Member';
      return `${author}: ${message.content}`;
    });

  return [
    `Hall context: You are ${options.member.name}, one council member in a live hall conversation.`,
    `Present members: ${presentMemberNames.join(', ') || options.member.name}.`,
    `Other members currently present: ${otherNames.join(', ') || 'none'}.`,
    'You can reference, build on, or challenge other members respectfully.',
    recentOtherOpinions.length > 0
      ? `Recent member opinions:\n- ${recentOtherOpinions.join('\n- ')}`
      : 'Recent member opinions: none yet.',
  ].join('\n');
}
