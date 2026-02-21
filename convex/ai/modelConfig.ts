export type ModelSlot =
  | 'chatResponse'
  | 'retrieval'
  | 'router'
  | 'hallTitle'
  | 'specialties'
  | 'summary'
  | 'chamberMemory'
  | 'kbGate'
  | 'kbQueryRewrite'
  | 'kbDigest';

const MODEL_DEFAULTS: Record<ModelSlot, string> = {
  chatResponse: 'gemini-3-flash-preview',
  retrieval: 'gemini-2.5-flash-lite',
  router: 'gemini-2.5-flash',
  hallTitle: 'gemini-2.5-flash-lite',
  specialties: 'gemini-2.5-flash-lite',
  summary: 'gemini-2.5-flash-lite',
  chamberMemory: 'gemini-3-flash-preview',
  kbGate: 'gemma-3-12b-it',
  kbQueryRewrite: 'gemini-2.5-flash-lite',
  kbDigest: 'gemini-2.5-flash-lite',
};

export const MODEL_IDS: Record<ModelSlot, string> = {
  chatResponse: process.env.GEMINI_CHAT_MODEL ?? process.env.GEMINI_MODEL ?? MODEL_DEFAULTS.chatResponse,
  retrieval: process.env.GEMINI_RETRIEVAL_MODEL ?? MODEL_DEFAULTS.retrieval,
  router: process.env.GEMINI_ROUTER_MODEL ?? MODEL_DEFAULTS.router,
  hallTitle: process.env.GEMINI_HALL_TITLE_MODEL ?? process.env.GEMINI_ROUTER_MODEL ?? MODEL_DEFAULTS.hallTitle,
  specialties: process.env.GEMINI_SPECIALTIES_MODEL ?? process.env.GEMINI_ROUTER_MODEL ?? MODEL_DEFAULTS.specialties,
  summary: process.env.GEMINI_SUMMARY_MODEL ?? process.env.GEMINI_ROUTER_MODEL ?? MODEL_DEFAULTS.summary,
  chamberMemory: process.env.GEMINI_CHAMBER_MEMORY_MODEL ?? MODEL_DEFAULTS.chamberMemory,
  kbGate: process.env.GEMINI_KB_GATE_MODEL ?? MODEL_DEFAULTS.kbGate,
  kbQueryRewrite: process.env.GEMINI_KB_QUERY_REWRITE_MODEL ?? MODEL_DEFAULTS.kbQueryRewrite,
  kbDigest: process.env.GEMINI_KB_DIGEST_MODEL ?? MODEL_DEFAULTS.kbDigest,
};

export function resolveModel(slot: ModelSlot, override?: string): string {
  const cleaned = override?.trim();
  if (cleaned) return cleaned;
  return MODEL_IDS[slot];
}

export function hallTitleModelCandidates(override?: string): string[] {
  return [override?.trim(), MODEL_IDS.hallTitle, MODEL_IDS.router, MODEL_DEFAULTS.hallTitle].filter(
    (value, index, list): value is string => Boolean(value) && list.indexOf(value as string) === index
  );
}
