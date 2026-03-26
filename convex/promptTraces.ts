import { getAuthUserId } from '@convex-dev/auth/server';
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { promptTraceDraftValidator, promptTraceRecordValidator } from './promptTraceValidators';

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function requireOwnedConversation(ctx: any, userId: Id<'users'>, conversationId: Id<'conversations'>) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.userId !== userId || conversation.deletedAt) {
    throw new Error('Conversation not found');
  }
  return conversation;
}

async function requireOwnedMessage(ctx: any, userId: Id<'users'>, messageId: Id<'messages'>) {
  const message = await ctx.db.get(messageId);
  if (!message || message.userId !== userId) {
    throw new Error('Message not found');
  }
  return message;
}

async function listPromptTraceRowsByMessageId(ctx: any, messageId: Id<'messages'>) {
  return await ctx.db
    .query('messagePromptTraces')
    .withIndex('by_message', (q: any) => q.eq('messageId', messageId))
    .collect();
}

export async function upsertPromptTraceForMessage(
  ctx: any,
  input: {
    userId: Id<'users'>;
    conversationId: Id<'conversations'>;
    messageId: Id<'messages'>;
    promptTraceDraft?: {
      kind: 'chamber' | 'hall_advisory' | 'hall_roundtable';
      sections: Array<{
        key: string;
        label: string;
        content: string;
        sourceKind: 'persona' | 'memory' | 'context' | 'question' | 'retrieval' | 'directive' | 'sentinel';
        meta?: Record<string, unknown>;
      }>;
      retrieval: {
        plannerKbQueries: string[];
        secondPassKbQueries: string[];
        personalSourceQueries: string[];
        selectedKbDocumentNames: string[];
        knowledgeRouteMode?: string;
        knowledgeRouteSummary?: string;
        personalSourcePlanReason?: string;
      };
      capturedAt: number;
    };
  }
) {
  if (!input.promptTraceDraft) return;

  const existingRows = await listPromptTraceRowsByMessageId(ctx, input.messageId);
  const [existing, ...duplicates] = existingRows.sort(
    (left: any, right: any) =>
      (right.capturedAt ?? right._creationTime) - (left.capturedAt ?? left._creationTime)
  );

  const payload = {
    userId: input.userId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    kind: input.promptTraceDraft.kind,
    sections: input.promptTraceDraft.sections,
    retrieval: input.promptTraceDraft.retrieval,
    capturedAt: input.promptTraceDraft.capturedAt,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    for (const duplicate of duplicates) {
      await ctx.db.delete(duplicate._id);
    }
    return;
  }

  await ctx.db.insert('messagePromptTraces', payload);
}

export const getByMessageId = query({
  args: {
    messageId: v.id('messages'),
  },
  returns: v.union(promptTraceRecordValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const message = await requireOwnedMessage(ctx, userId, args.messageId);
    await requireOwnedConversation(ctx, userId, message.conversationId);
    const rows = await listPromptTraceRowsByMessageId(ctx, args.messageId);
    if (rows.length === 0) {
      return null;
    }
    rows.sort(
      (left: any, right: any) =>
        (right.capturedAt ?? right._creationTime) - (left.capturedAt ?? left._creationTime)
    );
    return rows[0] ?? null;
  },
});

export const listMessageIdsByConversation = query({
  args: {
    conversationId: v.id('conversations'),
  },
  returns: v.array(v.id('messages')),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireOwnedConversation(ctx, userId, args.conversationId);
    const rows = await ctx.db
      .query('messagePromptTraces')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect();
    return [...new Set(rows
      .filter((row) => row.userId === userId)
      .map((row) => row.messageId))];
  },
});

export const upsertForMessage = mutation({
  args: {
    conversationId: v.id('conversations'),
    messageId: v.id('messages'),
    promptTraceDraft: promptTraceDraftValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const message = await requireOwnedMessage(ctx, userId, args.messageId);
    if (message.conversationId !== args.conversationId) {
      throw new Error('Trace conversation does not match message conversation');
    }
    await requireOwnedConversation(ctx, userId, args.conversationId);
    await upsertPromptTraceForMessage(ctx, {
      userId,
      conversationId: args.conversationId,
      messageId: args.messageId,
      promptTraceDraft: args.promptTraceDraft,
    });
    return null;
  },
});
