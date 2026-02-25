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

export const roundTriggerValidator = v.union(v.literal('user_message'), v.literal('continue'));
export const roundIntentValidator = v.union(
  v.literal('speak'),
  v.literal('challenge'),
  v.literal('support'),
  v.literal('pass')
);
export const roundtableSpeakIntentValidator = v.union(
  v.literal('speak'),
  v.literal('challenge'),
  v.literal('support')
);
