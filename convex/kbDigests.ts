import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const digestStatus = v.union(v.literal('active'), v.literal('deleted'));
const documentCardValidator = v.object({
  docType: v.string(),
  about: v.string(),
  bestFor: v.array(v.string()),
  evidenceKinds: v.array(v.string()),
  notFor: v.array(v.string()),
});

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

export const upsertForDocument = mutation({
  args: {
    memberId: v.id('members'),
    kbStoreName: v.string(),
    kbDocumentName: v.optional(v.string()),
    displayName: v.string(),
    storageId: v.optional(v.id('_storage')),
    documentCard: documentCardValidator,
    queryHints: v.array(v.string()),
    status: v.optional(digestStatus),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  },
  returns: v.id('kbDocumentDigests'),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const now = args.updatedAt ?? Date.now();
    let existing: any = null;

    if (args.kbDocumentName) {
      const byDocument = await ctx.db
        .query('kbDocumentDigests')
        .withIndex('by_member_document', (q: any) =>
          q.eq('memberId', args.memberId).eq('kbDocumentName', args.kbDocumentName)
        )
        .collect();
      existing = byDocument.find((row: any) => row.userId === userId) ?? null;
    }

    if (!existing) {
      const candidates = await ctx.db
        .query('kbDocumentDigests')
        .withIndex('by_user_member_status', (q: any) =>
          q.eq('userId', userId).eq('memberId', args.memberId).eq('status', 'active')
        )
        .collect();
      const normalizedDisplay = args.displayName.trim().toLowerCase();
      existing =
        candidates.find((row: any) => {
          const sameDisplay = (row.displayName ?? '').trim().toLowerCase() === normalizedDisplay;
          const sameStore = row.kbStoreName === args.kbStoreName;
          return sameDisplay && sameStore;
        }) ?? null;
    }

    const patch = {
      kbStoreName: args.kbStoreName,
      kbDocumentName: args.kbDocumentName,
      displayName: args.displayName,
      storageId: args.storageId,
      documentCard: args.documentCard,
      queryHints: args.queryHints,
      status: args.status ?? 'active',
      updatedAt: now,
      deletedAt: args.deletedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert('kbDocumentDigests', {
      userId,
      memberId: args.memberId,
      ...patch,
    });
  },
});

export const listByMember = query({
  args: {
    memberId: v.id('members'),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      _id: v.id('kbDocumentDigests'),
      _creationTime: v.number(),
      userId: v.id('users'),
      memberId: v.id('members'),
      kbStoreName: v.string(),
      kbDocumentName: v.optional(v.string()),
      displayName: v.string(),
      storageId: v.optional(v.id('_storage')),
      documentCard: documentCardValidator,
      queryHints: v.array(v.string()),
      status: digestStatus,
      updatedAt: v.number(),
      deletedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const includeDeleted = args.includeDeleted ?? false;
    const statuses: Array<'active' | 'deleted'> = includeDeleted ? ['active', 'deleted'] : ['active'];
    const rows = await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query('kbDocumentDigests')
          .withIndex('by_user_member_status', (q: any) =>
            q.eq('userId', userId).eq('memberId', args.memberId).eq('status', status)
          )
          .collect()
      )
    );

    return rows
      .flat()
      .filter((row: any) => includeDeleted || !row.deletedAt)
      .map((row: any) => ({
        ...row,
        documentCard: row.documentCard ?? buildDocumentCardFromLegacy(row),
        queryHints: Array.isArray(row.queryHints) ? row.queryHints : buildQueryHintsFromLegacy(row),
      }))
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  },
});

export const markDeletedByDocument = mutation({
  args: {
    memberId: v.id('members'),
    kbDocumentName: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);

    const rows = await ctx.db
      .query('kbDocumentDigests')
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

export const updateDigestMetadata = mutation({
  args: {
    digestId: v.id('kbDocumentDigests'),
    displayName: v.optional(v.string()),
    documentCard: v.optional(documentCardValidator),
    queryHints: v.optional(v.array(v.string())),
    updatedAt: v.optional(v.number()),
  },
  returns: v.id('kbDocumentDigests'),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const digest = await ctx.db.get(args.digestId);
    if (!digest || digest.userId !== userId) {
      throw new Error('Knowledge digest not found');
    }
    await assertOwnedMember(ctx, userId, digest.memberId);

    const now = args.updatedAt ?? Date.now();
    const patch: Record<string, any> = {
      updatedAt: now,
    };

    if (args.displayName !== undefined) patch.displayName = args.displayName;
    if (args.documentCard !== undefined) patch.documentCard = args.documentCard;
    if (args.queryHints !== undefined) patch.queryHints = args.queryHints;

    await ctx.db.patch(args.digestId, patch);
    return args.digestId;
  },
});

function normalizeLegacyItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .map((item) => item.slice(0, 120))
    .filter((item, index, list) => list.indexOf(item) === index);
}

function inferLegacyDocType(displayName: string): string {
  const normalized = displayName.toLowerCase();
  if (normalized.endsWith('.pdf') || normalized.includes('book')) return 'book';
  if (normalized.includes('transcript') || normalized.includes('interview') || normalized.includes('podcast')) return 'transcript';
  if (normalized.includes('report')) return 'report';
  if (normalized.includes('essay')) return 'essay';
  if (normalized.includes('article')) return 'article';
  if (normalized.includes('notes')) return 'notes';
  return 'other';
}

function buildDocumentCardFromLegacy(row: any) {
  const topics = normalizeLegacyItems(row.topics);
  const entities = normalizeLegacyItems(row.entities);
  const lexicalAnchors = normalizeLegacyItems(row.lexicalAnchors);
  const digestSummary = typeof row.digestSummary === 'string' ? row.digestSummary.trim() : '';
  const about =
    digestSummary ||
    (topics.length > 0
      ? `Document covering ${topics.slice(0, 4).join(', ')}.`
      : `Document titled ${row.displayName ?? 'Untitled document'}.`);

  const bestFor = topics.slice(0, 4).map((topic) => `questions about ${topic}`);
  const evidenceKinds = (() => {
    const docType = inferLegacyDocType(String(row.displayName ?? ''));
    if (docType === 'transcript') return ['quotes', 'story'];
    if (docType === 'report') return ['reference', 'argument'];
    if (docType === 'essay' || docType === 'article') return ['argument', 'framework'];
    if (docType === 'book') return ['story', 'framework', 'advice'];
    if (lexicalAnchors.length > 0 || entities.length > 0) return ['reference'];
    return ['reference'];
  })();

  return {
    docType: inferLegacyDocType(String(row.displayName ?? '')),
    about: about.slice(0, 600),
    bestFor,
    evidenceKinds,
    notFor: [] as string[],
  };
}

function buildQueryHintsFromLegacy(row: any): string[] {
  return normalizeLegacyItems([
    ...(Array.isArray(row.topics) ? row.topics : []),
    ...(Array.isArray(row.entities) ? row.entities : []),
    ...(Array.isArray(row.lexicalAnchors) ? row.lexicalAnchors : []),
  ]).slice(0, 24);
}

export const migrateLegacySchema = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    scannedCount: v.number(),
    migratedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 500, 1000));
    const rows = (await ctx.db.query('kbDocumentDigests').take(limit)) as Array<any>;

    let migratedCount = 0;
    for (const row of rows) {
      const hasDocumentCard =
        row.documentCard &&
        typeof row.documentCard.docType === 'string' &&
        typeof row.documentCard.about === 'string' &&
        Array.isArray(row.documentCard.bestFor) &&
        Array.isArray(row.documentCard.evidenceKinds) &&
        Array.isArray(row.documentCard.notFor);
      const hasQueryHints = Array.isArray(row.queryHints);
      if (hasDocumentCard && hasQueryHints) continue;

      await ctx.db.replace(row._id, {
        userId: row.userId,
        memberId: row.memberId,
        kbStoreName: row.kbStoreName,
        kbDocumentName: row.kbDocumentName,
        displayName: row.displayName,
        storageId: row.storageId,
        documentCard: hasDocumentCard ? row.documentCard : buildDocumentCardFromLegacy(row),
        queryHints: hasQueryHints ? row.queryHints : buildQueryHintsFromLegacy(row),
        status: row.status ?? 'active',
        updatedAt: row.updatedAt ?? Date.now(),
        deletedAt: row.deletedAt,
      });
      migratedCount += 1;
    }

    return {
      scannedCount: rows.length,
      migratedCount,
    };
  },
});
