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

        return { ...user, image };
    },
});

export const update = mutation({
    args: {
        name: v.optional(v.string()),
        image: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error('Not authenticated');

        const { name, image } = args;
        const patch: any = {};
        if (name !== undefined) patch.name = name;
        if (image !== undefined) patch.image = image;

        await ctx.db.patch(userId, patch);
        return await ctx.db.get(userId);
    },
});
