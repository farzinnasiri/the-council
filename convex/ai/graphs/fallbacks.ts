import type { RouteMemberCandidate } from './routeMembersGraph';

export function fallbackRouteMemberIds(message: string, candidates: RouteMemberCandidate[], maxSelections = 3): string[] {
  if (candidates.length === 0) {
    return [];
  }

  const seed = Array.from(message).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
  const count = Math.max(1, Math.min(maxSelections, candidates.length));
  const start = seed % candidates.length;
  const selected: string[] = [];
  for (let index = 0; index < count; index += 1) {
    selected.push(candidates[(start + index) % candidates.length].id);
  }
  return selected;
}
