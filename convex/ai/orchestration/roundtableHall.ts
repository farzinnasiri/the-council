import type { RoundIntent } from '../provider/types';

export interface DraftRoundIntent {
  memberId: string;
  intent: RoundIntent;
  targetMemberId?: string;
  rationale: string;
  selected: boolean;
  source: 'mention' | 'intent_default' | 'user_manual';
}

const INTENT_PRIORITY: Record<Exclude<RoundIntent, 'pass'>, number> = {
  challenge: 1,
  support: 2,
  speak: 3,
};

function normalizeMentionedSet(mentionedMemberIds?: string[]): Set<string> {
  return new Set((mentionedMemberIds ?? []).filter(Boolean));
}

export function applyRoundDefaultSelection(options: {
  intents: DraftRoundIntent[];
  mentionedMemberIds?: string[];
  maxSpeakers: number;
}): DraftRoundIntent[] {
  const maxSpeakers = Math.max(1, options.maxSpeakers);
  const mentioned = normalizeMentionedSet(options.mentionedMemberIds);

  const next = options.intents.map((intent) => ({
    ...intent,
    selected: false,
    source: 'intent_default' as DraftRoundIntent['source'],
  }));

  const selectedIds: string[] = [];

  for (const intent of next) {
    if (!mentioned.has(intent.memberId)) continue;
    if (selectedIds.length >= maxSpeakers) break;

    if (intent.intent === 'pass') {
      intent.intent = 'speak';
      intent.rationale = 'User mentioned this member for the next round.';
    }

    intent.selected = true;
    intent.source = 'mention';
    selectedIds.push(intent.memberId);
  }

  const available = next
    .filter((intent) => !intent.selected && intent.intent !== 'pass')
    .sort((a, b) => {
      const pa = INTENT_PRIORITY[a.intent as Exclude<RoundIntent, 'pass'>] ?? 99;
      const pb = INTENT_PRIORITY[b.intent as Exclude<RoundIntent, 'pass'>] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.memberId.localeCompare(b.memberId);
    });

  for (const intent of available) {
    if (selectedIds.length >= maxSpeakers) break;
    intent.selected = true;
    intent.source = 'intent_default';
    selectedIds.push(intent.memberId);
  }

  return next;
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
