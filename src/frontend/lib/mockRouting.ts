function hash(input: string): number {
  return Array.from(input).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
}

export function routeToMembers(input: string, candidateIds: string[], seedSource: string): string[] {
  if (candidateIds.length === 0) return [];

  const lowered = input.toLowerCase();
  const score = candidateIds.map((id, idx) => ({
    id,
    score: hash(`${id}:${lowered}`) + idx,
  }));

  score.sort((a, b) => a.score - b.score);
  const seed = hash(`${seedSource}:${input}`);
  const offset = seed % score.length;

  const rotated = [...score.slice(offset), ...score.slice(0, offset)];
  return rotated.slice(0, Math.min(3, rotated.length)).map((item) => item.id);
}
