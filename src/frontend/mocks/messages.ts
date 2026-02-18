import type { Message } from '../types/domain';

const base = Date.now();

function at(offsetMinutes: number) {
  const date = new Date(base + offsetMinutes * 60_000);
  return {
    timestamp: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: date.toISOString(),
  };
}

export const initialMessages: Message[] = [
  {
    id: 'm-1',
    conversationId: 'hall-risk-conviction',
    senderType: 'user',
    content:
      "I'm considering leaving my stable career to start a company. Everyone around me thinks I'm crazy. How do you think about risk when the stakes are this high?",
    ...at(-6),
    status: 'sent',
  },
  {
    id: 'm-2',
    conversationId: 'hall-risk-conviction',
    senderType: 'system',
    content: 'Routed to Elon, Max and Steve',
    ...at(-5),
    routeMemberIds: ['elon', 'max', 'jobs'],
    routingSource: 'fallback',
    status: 'sent',
  },
  {
    id: 'm-3',
    conversationId: 'hall-risk-conviction',
    senderType: 'member',
    memberId: 'elon',
    content:
      "Start from first principles: does this mission need to exist? If yes, optimize your downside while preserving upside. The worst outcome is spending years on something that doesn't matter.",
    ...at(-4),
    meta: { canReply: true, canDM: true },
    status: 'sent',
  },
  {
    id: 'm-4',
    conversationId: 'hall-risk-conviction',
    senderType: 'member',
    memberId: 'max',
    content:
      'Pressure is normal. Clarity beats confidence: know exactly what game you are playing and what winning means this year.',
    ...at(-3),
    meta: { canReply: true, canDM: true },
    status: 'sent',
  },
  {
    id: 'm-5',
    conversationId: 'hall-risk-conviction',
    senderType: 'member',
    memberId: 'jobs',
    content:
      'Your time is limited. Build something you deeply care about. Taste + conviction + relentless iteration is a powerful moat.',
    ...at(-2),
    meta: { canReply: true, canDM: true },
    status: 'sent',
  },
  {
    id: 'm-6',
    conversationId: 'chamber-elon-strategy',
    senderType: 'member',
    memberId: 'elon',
    content:
      'In this chamber we optimize for strategic leverage. Bring me one core assumption and we will stress test it.',
    ...at(-180),
    meta: { canReply: true, canDM: true },
    status: 'sent',
  },
  {
    id: 'm-7',
    conversationId: 'chamber-max-performance',
    senderType: 'member',
    memberId: 'max',
    content: 'Performance follows routines. Small gains done daily beat hype.',
    ...at(-2600),
    meta: { canReply: true, canDM: true },
    status: 'sent',
  },
];
