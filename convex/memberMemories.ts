import { getAuthUserId } from '@convex-dev/auth/server';
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { v } from 'convex/values';

type MemberUserEpisodeRow = Doc<'memberUserEpisodes'>;
type EpisodeReindexPatch = {
  title?: string;
  body?: string;
  lockedByUser?: boolean;
  userEditedAt?: number;
  archivedAt?: number | null;
};

const SINGLETON_DOC = v.object({
  _id: v.union(v.id('memberUserInteractionPolicies'), v.id('memberUserMentalModels')),
  _creationTime: v.number(),
  userId: v.id('users'),
  memberId: v.id('members'),
  body: v.string(),
  lockedByUser: v.boolean(),
  generatedAt: v.number(),
  updatedAt: v.number(),
  userEditedAt: v.optional(v.number()),
  lastProcessedMessageAt: v.optional(v.number()),
});

const episodeDoc = v.object({
  _id: v.id('memberUserEpisodes'),
  _creationTime: v.number(),
  userId: v.id('users'),
  memberId: v.id('members'),
  title: v.optional(v.string()),
  body: v.string(),
  embedding: v.array(v.float64()),
  lockedByUser: v.boolean(),
  archivedAt: v.optional(v.number()),
  generatedAt: v.number(),
  updatedAt: v.number(),
  userEditedAt: v.optional(v.number()),
  lastProcessedMessageAt: v.optional(v.number()),
});

const refreshStateDoc = v.object({
  _id: v.id('memberMemoryRefreshStates'),
  _creationTime: v.number(),
  userId: v.id('users'),
  memberId: v.id('members'),
  processing: v.boolean(),
  processingStartedAt: v.optional(v.number()),
  nextEligibleAt: v.number(),
  lastRunAt: v.optional(v.number()),
  lastSuccessAt: v.optional(v.number()),
  lastFailureAt: v.optional(v.number()),
  retryCount: v.number(),
  lastProcessedMessageAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
  updatedAt: v.number(),
});

const refreshQueueResult = v.object({
  scheduled: v.boolean(),
});

const episodeUpdateInput = v.object({
  episodeId: v.id('memberUserEpisodes'),
  title: v.optional(v.string()),
  body: v.optional(v.string()),
  archivedAt: v.optional(v.union(v.number(), v.null())),
});

const pairInput = v.object({
  userId: v.id('users'),
  memberId: v.id('members'),
});

const generatedEpisodeInput = v.object({
  title: v.optional(v.string()),
  body: v.string(),
  embedding: v.array(v.float64()),
  lastProcessedMessageAt: v.optional(v.number()),
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

async function getInteractionPolicyRow(ctx: any, userId: Id<'users'>, memberId: Id<'members'>) {
  return await ctx.db
    .query('memberUserInteractionPolicies')
    .withIndex('by_user_member', (q: any) => q.eq('userId', userId).eq('memberId', memberId))
    .unique();
}

async function getMentalModelRow(ctx: any, userId: Id<'users'>, memberId: Id<'members'>) {
  return await ctx.db
    .query('memberUserMentalModels')
    .withIndex('by_user_member', (q: any) => q.eq('userId', userId).eq('memberId', memberId))
    .unique();
}

async function getRefreshStateRow(ctx: any, userId: Id<'users'>, memberId: Id<'members'>) {
  return await ctx.db
    .query('memberMemoryRefreshStates')
    .withIndex('by_user_member', (q: any) => q.eq('userId', userId).eq('memberId', memberId))
    .unique();
}

export const getBundle = query({
  args: {
    memberId: v.id('members'),
  },
  returns: v.object({
    interactionPolicy: v.union(SINGLETON_DOC, v.null()),
    mentalModel: v.union(SINGLETON_DOC, v.null()),
    episodes: v.array(episodeDoc),
    refreshState: v.union(refreshStateDoc, v.null()),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);
    const [interactionPolicy, mentalModel, refreshState, episodes] = await Promise.all([
      getInteractionPolicyRow(ctx, userId, args.memberId),
      getMentalModelRow(ctx, userId, args.memberId),
      getRefreshStateRow(ctx, userId, args.memberId),
      ctx.db
        .query('memberUserEpisodes')
        .withIndex('by_user_member_updated', (q: any) => q.eq('userId', userId).eq('memberId', args.memberId))
        .order('desc')
        .collect(),
    ]);

    return {
      interactionPolicy: interactionPolicy ?? null,
      mentalModel: mentalModel ?? null,
      episodes,
      refreshState: refreshState ?? null,
    };
  },
});

export const saveInteractionPolicy = mutation({
  args: {
    memberId: v.id('members'),
    body: v.string(),
  },
  returns: v.union(SINGLETON_DOC, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);
    const current = await getInteractionPolicyRow(ctx, userId, args.memberId);
    const now = Date.now();
    if (current) {
      await ctx.db.patch(current._id, {
        body: args.body.trim(),
        lockedByUser: true,
        userEditedAt: now,
        updatedAt: now,
      });
      return (await ctx.db.get(current._id)) as any;
    }
    const id = await ctx.db.insert('memberUserInteractionPolicies', {
      userId,
      memberId: args.memberId,
      body: args.body.trim(),
      lockedByUser: true,
      generatedAt: now,
      updatedAt: now,
      userEditedAt: now,
    });
    return (await ctx.db.get(id)) as any;
  },
});

export const saveMentalModel = mutation({
  args: {
    memberId: v.id('members'),
    body: v.string(),
  },
  returns: v.union(SINGLETON_DOC, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);
    const current = await getMentalModelRow(ctx, userId, args.memberId);
    const now = Date.now();
    if (current) {
      await ctx.db.patch(current._id, {
        body: args.body.trim(),
        lockedByUser: true,
        userEditedAt: now,
        updatedAt: now,
      });
      return (await ctx.db.get(current._id)) as any;
    }
    const id = await ctx.db.insert('memberUserMentalModels', {
      userId,
      memberId: args.memberId,
      body: args.body.trim(),
      lockedByUser: true,
      generatedAt: now,
      updatedAt: now,
      userEditedAt: now,
    });
    return (await ctx.db.get(id)) as any;
  },
});

export const unlockSingleton = mutation({
  args: {
    memberId: v.id('members'),
    kind: v.union(v.literal('interaction_policy'), v.literal('mental_model')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);
    const row = args.kind === 'interaction_policy'
      ? await getInteractionPolicyRow(ctx, userId, args.memberId)
      : await getMentalModelRow(ctx, userId, args.memberId);
    if (row) {
      await ctx.db.patch(row._id, {
        lockedByUser: false,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const queueRefresh = mutation({
  args: {
    memberId: v.id('members'),
    force: v.optional(v.boolean()),
  },
  returns: refreshQueueResult,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await assertOwnedMember(ctx, userId, args.memberId);
    const now = Date.now();
    const current = await getRefreshStateRow(ctx, userId, args.memberId);
    if (current) {
      await ctx.db.patch(current._id, {
        nextEligibleAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('memberMemoryRefreshStates', {
        userId,
        memberId: args.memberId,
        processing: false,
        nextEligibleAt: now,
        retryCount: 0,
        updatedAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.ai.memberMemory.refreshMemberMemoryPair, {
      userId,
      memberId: args.memberId,
      force: Boolean(args.force),
    });
    return { scheduled: true };
  },
});

export const updateEpisode = action({
  args: episodeUpdateInput,
  returns: v.union(episodeDoc, v.null()),
  handler: async (ctx, args): Promise<MemberUserEpisodeRow | null> => {
    const userId = await requireUser(ctx);
    const current = await ctx.runQuery(internal.memberMemories.getEpisodeInternal, {
      episodeId: args.episodeId,
    });
    if (!current || current.userId !== userId) {
      throw new Error('Episode not found');
    }

    const nextTitle = args.title !== undefined ? args.title?.trim() : current.title;
    const nextBody = args.body !== undefined ? args.body.trim() : current.body;
    const patch: EpisodeReindexPatch = {
      title: nextTitle,
      body: nextBody,
      lockedByUser: true,
      userEditedAt: Date.now(),
    };
    if (args.archivedAt !== undefined) {
      patch.archivedAt = args.archivedAt;
    }

    const reindexed: MemberUserEpisodeRow | null = await ctx.runAction(internal.ai.memberMemory.reindexEpisode, {
      episodeId: args.episodeId,
      patch,
    });
    return reindexed;
  },
});

export const getPromptContextInternal = internalQuery({
  args: pairInput,
  returns: v.object({
    interactionPolicy: v.union(v.object({
      body: v.string(),
      lockedByUser: v.boolean(),
      updatedAt: v.number(),
    }), v.null()),
    mentalModel: v.union(v.object({
      body: v.string(),
      lockedByUser: v.boolean(),
      updatedAt: v.number(),
    }), v.null()),
    refreshState: v.union(refreshStateDoc, v.null()),
  }),
  handler: async (ctx, args) => {
    const [interactionPolicy, mentalModel, refreshState] = await Promise.all([
      getInteractionPolicyRow(ctx, args.userId, args.memberId),
      getMentalModelRow(ctx, args.userId, args.memberId),
      getRefreshStateRow(ctx, args.userId, args.memberId),
    ]);
    return {
      interactionPolicy: interactionPolicy
        ? { body: interactionPolicy.body, lockedByUser: interactionPolicy.lockedByUser, updatedAt: interactionPolicy.updatedAt }
        : null,
      mentalModel: mentalModel
        ? { body: mentalModel.body, lockedByUser: mentalModel.lockedByUser, updatedAt: mentalModel.updatedAt }
        : null,
      refreshState: refreshState ?? null,
    };
  },
});

export const getEpisodeInternal = internalQuery({
  args: { episodeId: v.id('memberUserEpisodes') },
  returns: v.union(episodeDoc, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.episodeId);
    return row ?? null;
  },
});

export const patchEpisodeInternal = internalMutation({
  args: {
    episodeId: v.id('memberUserEpisodes'),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    embedding: v.array(v.float64()),
    lockedByUser: v.optional(v.boolean()),
    userEditedAt: v.optional(v.number()),
    archivedAt: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.episodeId);
    if (!row) return null;
    await ctx.db.patch(args.episodeId, {
      title: args.title,
      body: args.body ?? row.body,
      embedding: args.embedding,
      lockedByUser: args.lockedByUser ?? row.lockedByUser,
      userEditedAt: args.userEditedAt ?? row.userEditedAt,
      archivedAt: args.archivedAt === null ? undefined : args.archivedAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const listRelevantEpisodesInternal = internalQuery({
  args: {
    userId: v.id('users'),
    memberId: v.id('members'),
    episodeIds: v.array(v.id('memberUserEpisodes')),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    _id: v.id('memberUserEpisodes'),
    title: v.optional(v.string()),
    body: v.string(),
    lockedByUser: v.boolean(),
    updatedAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 2, 4));
    const out: Array<{ _id: Id<'memberUserEpisodes'>; title?: string; body: string; lockedByUser: boolean; updatedAt: number }> = [];
    for (const episodeId of args.episodeIds) {
      if (out.length >= limit) break;
      const row = await ctx.db.get(episodeId);
      if (!row || row.userId !== args.userId || row.memberId !== args.memberId || row.archivedAt) continue;
      out.push({
        _id: row._id,
        title: row.title,
        body: row.body,
        lockedByUser: row.lockedByUser,
        updatedAt: row.updatedAt,
      });
    }
    return out;
  },
});

export const listActiveChamberPairsInternal = internalQuery({
  args: {},
  returns: v.array(pairInput),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_kind_updated', (q: any) => q.eq('kind', 'chamber'))
      .order('desc')
      .collect();

    const seen = new Set<string>();
    const pairs: Array<{ userId: Id<'users'>; memberId: Id<'members'> }> = [];
    for (const row of rows) {
      if (row.deletedAt || !row.chamberMemberId) continue;
      const key = `${row.userId}:${row.chamberMemberId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        userId: row.userId,
        memberId: row.chamberMemberId,
      });
    }
    return pairs;
  },
});

export const collectRefreshEvidenceInternal = internalQuery({
  args: {
    userId: v.id('users'),
    memberId: v.id('members'),
  },
  returns: v.object({
    memberName: v.string(),
    systemPrompt: v.string(),
    guidanceProfilePrompt: v.optional(v.string()),
    totalUserTurns: v.number(),
    newMessageCount: v.number(),
    latestMessageAt: v.optional(v.number()),
    transcript: v.array(v.object({
      conversationId: v.id('conversations'),
      createdAt: v.number(),
      role: v.union(v.literal('user'), v.literal('assistant')),
      content: v.string(),
      revisionKind: v.optional(v.union(
        v.literal('think_harder'),
        v.literal('brainstorm'),
        v.literal('deep_dive'),
        v.literal('shorter'),
        v.literal('elaborate'),
      )),
      generationProfile: v.optional(v.union(
        v.literal('instant'),
        v.literal('short'),
        v.literal('think'),
        v.literal('brainstorm'),
        v.literal('deep_dive'),
      )),
    })),
    feedbackKeys: v.array(v.string()),
    currentInteractionPolicy: v.optional(v.string()),
    currentMentalModel: v.optional(v.string()),
    activeEpisodes: v.array(v.object({
      _id: v.id('memberUserEpisodes'),
      title: v.optional(v.string()),
      body: v.string(),
      lockedByUser: v.boolean(),
      archivedAt: v.optional(v.number()),
      updatedAt: v.number(),
    })),
    refreshState: v.union(refreshStateDoc, v.null()),
  }),
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member || member.userId !== args.userId || member.deletedAt) {
      throw new Error('Member not found');
    }
    const refreshState = await getRefreshStateRow(ctx, args.userId, args.memberId);
    const conversations = await ctx.db
      .query('conversations')
      .withIndex('by_user_kind_member_updated', (q: any) =>
        q.eq('userId', args.userId).eq('kind', 'chamber').eq('chamberMemberId', args.memberId)
      )
      .order('desc')
      .collect();

    const transcript: Array<{
      conversationId: Id<'conversations'>;
      createdAt: number;
      role: 'user' | 'assistant';
      content: string;
      revisionKind?: 'think_harder' | 'brainstorm' | 'deep_dive' | 'shorter' | 'elaborate';
      generationProfile?: 'instant' | 'short' | 'think' | 'brainstorm' | 'deep_dive';
    }> = [];
    const feedbackKeys: string[] = [];
    let totalUserTurns = 0;
    let newMessageCount = 0;
    let latestMessageAt: number | undefined;

    for (const conversation of conversations) {
      if (conversation.deletedAt) continue;
      const [messages, feedbackRows] = await Promise.all([
        ctx.db
          .query('messages')
          .withIndex('by_conversation', (q: any) => q.eq('conversationId', conversation._id))
          .order('asc')
          .collect(),
        ctx.db
          .query('messageFeedback')
          .withIndex('by_conversation', (q: any) => q.eq('conversationId', conversation._id))
          .collect(),
      ]);

      for (const row of messages) {
        if (row.deletedAt || row.supersededAt || row.role === 'system') continue;
        latestMessageAt = Math.max(latestMessageAt ?? 0, row._creationTime);
        if (
          typeof refreshState?.lastProcessedMessageAt === 'number' &&
          row._creationTime > refreshState.lastProcessedMessageAt
        ) {
          newMessageCount += 1;
        } else if (refreshState?.lastProcessedMessageAt === undefined) {
          newMessageCount += 1;
        }
        if (row.role === 'user') {
          totalUserTurns += 1;
        }
        transcript.push({
          conversationId: conversation._id,
          createdAt: row._creationTime,
          role: row.role === 'user' ? 'user' : 'assistant',
          content: row.content,
          revisionKind: row.revisionKind,
          generationProfile: row.generationProfile,
        });
      }

      for (const feedbackRow of feedbackRows) {
        if (feedbackRow.memberId !== args.memberId) continue;
        feedbackKeys.push(feedbackRow.key);
      }
    }

    const [interactionPolicy, mentalModel, activeEpisodes] = await Promise.all([
      getInteractionPolicyRow(ctx, args.userId, args.memberId),
      getMentalModelRow(ctx, args.userId, args.memberId),
      ctx.db
        .query('memberUserEpisodes')
        .withIndex('by_user_member_updated', (q: any) =>
          q.eq('userId', args.userId).eq('memberId', args.memberId)
        )
        .order('desc')
        .collect(),
    ]);

    return {
      memberName: member.name,
      systemPrompt: member.systemPrompt,
      guidanceProfilePrompt: member.guidanceProfilePrompt,
      totalUserTurns,
      newMessageCount,
      latestMessageAt,
      transcript,
      feedbackKeys,
      currentInteractionPolicy: interactionPolicy?.body,
      currentMentalModel: mentalModel?.body,
      activeEpisodes: activeEpisodes.map((row: any) => ({
        _id: row._id,
        title: row.title,
        body: row.body,
        lockedByUser: row.lockedByUser,
        archivedAt: row.archivedAt,
        updatedAt: row.updatedAt,
      })),
      refreshState: refreshState ?? null,
    };
  },
});

export const claimRefreshStateInternal = internalMutation({
  args: {
    userId: v.id('users'),
    memberId: v.id('members'),
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    claimed: v.boolean(),
    refreshState: v.union(refreshStateDoc, v.null()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const current = await getRefreshStateRow(ctx, args.userId, args.memberId);
    if (!current) {
      const id = await ctx.db.insert('memberMemoryRefreshStates', {
        userId: args.userId,
        memberId: args.memberId,
        processing: true,
        processingStartedAt: now,
        nextEligibleAt: now,
        lastRunAt: now,
        retryCount: 0,
        updatedAt: now,
      });
      return {
        claimed: true,
        refreshState: (await ctx.db.get(id)) as any,
      };
    }

    if (current.processing && !args.force) {
      return { claimed: false, refreshState: current as any };
    }
    if (!args.force && current.nextEligibleAt > now) {
      return { claimed: false, refreshState: current as any };
    }

    await ctx.db.patch(current._id, {
      processing: true,
      processingStartedAt: now,
      lastRunAt: now,
      updatedAt: now,
      lastError: undefined,
    });
    return {
      claimed: true,
      refreshState: (await ctx.db.get(current._id)) as any,
    };
  },
});

export const commitRefreshInternal = internalMutation({
  args: {
    userId: v.id('users'),
    memberId: v.id('members'),
    interactionPolicyBody: v.optional(v.string()),
    mentalModelBody: v.optional(v.string()),
    interactionPolicyLastProcessedMessageAt: v.optional(v.number()),
    mentalModelLastProcessedMessageAt: v.optional(v.number()),
    episodes: v.optional(v.array(generatedEpisodeInput)),
    latestMessageAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const [interactionPolicyRow, mentalModelRow, refreshState] = await Promise.all([
      getInteractionPolicyRow(ctx, args.userId, args.memberId),
      getMentalModelRow(ctx, args.userId, args.memberId),
      getRefreshStateRow(ctx, args.userId, args.memberId),
    ]);

    if (typeof args.interactionPolicyBody === 'string' && !interactionPolicyRow?.lockedByUser) {
      if (interactionPolicyRow) {
        await ctx.db.patch(interactionPolicyRow._id, {
          body: args.interactionPolicyBody.trim(),
          generatedAt: now,
          updatedAt: now,
          lastProcessedMessageAt: args.interactionPolicyLastProcessedMessageAt,
        });
      } else {
        await ctx.db.insert('memberUserInteractionPolicies', {
          userId: args.userId,
          memberId: args.memberId,
          body: args.interactionPolicyBody.trim(),
          lockedByUser: false,
          generatedAt: now,
          updatedAt: now,
          lastProcessedMessageAt: args.interactionPolicyLastProcessedMessageAt,
        });
      }
    }

    if (typeof args.mentalModelBody === 'string' && !mentalModelRow?.lockedByUser) {
      if (mentalModelRow) {
        await ctx.db.patch(mentalModelRow._id, {
          body: args.mentalModelBody.trim(),
          generatedAt: now,
          updatedAt: now,
          lastProcessedMessageAt: args.mentalModelLastProcessedMessageAt,
        });
      } else {
        await ctx.db.insert('memberUserMentalModels', {
          userId: args.userId,
          memberId: args.memberId,
          body: args.mentalModelBody.trim(),
          lockedByUser: false,
          generatedAt: now,
          updatedAt: now,
          lastProcessedMessageAt: args.mentalModelLastProcessedMessageAt,
        });
      }
    }

    if (args.episodes?.length) {
      const existing = await ctx.db
        .query('memberUserEpisodes')
        .withIndex('by_user_member_updated', (q: any) =>
          q.eq('userId', args.userId).eq('memberId', args.memberId)
        )
        .order('desc')
        .collect();
      const active = existing.filter((row: any) => !row.archivedAt);
      const duplicateKeys = new Set(active.map((row: any) => `${(row.title ?? '').trim().toLowerCase()}::${row.body.trim().toLowerCase()}`));

      let activeCount = active.length;
      for (const episode of args.episodes.slice(0, 3)) {
        const key = `${(episode.title ?? '').trim().toLowerCase()}::${episode.body.trim().toLowerCase()}`;
        if (!episode.body.trim() || duplicateKeys.has(key)) continue;
        if (activeCount >= 12) {
          const archivable = active
            .filter((row: any) => !row.lockedByUser)
            .sort((a: any, b: any) => a.updatedAt - b.updatedAt)[0];
          if (!archivable) break;
          await ctx.db.patch(archivable._id, {
            archivedAt: now,
            updatedAt: now,
          });
          activeCount -= 1;
        }
        await ctx.db.insert('memberUserEpisodes', {
          userId: args.userId,
          memberId: args.memberId,
          title: episode.title?.trim() || undefined,
          body: episode.body.trim(),
          embedding: episode.embedding,
          lockedByUser: false,
          generatedAt: now,
          updatedAt: now,
          lastProcessedMessageAt: episode.lastProcessedMessageAt,
        });
        duplicateKeys.add(key);
        activeCount += 1;
      }
    }

    if (refreshState) {
      await ctx.db.patch(refreshState._id, {
        processing: false,
        processingStartedAt: undefined,
        nextEligibleAt: now + 6 * 60 * 60 * 1000,
        lastSuccessAt: now,
        retryCount: 0,
        lastProcessedMessageAt: args.latestMessageAt,
        lastError: undefined,
        updatedAt: now,
      });
    }

    return null;
  },
});

export const markRefreshSkippedInternal = internalMutation({
  args: {
    userId: v.id('users'),
    memberId: v.id('members'),
    latestMessageAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await getRefreshStateRow(ctx, args.userId, args.memberId);
    if (!row) return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      processing: false,
      processingStartedAt: undefined,
      nextEligibleAt: now + 6 * 60 * 60 * 1000,
      lastSuccessAt: row.lastSuccessAt,
      lastProcessedMessageAt: args.latestMessageAt ?? row.lastProcessedMessageAt,
      updatedAt: now,
    });
    return null;
  },
});

export const markRefreshFailedInternal = internalMutation({
  args: {
    userId: v.id('users'),
    memberId: v.id('members'),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await getRefreshStateRow(ctx, args.userId, args.memberId);
    if (!row) return null;
    const now = Date.now();
    const nextRetryCount = (row.retryCount ?? 0) + 1;
    await ctx.db.patch(row._id, {
      processing: false,
      processingStartedAt: undefined,
      retryCount: nextRetryCount,
      lastFailureAt: now,
      lastError: args.error.slice(0, 500),
      nextEligibleAt: now + Math.min(nextRetryCount, 4) * 30 * 60 * 1000,
      updatedAt: now,
    });
    return null;
  },
});
