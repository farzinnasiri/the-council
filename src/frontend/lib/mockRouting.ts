import type { Conversation } from '../types/domain';

const keywordMap: Array<{ keywords: string[]; members: string[] }> = [
  { keywords: ['risk', 'runway', 'bet', 'career'], members: ['elon', 'max', 'jobs'] },
  { keywords: ['team', 'hire', 'culture', 'manager'], members: ['jobs', 'marcus', 'elon'] },
  { keywords: ['focus', 'discipline', 'stress', 'pressure'], members: ['max', 'marcus'] },
  { keywords: ['product', 'design', 'taste', 'ux'], members: ['jobs', 'ada'] },
];

function hash(input: string): number {
  return Array.from(input).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
}

export function routeToMembers(input: string, conversation: Conversation): string[] {
  if (conversation.type === 'chamber' && conversation.memberIds.length > 0) {
    return [conversation.memberIds[0]];
  }

  const lowered = input.toLowerCase();
  for (const entry of keywordMap) {
    if (entry.keywords.some((keyword) => lowered.includes(keyword))) {
      return entry.members.slice(0, 3);
    }
  }

  const defaults = ['elon', 'max', 'jobs', 'marcus'];
  const seed = hash(`${conversation.id}:${input}`);
  const start = seed % defaults.length;
  return [defaults[start], defaults[(start + 1) % defaults.length]];
}

const voiceLines: Record<string, string[]> = {
  elon: [
    'De-risk by validating demand with scrappy experiments this week, not months later.',
    'Compress feedback loops. Speed is a strategic weapon.',
  ],
  max: [
    'Define your lap: what does this week look like when executed perfectly?',
    'Ignore noise. Precision in execution is your edge.',
  ],
  jobs: [
    'Ship fewer things with stronger taste.',
    'Clarity in the product story makes every decision easier.',
  ],
  marcus: [
    'Control your effort, not the outcome. Then act with discipline.',
    'Remove drama, keep standards.',
  ],
  ada: [
    'Model the system before scaling the solution.',
    'Good abstractions are leverage for future features.',
  ],
};

export function buildReply(memberId: string, input: string): string {
  const lines = voiceLines[memberId] ?? ['Take one clear next step and re-evaluate quickly.'];
  const seed = hash(`${memberId}:${input}`);
  return lines[seed % lines.length];
}
