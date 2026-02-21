export const COMPACTION_POLICY_KEYS = {
  threshold: 'compaction-threshold',
  recentRawTail: 'compaction-recent-raw-tail',
} as const;

export const COMPACTION_POLICY_DEFAULTS = {
  threshold: 20,
  recentRawTail: 8,
} as const;

export interface CompactionPolicy {
  threshold: number;
  recentRawTail: number;
}

export function normalizePolicyNumber(raw: string | null | undefined, fallback: number, min = 1): number {
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}
