import type { RoundIntent } from '../provider/types';

export interface DraftRoundIntent {
  memberId: string;
  intent: RoundIntent;
  targetMemberId?: string;
  rationale: string;
  selected: boolean;
  source: 'mention' | 'intent_default' | 'user_manual';
}

export function applyRoundDefaultSelection(options: {
  intents: DraftRoundIntent[];
  mentionedMemberIds?: string[];
  maxSpeakers: number;
}): DraftRoundIntent[] {
  return options.intents.map((intent) => ({
    ...intent,
    selected: false,
    source: 'intent_default' as DraftRoundIntent['source'],
  }));
}

export function buildRoundContext(options: {
  userMessage?: string;
  recentMessages: Array<{ author: string; content: string }>;
}): string {
  const block = options.recentMessages
    .slice(-10)
    .map((item) => `${item.author}: ${item.content}`)
    .join('\n');

  return [
    options.userMessage ? `User topic:\n${options.userMessage}` : 'User topic: (continuation round)',
    '',
    'Recent discussion:',
    block || '(no prior discussion)',
  ].join('\n');
}
