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
