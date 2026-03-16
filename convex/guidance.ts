import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const directiveSourceValidator = v.union(
  v.literal('background_reflection'),
  v.literal('feedback'),
  v.literal('system_rule')
);
const feedbackKeyValidator = v.union(
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
);

const directiveDoc = v.object({
  _id: v.id('conversationGuidanceDirectives'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  memberId: v.id('members'),
  source: directiveSourceValidator,
  triggerMessageId: v.optional(v.id('messages')),
  note: v.string(),
  createdAfterUserTurn: v.number(),
  expiresAfterUserTurn: v.number(),
  createdAt: v.number(),
});

const feedbackDoc = v.object({
  _id: v.id('messageFeedback'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  messageId: v.id('messages'),
  memberId: v.id('members'),
  key: feedbackKeyValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function getOwnedConversation(ctx: any, userId: any, conversationId: any) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.userId !== userId || conversation.deletedAt) {
    throw new Error('Conversation not found');
  }
  return conversation;
}

async function getOwnedMessage(ctx: any, userId: any, messageId: any) {
  const message = await ctx.db.get(messageId);
  if (!message || message.userId !== userId || message.deletedAt) {
    throw new Error('Message not found');
  }
  return message;
}

const MUTUAL_EXCLUSION: Record<string, string[]> = {
  like: ['dislike'],
  dislike: ['like'],
  helpful: ['not_helpful'],
  not_helpful: ['helpful'],
  shorter: ['longer'],
  longer: ['shorter'],
  softer: ['harder'],
  harder: ['softer'],
};

const DETERMINISTIC_DIRECTIVE_TTL_TURNS = 3 as const;

function buildFeedbackDirectiveNote(key: string): string | null {
  switch (key) {
    case 'helpful':
      return 'That approach helped. I should stay on this track and keep the same level of specificity and usefulness.';
    case 'not_helpful':
      return "That didn't help. I should change approach immediately, answer the actual ask first, and avoid repeating the same framing.";
    case 'shorter':
      return 'I should answer in 2-4 sentences unless a very short list is clearly better. No padding, no extra framing, and no long anecdotes.';
    case 'longer':
      return 'I should go deeper in the next replies, add more detail, and fully cover the question instead of stopping at the surface.';
    case 'more_direct':
      return 'I should be more direct: lead with the answer, then give one concrete next step. No long setup before the point.';
    default:
      return null;
  }
}

function buildReentryDirectiveNote(input: {
  gapBucket: 'mild' | 'medium' | 'strong' | 'very_strong';
  explicitContinuation: boolean;
}): string {
  let note = '';
  if (input.gapBucket === 'mild') {
    note = 'The thread cooled off a bit. I should keep continuity without treating the old emotional beat as fully live.';
  } else if (input.gapBucket === 'medium') {
    note = 'The user returned after a real gap. I should re-anchor to the present message before leaning on prior momentum.';
  } else {
    note = 'The old momentum is stale. I should respond from the present message first and treat prior context as background.';
  }
  if (input.explicitContinuation) {
    note += ' The user explicitly wants continuity, so I should preserve the thread while keeping the response grounded in the present.';
  }
  return note;
}

async function countUserTurnsForConversation(ctx: any, conversationId: any) {
  const rows = await ctx.db
    .query('messages')
    .withIndex('by_conversation', (q: any) => q.eq('conversationId', conversationId))
    .collect();
  return rows.filter((row: any) => row.role === 'user' && !row.deletedAt && !row.supersededAt).length;
}

export const listConversationGuidanceDirectives = query({
  args: { conversationId: v.id('conversations') },
  returns: v.array(directiveDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);
    return await ctx.db
      .query('conversationGuidanceDirectives')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .collect();
  },
});

export const listActiveConversationGuidanceDirectives = query({
  args: {
    conversationId: v.id('conversations'),
    userTurnCount: v.number(),
  },
  returns: v.array(directiveDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);
    return await ctx.db
      .query('conversationGuidanceDirectives')
      .withIndex('by_conversation_expiry', (q) =>
        q.eq('conversationId', args.conversationId).gte('expiresAfterUserTurn', args.userTurnCount)
      )
      .collect();
  },
});

export const listMessageFeedback = query({
  args: { conversationId: v.id('conversations') },
  returns: v.array(feedbackDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);
    return await ctx.db
      .query('messageFeedback')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect();
  },
});

export const setMessageFeedback = mutation({
  args: {
    messageId: v.id('messages'),
    key: feedbackKeyValidator,
    active: v.boolean(),
  },
  returns: v.array(feedbackDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const message = await getOwnedMessage(ctx, userId, args.messageId);
    if (message.role !== 'member' || !message.authorMemberId) {
      throw new Error('Feedback only applies to member messages');
    }
    await getOwnedConversation(ctx, userId, message.conversationId);
    const existing = await ctx.db
      .query('messageFeedback')
      .withIndex('by_conversation', (q) => q.eq('conversationId', message.conversationId))
      .collect();
    const current = existing.find((row: any) => row.messageId === args.messageId && row.key === args.key);
    const now = Date.now();

    if (args.active) {
      for (const exclusiveKey of MUTUAL_EXCLUSION[args.key] ?? []) {
        const match = existing.find((row: any) => row.messageId === args.messageId && row.key === exclusiveKey);
        if (match) {
          await ctx.db.delete(match._id);
        }
      }
      if (!current) {
        await ctx.db.insert('messageFeedback', {
          userId,
          conversationId: message.conversationId,
          messageId: args.messageId,
          memberId: message.authorMemberId,
          key: args.key,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(current._id, { updatedAt: now });
      }
    } else if (current) {
      await ctx.db.delete(current._id);
    }

    return await ctx.db
      .query('messageFeedback')
      .withIndex('by_conversation', (q) => q.eq('conversationId', message.conversationId))
      .collect();
  },
});

export const replaceConversationGuidanceDirectives = mutation({
  args: {
    conversationId: v.id('conversations'),
    memberId: v.id('members'),
    source: directiveSourceValidator,
    triggerMessageId: v.optional(v.id('messages')),
    createdAfterUserTurn: v.number(),
    directives: v.array(
      v.object({
        note: v.string(),
        ttlUserTurns: v.union(v.literal(1), v.literal(2), v.literal(3)),
      })
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);
    const now = Date.now();
    for (const directive of args.directives.slice(0, 3)) {
      await ctx.db.insert('conversationGuidanceDirectives', {
        userId,
        conversationId: args.conversationId,
        memberId: args.memberId,
        source: args.source,
        triggerMessageId: args.triggerMessageId,
        note: directive.note.trim(),
        createdAfterUserTurn: args.createdAfterUserTurn,
        expiresAfterUserTurn: args.createdAfterUserTurn + directive.ttlUserTurns,
        createdAt: now,
      });
    }
    return Math.min(args.directives.length, 3);
  },
});

export const syncFeedbackGuidanceDirectives = mutation({
  args: {
    messageId: v.id('messages'),
  },
  returns: v.object({
    directivesCreated: v.number(),
    activeKeys: v.array(feedbackKeyValidator),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const message = await getOwnedMessage(ctx, userId, args.messageId);
    if (message.role !== 'member' || !message.authorMemberId) {
      throw new Error('Feedback guidance only applies to member messages');
    }
    await getOwnedConversation(ctx, userId, message.conversationId);

    const feedbackRows = await ctx.db
      .query('messageFeedback')
      .withIndex('by_conversation', (q) => q.eq('conversationId', message.conversationId))
      .collect();
    const activeKeys = feedbackRows
      .filter((row: any) => row.messageId === args.messageId)
      .map((row: any) => row.key);

    const existingDirectives = await ctx.db
      .query('conversationGuidanceDirectives')
      .withIndex('by_conversation', (q) => q.eq('conversationId', message.conversationId))
      .collect();
    await Promise.all(
      existingDirectives
        .filter((row: any) => row.source === 'feedback' && row.triggerMessageId === args.messageId)
        .map((row: any) => ctx.db.delete(row._id))
    );

    const notes = activeKeys
      .map((key) => buildFeedbackDirectiveNote(key))
      .filter((note): note is string => Boolean(note));

    if (notes.length === 0) {
      return { directivesCreated: 0, activeKeys };
    }

    const userTurnCount = await countUserTurnsForConversation(ctx, message.conversationId);
    const now = Date.now();
    for (const note of notes.slice(0, 3)) {
      await ctx.db.insert('conversationGuidanceDirectives', {
        userId,
        conversationId: message.conversationId,
        memberId: message.authorMemberId,
        source: 'feedback',
        triggerMessageId: args.messageId,
        note,
        createdAfterUserTurn: userTurnCount,
        expiresAfterUserTurn: userTurnCount + DETERMINISTIC_DIRECTIVE_TTL_TURNS,
        createdAt: now,
      });
    }

    return {
      directivesCreated: Math.min(notes.length, 3),
      activeKeys,
    };
  },
});

export const upsertTimeAwareReentryGuidance = mutation({
  args: {
    conversationId: v.id('conversations'),
    gapBucket: v.union(
      v.literal('mild'),
      v.literal('medium'),
      v.literal('strong'),
      v.literal('very_strong')
    ),
    explicitContinuation: v.boolean(),
  },
  returns: v.object({
    directivesCreated: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'chamber' || !conversation.chamberMemberId) {
      throw new Error('Conversation not found');
    }

    const existingDirectives = await ctx.db
      .query('conversationGuidanceDirectives')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect();
    await Promise.all(
      existingDirectives
        .filter((row: any) => row.source === 'system_rule')
        .map((row: any) => ctx.db.delete(row._id))
    );

    const userTurnCount = await countUserTurnsForConversation(ctx, args.conversationId);
    await ctx.db.insert('conversationGuidanceDirectives', {
      userId,
      conversationId: args.conversationId,
      memberId: conversation.chamberMemberId,
      source: 'system_rule',
      note: buildReentryDirectiveNote({
        gapBucket: args.gapBucket,
        explicitContinuation: args.explicitContinuation,
      }),
      createdAfterUserTurn: userTurnCount,
      expiresAfterUserTurn: userTurnCount + DETERMINISTIC_DIRECTIVE_TTL_TURNS,
      createdAt: Date.now(),
    });

    return { directivesCreated: 1 };
  },
});
