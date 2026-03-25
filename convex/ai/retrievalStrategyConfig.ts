'use node';

export type RetrievalStrategy = 'instant' | 'brainstorm' | 'deep_dive';

export type QueryFamily =
  | 'anchor'
  | 'tactical'
  | 'autobiographical'
  | 'thematic'
  | 'contrast'
  | 'adjacent'
  | 'wildcard';

export type PlannerPromptVariant = 'instant' | 'brainstorm' | 'deep_dive';
export type RetrievalLengthBucket = 'short' | 'medium' | 'long' | 'very_long';

export interface RetrievalStrategyConfig {
  plannerPromptVariant: PlannerPromptVariant;
  plannerModelOverride?: string;
  allowedQueryFamilies: QueryFamily[];
  maxKnowledgeQueries: number;
  initialKnowledgeChunkLimit: number;
  targetedDocCount: number;
  wildcardDocCount: number;
  allowBroadFallback: boolean;
  runSecondPassExploitation: boolean;
  secondPassKnowledgeQueries: number;
  secondPassKnowledgeChunkLimit: number;
  collapseDocCount: number;
  answerSynthesisMode: 'instant' | 'thinking';
  answerDirectiveVariant: 'instant' | 'brainstorm' | 'deep_dive';
}

export interface RetrievalLengthAdjustments {
  maxKnowledgeQueriesDelta: number;
  initialKnowledgeChunkLimitDelta: number;
  targetedDocCountDelta: number;
  wildcardDocCountDelta: number;
  secondPassKnowledgeQueriesDelta: number;
  secondPassKnowledgeChunkLimitDelta: number;
}

export interface ResolvedRetrievalStrategyConfig extends RetrievalStrategyConfig {
  lengthBucket: RetrievalLengthBucket;
  normalizedQueryLength: number;
}

export const RETRIEVAL_STRATEGY_CONFIG: Record<RetrievalStrategy, RetrievalStrategyConfig> = {
  instant: {
    plannerPromptVariant: 'instant',
    allowedQueryFamilies: ['anchor', 'tactical', 'autobiographical', 'adjacent'],
    maxKnowledgeQueries: 3,
    initialKnowledgeChunkLimit: 4,
    targetedDocCount: 3,
    wildcardDocCount: 1,
    allowBroadFallback: true,
    runSecondPassExploitation: false,
    secondPassKnowledgeQueries: 0,
    secondPassKnowledgeChunkLimit: 0,
    collapseDocCount: 0,
    answerSynthesisMode: 'instant',
    answerDirectiveVariant: 'instant',
  },
  brainstorm: {
    plannerPromptVariant: 'brainstorm',
    allowedQueryFamilies: ['anchor', 'thematic', 'contrast', 'adjacent', 'wildcard'],
    maxKnowledgeQueries: 5,
    initialKnowledgeChunkLimit: 3,
    targetedDocCount: 4,
    wildcardDocCount: 2,
    allowBroadFallback: true,
    runSecondPassExploitation: false,
    secondPassKnowledgeQueries: 0,
    secondPassKnowledgeChunkLimit: 0,
    collapseDocCount: 0,
    answerSynthesisMode: 'instant',
    answerDirectiveVariant: 'brainstorm',
  },
  deep_dive: {
    plannerPromptVariant: 'deep_dive',
    allowedQueryFamilies: ['anchor', 'tactical', 'autobiographical', 'thematic', 'adjacent'],
    maxKnowledgeQueries: 4,
    initialKnowledgeChunkLimit: 4,
    targetedDocCount: 3,
    wildcardDocCount: 1,
    allowBroadFallback: true,
    runSecondPassExploitation: true,
    secondPassKnowledgeQueries: 2,
    secondPassKnowledgeChunkLimit: 6,
    collapseDocCount: 2,
    answerSynthesisMode: 'thinking',
    answerDirectiveVariant: 'deep_dive',
  },
};

const EMPTY_LENGTH_ADJUSTMENTS: RetrievalLengthAdjustments = {
  maxKnowledgeQueriesDelta: 0,
  initialKnowledgeChunkLimitDelta: 0,
  targetedDocCountDelta: 0,
  wildcardDocCountDelta: 0,
  secondPassKnowledgeQueriesDelta: 0,
  secondPassKnowledgeChunkLimitDelta: 0,
};

const RETRIEVAL_LENGTH_ADJUSTMENTS: Record<
  RetrievalStrategy,
  Record<RetrievalLengthBucket, RetrievalLengthAdjustments>
> = {
  instant: {
    short: EMPTY_LENGTH_ADJUSTMENTS,
    medium: {
      ...EMPTY_LENGTH_ADJUSTMENTS,
      maxKnowledgeQueriesDelta: 1,
      targetedDocCountDelta: 1,
    },
    long: {
      ...EMPTY_LENGTH_ADJUSTMENTS,
      maxKnowledgeQueriesDelta: 2,
      targetedDocCountDelta: 1,
      wildcardDocCountDelta: 1,
      initialKnowledgeChunkLimitDelta: 1,
    },
    very_long: {
      ...EMPTY_LENGTH_ADJUSTMENTS,
      maxKnowledgeQueriesDelta: 4,
      targetedDocCountDelta: 2,
      wildcardDocCountDelta: 1,
      initialKnowledgeChunkLimitDelta: 1,
    },
  },
  brainstorm: {
    short: EMPTY_LENGTH_ADJUSTMENTS,
    medium: {
      ...EMPTY_LENGTH_ADJUSTMENTS,
      maxKnowledgeQueriesDelta: 1,
      targetedDocCountDelta: 1,
      wildcardDocCountDelta: 1,
    },
    long: {
      ...EMPTY_LENGTH_ADJUSTMENTS,
      maxKnowledgeQueriesDelta: 2,
      targetedDocCountDelta: 2,
      wildcardDocCountDelta: 1,
    },
    very_long: {
      ...EMPTY_LENGTH_ADJUSTMENTS,
      maxKnowledgeQueriesDelta: 3,
      targetedDocCountDelta: 2,
      wildcardDocCountDelta: 2,
      initialKnowledgeChunkLimitDelta: 1,
    },
  },
  deep_dive: {
    short: EMPTY_LENGTH_ADJUSTMENTS,
    medium: {
      ...EMPTY_LENGTH_ADJUSTMENTS,
      maxKnowledgeQueriesDelta: 1,
      targetedDocCountDelta: 1,
      secondPassKnowledgeQueriesDelta: 1,
    },
    long: {
      ...EMPTY_LENGTH_ADJUSTMENTS,
      maxKnowledgeQueriesDelta: 2,
      targetedDocCountDelta: 1,
      wildcardDocCountDelta: 1,
      initialKnowledgeChunkLimitDelta: 1,
      secondPassKnowledgeQueriesDelta: 1,
      secondPassKnowledgeChunkLimitDelta: 1,
    },
    very_long: {
      ...EMPTY_LENGTH_ADJUSTMENTS,
      maxKnowledgeQueriesDelta: 4,
      targetedDocCountDelta: 2,
      wildcardDocCountDelta: 1,
      initialKnowledgeChunkLimitDelta: 1,
      secondPassKnowledgeQueriesDelta: 2,
      secondPassKnowledgeChunkLimitDelta: 2,
    },
  },
};

export function getRetrievalStrategyConfig(strategy: RetrievalStrategy): RetrievalStrategyConfig {
  return RETRIEVAL_STRATEGY_CONFIG[strategy];
}

export function getNormalizedQueryLength(query: string): number {
  return query.trim().replace(/\s+/g, ' ').length;
}

export function getRetrievalLengthBucket(query: string): RetrievalLengthBucket {
  const length = getNormalizedQueryLength(query);
  if (length > 2200) return 'very_long';
  if (length > 900) return 'long';
  if (length > 280) return 'medium';
  return 'short';
}

export function resolveRetrievalStrategyConfig(
  strategy: RetrievalStrategy,
  query: string,
): ResolvedRetrievalStrategyConfig {
  const base = getRetrievalStrategyConfig(strategy);
  const lengthBucket = getRetrievalLengthBucket(query);
  const normalizedQueryLength = getNormalizedQueryLength(query);
  const deltas = RETRIEVAL_LENGTH_ADJUSTMENTS[strategy][lengthBucket];

  return {
    ...base,
    maxKnowledgeQueries: base.maxKnowledgeQueries + deltas.maxKnowledgeQueriesDelta,
    initialKnowledgeChunkLimit: base.initialKnowledgeChunkLimit + deltas.initialKnowledgeChunkLimitDelta,
    targetedDocCount: base.targetedDocCount + deltas.targetedDocCountDelta,
    wildcardDocCount: base.wildcardDocCount + deltas.wildcardDocCountDelta,
    secondPassKnowledgeQueries: base.secondPassKnowledgeQueries + deltas.secondPassKnowledgeQueriesDelta,
    secondPassKnowledgeChunkLimit: base.secondPassKnowledgeChunkLimit + deltas.secondPassKnowledgeChunkLimitDelta,
    lengthBucket,
    normalizedQueryLength,
  };
}
