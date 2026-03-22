'use node';

export const MAX_RETRIEVAL_QUERY_CHARS = 240;
export const MAX_RETRIEVAL_QUERY_WORDS = 32;

function clipText(text: string | undefined, maxChars: number): string {
  return (text ?? '').trim().replace(/\s+/g, ' ').slice(0, maxChars).trim();
}

export function normalizeRetrievalQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

export function sanitizeRetrievalQuery(query: string): string {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) return '';
  if (normalized.length > MAX_RETRIEVAL_QUERY_CHARS) return '';
  if (normalized.split(/\s+/).length > MAX_RETRIEVAL_QUERY_WORDS) return '';
  return normalized;
}

export function summarizeRetrievalQuery(query: string): { chars: number; words: number; preview: string } {
  const normalized = normalizeRetrievalQuery(query);
  return {
    chars: normalized.length,
    words: normalized ? normalized.split(/\s+/).filter(Boolean).length : 0,
    preview: clipText(normalized, 180),
  };
}

function trimPastedBody(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const markers = ['\n---', '\n```', '\n## ', '\n# ', '\n> ', '\n[(00:'];
  let cutoff = trimmed.length;
  for (const marker of markers) {
    const index = trimmed.indexOf(marker);
    if (index > 0) {
      cutoff = Math.min(cutoff, index);
    }
  }
  return trimmed.slice(0, cutoff).trim();
}

function compressRetrievalQuery(query: string): string {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) return '';
  const words = normalized.split(/\s+/).filter(Boolean).slice(0, MAX_RETRIEVAL_QUERY_WORDS);
  return words.join(' ').slice(0, MAX_RETRIEVAL_QUERY_CHARS).trim();
}

export function buildEpisodeRetrievalQuery(input: {
  query: string;
  contextMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
}): string {
  const lead = trimPastedBody(input.query);
  const recentContext = input.contextMessages
    .slice(-2)
    .map((message) => `${message.role}: ${clipText(message.content, 120)}`)
    .filter(Boolean);
  const combined = [clipText(lead || input.query, 180), ...recentContext].filter(Boolean).join(' | ');
  return sanitizeRetrievalQuery(combined) || compressRetrievalQuery(combined);
}
