'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { api } from '../_generated/api';
import { createAiProvider } from '../contexts/shared/convexGateway';
import { requireAuthUser, requireOwnedConversation, requireOwnedMember } from '../contexts/shared/auth';
import { observeAction, setMainSpanAttributes } from '../observability/wideEvents';
import { wideEventError } from '../observability/errors';

const GUIDANCE_REFLECTION_USER_TURNS_KEY = 'chamber-guidance-reflection-user-turns';
const DEFAULT_REFLECTION_USER_TURNS = 3;

function sanitizeDirectiveNote(note: string) {
  return note.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function countUserTurns(messages: Array<{ role: string }>) {
  return messages.filter((message) => message.role === 'user').length;
}

export const generateMemberGuidanceProfile = action({
  args: {
    memberId: v.id('members'),
    systemPrompt: v.string(),
    specialties: v.optional(v.array(v.string())),
    force: v.optional(v.boolean()),
    model: v.optional(v.string()),
  },
  returns: v.object({
    guidanceProfilePrompt: v.string(),
    model: v.string(),
  }),
  handler: observeAction('ai.guidance.generateMemberGuidanceProfile', async (ctx, args) => {
    setMainSpanAttributes({
      'member.id': String(args.memberId),
      'guidance.force': Boolean(args.force),
      'member.specialty_count': args.specialties?.length ?? 0,
    });
    await requireAuthUser(ctx);
    const member = await requireOwnedMember(ctx, args.memberId, { includeArchived: true });
    if (member.guidanceProfilePrompt?.trim() && !args.force) {
      return {
        guidanceProfilePrompt: member.guidanceProfilePrompt,
        model: 'existing',
      };
    }

    const provider = createAiProvider();
    const result = await provider.generateMemberGuidanceProfile({
      memberName: member.name,
      systemPrompt: args.systemPrompt,
      specialties: args.specialties,
      existingGuidanceProfilePrompt: member.guidanceProfilePrompt,
      model: args.model,
    });

    await ctx.runMutation(api.members.update, {
      memberId: args.memberId,
      guidanceProfilePrompt: result.guidanceProfilePrompt,
      guidanceProfileGeneratedAt: Date.now(),
    });

    return result;
  }),
});

export const reflectChamberGuidance = action({
  args: {
    conversationId: v.id('conversations'),
    trigger: v.union(v.literal('interval'), v.literal('feedback')),
    messageId: v.optional(v.id('messages')),
    feedbackKeys: v.optional(
      v.array(
        v.union(
          v.literal('like'),
          v.literal('dislike'),
          v.literal('helpful'),
          v.literal('not_helpful'),
          v.literal('shorter'),
          v.literal('longer'),
          v.literal('clearer'),
          v.literal('more_direct'),
          v.literal('softer'),
          v.literal('harder')
        )
      )
    ),
    model: v.optional(v.string()),
  },
  returns: v.object({
    directivesCreated: v.number(),
    model: v.optional(v.string()),
    skippedReason: v.optional(v.string()),
  }),
  handler: observeAction('ai.guidance.reflectChamberGuidance', async (
    ctx,
    args
  ): Promise<{ directivesCreated: number; model?: string; skippedReason?: string }> => {
    setMainSpanAttributes({
      'conversation.id': String(args.conversationId),
      'guidance.trigger': args.trigger,
      'guidance.feedback_key_count': args.feedbackKeys?.length ?? 0,
    });
    await requireAuthUser(ctx);
    const conversation = await requireOwnedConversation(ctx, args.conversationId);
    if (conversation.kind !== 'chamber' || !conversation.chamberMemberId) {
      throw wideEventError('guidance-chamber-conversation-not-found', 'Chamber conversation not found', {
        statusCode: 404,
      });
    }

    const member = await requireOwnedMember(ctx, conversation.chamberMemberId, { includeArchived: true });
    if (!member.guidanceProfilePrompt?.trim()) {
      return { directivesCreated: 0, skippedReason: 'missing-guidance-profile' };
    }

    const [messages, activeDirectives, feedbackRows, latestMemory] = await Promise.all([
      ctx.runQuery(api.messages.listAll, { conversationId: args.conversationId }),
      ctx.runQuery(api.guidance.listConversationGuidanceDirectives, { conversationId: args.conversationId }),
      ctx.runQuery(api.guidance.listMessageFeedback, { conversationId: args.conversationId }),
      ctx.runQuery(api.memoryLogs.getLatestByConversation, {
        conversationId: args.conversationId,
      }),
    ]);
    const cadenceRaw = await ctx.runQuery(api.settings.get, {
      key: GUIDANCE_REFLECTION_USER_TURNS_KEY,
    });
    const cadence = Math.max(
      1,
      Number.parseInt((cadenceRaw ?? '').trim(), 10) || DEFAULT_REFLECTION_USER_TURNS
    );

    const userTurnCount = countUserTurns(messages);
    setMainSpanAttributes({ 'guidance.user_turn_count': userTurnCount });
    if (
      args.trigger === 'interval' &&
      userTurnCount > 0 &&
      userTurnCount % cadence !== 0
    ) {
      setMainSpanAttributes({ 'guidance.skipped_reason': 'interval-not-due' });
      return { directivesCreated: 0, skippedReason: 'interval-not-due' };
    }
    if (
      args.trigger === 'interval' &&
      typeof conversation.guidanceLastReflectedUserTurnCount === 'number' &&
      conversation.guidanceLastReflectedUserTurnCount >= userTurnCount
    ) {
      setMainSpanAttributes({ 'guidance.skipped_reason': 'already-reflected' });
      return { directivesCreated: 0, skippedReason: 'already-reflected' };
    }

    const provider = createAiProvider();
    let result;
    try {
      result = await provider.reflectChamberGuidance({
        memberName: member.name,
        guidanceProfilePrompt: member.guidanceProfilePrompt,
        previousSummary: latestMemory?.memory,
        trigger: args.trigger,
        recentMessages: messages
          .filter((message: any) => message.role === 'user' || message.role === 'member')
          .slice(-12)
          .map((message: any) => ({
            role: message.role === 'user' ? 'user' : 'assistant',
            content: message.content,
          })),
        activeDirectiveNotes: activeDirectives
          .map((directive: any) => directive.note)
          .slice(0, 6),
        feedbackKeys:
          args.feedbackKeys && args.feedbackKeys.length > 0
            ? args.feedbackKeys
            : feedbackRows
                .filter((row: any) => !args.messageId || row.messageId === args.messageId)
                .map((row: any) => row.key),
        model: args.model,
      });
    } catch (error) {
      setMainSpanAttributes({ 'guidance.skipped_reason': 'reflection-failed' });
      return { directivesCreated: 0, skippedReason: 'reflection-failed' };
    }

    const directives = result.directives
      .map((directive) => ({
        note: sanitizeDirectiveNote(directive.note),
        ttlUserTurns: directive.ttlUserTurns,
      }))
      .filter((directive) => directive.note.length > 0);

    const directivesCreated: number = await ctx.runMutation(api.guidance.replaceConversationGuidanceDirectives, {
      conversationId: args.conversationId,
      memberId: conversation.chamberMemberId,
      source: args.trigger === 'feedback' ? 'feedback' : 'background_reflection',
      triggerMessageId: args.messageId,
      createdAfterUserTurn: userTurnCount,
      directives,
    });

    if (args.trigger === 'interval') {
      await ctx.runMutation(api.conversations.setGuidanceLastReflectedUserTurnCount, {
        conversationId: args.conversationId,
        userTurnCount,
      });
    }

    return {
      directivesCreated,
      model: result.model,
      skippedReason: directivesCreated === 0 ? 'no-directives' : undefined,
    };
  }),
});
