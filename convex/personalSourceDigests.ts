import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import {
  normalizePersonalSourceLabels,
  normalizePersonalSourceQueryHints,
  personalSourceDocumentKindValues,
  personalSourceDocumentMetadataValidator,
  personalSourceSemanticClassValues,
} from './personalSourcesShared';

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

function normalizeMetadata(input: {
  documentKinds?: string[];
  semanticClasses?: string[];
  queryHints?: string[];
  voice?: 'first_person' | 'second_person' | 'mixed' | 'unknown';
}) {
  return {
    documentKinds: normalizePersonalSourceLabels(input.documentKinds, personalSourceDocumentKindValues, 4),
    semanticClasses: normalizePersonalSourceLabels(input.semanticClasses, personalSourceSemanticClassValues, 8),
    queryHints: normalizePersonalSourceQueryHints(input.queryHints, 16),
    voice: input.voice,
  };
}

export const upsertForDocument = mutation({
  args: {
    personalSourceName: v.string(),
    displayName: v.string(),
    storageId: v.optional(v.id('_storage')),
    metadata: personalSourceDocumentMetadataValidator,
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  },
  returns: v.id('personalSourceDigests'),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query('personalSourceDigests')
      .withIndex('by_user_source', (q: any) => q.eq('userId', userId).eq('personalSourceName', args.personalSourceName))
      .unique();
    const now = args.updatedAt ?? Date.now();
    const metadata = normalizeMetadata(args.metadata);
    const patch = {
      displayName: args.displayName,
      storageId: args.storageId,
      metadata,
      updatedAt: now,
      deletedAt: args.deletedAt,
      status: (args.deletedAt ? 'deleted' : 'active') as 'active' | 'deleted',
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert('personalSourceDigests', {
      userId,
      personalSourceName: args.personalSourceName,
      ...patch,
    });
  },
});

export const listByUser = query({
  args: {
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const includeDeleted = args.includeDeleted ?? false;
    const statuses: Array<'active' | 'deleted'> = includeDeleted ? ['active', 'deleted'] : ['active'];
    const rows = await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query('personalSourceDigests')
          .withIndex('by_user_status', (q: any) => q.eq('userId', userId).eq('status', status))
          .collect(),
      ),
    );
    return rows
      .flat()
      .filter((row: any) => includeDeleted || !row.deletedAt)
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  },
});

export const updateDigestMetadata = mutation({
  args: {
    digestId: v.id('personalSourceDigests'),
    displayName: v.optional(v.string()),
    metadata: v.optional(personalSourceDocumentMetadataValidator),
    updatedAt: v.optional(v.number()),
  },
  returns: v.id('personalSourceDigests'),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const digest = await ctx.db.get(args.digestId);
    if (!digest || digest.userId !== userId) throw new Error('Personal source metadata not found');

    const patch: Record<string, unknown> = {
      updatedAt: args.updatedAt ?? Date.now(),
    };
    if (args.displayName !== undefined) patch.displayName = args.displayName;
    if (args.metadata !== undefined) patch.metadata = normalizeMetadata(args.metadata);
    await ctx.db.patch(args.digestId, patch);
    return args.digestId;
  },
});

export const markDeletedBySource = mutation({
  args: {
    personalSourceName: v.string(),
    deletedAt: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db
      .query('personalSourceDigests')
      .withIndex('by_user_source', (q: any) => q.eq('userId', userId).eq('personalSourceName', args.personalSourceName))
      .unique();
    if (!row) return 0;
    const deletedAt = args.deletedAt ?? Date.now();
    await ctx.db.patch(row._id, {
      status: 'deleted',
      deletedAt,
      updatedAt: deletedAt,
    });
    return 1;
  },
});
