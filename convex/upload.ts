import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation } from './_generated/server';

/**
 * Returns a short-lived upload URL for Convex File Storage.
 * The client POSTs the file to this URL, then reads { storageId } from the response.
 */
export const generateUploadUrl = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error('Not authenticated');
        return await ctx.storage.generateUploadUrl();
    },
});
