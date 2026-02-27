'use node';

import { api } from '../_generated/api';

export const HALL_MEMORY_POLICY_KEY = 'hall-memory-raw-round-tail';
export const HALL_MEMORY_POLICY_DEFAULTS = {
  rawRoundTail: 1,
};

export function normalizeHallRawRoundTail(raw: string | null | undefined): number {
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) {
    return HALL_MEMORY_POLICY_DEFAULTS.rawRoundTail;
  }
  return Math.max(1, parsed);
}

export async function resolveHallRawRoundTail(ctx: any): Promise<number> {
  const raw = await ctx.runQuery(api.settings.get, {
    key: HALL_MEMORY_POLICY_KEY,
  });
  return normalizeHallRawRoundTail(raw);
}
