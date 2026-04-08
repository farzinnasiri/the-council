import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query, internalQuery } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { v } from 'convex/values';

type RunningBriefRow = Doc<'memberRunningBriefs'>;

const runningBriefDoc = v.object({
  _id: v.id('memberRunningBriefs'),
  _creationTime: v.number(),
  userId: v.id('users'),
  memberId: v.id('members'),
  rawBody: v.string(),
  enabled: v.boolean(),
  updatedAt: v.number(),
});

const runningBriefStatusDoc = v.object({
  memberId: v.id('members'),
  enabled: v.boolean(),
  hasContent: v.boolean(),
  available: v.boolean(),
  updatedAt: v.optional(v.number()),
});

const conversationMemberRunningBriefOverrideDoc = v.object({
  _id: v.id('conversationMemberContextOverrides'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  memberId: v.id('members'),
  runningBriefEnabled: v.optional(v.boolean()),
  updatedAt: v.number(),
});

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function assertOwnedMember(ctx: any, userId: Id<'users'>, memberId: Id<'members'>) {
  const member = await ctx.db.get(memberId);
  if (!member || member.userId !== userId || member.deletedAt) {
    throw new Error('Member not found');
  }
  return member;
}

async function assertOwnedConversation(ctx: any, userId: Id<'users'>, conversationId: Id<'conversations'>) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.userId !== userId || conversation.deletedAt) {
    throw new Error('Conversation not found');
  }
  return conversation;
}

async function assertMemberInConversation(
  ctx: any,
  userId: Id<'users'>,
  conversationId: Id<'conversations'>,
  memberId: Id<'members'>
) {
  const conversation = await assertOwnedConversation(ctx, userId, conversationId);
  await assertOwnedMember(ctx, userId, memberId);

  if (conversation.kind === 'chamber') {
    if (conversation.chamberMemberId !== memberId) {
      throw new Error('Member does not match chamber conversation');
    }
    return conversation;
  }

  const participants = await ctx.db
    .query('conversationParticipants')
    .withIndex('by_conversation_status', (q: any) =>
      q.eq('conversationId', conversationId).eq('status', 'active')
    )
    .collect();
  if (!participants.some((row: any) => row.memberId === memberId)) {
    throw new Error('Member is not active in this hall');
  }
  return conversation;
}

async function getRunningBriefRow(ctx: any, userId: Id<'users'>, memberId: Id<'members'>) {
  return await ctx.db
    .query('memberRunningBriefs')
    .withIndex('by_user_member', (q: any) => q.eq('userId', userId).eq('memberId', memberId))
    .unique();
}

function serializeRunningBriefRow(row: RunningBriefRow | null) {
  if (!row) return null;
  return {
    _id: row._id,
    _creationTime: row._creationTime,
    userId: row.userId,
    memberId: row.memberId,
    rawBody: row.rawBody,
    enabled: row.enabled,
    updatedAt: row.updatedAt,
  };
}

async function getOverrideRow(
  ctx: any,
  userId: Id<'users'>,
  conversationId: Id<'conversations'>,
  memberId: Id<'members'>
) {
  return await ctx.db
    .query('conversationMemberContextOverrides')
    .withIndex('by_user_conversation_member', (q: any) =>
      q.eq('userId', userId).eq('conversationId', conversationId).eq('memberId', memberId)
    )
    .unique();
}

function buildRunningBriefStatus(memberId: Id<'members'>, row: RunningBriefRow | null) {
  const hasContent = Boolean(row?.rawBody.trim());
  const enabled = Boolean(row?.enabled);
  return {
    memberId,
    enabled,
    hasContent,
    available: enabled && hasContent,
    updatedAt: row?.updatedAt,
  } as const;
}

export const get = query({
  args: {
    memberId: v.id('members'),
  },
  returns: v.union(runningBriefDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);
    return serializeRunningBriefRow(await getRunningBriefRow(ctx, userId, args.memberId));
  },
});

export const save = mutation({
  args: {
    memberId: v.id('members'),
    rawBody: v.string(),
    enabled: v.boolean(),
  },
  returns: v.union(runningBriefDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);
    const now = Date.now();
    const rawBody = args.rawBody.replace(/\r\n/g, '\n').trim();
    const current = await getRunningBriefRow(ctx, userId, args.memberId);

    if (current) {
      await ctx.db.patch(current._id, {
        rawBody,
        enabled: args.enabled,
        updatedAt: now,
      });
      return serializeRunningBriefRow((await ctx.db.get(current._id)) as RunningBriefRow | null);
    }

    const id = await ctx.db.insert('memberRunningBriefs', {
      userId,
      memberId: args.memberId,
      rawBody,
      enabled: args.enabled,
      updatedAt: now,
    });
    return serializeRunningBriefRow((await ctx.db.get(id)) as RunningBriefRow | null);
  },
});

export const getStatus = query({
  args: {
    memberId: v.id('members'),
  },
  returns: runningBriefStatusDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);
    const brief = await getRunningBriefRow(ctx, userId, args.memberId);
    return buildRunningBriefStatus(args.memberId, brief ?? null);
  },
});

export const listStatusesByMembers = query({
  args: {
    memberIds: v.array(v.id('members')),
  },
  returns: v.array(runningBriefStatusDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const statuses = [];
    for (const memberId of args.memberIds) {
      await assertOwnedMember(ctx, userId, memberId);
      const brief = await getRunningBriefRow(ctx, userId, memberId);
      statuses.push(buildRunningBriefStatus(memberId, brief ?? null));
    }
    return statuses;
  },
});

export const listConversationMemberRunningBriefOverrides = query({
  args: {},
  returns: v.array(conversationMemberRunningBriefOverrideDoc),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query('conversationMemberContextOverrides')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .collect();
  },
});

export const setConversationMemberRunningBriefEnabled = mutation({
  args: {
    conversationId: v.id('conversations'),
    memberId: v.id('members'),
    enabled: v.boolean(),
  },
  returns: v.union(conversationMemberRunningBriefOverrideDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertMemberInConversation(ctx, userId, args.conversationId, args.memberId);
    const [brief, existing] = await Promise.all([
      getRunningBriefRow(ctx, userId, args.memberId),
      getOverrideRow(ctx, userId, args.conversationId, args.memberId),
    ]);

    if (args.enabled) {
      const available = Boolean(brief?.enabled && brief?.rawBody.trim());
      if (!available) {
        throw new Error('Running brief is not available for this member');
      }
      if (existing) {
        await ctx.db.delete(existing._id);
      }
      return null;
    }

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        runningBriefEnabled: false,
        updatedAt: now,
      });
      return (await ctx.db.get(existing._id)) as any;
    }
    const id = await ctx.db.insert('conversationMemberContextOverrides', {
      userId,
      conversationId: args.conversationId,
      memberId: args.memberId,
      runningBriefEnabled: false,
      updatedAt: now,
    });
    return (await ctx.db.get(id)) as any;
  },
});

export const getPromptContextInternal = internalQuery({
  args: {
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    memberId: v.id('members'),
  },
  returns: v.object({
    enabled: v.boolean(),
    rawBody: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const [brief, override] = await Promise.all([
      getRunningBriefRow(ctx, args.userId, args.memberId),
      getOverrideRow(ctx, args.userId, args.conversationId, args.memberId),
    ]);
    const enabled =
      Boolean(brief?.enabled) &&
      Boolean(brief?.rawBody.trim()) &&
      override?.runningBriefEnabled !== false;
    return {
      enabled,
      rawBody: enabled ? brief?.rawBody.trim() : undefined,
    };
  },
});
