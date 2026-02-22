import { api } from '../_generated/api';

export const ROUNDTABLE_POLICY_KEY = 'roundtable-max-speakers';
export const ROUNDTABLE_POLICY_DEFAULTS = {
  maxSpeakersPerRound: 2,
  minSpeakers: 1,
  maxSpeakers: 8,
} as const;

export function normalizeRoundtableMaxSpeakers(raw: string | null | undefined): number {
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) {
    return ROUNDTABLE_POLICY_DEFAULTS.maxSpeakersPerRound;
  }
  return Math.max(
    ROUNDTABLE_POLICY_DEFAULTS.minSpeakers,
    Math.min(parsed, ROUNDTABLE_POLICY_DEFAULTS.maxSpeakers)
  );
}

export async function resolveRoundtableMaxSpeakers(ctx: any): Promise<number> {
  const raw = (await ctx.runQuery(api.settings.get, {
    key: ROUNDTABLE_POLICY_KEY,
  })) as string | null;

  return normalizeRoundtableMaxSpeakers(raw);
}
