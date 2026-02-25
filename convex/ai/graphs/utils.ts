export function normalizeKeywordList(items: string[], max = 12): string[] {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 120))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, max);
}

export function tryParseStructuredJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

export function sanitizeLabel(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'member';
}
