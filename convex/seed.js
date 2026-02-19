/**
 * seed.ts
 *
 * The V2 schema starts empty — no default members, conversations, or messages.
 * Users create their own council members from scratch.
 *
 * This module only provides a lightweight "seeded" flag check so we can run
 * any one-time initialization logic in the future without duplicating it.
 */
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
const SEED_KEY = 'schema-v2-initialized';
/** Returns true if the V2 schema has been initialized */
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
 * Called from the frontend once on first load.
 * In V2 there is nothing to seed — just marks the DB as initialized.
 */
export const initializeIfNeeded = mutation({
    args: {},
    returns: v.null(),
    handler: async (ctx) => {
        const existing = await ctx.db
            .query('appConfig')
            .withIndex('by_key', (q) => q.eq('key', SEED_KEY))
            .unique();
        if (existing)
            return null;
        await ctx.db.insert('appConfig', {
            key: SEED_KEY,
            value: new Date().toISOString(),
        });
        return null;
    },
});
