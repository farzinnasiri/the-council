import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

export const viewer = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return null;
        const user = await ctx.db.get(userId);
        if (!user) return null;
        const legacyProfile = !user.profileNote
          ? await ctx.db
              .query('personalArchiveProfiles')
              .withIndex('by_user', (q) => q.eq('userId', userId))
              .unique()
          : null;

        // If image is a storage ID, resolve it to a URL
        let image = user.image;
        if (image && !image.startsWith('http')) {
            try {
                const url = await ctx.storage.getUrl(image as any);
                if (url) image = url;
            } catch {
                // Not a storage ID or failed to resolve
            }
        }

        return {
          ...user,
          image,
          profileNote: user.profileNote ?? legacyProfile?.identity,
        };
    },
});

export const update = mutation({
    args: {
        name: v.optional(v.string()),
        image: v.optional(v.string()),
        profileNote: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error('Not authenticated');

        const { name, image, profileNote } = args;
        const patch: any = {};
        if (name !== undefined) patch.name = name;
        if (image !== undefined) patch.image = image;
        if (profileNote !== undefined) patch.profileNote = profileNote;

        await ctx.db.patch(userId, patch);
        return await ctx.db.get(userId);
    },
});

export const migrateLegacyProfileNote = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error('Not authenticated');

        const user = await ctx.db.get(userId);
        if (!user) throw new Error('User not found');
        if (user.profileNote?.trim()) {
          return user;
        }

        const legacyProfile = await ctx.db
          .query('personalArchiveProfiles')
          .withIndex('by_user', (q) => q.eq('userId', userId))
          .unique();
        if (!legacyProfile?.identity?.trim()) {
          return user;
        }

        await ctx.db.patch(userId, { profileNote: legacyProfile.identity.trim() });
        return await ctx.db.get(userId);
    },
});
