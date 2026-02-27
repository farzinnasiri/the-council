export type ModelSlot =
  | 'chatResponse'
  | 'retrieval'
  | 'router'
  | 'hallTitle'
  | 'hallMemory'
  | 'specialties'
  | 'summary'
  | 'chamberMemory'
  | 'kbGate'
  | 'kbQueryRewrite'
  | 'kbDigest';

export type AiProvider = 'openai' | 'google';

export interface ModelTarget {
  provider: AiProvider;
  model: string;
}

const SLOT_ENV_KEYS: Record<ModelSlot, string> = {
  chatResponse: 'AI_MODEL_CHAT_RESPONSE',
  retrieval: 'AI_MODEL_RETRIEVAL',
  router: 'AI_MODEL_ROUTER',
  hallTitle: 'AI_MODEL_HALL_TITLE',
  hallMemory: 'AI_MODEL_HALL_MEMORY',
  specialties: 'AI_MODEL_SPECIALTIES',
  summary: 'AI_MODEL_SUMMARY',
  chamberMemory: 'AI_MODEL_CHAMBER_MEMORY',
  kbGate: 'AI_MODEL_KB_GATE',
  kbQueryRewrite: 'AI_MODEL_KB_QUERY_REWRITE',
  kbDigest: 'AI_MODEL_KB_DIGEST',
};

const LEGACY_GEMINI_ENV_KEYS: Partial<Record<ModelSlot, string[]>> = {
  chatResponse: ['GEMINI_CHAT_MODEL', 'GEMINI_MODEL'],
  retrieval: ['GEMINI_RETRIEVAL_MODEL', 'GEMINI_MODEL'],
  router: ['GEMINI_ROUTER_MODEL', 'GEMINI_MODEL'],
  hallTitle: ['GEMINI_HALL_TITLE_MODEL', 'GEMINI_ROUTER_MODEL', 'GEMINI_MODEL'],
  hallMemory: ['GEMINI_HALL_MEMORY_MODEL', 'GEMINI_MODEL'],
  specialties: ['GEMINI_SPECIALTIES_MODEL', 'GEMINI_ROUTER_MODEL', 'GEMINI_MODEL'],
  summary: ['GEMINI_SUMMARY_MODEL', 'GEMINI_ROUTER_MODEL', 'GEMINI_MODEL'],
  chamberMemory: ['GEMINI_CHAMBER_MEMORY_MODEL', 'GEMINI_MODEL'],
  kbGate: ['GEMINI_KB_GATE_MODEL', 'GEMINI_ROUTER_MODEL', 'GEMINI_MODEL'],
  kbQueryRewrite: ['GEMINI_KB_QUERY_REWRITE_MODEL', 'GEMINI_MODEL'],
  kbDigest: ['GEMINI_KB_DIGEST_MODEL', 'GEMINI_MODEL'],
};

const SLOT_DEFAULTS: Record<ModelSlot, ModelTarget> = {
  chatResponse: { provider: 'openai', model: 'gpt-5.2-chat-latest' },
  retrieval: { provider: 'google', model: 'gemini-2.5-flash-lite' },
  router: { provider: 'google', model: 'gemini-2.5-flash' },
  hallTitle: { provider: 'google', model: 'gemini-2.5-flash-lite' },
  hallMemory: { provider: 'google', model: 'gemini-3-flash-preview' },
  specialties: { provider: 'google', model: 'gemini-2.5-flash-lite' },
  summary: { provider: 'google', model: 'gemini-2.5-flash-lite' },
  chamberMemory: { provider: 'google', model: 'gemini-3-flash-preview' },
  kbGate: { provider: 'google', model: 'gemma-3-12b-it' },
  kbQueryRewrite: { provider: 'google', model: 'gemini-2.5-flash-lite' },
  kbDigest: { provider: 'google', model: 'gemini-2.5-flash-lite' },
};

function parseModelSpec(raw?: string | null): ModelTarget | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const [providerRaw, ...rest] = trimmed.split(':');
    const provider = providerRaw.trim().toLowerCase();
    const model = rest.join(':').trim();
    if ((provider === 'openai' || provider === 'google') && model) {
      return { provider, model } as ModelTarget;
    }
  }

  return null;
}

function readLegacyGeminiModel(slot: ModelSlot): string | undefined {
  const keys = LEGACY_GEMINI_ENV_KEYS[slot] ?? [];
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function resolveModelTarget(slot: ModelSlot, override?: string): ModelTarget {
  const overrideTarget = parseModelSpec(override);
  if (overrideTarget) return overrideTarget;

  const slotTarget = parseModelSpec(process.env[SLOT_ENV_KEYS[slot]]);
  if (slotTarget) return slotTarget;

  const legacyGeminiModel = readLegacyGeminiModel(slot);
  if (legacyGeminiModel) {
    if (slot === 'chatResponse') {
      return SLOT_DEFAULTS.chatResponse;
    }
    return { provider: 'google', model: legacyGeminiModel };
  }

  return SLOT_DEFAULTS[slot];
}

export const MODEL_IDS: Record<ModelSlot, string> = {
  chatResponse: resolveModelTarget('chatResponse').model,
  retrieval: resolveModelTarget('retrieval').model,
  router: resolveModelTarget('router').model,
  hallTitle: resolveModelTarget('hallTitle').model,
  hallMemory: resolveModelTarget('hallMemory').model,
  specialties: resolveModelTarget('specialties').model,
  summary: resolveModelTarget('summary').model,
  chamberMemory: resolveModelTarget('chamberMemory').model,
  kbGate: resolveModelTarget('kbGate').model,
  kbQueryRewrite: resolveModelTarget('kbQueryRewrite').model,
  kbDigest: resolveModelTarget('kbDigest').model,
};

export function resolveModel(slot: ModelSlot, override?: string): string {
  return resolveModelTarget(slot, override).model;
}

export function hallTitleModelCandidates(override?: string): string[] {
  const explicit = resolveModelTarget('hallTitle', override).model;
  return [explicit, resolveModel('router'), SLOT_DEFAULTS.hallTitle.model].filter(
    (value, index, list): value is string => Boolean(value) && list.indexOf(value) === index
  );
}

export function getModelEnvKey(slot: ModelSlot): string {
  return SLOT_ENV_KEYS[slot];
}
