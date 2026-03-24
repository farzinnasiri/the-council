'use node';

import { v } from 'convex/values';

export const contextMessageValidator = v.object({
  role: v.union(v.literal('user'), v.literal('assistant')),
  content: v.string(),
});

export const stagedUploadInputValidator = v.object({
  storageId: v.id('_storage'),
  displayName: v.string(),
  mimeType: v.optional(v.string()),
  sizeBytes: v.optional(v.number()),
});

export const kbChunkConfigValidator = v.object({
  chunkSizeChars: v.number(),
  chunkOverlapChars: v.number(),
});

export const roundTriggerValidator = v.union(v.literal('user_message'), v.literal('continue'));
export const roundIntentValidator = v.union(
  v.literal('speak'),
  v.literal('challenge'),
  v.literal('support'),
  v.literal('pass')
);
export const roundBidMoveTypeValidator = v.union(
  v.literal('rebuttal'),
  v.literal('caveat'),
  v.literal('synthesis'),
  v.literal('evidence'),
  v.literal('reframing'),
  v.literal('clarification'),
  v.literal('agreement'),
  v.literal('pass')
);
export const roundtableRationaleTagValidator = v.union(
  v.literal('pushback'),
  v.literal('new angle'),
  v.literal('evidence'),
  v.literal('synthesis'),
  v.literal('clarify')
);
export const roundtableCandidateStatusValidator = v.union(
  v.literal('shortlisted'),
  v.literal('speaking'),
  v.literal('spoken'),
  v.literal('dismissed')
);
export const roundtableCandidateSelectedByValidator = v.union(
  v.literal('allocator'),
  v.literal('mention_boost'),
  v.literal('user_manual_fallback')
);
export const roundtableSpeakIntentValidator = v.union(
  v.literal('speak'),
  v.literal('challenge'),
  v.literal('support')
);
