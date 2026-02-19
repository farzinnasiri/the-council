import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

// ── Shared validator ──────────────────────────────────────────────────────────

const conversationDoc = v.object({
    _id: v.id('conversations'),
    _creationTime: v.number(),
    type: v.union(v.literal('hall'), v.literal('chamber')),
    title: v.string(),
    memberIds: v.array(v.id('members')),
    status: v.union(v.literal('active'), v.literal('archived')),
    summary: v.optional(v.string()),
    summaryTokens: v.optional(v.number()),
    messageCount: v.number(),
    updatedAt: v.number(),
});

// ── Queries ───────────────────────────────────────────────────────────────────

export const list = query({
    args: { includeArchived: v.optional(v.boolean()) },
    returns: v.array(conversationDoc),
    handler: async (ctx, args) => {
        const rows = args.includeArchived
            ? await ctx.db.query('conversations').order('desc').collect()
            : await ctx.db
                .query('conversations')
                .withIndex('by_status_updated', (q) => q.eq('status', 'active'))
                .order('desc')
                .collect();
        return rows;
    },
});

export const getById = query({
    args: { conversationId: v.id('conversations') },
    returns: v.union(conversationDoc, v.null()),
    handler: async (ctx, args) => {
        return await ctx.db.get(args.conversationId);
    },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

export const create = mutation({
    args: {
        type: v.union(v.literal('hall'), v.literal('chamber')),
        title: v.string(),
        memberIds: v.array(v.id('members')),
    },
    returns: conversationDoc,
    handler: async (ctx, args) => {
        const now = Date.now();
        const id = await ctx.db.insert('conversations', {
            type: args.type,
            title: args.title,
            memberIds: args.memberIds,
            status: 'active',
            messageCount: 0,
            updatedAt: now,
        });
        return (await ctx.db.get(id))!;
    },
});

export const update = mutation({
    args: {
        conversationId: v.id('conversations'),
        title: v.optional(v.string()),
        memberIds: v.optional(v.array(v.id('members'))),
        status: v.optional(v.union(v.literal('active'), v.literal('archived'))),
    },
    returns: conversationDoc,
    handler: async (ctx, args) => {
        const { conversationId, ...patch } = args;
        const current = await ctx.db.get(conversationId);
        if (!current) throw new Error('Conversation not found');
        await ctx.db.patch(conversationId, { ...patch, updatedAt: Date.now() });
        return (await ctx.db.get(conversationId))!;
    },
});

// Bump updatedAt and increment messageCount after messages are appended
export const touch = mutation({
    args: { conversationId: v.id('conversations'), increment: v.number() },
    returns: v.null(),
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.conversationId);
        if (!current) throw new Error('Conversation not found');
        await ctx.db.patch(args.conversationId, {
            updatedAt: Date.now(),
            messageCount: current.messageCount + args.increment,
        });
        return null;
    },
});

// Update rolling summary (called by compaction action)
export const applyCompaction = mutation({
    args: {
        conversationId: v.id('conversations'),
        summary: v.string(),
        summaryTokens: v.optional(v.number()),
        compactedMessageIds: v.array(v.id('messages')),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.patch(args.conversationId, {
            summary: args.summary,
            summaryTokens: args.summaryTokens,
            updatedAt: Date.now(),
        });
        await Promise.all(
            args.compactedMessageIds.map((id) => ctx.db.patch(id, { compacted: true }))
        );
        return null;
    },
});
