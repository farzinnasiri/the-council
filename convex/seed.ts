/**
 * seed.ts — one-time initialization sentinel.
 * V2 schema starts empty; users create their own members and conversations after signing in.
 * The SEED_KEY simply marks that the app has been initialized at least once.
 */
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const SEED_KEY = 'schema-v2-initialized';

/** Returns true if the schema has been initialized */
export const isInitialized = query({
    args: {},
    returns: v.boolean(),
    handler: async (ctx) => {
        const row = await ctx.db
            .query('appConfig')
            .withIndex('by_key', (q) => q.eq('key', SEED_KEY))
            .unique();
        return row !== null;
    },
});

/**
 * Called once per app session after auth is confirmed.
 * Marks the DB as initialized (idempotent).
 */
export const initializeIfNeeded = mutation({
    args: {},
    returns: v.null(),
    handler: async (ctx) => {
        const existing = await ctx.db
            .query('appConfig')
            .withIndex('by_key', (q) => q.eq('key', SEED_KEY))
            .unique();
        if (existing) return null;
        await ctx.db.insert('appConfig', {
            key: SEED_KEY,
            value: new Date().toISOString(),
        });
        return null;
    },
});
