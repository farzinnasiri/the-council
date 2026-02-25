'use node';

export function normalizeHallMode(conversation: { kind: 'hall' | 'chamber'; hallMode?: 'advisory' | 'roundtable' }) {
  if (conversation.kind !== 'hall') return undefined;
  return conversation.hallMode ?? 'advisory';
}
