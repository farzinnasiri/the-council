import { v } from 'convex/values';

export const personalSourceDocumentKindValues = [
  'diary',
  'essay',
  'notes',
  'report',
  'letter',
  'transcript',
  'memoir',
  'mixed',
] as const;

export const personalSourceSemanticClassValues = [
  'win',
  'failure',
  'reflection',
  'belief',
  'memory',
  'goal',
  'fear',
  'quote',
  'relationship',
  'work',
  'health',
  'identity',
] as const;

export const personalSourceVoiceValues = [
  'first_person',
  'second_person',
  'mixed',
  'unknown',
] as const;

export type PersonalSourceDocumentKind = (typeof personalSourceDocumentKindValues)[number];
export type PersonalSourceSemanticClass = (typeof personalSourceSemanticClassValues)[number];
export type PersonalSourceVoice = (typeof personalSourceVoiceValues)[number];

export const personalSourceVoiceValidator = v.union(
  v.literal('first_person'),
  v.literal('second_person'),
  v.literal('mixed'),
  v.literal('unknown'),
);

export const personalSourceDocumentMetadataValidator = v.object({
  documentKinds: v.array(v.string()),
  semanticClasses: v.array(v.string()),
  queryHints: v.array(v.string()),
  voice: v.optional(personalSourceVoiceValidator),
});

export function normalizePersonalSourceLabels(
  items: string[] | undefined,
  allowed: readonly string[],
  max: number,
): string[] {
  if (!Array.isArray(items)) return [];
  const allowedSet = new Set(allowed);
  const out: string[] = [];
  for (const item of items) {
    const normalized = item.trim().toLowerCase().replace(/[^a-z0-9_ ]+/g, '').replace(/\s+/g, '_');
    if (!normalized || !allowedSet.has(normalized)) continue;
    if (out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizePersonalSourceQueryHints(items: string[] | undefined, max: number): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const item of items) {
    const normalized = item.trim().toLowerCase().slice(0, 80);
    if (!normalized) continue;
    if (out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}
