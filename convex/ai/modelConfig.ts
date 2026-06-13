export type ModelSlot =
  | 'chatResponse'
  | 'chatThinking'
  | 'hallClosure'
  | 'transcription'
  | 'retrieval'
  | 'router'
  | 'roundtableBid'
  | 'archiveParse'
  | 'hallTitle'
  | 'hallMemory'
  | 'hallThreadSeed'
  | 'specialties'
  | 'summary'
  | 'chamberMemory'
  | 'kbGate'
  | 'kbQueryRewrite'
  | 'personalSourceQueryRewrite'
  | 'kbDigest'
  | 'tts'
  | 'voicePersona'
  | 'guidanceProfile'
  | 'guidanceReflection';

export type AiProvider = 'openai' | 'google' | 'openrouter';

export interface ModelTarget {
  provider: AiProvider;
  model: string;
}

export interface ChatResponseSlotConfig {
  slot: number;
  envKey: string;
  spec: string;
  target: ModelTarget;
  isDefault: boolean;
}

const MAX_CHAT_RESPONSE_SLOT_SCAN = 16;

const SLOT_ENV_KEYS: Record<ModelSlot, string> = {
  chatResponse: 'AI_MODEL_CHAT_RESPONSE',
  chatThinking: 'AI_MODEL_CHAT_THINKING',
  hallClosure: 'AI_MODEL_HALL_CLOSURE',
  transcription: 'AI_MODEL_TRANSCRIPTION',
  retrieval: 'AI_MODEL_RETRIEVAL',
  router: 'AI_MODEL_ROUTER',
  roundtableBid: 'AI_MODEL_ROUNDTABLE_BID',
  archiveParse: 'AI_MODEL_ARCHIVE_PARSE',
  hallTitle: 'AI_MODEL_HALL_TITLE',
  hallMemory: 'AI_MODEL_HALL_MEMORY',
  hallThreadSeed: 'AI_MODEL_HALL_THREAD_SEED',
  specialties: 'AI_MODEL_SPECIALTIES',
  summary: 'AI_MODEL_SUMMARY',
  chamberMemory: 'AI_MODEL_CHAMBER_MEMORY',
  kbGate: 'AI_MODEL_KB_GATE',
  kbQueryRewrite: 'AI_MODEL_KB_QUERY_REWRITE',
  personalSourceQueryRewrite: 'AI_MODEL_PERSONAL_SOURCE_QUERY_REWRITE',
  kbDigest: 'AI_MODEL_KB_DIGEST',
  tts: 'AI_MODEL_TTS',
  voicePersona: 'AI_MODEL_VOICE_PERSONA',
  guidanceProfile: 'AI_MODEL_GUIDANCE_PROFILE',
  guidanceReflection: 'AI_MODEL_GUIDANCE_REFLECTION',
};

const LEGACY_GEMINI_ENV_KEYS: Partial<Record<ModelSlot, string[]>> = {
  chatResponse: ['GEMINI_CHAT_MODEL', 'GEMINI_MODEL'],
  chatThinking: ['GEMINI_CHAT_THINKING_MODEL', 'GEMINI_CHAT_MODEL', 'GEMINI_MODEL'],
  hallClosure: ['GEMINI_HALL_CLOSURE_MODEL', 'GEMINI_MODEL'],
  transcription: ['GEMINI_TRANSCRIPTION_MODEL', 'GEMINI_MODEL'],
  retrieval: ['GEMINI_RETRIEVAL_MODEL', 'GEMINI_MODEL'],
  router: ['GEMINI_ROUTER_MODEL', 'GEMINI_MODEL'],
  roundtableBid: ['GEMINI_ROUNDTABLE_BID_MODEL', 'GEMINI_ROUTER_MODEL', 'GEMINI_MODEL'],
  archiveParse: ['GEMINI_ARCHIVE_PARSE_MODEL', 'GEMINI_MODEL'],
  hallTitle: ['GEMINI_HALL_TITLE_MODEL', 'GEMINI_ROUTER_MODEL', 'GEMINI_MODEL'],
  hallMemory: ['GEMINI_HALL_MEMORY_MODEL', 'GEMINI_MODEL'],
  hallThreadSeed: ['GEMINI_HALL_THREAD_SEED_MODEL', 'GEMINI_HALL_MEMORY_MODEL', 'GEMINI_MODEL'],
  specialties: ['GEMINI_SPECIALTIES_MODEL', 'GEMINI_ROUTER_MODEL', 'GEMINI_MODEL'],
  summary: ['GEMINI_SUMMARY_MODEL', 'GEMINI_ROUTER_MODEL', 'GEMINI_MODEL'],
  chamberMemory: ['GEMINI_CHAMBER_MEMORY_MODEL', 'GEMINI_MODEL'],
  kbGate: ['GEMINI_KB_GATE_MODEL', 'GEMINI_ROUTER_MODEL', 'GEMINI_MODEL'],
  kbQueryRewrite: ['GEMINI_KB_QUERY_REWRITE_MODEL', 'GEMINI_MODEL'],
  personalSourceQueryRewrite: ['GEMINI_MODEL'],
  kbDigest: ['GEMINI_KB_DIGEST_MODEL', 'GEMINI_MODEL'],
  tts: ['GEMINI_TTS_MODEL', 'GEMINI_MODEL'],
  voicePersona: ['GEMINI_VOICE_PERSONA_MODEL', 'GEMINI_SPECIALTIES_MODEL', 'GEMINI_MODEL'],
  guidanceProfile: ['GEMINI_GUIDANCE_PROFILE_MODEL', 'GEMINI_MODEL'],
  guidanceReflection: ['GEMINI_GUIDANCE_REFLECTION_MODEL', 'GEMINI_MODEL'],
};

const SLOT_DEFAULTS: Record<ModelSlot, ModelTarget> = {
  chatResponse: { provider: 'openai', model: 'chat-latest' },
  chatThinking: { provider: 'openrouter', model: 'google/gemini-3-flash-preview' },
  hallClosure: { provider: 'openrouter', model: 'google/gemini-3-flash-preview' },
  transcription: { provider: 'google', model: 'gemini-2.5-flash' },
  retrieval: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
  router: { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
  roundtableBid: { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
  archiveParse: { provider: 'openrouter', model: 'google/gemini-3-flash-preview' },
  hallTitle: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
  hallMemory: { provider: 'openrouter', model: 'google/gemini-3-flash-preview' },
  hallThreadSeed: { provider: 'openrouter', model: 'google/gemini-3-flash-preview' },
  specialties: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
  summary: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
  chamberMemory: { provider: 'openrouter', model: 'google/gemini-3-flash-preview' },
  kbGate: { provider: 'openrouter', model: 'google/gemma-3-12b-it' },
  kbQueryRewrite: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
  personalSourceQueryRewrite: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
  kbDigest: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
  tts: { provider: 'google', model: 'gemini-2.5-flash-preview-tts' },
  voicePersona: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
  guidanceProfile: { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
  guidanceReflection: { provider: 'openrouter', model: 'google/gemini-3-flash-preview' },
};

function modelTargetToSpec(target: ModelTarget): string {
  if (target.provider === 'openrouter') {
    return `openrouter:${target.model}`;
  }
  return `${target.provider}:${target.model}`;
}

function parseModelSpec(raw?: string | null, options?: { allowOpenRouter?: boolean }): ModelTarget | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const [providerRaw, ...rest] = trimmed.split(':');
    const provider = providerRaw.trim().toLowerCase();
    const model = rest.join(':').trim();
    if ((provider === 'openai' || provider === 'google') && model) {
      return { provider, model } as ModelTarget;
    }
    if (provider === 'openrouter' && model) {
      return { provider: 'openrouter', model };
    }
    if (options?.allowOpenRouter && provider && model) {
      return { provider: 'openrouter', model: `${provider}:${model}` };
    }
  }

  return null;
}

function allowOpenRouterForSlot(slot: ModelSlot) {
  return slot === 'chatResponse';
}

function readLegacyGeminiModel(slot: ModelSlot): string | undefined {
  const keys = LEGACY_GEMINI_ENV_KEYS[slot] ?? [];
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function legacyGeminiTarget(slot: ModelSlot, model: string): ModelTarget {
  if (slot === 'tts' || slot === 'transcription') {
    return { provider: 'google', model };
  }
  return { provider: 'openrouter', model: `google/${model}` };
}

export function resolveModelTarget(slot: ModelSlot, override?: string): ModelTarget {
  const overrideTarget = parseModelSpec(override, { allowOpenRouter: allowOpenRouterForSlot(slot) });
  if (overrideTarget) return overrideTarget;

  const slotTarget = parseModelSpec(process.env[SLOT_ENV_KEYS[slot]], {
    allowOpenRouter: allowOpenRouterForSlot(slot),
  });
  if (slotTarget) return slotTarget;

  const legacyGeminiModel = readLegacyGeminiModel(slot);
  if (legacyGeminiModel) {
    if (slot === 'chatResponse') {
      return SLOT_DEFAULTS.chatResponse;
    }
    return legacyGeminiTarget(slot, legacyGeminiModel);
  }

  return SLOT_DEFAULTS[slot];
}

export const MODEL_IDS: Record<ModelSlot, string> = {
  chatResponse: resolveModelTarget('chatResponse').model,
  chatThinking: resolveModelTarget('chatThinking').model,
  hallClosure: resolveModelTarget('hallClosure').model,
  transcription: resolveModelTarget('transcription').model,
  retrieval: resolveModelTarget('retrieval').model,
  router: resolveModelTarget('router').model,
  roundtableBid: resolveModelTarget('roundtableBid').model,
  archiveParse: resolveModelTarget('archiveParse').model,
  hallTitle: resolveModelTarget('hallTitle').model,
  hallMemory: resolveModelTarget('hallMemory').model,
  hallThreadSeed: resolveModelTarget('hallThreadSeed').model,
  specialties: resolveModelTarget('specialties').model,
  summary: resolveModelTarget('summary').model,
  chamberMemory: resolveModelTarget('chamberMemory').model,
  kbGate: resolveModelTarget('kbGate').model,
  kbQueryRewrite: resolveModelTarget('kbQueryRewrite').model,
  personalSourceQueryRewrite: resolveModelTarget('personalSourceQueryRewrite').model,
  kbDigest: resolveModelTarget('kbDigest').model,
  tts: resolveModelTarget('tts').model,
  voicePersona: resolveModelTarget('voicePersona').model,
  guidanceProfile: resolveModelTarget('guidanceProfile').model,
  guidanceReflection: resolveModelTarget('guidanceReflection').model,
};

export function resolveModel(slot: ModelSlot, override?: string): string {
  return resolveModelTarget(slot, override).model;
}

export function hallTitleModelCandidates(override?: string): string[] {
  return hallTitleModelTargetCandidates(override).map((target) => target.model);
}

export function hallTitleModelTargetCandidates(override?: string): ModelTarget[] {
  const explicit = resolveModelTarget('hallTitle', override);
  const router = resolveModelTarget('router');
  const candidates = [explicit, router, SLOT_DEFAULTS.hallTitle];
  const seen = new Set<string>();
  return candidates.filter((target) => {
    const key = modelTargetToSpec(target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getModelEnvKey(slot: ModelSlot): string {
  return SLOT_ENV_KEYS[slot];
}

function getChatResponseSlotEnvKey(slot: number): string {
  return slot === 1 ? SLOT_ENV_KEYS.chatResponse : `${SLOT_ENV_KEYS.chatResponse}_${slot}`;
}

function parseChatResponseSlot(slot: number, raw?: string | null): ChatResponseSlotConfig | null {
  const target = parseModelSpec(raw, { allowOpenRouter: true });
  if (!target) return null;
  return {
    slot,
    envKey: getChatResponseSlotEnvKey(slot),
    spec: modelTargetToSpec(target),
    target,
    isDefault: slot === 1,
  };
}

export function listConfiguredChatResponseSlots(): ChatResponseSlotConfig[] {
  const slots = new Map<number, ChatResponseSlotConfig>();
  const defaultTarget = resolveModelTarget('chatResponse');
  slots.set(1, {
    slot: 1,
    envKey: SLOT_ENV_KEYS.chatResponse,
    spec: modelTargetToSpec(defaultTarget),
    target: defaultTarget,
    isDefault: true,
  });

  for (let slot = 2; slot <= MAX_CHAT_RESPONSE_SLOT_SCAN; slot += 1) {
    const parsed = parseChatResponseSlot(slot, process.env[getChatResponseSlotEnvKey(slot)]);
    if (parsed) {
      slots.set(slot, parsed);
    }
  }

  return Array.from(slots.values()).sort((left, right) => left.slot - right.slot);
}

export function resolveChatResponseSlot(slot?: number): ChatResponseSlotConfig {
  const configured = listConfiguredChatResponseSlots();
  const targetSlot = typeof slot === 'number' && Number.isFinite(slot) ? Math.max(1, Math.trunc(slot)) : 1;
  return configured.find((item) => item.slot === targetSlot) ?? configured[0];
}

export function hasOpenRouterChatResponseSlot(): boolean {
  return listConfiguredChatResponseSlots().some((slot) => slot.target.provider === 'openrouter');
}
