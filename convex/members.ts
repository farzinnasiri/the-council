import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const docs = await ctx.db
      .query('members')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .collect();

    const filtered = args.includeArchived ? docs : docs.filter((doc: any) => !doc.deletedAt);

    return await Promise.all(
      filtered.map(async (doc: any) => ({
        ...doc,
        avatarUrl: doc.avatarId ? await ctx.storage.getUrl(doc.avatarId) : null,
      }))
    );
  },
});

export const getById = query({
  args: {
    memberId: v.id('members'),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(args.memberId);
    if (!doc || doc.userId !== userId) {
      return null;
    }
    if (!args.includeArchived && doc.deletedAt) {
      return null;
    }
    return {
      ...doc,
      avatarUrl: doc.avatarId ? await ctx.storage.getUrl(doc.avatarId) : null,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    specialties: v.optional(v.array(v.string())),
    systemPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const id = await ctx.db.insert('members', {
      userId,
      name: args.name,
      specialties: args.specialties ?? [],
      systemPrompt: args.systemPrompt,
      updatedAt: Date.now(),
    });
    const doc = (await ctx.db.get(id))!;
    return { ...doc, avatarUrl: null as string | null };
  },
});

export const update = mutation({
  args: {
    memberId: v.id('members'),
    name: v.optional(v.string()),
    specialties: v.optional(v.array(v.string())),
    systemPrompt: v.optional(v.string()),
    avatarId: v.optional(v.id('_storage')),
    kbStoreName: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get(args.memberId);
    if (!current || current.userId !== userId) throw new Error('Member not found');
    const { memberId, ...patch } = args;
    const filteredPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    await ctx.db.patch(memberId, { ...filteredPatch, updatedAt: Date.now() });
    const updated = (await ctx.db.get(memberId))!;
    return {
      ...updated,
      avatarUrl: updated.avatarId ? await ctx.storage.getUrl(updated.avatarId) : null as string | null,
    };
  },
});

export const archive = mutation({
  args: { memberId: v.id('members') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get(args.memberId);
    if (!current || current.userId !== userId) throw new Error('Member not found');
    await ctx.db.patch(args.memberId, { deletedAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

export const setStoreName = mutation({
  args: { memberId: v.id('members'), storeName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get(args.memberId);
    if (!current || current.userId !== userId) throw new Error('Member not found');
    await ctx.db.patch(args.memberId, { kbStoreName: args.storeName, updatedAt: Date.now() });
    return null;
  },
});
