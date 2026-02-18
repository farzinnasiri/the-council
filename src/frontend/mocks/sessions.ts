import type { Conversation } from '../types/domain';

const now = Date.now();

export const initialConversations: Conversation[] = [
  {
    id: 'hall-risk-conviction',
    type: 'hall',
    title: 'Risk-taking & conviction',
    updatedAt: new Date(now - 5 * 60_000).toISOString(),
    memberIds: ['elon', 'max', 'jobs'],
  },
  {
    id: 'hall-team-culture',
    type: 'hall',
    title: 'Building a world-class team',
    updatedAt: new Date(now - 20 * 60 * 60_000).toISOString(),
    memberIds: ['jobs', 'marcus'],
  },
  {
    id: 'chamber-elon-strategy',
    type: 'chamber',
    title: 'Chamber · Elon on company strategy',
    updatedAt: new Date(now - 3 * 60 * 60_000).toISOString(),
    memberIds: ['elon'],
    memberId: 'elon',
  },
  {
    id: 'chamber-max-performance',
    type: 'chamber',
    title: 'Chamber · Max on pressure',
    updatedAt: new Date(now - 48 * 60 * 60_000).toISOString(),
    memberIds: ['max'],
    memberId: 'max',
  },
];
