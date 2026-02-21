'use node';

import { action } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { api } from './_generated/api';
import { GeminiService, fallbackRouteMemberIds } from './ai/geminiService';
import { requireAuthUser, requireOwnedConversation, requireOwnedMember } from './ai/ownership';
import {
  deleteMemberDocument,
  ensureMemberStore,
  listMemberDocuments,
  purgeExpiredStagedDocuments,
  rebuildMemberDigests,
  rehydrateMemberStore,
  uploadStagedDocuments,
} from './ai/kbIngest';

function createService() {
  return new GeminiService(process.env.GEMINI_API_KEY);
}

const contextMessage = v.object({
  role: v.union(v.literal('user'), v.literal('assistant')),
  content: v.string(),
});

const stagedUploadInput = v.object({
  storageId: v.id('_storage'),
  displayName: v.string(),
  mimeType: v.optional(v.string()),
  sizeBytes: v.optional(v.number()),
});

export const routeHallMembers = action({
  args: {
    conversationId: v.id('conversations'),
    message: v.string(),
    maxSelections: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const conversation = await requireOwnedConversation(ctx, args.conversationId);
    if (conversation.kind !== 'hall') {
      throw new Error('Routing is only supported for hall conversations');
    }

    const candidates = (await ctx.runQuery(api.members.list, {
      includeArchived: false,
    })) as Array<any>;

    if (candidates.length === 0) {
      return {
        chosenMemberIds: [] as string[],
        model: 'none',
        source: 'fallback' as const,
      };
    }

    const normalizedCandidates = candidates.map((candidate) => ({
      id: candidate._id as string,
      name: candidate.name as string,
      specialties: (candidate.specialties ?? []) as string[],
      systemPrompt: candidate.systemPrompt as string,
    }));

    const maxSelections = Math.max(1, Math.min(8, args.maxSelections ?? 3));
    const service = createService();

    try {
      const routed = await service.routeMembersLite({
        message: args.message,
        candidates: normalizedCandidates,
        maxSelections,
      });

      const chosen = routed.chosenMemberIds.filter((id) => normalizedCandidates.some((candidate) => candidate.id === id));
      if (chosen.length === 0) {
        return {
          chosenMemberIds: fallbackRouteMemberIds(args.message, normalizedCandidates, maxSelections),
          model: routed.model,
          source: 'fallback' as const,
        };
      }

      return {
        chosenMemberIds: chosen.slice(0, maxSelections),
        model: routed.model,
        source: 'llm' as const,
      };
    } catch {
      return {
        chosenMemberIds: fallbackRouteMemberIds(args.message, normalizedCandidates, maxSelections),
        model: process.env.GEMINI_ROUTER_MODEL ?? 'fallback',
        source: 'fallback' as const,
      };
    }
  },
});

export const suggestHallTitle = action({
  args: {
    message: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const service = createService();
    return await service.suggestHallTitle({ message: args.message, model: args.model });
  },
});

export const suggestMemberSpecialties = action({
  args: {
    name: v.string(),
    systemPrompt: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const service = createService();
    return await service.suggestMemberSpecialties({
      name: args.name,
      systemPrompt: args.systemPrompt,
      model: args.model,
    });
  },
});

export const chatWithMember = action({
  args: {
    conversationId: v.id('conversations'),
    memberId: v.id('members'),
    message: v.string(),
    previousSummary: v.optional(v.string()),
    contextMessages: v.optional(v.array(contextMessage)),
    hallContext: v.optional(v.string()),
    chatModel: v.optional(v.string()),
    retrievalModel: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    await requireAuthUser(ctx);
    const [conversation, member] = await Promise.all([
      requireOwnedConversation(ctx, args.conversationId),
      requireOwnedMember(ctx, args.memberId),
    ]);

    if (conversation.kind === 'chamber' && conversation.chamberMemberId !== args.memberId) {
      throw new Error('Member does not match chamber conversation');
    }

    const summaryBlock = args.previousSummary?.trim()
      ? `\n\n---\nConversation summary so far:\n${args.previousSummary.trim()}\n---`
      : '';
    const hallBlock = args.hallContext?.trim() ? `${args.hallContext.trim()}\n\n` : '';
    const effectiveSystemPrompt = hallBlock + member.systemPrompt + summaryBlock;
    const kbDigests: Array<any> = member.deletedAt
      ? []
      : ((await ctx.runQuery(api.kbDigests.listByMember as any, {
          memberId: args.memberId,
          includeDeleted: false,
        })) as Array<any>);

    const service = createService();
    return await service.chatWithOptionalKnowledgeBase({
      query: args.message,
      storeName: member.kbStoreName ?? null,
      memoryHint: args.previousSummary,
      kbDigests: (kbDigests as Array<any>).map((item) => ({
        displayName: item.displayName as string,
        geminiDocumentName: item.geminiDocumentName as string | undefined,
        topics: (item.topics ?? []) as string[],
        entities: (item.entities ?? []) as string[],
        lexicalAnchors: (item.lexicalAnchors ?? []) as string[],
        styleAnchors: (item.styleAnchors ?? []) as string[],
        digestSummary: (item.digestSummary ?? '') as string,
      })),
      responseModel: args.chatModel,
      retrievalModel: args.retrievalModel,
      temperature: 0.35,
      personaPrompt: effectiveSystemPrompt,
      contextMessages: (args.contextMessages ?? []).slice(-12),
    });
  },
});

export const compactConversation = action({
  args: {
    conversationId: v.id('conversations'),
    previousSummary: v.optional(v.string()),
    messageIds: v.array(v.id('messages')),
    messages: v.array(contextMessage),
    memoryScope: v.optional(v.union(v.literal('chamber'), v.literal('hall'))),
    memoryContext: v.optional(
      v.object({
        conversationId: v.string(),
        memberName: v.string(),
        memberSpecialties: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    await requireOwnedConversation(ctx, args.conversationId);

    if (!args.messages.length || !args.messageIds.length) {
      throw new Error('messages and messageIds are required');
    }

    const service = createService();
    const summary =
      args.memoryScope === 'chamber' && args.memoryContext?.memberName
        ? await service.summarizeChamberMemory({
            messages: args.messages,
            previousSummary: args.previousSummary,
            memberName: args.memoryContext.memberName,
            memberSpecialties: args.memoryContext.memberSpecialties,
          })
        : await service.summarizeMessages({
            messages: args.messages,
            previousSummary: args.previousSummary,
          });

    return { summary };
  },
});

export const ensureMemberKnowledgeStore = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const service = createService();
    const ensured = await ensureMemberStore(ctx, service, args.memberId);
    return {
      storeName: ensured.storeName,
      created: ensured.created,
    };
  },
});

export const uploadMemberDocuments = action({
  args: {
    memberId: v.id('members'),
    stagedFiles: v.array(stagedUploadInput),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    if (args.stagedFiles.length === 0) {
      throw new Error('No staged files provided');
    }

    const service = createService();
    return await uploadStagedDocuments(ctx, service, args.memberId, args.stagedFiles);
  },
});

export const listMemberKnowledgeDocuments = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const service = createService();
    return await listMemberDocuments(ctx, service, args.memberId);
  },
});

export const deleteMemberKnowledgeDocument = action({
  args: {
    memberId: v.id('members'),
    documentName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const service = createService();
    const documents = await deleteMemberDocument(ctx, service, args.memberId, args.documentName);
    return { ok: true, documents };
  },
});

export const rehydrateMemberKnowledgeStore = action({
  args: {
    memberId: v.id('members'),
    mode: v.optional(v.union(v.literal('missing-only'), v.literal('all'))),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const service = createService();
    return await rehydrateMemberStore(ctx, service, args.memberId, args.mode ?? 'missing-only');
  },
});

export const purgeExpiredStagedKnowledgeDocuments = action({
  args: {
    memberId: v.optional(v.id('members')),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    return await purgeExpiredStagedDocuments(ctx, args.memberId as Id<'members'> | undefined);
  },
});

export const rebuildMemberKnowledgeDigests = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const service = createService();
    return await rebuildMemberDigests(ctx, service, args.memberId);
  },
});
