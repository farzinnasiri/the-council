import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
// ── Shared validators ─────────────────────────────────────────────────────────
const routingValidator = v.object({
    memberIds: v.array(v.id('members')),
    source: v.union(v.literal('llm'), v.literal('fallback'), v.literal('chamber-fixed')),
});
const messageDoc = v.object({
    _id: v.id('messages'),
    _creationTime: v.number(),
    conversationId: v.id('conversations'),
    role: v.union(v.literal('user'), v.literal('member'), v.literal('system')),
    memberId: v.optional(v.id('members')),
    content: v.string(),
    status: v.union(v.literal('pending'), v.literal('sent'), v.literal('error')),
    compacted: v.boolean(),
    routing: v.optional(routingValidator),
    error: v.optional(v.string()),
});
const messageInputValidator = v.object({
    conversationId: v.id('conversations'),
    role: v.union(v.literal('user'), v.literal('member'), v.literal('system')),
    memberId: v.optional(v.id('members')),
    content: v.string(),
    status: v.union(v.literal('pending'), v.literal('sent'), v.literal('error')),
    routing: v.optional(routingValidator),
    error: v.optional(v.string()),
});
// ── Queries ───────────────────────────────────────────────────────────────────
/** Fetch active (non-compacted) messages for a conversation */
export const listActive = query({
    args: { conversationId: v.id('conversations') },
    returns: v.array(messageDoc),
    handler: async (ctx, args) => {
        return await ctx.db
            .query('messages')
            .withIndex('by_conversation_active', (q) => q.eq('conversationId', args.conversationId).eq('compacted', false))
            .order('asc')
            .collect();
    },
});
/** Fetch ALL messages (compacted or not) for a conversation */
export const listAll = query({
    args: { conversationId: v.id('conversations') },
    returns: v.array(messageDoc),
    handler: async (ctx, args) => {
        return await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
            .order('asc')
            .collect();
    },
});
/** For compaction: oldest non-compacted messages in a conversation */
export const listOldestActive = query({
    args: { conversationId: v.id('conversations'), limit: v.number() },
    returns: v.array(messageDoc),
    handler: async (ctx, args) => {
        return await ctx.db
            .query('messages')
            .withIndex('by_conversation_active', (q) => q.eq('conversationId', args.conversationId).eq('compacted', false))
            .order('asc')
            .take(args.limit);
    },
});
/** Full context for LLM: summary + active messages */
export const getContext = query({
    args: {
        conversationId: v.id('conversations'),
        compactionThreshold: v.optional(v.number()),
    },
    returns: v.object({
        summary: v.optional(v.string()),
        messages: v.array(messageDoc),
        shouldCompact: v.boolean(),
        messageCount: v.number(),
    }),
    handler: async (ctx, args) => {
        const conversation = await ctx.db.get(args.conversationId);
        if (!conversation)
            throw new Error('Conversation not found');
        const messages = await ctx.db
            .query('messages')
            .withIndex('by_conversation_active', (q) => q.eq('conversationId', args.conversationId).eq('compacted', false))
            .order('asc')
            .collect();
        const threshold = args.compactionThreshold ?? 20;
        return {
            summary: conversation.summary,
            messages,
            shouldCompact: messages.length >= threshold,
            messageCount: conversation.messageCount,
        };
    },
});
// ── Mutations ─────────────────────────────────────────────────────────────────
export const append = mutation({
    args: { message: messageInputValidator },
    returns: v.id('messages'),
    handler: async (ctx, args) => {
        const id = await ctx.db.insert('messages', {
            ...args.message,
            compacted: false,
        });
        return id;
    },
});
export const appendMany = mutation({
    args: { messages: v.array(messageInputValidator) },
    returns: v.null(),
    handler: async (ctx, args) => {
        for (const msg of args.messages) {
            await ctx.db.insert('messages', { ...msg, compacted: false });
        }
        return null;
    },
});
export const clearConversation = mutation({
    args: { conversationId: v.id('conversations') },
    returns: v.null(),
    handler: async (ctx, args) => {
        const rows = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
            .collect();
        await Promise.all(rows.map((r) => ctx.db.delete(r._id)));
        return null;
    },
});
