import type { CouncilContextMessage } from './types';

export function formatContextMessages(messages: CouncilContextMessage[], max = 10): string {
  return messages
    .slice(-max)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
}
