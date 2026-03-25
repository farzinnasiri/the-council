import type { KbChunkConfig } from '../repository/CouncilRepository';

export type KbChunkPresetKey = 'small' | 'default' | 'large' | 'custom';

export const KB_CHUNK_PRESETS: Record<Exclude<KbChunkPresetKey, 'custom'>, KbChunkConfig> = {
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
};

export const DEFAULT_KB_CHUNK_CONFIG: KbChunkConfig = KB_CHUNK_PRESETS.default;

export function detectKbChunkPreset(config: KbChunkConfig): KbChunkPresetKey {
  for (const [key, preset] of Object.entries(KB_CHUNK_PRESETS) as Array<
    [Exclude<KbChunkPresetKey, 'custom'>, KbChunkConfig]
  >) {
    if (
      preset.chunkSizeChars === config.chunkSizeChars &&
      preset.chunkOverlapChars === config.chunkOverlapChars
    ) {
      return key;
    }
  }
  return 'custom';
}

export function getKbChunkPresetConfig(
  preset: Exclude<KbChunkPresetKey, 'custom'>,
): KbChunkConfig {
  return KB_CHUNK_PRESETS[preset];
}

export function validateKbChunkConfig(config: KbChunkConfig): string | null {
  if (!Number.isFinite(config.chunkSizeChars) || !Number.isFinite(config.chunkOverlapChars)) {
    return 'Chunk settings must be numeric.';
  }
  if (config.chunkSizeChars < 50 || config.chunkSizeChars > 12000) {
    return 'Chunk size must be between 50 and 12000 characters.';
  }
  if (config.chunkOverlapChars < 0 || config.chunkOverlapChars > 4000) {
    return 'Chunk overlap must be between 0 and 4000 characters.';
  }
  if (config.chunkOverlapChars >= config.chunkSizeChars) {
    return 'Chunk overlap must be smaller than chunk size.';
  }
  return null;
}
