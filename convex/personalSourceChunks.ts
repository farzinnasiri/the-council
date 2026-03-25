import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

const chunkInput = v.object({
  chunkIndex: v.number(),
  text: v.string(),
  embedding: v.array(v.float64()),
});

const vectorResult = v.object({
  _id: v.id('personalSourceChunks'),
  _score: v.float64(),
});

const MAX_DELETE_BATCH = 64;

export const upsertSourceChunks = mutation({
  args: {
    personalSourceName: v.string(),
    displayName: v.string(),
    chunks: v.array(chunkInput),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    let inserted = 0;
    for (const chunk of args.chunks) {
      const normalized = chunk.text.trim();
      if (!normalized) continue;
      await ctx.db.insert('personalSourceChunks', {
        userId,
        personalSourceName: args.personalSourceName,
        displayName: args.displayName,
        chunkIndex: chunk.chunkIndex,
        text: normalized,
        embedding: chunk.embedding,
        createdAt: now,
      });
      inserted += 1;
    }
    return inserted;
  },
});

export const deleteSourceChunksBatch = mutation({
  args: {
    personalSourceName: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    deletedCount: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? MAX_DELETE_BATCH, MAX_DELETE_BATCH));
    const rows = await ctx.db
      .query('personalSourceChunks')
      .withIndex('by_user_source', (q: any) => q.eq('userId', userId).eq('personalSourceName', args.personalSourceName))
      .take(limit);
    let deletedCount = 0;
    for (const row of rows) {
      await ctx.db.delete(row._id);
      deletedCount += 1;
    }
    return {
      deletedCount,
      hasMore: rows.length === limit,
    };
  },
});

export const hydrateVectorResults = query({
  args: {
    vectorResults: v.array(vectorResult),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const scoreById = new Map(args.vectorResults.map((row) => [String(row._id), row._score]));
    const out: Array<Record<string, unknown>> = [];
    for (const result of args.vectorResults) {
      const row = await ctx.db.get(result._id);
      if (!row || row.userId !== userId) continue;
      out.push({
        chunkId: row._id,
        personalSourceName: row.personalSourceName,
        displayName: row.displayName,
        chunkIndex: row.chunkIndex,
        score: scoreById.get(String(row._id)) ?? 0,
        text: row.text,
      });
    }
    return out;
  },
});
