export const ROUNDTABLE_POLICY_KEYS = {
  maxSpeakersPerRound: 'roundtable-max-speakers',
} as const;

export const ROUNDTABLE_POLICY_DEFAULTS = {
  maxSpeakersPerRound: 2,
  minSpeakers: 1,
  maxSpeakers: 8,
} as const;

export function normalizeRoundtableMaxSpeakers(raw: string | null | undefined): number {
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return ROUNDTABLE_POLICY_DEFAULTS.maxSpeakersPerRound;
  return Math.max(
    ROUNDTABLE_POLICY_DEFAULTS.minSpeakers,
    Math.min(parsed, ROUNDTABLE_POLICY_DEFAULTS.maxSpeakers)
  );
}
