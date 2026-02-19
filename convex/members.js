import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
// ── Shared return shape ───────────────────────────────────────────────────────
const memberDoc = v.object({
    _id: v.id('members'),
    _creationTime: v.number(),
    name: v.string(),
    emoji: v.string(),
    role: v.string(),
    specialties: v.array(v.string()),
    systemPrompt: v.string(),
    kbStoreName: v.optional(v.string()),
    status: v.union(v.literal('active'), v.literal('archived')),
    updatedAt: v.number(),
});
// ── Queries ───────────────────────────────────────────────────────────────────
export const list = query({
    args: { includeArchived: v.optional(v.boolean()) },
    returns: v.array(memberDoc),
    handler: async (ctx, args) => {
        if (args.includeArchived) {
            return await ctx.db.query('members').order('asc').collect();
        }
        return await ctx.db
            .query('members')
            .withIndex('by_status', (q) => q.eq('status', 'active'))
            .collect();
    },
});
export const get = query({
    args: { memberId: v.id('members') },
    returns: v.union(memberDoc, v.null()),
    handler: async (ctx, args) => {
        return await ctx.db.get(args.memberId);
    },
});
// ── Mutations ─────────────────────────────────────────────────────────────────
export const create = mutation({
    args: {
        name: v.string(),
        systemPrompt: v.string(),
        emoji: v.optional(v.string()),
        role: v.optional(v.string()),
        specialties: v.optional(v.array(v.string())),
    },
    returns: memberDoc,
    handler: async (ctx, args) => {
        const now = Date.now();
        const id = await ctx.db.insert('members', {
            name: args.name,
            emoji: args.emoji ?? '🤖',
            role: args.role ?? 'Advisor',
            specialties: args.specialties ?? [],
            systemPrompt: args.systemPrompt,
            status: 'active',
            updatedAt: now,
        });
        return (await ctx.db.get(id));
    },
});
export const update = mutation({
    args: {
        memberId: v.id('members'),
        name: v.optional(v.string()),
        systemPrompt: v.optional(v.string()),
        emoji: v.optional(v.string()),
        role: v.optional(v.string()),
        specialties: v.optional(v.array(v.string())),
        kbStoreName: v.optional(v.union(v.string(), v.null())),
        status: v.optional(v.union(v.literal('active'), v.literal('archived'))),
    },
    returns: memberDoc,
    handler: async (ctx, args) => {
        const { memberId, kbStoreName, ...rest } = args;
        const current = await ctx.db.get(memberId);
        if (!current)
            throw new Error('Member not found');
        const patch = { ...rest, updatedAt: Date.now() };
        // Allow explicitly clearing kbStoreName by passing null
        if (kbStoreName !== undefined) {
            patch.kbStoreName = kbStoreName ?? undefined;
        }
        await ctx.db.patch(memberId, patch);
        return (await ctx.db.get(memberId));
    },
});
export const archive = mutation({
    args: { memberId: v.id('members') },
    returns: v.null(),
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.memberId);
        if (!current)
            throw new Error('Member not found');
        await ctx.db.patch(args.memberId, { status: 'archived', updatedAt: Date.now() });
        return null;
    },
});
export const setStoreName = mutation({
    args: { memberId: v.id('members'), storeName: v.string() },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.patch(args.memberId, {
            kbStoreName: args.storeName,
            updatedAt: Date.now(),
        });
        return null;
    },
});
