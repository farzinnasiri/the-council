'use node';

export interface NumericRange {
  min: number;
  max: number;
}

export interface PersonalSourceRetrievalConfig {
  queryCountRange: NumericRange;
  parallelQueryCountRange: NumericRange;
  candidateSourceCountRange: NumericRange;
  chunkLimitPerQueryRange: NumericRange;
  injectedSourceGroupCountRange: NumericRange;
  chunksPerSourceGroupRange: NumericRange;
}

export const PERSONAL_SOURCE_RETRIEVAL_CONFIG: PersonalSourceRetrievalConfig = {
  queryCountRange: { min: 1, max: 3 },
  parallelQueryCountRange: { min: 1, max: 2 },
  candidateSourceCountRange: { min: 1, max: 4 },
  chunkLimitPerQueryRange: { min: 2, max: 5 },
  injectedSourceGroupCountRange: { min: 1, max: 3 },
  chunksPerSourceGroupRange: { min: 1, max: 2 },
};

export function clampToRange(value: number | undefined, range: NumericRange): number {
  if (!Number.isFinite(value)) return range.min;
  return Math.max(range.min, Math.min(range.max, Math.trunc(value!)));
}
