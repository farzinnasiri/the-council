import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import {
  archiveAccessToBuckets,
  personalArchiveAccessValidator,
  personalArchiveBucketValidator,
  personalArchiveCaptureStatusValidator,
  personalArchiveProposedEntryValidator,
  personalArchiveSourceTypeValidator,
} from './personalArchiveShared';

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function requireOwnedCapture(ctx: any, userId: any, captureId: any) {
  const capture = await ctx.db.get(captureId);
  if (!capture || capture.userId !== userId) {
    throw new Error('Capture not found');
  }
  return capture;
}

async function requireOwnedEntry(ctx: any, userId: any, entryId: any) {
  const entry = await ctx.db.get(entryId);
  if (!entry || entry.userId !== userId) {
    throw new Error('Entry not found');
  }
  return entry;
}

const profileDoc = v.object({
  _id: v.id('personalArchiveProfiles'),
  _creationTime: v.number(),
  userId: v.id('users'),
  identity: v.string(),
  updatedAt: v.number(),
});

const captureDoc = v.object({
  _id: v.id('personalArchiveCaptures'),
  _creationTime: v.number(),
  userId: v.id('users'),
  sourceType: personalArchiveSourceTypeValidator,
  rawText: v.optional(v.string()),
  storageId: v.optional(v.id('_storage')),
  originalLabel: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  sizeBytes: v.optional(v.number()),
  parseStatus: personalArchiveCaptureStatusValidator,
  parseError: v.optional(v.string()),
  proposedEntries: v.array(personalArchiveProposedEntryValidator),
  updatedAt: v.number(),
  committedAt: v.optional(v.number()),
});

const entryDoc = v.object({
  _id: v.id('personalArchiveEntries'),
  _creationTime: v.number(),
  userId: v.id('users'),
  captureId: v.optional(v.id('personalArchiveCaptures')),
  bucket: personalArchiveBucketValidator,
  title: v.optional(v.string()),
  content: v.string(),
  archivedAt: v.optional(v.number()),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
});

export const getProfile = query({
  args: {},
  returns: v.union(profileDoc, v.null()),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return (
      (await ctx.db
        .query('personalArchiveProfiles')
        .withIndex('by_user', (q: any) => q.eq('userId', userId))
        .unique()) ?? null
    );
  },
});

export const upsertProfile = mutation({
  args: {
    identity: v.string(),
  },
  returns: profileDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query('personalArchiveProfiles')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        identity: args.identity.trim(),
        updatedAt: now,
      });
      return (await ctx.db.get(existing._id))!;
    }
    const profileId = await ctx.db.insert('personalArchiveProfiles', {
      userId,
      identity: args.identity.trim(),
      updatedAt: now,
    });
    return (await ctx.db.get(profileId))!;
  },
});

export const createCapture = mutation({
  args: {
    sourceType: personalArchiveSourceTypeValidator,
    rawText: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    originalLabel: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
  },
  returns: v.id('personalArchiveCaptures'),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await ctx.db.insert('personalArchiveCaptures', {
      userId,
      sourceType: args.sourceType,
      rawText: args.rawText,
      storageId: args.storageId,
      originalLabel: args.originalLabel,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      parseStatus: 'pending',
      proposedEntries: [],
      updatedAt: Date.now(),
    });
  },
});

export const getCapture = query({
  args: {
    captureId: v.id('personalArchiveCaptures'),
  },
  returns: v.union(captureDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const capture = await ctx.db.get(args.captureId);
    if (!capture || capture.userId !== userId) {
      return null;
    }
    return capture;
  },
});

export const patchCapture = mutation({
  args: {
    captureId: v.id('personalArchiveCaptures'),
    parseStatus: v.optional(personalArchiveCaptureStatusValidator),
    parseError: v.optional(v.string()),
    proposedEntries: v.optional(v.array(personalArchiveProposedEntryValidator)),
    rawText: v.optional(v.string()),
    committedAt: v.optional(v.number()),
  },
  returns: captureDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireOwnedCapture(ctx, userId, args.captureId);
    const { captureId, ...patch } = args;
    const filteredPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    await ctx.db.patch(captureId, {
      ...filteredPatch,
      updatedAt: Date.now(),
    });
    return (await ctx.db.get(captureId))!;
  },
});

export const createEntry = mutation({
  args: {
    captureId: v.optional(v.id('personalArchiveCaptures')),
    bucket: personalArchiveBucketValidator,
    title: v.optional(v.string()),
    content: v.string(),
  },
  returns: entryDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.captureId) {
      await requireOwnedCapture(ctx, userId, args.captureId);
    }
    const entryId = await ctx.db.insert('personalArchiveEntries', {
      userId,
      captureId: args.captureId,
      bucket: args.bucket,
      title: args.title,
      content: args.content.trim(),
      updatedAt: Date.now(),
    });
    return (await ctx.db.get(entryId))!;
  },
});

export const updateEntry = mutation({
  args: {
    entryId: v.id('personalArchiveEntries'),
    bucket: v.optional(personalArchiveBucketValidator),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    archivedAt: v.optional(v.union(v.number(), v.null())),
    deletedAt: v.optional(v.union(v.number(), v.null())),
  },
  returns: entryDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await requireOwnedEntry(ctx, userId, args.entryId);
    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    if (args.bucket !== undefined) patch.bucket = args.bucket;
    if (args.title !== undefined) patch.title = args.title;
    if (args.content !== undefined) patch.content = args.content.trim();
    if (args.archivedAt !== undefined) patch.archivedAt = args.archivedAt ?? undefined;
    if (args.deletedAt !== undefined) patch.deletedAt = args.deletedAt ?? undefined;
    await ctx.db.patch(args.entryId, patch);
    return (await ctx.db.get(current._id))! as any;
  },
});

export const listEntries = query({
  args: {
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(entryDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query('personalArchiveEntries')
      .withIndex('by_user_updated', (q: any) => q.eq('userId', userId))
      .order('desc')
      .collect();
    return rows.filter((row: any) => {
      if (row.deletedAt) return false;
      if (args.includeArchived) return true;
      return !row.archivedAt;
    });
  },
});

export const getAccessibleSummary = query({
  args: {
    access: personalArchiveAccessValidator,
  },
  returns: v.object({
    availableBuckets: v.array(personalArchiveBucketValidator),
    totalEntries: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const allowedBuckets = archiveAccessToBuckets(args.access);
    if (!allowedBuckets.length) {
      return { availableBuckets: [], totalEntries: 0 };
    }

    const rows = await ctx.db
      .query('personalArchiveEntries')
      .withIndex('by_user_updated', (q: any) => q.eq('userId', userId))
      .collect();

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.deletedAt || row.archivedAt) continue;
      if (!allowedBuckets.includes(row.bucket)) continue;
      counts.set(row.bucket, (counts.get(row.bucket) ?? 0) + 1);
    }

    const availableBuckets = allowedBuckets.filter((bucket) => (counts.get(bucket) ?? 0) > 0);
    const totalEntries = availableBuckets.reduce((sum, bucket) => sum + (counts.get(bucket) ?? 0), 0);
    return { availableBuckets, totalEntries };
  },
});
