import { mutation } from './_generated/server';

export const removeEmojiField = mutation({
    args: {},
    handler: async (ctx) => {
        const members = await ctx.db.query('members').collect();
        let count = 0;
        for (const member of members) {
            if ((member as any).emoji !== undefined) {
                // We use patch with undefined to remove a field if it's optional in schema,
                // but here it's removed from schema entirely, so we might need a more direct way
                // or just accept that Convex will stop returning it if we filter it out in queries.
                // Actually, in Convex, simply updating the doc without the field (if schema allows) 
                // OR using ctx.db.replace is the way.
                const { emoji, ...rest } = member as any;
                await ctx.db.replace(member._id, rest);
                count++;
            }
        }
        return `Cleaned up ${count} members`;
    },
});

export const backfillConversationLastMessageAt = mutation({
    args: {},
    handler: async (ctx) => {
        const conversations = await ctx.db.query('conversations').collect();
        let patched = 0;

        for (const conversation of conversations) {
            const rows = await ctx.db
                .query('messages')
                .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
                .order('desc')
                .collect();
            const latest = rows.find((row) => !row.deletedAt);
            const nextLastMessageAt = latest?._creationTime;
            const currentLastMessageAt = (conversation as any).lastMessageAt as number | undefined;

            if (nextLastMessageAt !== currentLastMessageAt) {
                await ctx.db.patch(conversation._id, { lastMessageAt: nextLastMessageAt });
                patched += 1;
            }
        }

        return `Updated ${patched} conversations`;
    },
});
