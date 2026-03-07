import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { personalArchiveBucketValidator } from './personalArchiveShared';

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function assertOwnedEntry(ctx: any, userId: any, entryId: any) {
  const entry = await ctx.db.get(entryId);
  if (!entry || entry.userId !== userId) {
    throw new Error('Entry not found');
  }
  return entry;
}

const chunkInput = v.object({
  chunkIndex: v.number(),
  text: v.string(),
  embedding: v.array(v.float64()),
});

const vectorResult = v.object({
  _id: v.id('personalArchiveChunks'),
  _score: v.float64(),
});

export const replaceEntryChunks = mutation({
  args: {
    entryId: v.id('personalArchiveEntries'),
    bucket: personalArchiveBucketValidator,
    title: v.optional(v.string()),
    chunks: v.array(chunkInput),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedEntry(ctx, userId, args.entryId);

    const existing = await ctx.db
      .query('personalArchiveChunks')
      .withIndex('by_entry', (q: any) => q.eq('entryId', args.entryId))
      .collect();
    for (const row of existing) {
      if (row.userId !== userId) continue;
      await ctx.db.delete(row._id);
    }

    const now = Date.now();
    let inserted = 0;
    for (const chunk of args.chunks) {
      const normalized = chunk.text.trim();
      if (!normalized) continue;
      await ctx.db.insert('personalArchiveChunks', {
        userId,
        entryId: args.entryId,
        bucket: args.bucket,
        title: args.title,
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

export const deleteEntryChunks = mutation({
  args: {
    entryId: v.id('personalArchiveEntries'),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedEntry(ctx, userId, args.entryId);
    const existing = await ctx.db
      .query('personalArchiveChunks')
      .withIndex('by_entry', (q: any) => q.eq('entryId', args.entryId))
      .collect();
    let deleted = 0;
    for (const row of existing) {
      if (row.userId !== userId) continue;
      await ctx.db.delete(row._id);
      deleted += 1;
    }
    return deleted;
  },
});

export const hydrateVectorResults = query({
  args: {
    vectorResults: v.array(vectorResult),
    allowedBuckets: v.array(personalArchiveBucketValidator),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    retrievalText: v.string(),
    citations: v.array(v.object({ title: v.string(), uri: v.optional(v.string()) })),
    snippets: v.array(v.object({ text: v.string(), citationIndices: v.array(v.number()) })),
    grounded: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const allowedBuckets = new Set(args.allowedBuckets);
    const snippets: Array<{ text: string; citationIndices: number[] }> = [];
    const citations: Array<{ title: string; uri?: string }> = [];
    const citationIndexByEntry = new Map<string, number>();
    const limit = Math.max(1, Math.min(args.limit ?? 3, 6));

    for (const result of args.vectorResults) {
      if (snippets.length >= limit) break;
      const chunk = await ctx.db.get(result._id);
      if (!chunk || chunk.userId !== userId) continue;
      if (!allowedBuckets.has(chunk.bucket)) continue;
      const entry = await ctx.db.get(chunk.entryId);
      if (!entry || entry.userId !== userId || entry.deletedAt || entry.archivedAt) continue;

      let citationIndex = citationIndexByEntry.get(`${chunk.entryId}`);
      if (citationIndex === undefined) {
        citationIndex = citations.length;
        citationIndexByEntry.set(`${chunk.entryId}`, citationIndex);
        citations.push({
          title: chunk.title?.trim() || bucketTitle(chunk.bucket),
          uri: undefined,
        });
      }

      snippets.push({
        text: chunk.text,
        citationIndices: [citationIndex],
      });
    }

    const retrievalText = snippets.length
      ? snippets
          .map((snippet) => {
            const ref = snippet.citationIndices.map((value) => `S${value + 1}`).join(',');
            return `[${ref}] ${snippet.text}`;
          })
          .join('\n\n')
      : 'NO_EVIDENCE';

    return {
      retrievalText,
      citations,
      snippets,
      grounded: snippets.length > 0,
    };
  },
});

function bucketTitle(bucket: string): string {
  switch (bucket) {
    case 'cookie_jar':
      return 'Cookie Jar';
    case 'world_model':
      return 'World Model';
    default:
      return bucket.charAt(0).toUpperCase() + bucket.slice(1);
  }
}
