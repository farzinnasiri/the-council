import type { Message } from '../types/domain';

const base = Date.now();

function at(offsetMinutes: number): number {
  return base + offsetMinutes * 60_000;
}

export const initialMessages: Message[] = [
  {
    id: 'm-1',
    conversationId: 'hall-risk-conviction',
    role: 'user',
    content:
      "I'm considering leaving my stable career to start a company. Everyone around me thinks I'm crazy. How do you think about risk when the stakes are this high?",
    createdAt: at(-6),
    status: 'sent',
    compacted: false,
  },
  {
    id: 'm-2',
    conversationId: 'hall-risk-conviction',
    role: 'system',
    content: 'Routed to Elon, Max and Steve',
    createdAt: at(-5),
    status: 'sent',
    compacted: false,
    routing: { memberIds: ['elon', 'max', 'jobs'], source: 'fallback' },
  },
  {
    id: 'm-3',
    conversationId: 'hall-risk-conviction',
    role: 'member',
    memberId: 'elon',
    content:
      "Start from first principles: does this mission need to exist? If yes, optimize your downside while preserving upside. The worst outcome is spending years on something that doesn't matter.",
    createdAt: at(-4),
    status: 'sent',
    compacted: false,
  },
  {
    id: 'm-4',
    conversationId: 'hall-risk-conviction',
    role: 'member',
    memberId: 'max',
    content:
      'Pressure is normal. Clarity beats confidence: know exactly what game you are playing and what winning means this year.',
    createdAt: at(-3),
    status: 'sent',
    compacted: false,
  },
  {
    id: 'm-5',
    conversationId: 'hall-risk-conviction',
    role: 'member',
    memberId: 'jobs',
    content:
      'Your time is limited. Build something you deeply care about. Taste + conviction + relentless iteration is a powerful moat.',
    createdAt: at(-2),
    status: 'sent',
    compacted: false,
  },
  {
    id: 'm-6',
    conversationId: 'chamber-elon-strategy',
    role: 'member',
    memberId: 'elon',
    content:
      'In this chamber we optimize for strategic leverage. Bring me one core assumption and we will stress test it.',
    createdAt: at(-180),
    status: 'sent',
    compacted: false,
  },
  {
    id: 'm-7',
    conversationId: 'chamber-max-performance',
    role: 'member',
    memberId: 'max',
    content: 'Performance follows routines. Small gains done daily beat hype.',
    createdAt: at(-2600),
    status: 'sent',
    compacted: false,
  },
];
