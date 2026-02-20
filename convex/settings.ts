import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

/**
 * User-scoped get — reads a config value for the authenticated user.
 * Falls back to null if not set.
 */
export const getForUser = query({
    args: { key: v.string() },
    returns: v.union(v.string(), v.null()),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return null;
        const row = await ctx.db
            .query('appConfig')
            .withIndex('by_user_key', (q) => q.eq('userId', userId).eq('key', args.key))
            .unique();
        return row?.value ?? null;
    },
});

/**
 * User-scoped set — writes a config value for the authenticated user.
 */
export const setForUser = mutation({
    args: { key: v.string(), value: v.string() },
    returns: v.null(),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error('Not authenticated');
        const existing = await ctx.db
            .query('appConfig')
            .withIndex('by_user_key', (q) => q.eq('userId', userId).eq('key', args.key))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, { value: args.value });
        } else {
            await ctx.db.insert('appConfig', { userId, key: args.key, value: args.value });
        }
        return null;
    },
});

/**
 * Global get — for app-wide flags (e.g. init sentinel, no userId).
 */
export const get = query({
    args: { key: v.string() },
    returns: v.union(v.string(), v.null()),
    handler: async (ctx, args) => {
        const row = await ctx.db
            .query('appConfig')
            .withIndex('by_key', (q) => q.eq('key', args.key))
            .unique();
        return row?.value ?? null;
    },
});

/**
 * Global set — for app-wide flags only.
 */
export const set = mutation({
    args: { key: v.string(), value: v.string() },
    returns: v.null(),
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query('appConfig')
            .withIndex('by_key', (q) => q.eq('key', args.key))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, { value: args.value });
        } else {
            await ctx.db.insert('appConfig', { key: args.key, value: args.value });
        }
        return null;
    },
});
