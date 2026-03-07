import { v } from 'convex/values';

export const personalArchiveSourceTypeValues = ['text', 'audio', 'file', 'import'] as const;
export type PersonalArchiveSourceType = (typeof personalArchiveSourceTypeValues)[number];

export const personalArchiveBucketValues = [
  'reflection',
  'cookie_jar',
  'accountability',
  'world_model',
] as const;
export type PersonalArchiveBucket = (typeof personalArchiveBucketValues)[number];

export const personalArchiveSourceTypeValidator = v.union(
  v.literal('text'),
  v.literal('audio'),
  v.literal('file'),
  v.literal('import'),
);

export const personalArchiveBucketValidator = v.union(
  v.literal('reflection'),
  v.literal('cookie_jar'),
  v.literal('accountability'),
  v.literal('world_model'),
);

export const personalArchiveAccessValidator = v.object({
  reflection: v.boolean(),
  cookieJar: v.boolean(),
  accountability: v.boolean(),
  worldModel: v.boolean(),
});

export const personalArchiveCaptureStatusValidator = v.union(
  v.literal('pending'),
  v.literal('ready'),
  v.literal('failed'),
  v.literal('committed'),
);

export const personalArchiveProposedEntryValidator = v.object({
  bucket: personalArchiveBucketValidator,
  title: v.optional(v.string()),
  content: v.string(),
});

export function defaultPersonalArchiveAccess() {
  return {
    reflection: false,
    cookieJar: false,
    accountability: false,
    worldModel: false,
  };
}

export function archiveAccessToBuckets(access?: {
  reflection?: boolean;
  cookieJar?: boolean;
  accountability?: boolean;
  worldModel?: boolean;
}): PersonalArchiveBucket[] {
  const buckets: PersonalArchiveBucket[] = [];
  if (access?.reflection) buckets.push('reflection');
  if (access?.cookieJar) buckets.push('cookie_jar');
  if (access?.accountability) buckets.push('accountability');
  if (access?.worldModel) buckets.push('world_model');
  return buckets;
}
