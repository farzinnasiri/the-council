export interface KBChunkConfig {
  chunkSizeChars: number;
  chunkOverlapChars: number;
}

export const KB_CHUNK_PRESETS = {
  small: {
    chunkSizeChars: 800,
    chunkOverlapChars: 120,
  },
  default: {
    chunkSizeChars: 2000,
    chunkOverlapChars: 500,
  },
  large: {
    chunkSizeChars: 3600,
    chunkOverlapChars: 700,
  },
} as const satisfies Record<string, KBChunkConfig>;

export const DEFAULT_KB_CHUNK_CONFIG: KBChunkConfig = KB_CHUNK_PRESETS.default;

export const MIN_CHUNK_SIZE_CHARS = 50;
export const MAX_CHUNK_SIZE_CHARS = 12000;
export const MIN_CHUNK_OVERLAP_CHARS = 0;
export const MAX_CHUNK_OVERLAP_CHARS = 4000;

export function resolveKbChunkConfig(
  input?: Partial<KBChunkConfig> | null,
): KBChunkConfig {
  return {
    chunkSizeChars: Math.trunc(input?.chunkSizeChars ?? DEFAULT_KB_CHUNK_CONFIG.chunkSizeChars),
    chunkOverlapChars: Math.trunc(
      input?.chunkOverlapChars ?? DEFAULT_KB_CHUNK_CONFIG.chunkOverlapChars,
    ),
  };
}

export function validateKbChunkConfig(config: KBChunkConfig): string | null {
  if (!Number.isFinite(config.chunkSizeChars)) {
    return 'Chunk size must be a number.';
  }
  if (!Number.isFinite(config.chunkOverlapChars)) {
    return 'Chunk overlap must be a number.';
  }
  if (
    config.chunkSizeChars < MIN_CHUNK_SIZE_CHARS ||
    config.chunkSizeChars > MAX_CHUNK_SIZE_CHARS
  ) {
    return `Chunk size must be between ${MIN_CHUNK_SIZE_CHARS} and ${MAX_CHUNK_SIZE_CHARS} characters.`;
  }
  if (
    config.chunkOverlapChars < MIN_CHUNK_OVERLAP_CHARS ||
    config.chunkOverlapChars > MAX_CHUNK_OVERLAP_CHARS
  ) {
    return `Chunk overlap must be between ${MIN_CHUNK_OVERLAP_CHARS} and ${MAX_CHUNK_OVERLAP_CHARS} characters.`;
  }
  if (config.chunkOverlapChars >= config.chunkSizeChars) {
    return 'Chunk overlap must be smaller than chunk size.';
  }
  return null;
}

export const EMBEDDING_BATCH_SIZE = 32;
export const UPSERT_BATCH_SIZE = 20;
export const MAX_INDEXED_CHUNKS = 2000;

export const SEARCH_LIMIT_DEFAULT = 5;
export const SEARCH_LIMIT_MAX = 20;

export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const OPENAI_EMBEDDING_DIMENSIONS = 1536;
