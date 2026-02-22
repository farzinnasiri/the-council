import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function assertOwnedMember(ctx: any, userId: any, memberId: any) {
  const member = await ctx.db.get(memberId);
  if (!member || member.userId !== userId) {
    throw new Error('Member not found');
  }
  return member;
}

const chunkInput = v.object({
  chunkIndex: v.number(),
  text: v.string(),
  embedding: v.array(v.float64()),
});

const vectorResult = v.object({
  _id: v.id('kbDocumentChunks'),
  _score: v.float64(),
});

export const upsertDocumentChunks = mutation({
  args: {
    memberId: v.id('members'),
    kbStoreName: v.string(),
    kbDocumentName: v.string(),
    displayName: v.string(),
    chunks: v.array(chunkInput),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const existing = await ctx.db
      .query('kbDocumentChunks')
      .withIndex('by_member_document', (q: any) =>
        q.eq('memberId', args.memberId).eq('kbDocumentName', args.kbDocumentName)
      )
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
      await ctx.db.insert('kbDocumentChunks', {
        userId,
        memberId: args.memberId,
        kbStoreName: args.kbStoreName,
        kbDocumentName: args.kbDocumentName,
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

export const deleteDocumentChunks = mutation({
  args: {
    memberId: v.id('members'),
    kbDocumentName: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const rows = await ctx.db
      .query('kbDocumentChunks')
      .withIndex('by_member_document', (q: any) =>
        q.eq('memberId', args.memberId).eq('kbDocumentName', args.kbDocumentName)
      )
      .collect();

    let count = 0;
    for (const row of rows) {
      if (row.userId !== userId) continue;
      await ctx.db.delete(row._id);
      count += 1;
    }
    return count;
  },
});

export const listDocumentsByMember = query({
  args: {
    memberId: v.id('members'),
  },
  returns: v.array(
    v.object({
      name: v.optional(v.string()),
      displayName: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const rows = await ctx.db
      .query('kbDocumentChunks')
      .withIndex('by_member_createdAt', (q: any) => q.eq('memberId', args.memberId))
      .collect();

    const latestByDoc = new Map<string, { name: string; displayName: string; createdAt: number }>();
    for (const row of rows) {
      if (row.userId !== userId) continue;
      const key = row.kbDocumentName;
      const current = latestByDoc.get(key);
      if (!current || row.createdAt > current.createdAt) {
        latestByDoc.set(key, {
          name: row.kbDocumentName,
          displayName: row.displayName,
          createdAt: row.createdAt,
        });
      }
    }

    return Array.from(latestByDoc.values())
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map((item) => ({
        name: item.name,
        displayName: item.displayName,
      }));
  },
});

export const hydrateVectorResults = query({
  args: {
    memberId: v.id('members'),
    vectorResults: v.array(vectorResult),
  },
  returns: v.object({
    retrievalText: v.string(),
    citations: v.array(v.object({ title: v.string(), uri: v.optional(v.string()) })),
    snippets: v.array(v.object({ text: v.string(), citationIndices: v.array(v.number()) })),
    grounded: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const citations: Array<{ title: string; uri?: string }> = [];
    const citationIndexByDoc = new Map<string, number>();
    const snippets: Array<{ text: string; citationIndices: number[] }> = [];

    for (const result of args.vectorResults) {
      const chunk = await ctx.db.get(result._id);
      if (!chunk || chunk.userId !== userId || chunk.memberId !== args.memberId) continue;

      let citationIndex = citationIndexByDoc.get(chunk.kbDocumentName);
      if (citationIndex === undefined) {
        citationIndex = citations.length;
        citationIndexByDoc.set(chunk.kbDocumentName, citationIndex);
        citations.push({
          title: chunk.displayName || chunk.kbDocumentName,
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
          .map((snippet, index) => {
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
