'use node';

import { internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import { v } from 'convex/values';
import { embedText } from './openaiEmbeddings';
import { runEpisodeExtractionGraph, runInteractionPolicyGraph, runMentalModelGraph } from './graphs/memberMemoryGraph';
import { observeAction, setMainSpanAttributes } from '../observability/wideEvents';

const MIN_TOTAL_USER_TURNS = 6;
const MIN_NEW_MESSAGES = 4;
type MemberUserEpisodeRow = Doc<'memberUserEpisodes'>;

function buildEpisodeEmbeddingInput(input: { title?: string; body: string }) {
  return [input.title?.trim(), input.body.trim()].filter(Boolean).join('\n\n');
}

export const refreshMemberMemoryPair = internalAction({
  args: {
    userId: v.id('users'),
    memberId: v.id('members'),
    force: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: observeAction('ai.memberMemory.refreshMemberMemoryPair', async (ctx, args): Promise<null> => {
    setMainSpanAttributes({
      'user.id': String(args.userId),
      'member.id': String(args.memberId),
      'memory.force': Boolean(args.force),
    });
    const claim = await ctx.runMutation(internal.memberMemories.claimRefreshStateInternal, args);
    if (!claim.claimed) {
      return null;
    }

    try {
      const evidence = await ctx.runQuery(internal.memberMemories.collectRefreshEvidenceInternal, {
        userId: args.userId,
        memberId: args.memberId,
      });

      const isEligible =
        Boolean(args.force) ||
        (evidence.totalUserTurns >= MIN_TOTAL_USER_TURNS &&
          evidence.newMessageCount >= MIN_NEW_MESSAGES);

      if (!isEligible || evidence.transcript.length === 0) {
        await ctx.runMutation(internal.memberMemories.markRefreshSkippedInternal, {
          userId: args.userId,
          memberId: args.memberId,
          latestMessageAt: evidence.latestMessageAt,
        });
        return null;
      }

      const promptContext = await ctx.runQuery(internal.memberMemories.getPromptContextInternal, {
        userId: args.userId,
        memberId: args.memberId,
      });

      const interactionPolicyBody =
        promptContext.interactionPolicy?.lockedByUser
          ? undefined
          : await runInteractionPolicyGraph({
              memberName: evidence.memberName,
              systemPrompt: evidence.systemPrompt,
              guidanceProfilePrompt: evidence.guidanceProfilePrompt,
              transcript: evidence.transcript,
              feedbackKeys: evidence.feedbackKeys,
              existingBody: evidence.currentInteractionPolicy,
            });

      const mentalModelBody =
        promptContext.mentalModel?.lockedByUser
          ? undefined
          : await runMentalModelGraph({
              memberName: evidence.memberName,
              systemPrompt: evidence.systemPrompt,
              guidanceProfilePrompt: evidence.guidanceProfilePrompt,
              transcript: evidence.transcript,
              feedbackKeys: evidence.feedbackKeys,
              existingBody: evidence.currentMentalModel,
            });

      const extractedEpisodes = await runEpisodeExtractionGraph({
        memberName: evidence.memberName,
        systemPrompt: evidence.systemPrompt,
        guidanceProfilePrompt: evidence.guidanceProfilePrompt,
        transcript: evidence.transcript,
        feedbackKeys: evidence.feedbackKeys,
        existingEpisodes: evidence.activeEpisodes
          .filter((episode: { archivedAt?: number }) => !episode.archivedAt)
          .map((episode: { title?: string; body: string }) => ({ title: episode.title, body: episode.body })),
      });

      const episodes: Array<{
        title?: string;
        body: string;
        embedding: number[];
        lastProcessedMessageAt?: number;
      }> = [];
      for (const episode of extractedEpisodes.slice(0, 3)) {
        episodes.push({
          title: episode.title,
          body: episode.body,
          embedding: await embedText(buildEpisodeEmbeddingInput(episode), { source: 'episode_index' }),
          lastProcessedMessageAt: evidence.latestMessageAt,
        });
      }

      await ctx.runMutation(internal.memberMemories.commitRefreshInternal, {
        userId: args.userId,
        memberId: args.memberId,
        interactionPolicyBody,
        mentalModelBody,
        interactionPolicyLastProcessedMessageAt: evidence.latestMessageAt,
        mentalModelLastProcessedMessageAt: evidence.latestMessageAt,
        episodes,
        latestMessageAt: evidence.latestMessageAt,
      });
    } catch (error) {
      await ctx.runMutation(internal.memberMemories.markRefreshFailedInternal, {
        userId: args.userId,
        memberId: args.memberId,
        error: error instanceof Error ? error.message : 'Unknown refresh failure',
      });
    }
    return null;
  }),
});

export const refreshDuePairs = internalAction({
  args: {},
  returns: v.null(),
  handler: observeAction('ai.memberMemory.refreshDuePairs', async (ctx): Promise<null> => {
    const pairs = await ctx.runQuery(internal.memberMemories.listActiveChamberPairsInternal, {});
    for (const pair of pairs) {
      await ctx.scheduler.runAfter(0, internal.ai.memberMemory.refreshMemberMemoryPair, {
        userId: pair.userId,
        memberId: pair.memberId,
        force: false,
      });
    }
    return null;
  }),
});

export const reindexEpisode = internalAction({
  args: {
    episodeId: v.id('memberUserEpisodes'),
    patch: v.object({
      title: v.optional(v.string()),
      body: v.optional(v.string()),
      lockedByUser: v.optional(v.boolean()),
      userEditedAt: v.optional(v.number()),
      archivedAt: v.optional(v.union(v.number(), v.null())),
    }),
  },
  returns: v.union(v.object({
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
  }), v.null()),
  handler: observeAction('ai.memberMemory.reindexEpisode', async (ctx, args): Promise<MemberUserEpisodeRow | null> => {
    const current = await ctx.runQuery(internal.memberMemories.getEpisodeInternal, {
      episodeId: args.episodeId,
    });
    if (!current) {
      return null;
    }
    const nextTitle = args.patch.title !== undefined ? args.patch.title?.trim() : current.title;
    const nextBody = args.patch.body !== undefined ? args.patch.body.trim() : current.body;
    const embedding = await embedText(buildEpisodeEmbeddingInput({ title: nextTitle, body: nextBody }), { source: 'episode_index' });
    await ctx.runMutation(internal.memberMemories.patchEpisodeInternal, {
      episodeId: args.episodeId,
      title: nextTitle,
      body: nextBody,
      embedding,
      lockedByUser: args.patch.lockedByUser,
      userEditedAt: args.patch.userEditedAt,
      archivedAt: args.patch.archivedAt,
    });
    return (await ctx.runQuery(internal.memberMemories.getEpisodeInternal, {
      episodeId: args.episodeId,
    })) as MemberUserEpisodeRow | null;
  }),
});
