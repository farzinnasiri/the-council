import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

/** Get a value from the app config KV store */
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

/** Set a value in the app config KV store */
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
