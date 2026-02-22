'use node';

import { action } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { api } from './_generated/api';
import { GeminiService, fallbackRouteMemberIds } from './ai/geminiService';
import { createCouncilAiProvider } from './ai/provider/factory';
import type { RoundIntentProposal } from './ai/provider/types';
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
import { resolveRoundtableMaxSpeakers } from './ai/roundtablePolicy';
import { applyRoundDefaultSelection, buildRoundContext } from './ai/orchestration/roundtableHall';

function createProvider() {
  return createCouncilAiProvider();
}

function createGeminiServiceForKnowledgeBase() {
  return new GeminiService(process.env.GEMINI_API_KEY);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
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

const roundTriggerValidator = v.union(v.literal('user_message'), v.literal('continue'));
const roundIntentValidator = v.union(
  v.literal('speak'),
  v.literal('challenge'),
  v.literal('support'),
  v.literal('pass'),
);
const roundtableSpeakIntentValidator = v.union(
  v.literal('speak'),
  v.literal('challenge'),
  v.literal('support'),
);

function normalizeHallMode(conversation: { kind: 'hall' | 'chamber'; hallMode?: 'advisory' | 'roundtable' }) {
  if (conversation.kind !== 'hall') return undefined;
  return conversation.hallMode ?? 'advisory';
}

function buildContextMessages(options: {
  messages: Array<any>;
  membersById: Map<string, any>;
  selfMemberId: string;
}): Array<{ role: 'user' | 'assistant'; content: string }> {
  return options.messages
    .filter((message) => message.role !== 'system' && message.status !== 'error')
    .slice(-12)
    .map((message) => {
      if (message.role === 'user') {
        return {
          role: 'user' as const,
          content: message.content,
        };
      }

      const authorName = message.authorMemberId
        ? (options.membersById.get(message.authorMemberId as string)?.name ?? 'Member')
        : 'Member';
      const selfSuffix = message.authorMemberId === options.selfMemberId ? ' (you)' : '';

      return {
        role: 'assistant' as const,
        content: `${authorName}${selfSuffix}: ${message.content}`,
      };
    });
}

function buildHallSystemPrompt(options: {
  member: any;
  participants: any[];
  messages: Array<any>;
  conversationId: string;
}): string {
  const presentMemberNames = options.participants.map((m) => m.name);
  const otherNames = options.participants.filter((m) => m._id !== options.member._id).map((m) => m.name);

  const recentOtherOpinions = options.messages
    .filter(
      (msg) =>
        msg.conversationId === options.conversationId &&
        msg.role === 'member' &&
        msg.status !== 'error' &&
        msg.authorMemberId &&
        msg.authorMemberId !== options.member._id
    )
    .slice(-6)
    .map((msg) => {
      const author = options.participants.find((item) => item._id === msg.authorMemberId)?.name ?? 'Member';
      return `${author}: ${msg.content}`;
    });

  return [
    `Hall context: You are ${options.member.name}, one council member in a live hall conversation.`,
    `Present members: ${presentMemberNames.join(', ') || options.member.name}.`,
    `Other members currently present: ${otherNames.join(', ') || 'none'}.`,
    'You can reference, build on, or challenge other members respectfully.',
    recentOtherOpinions.length > 0
      ? `Recent member opinions:\n- ${recentOtherOpinions.join('\n- ')}`
      : 'Recent member opinions: none yet.',
  ].join('\n');
}

async function loadActiveParticipants(ctx: any, conversationId: Id<'conversations'>): Promise<any[]> {
  return (await ctx.runQuery(api.conversations.listParticipants as any, {
    conversationId,
    includeRemoved: false,
  })) as Array<any>;
}

async function loadActiveMembersMap(ctx: any): Promise<Map<string, any>> {
  const members = (await ctx.runQuery(api.members.list as any, {
    includeArchived: false,
  })) as Array<any>;

  return new Map(members.map((member) => [member._id as string, member]));
}

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
    const provider = createProvider();

    try {
      const routed = await provider.routeMembers({
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
    const provider = createProvider();
    return await provider.suggestHallTitle({ message: args.message, model: args.model });
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
    const provider = createProvider();
    return await provider.suggestMemberSpecialties({
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

    const provider = createProvider();
    return await provider.chatMember({
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

    const provider = createProvider();
    const summary =
      args.memoryScope === 'chamber' && args.memoryContext?.memberName
        ? await provider.summarizeChamberMemory({
            messages: args.messages,
            previousSummary: args.previousSummary,
            memberName: args.memoryContext.memberName,
            memberSpecialties: args.memoryContext.memberSpecialties,
          })
        : await provider.summarizeConversation({
            messages: args.messages,
            previousSummary: args.previousSummary,
          });

    return { summary };
  },
});

export const prepareRoundtableRound = action({
  args: {
    conversationId: v.id('conversations'),
    trigger: roundTriggerValidator,
    triggerMessageId: v.optional(v.id('messages')),
    mentionedMemberIds: v.optional(v.array(v.id('members'))),
  },
  returns: v.object({
    round: v.object({
      _id: v.id('hallRounds'),
      _creationTime: v.number(),
      userId: v.id('users'),
      conversationId: v.id('conversations'),
      roundNumber: v.number(),
      status: v.union(
        v.literal('awaiting_user'),
        v.literal('in_progress'),
        v.literal('completed'),
        v.literal('superseded'),
      ),
      trigger: roundTriggerValidator,
      triggerMessageId: v.optional(v.id('messages')),
      maxSpeakers: v.number(),
      updatedAt: v.number(),
    }),
    intents: v.array(
      v.object({
        _id: v.id('hallRoundIntents'),
        _creationTime: v.number(),
        userId: v.id('users'),
        conversationId: v.id('conversations'),
        roundNumber: v.number(),
        memberId: v.id('members'),
        intent: roundIntentValidator,
        targetMemberId: v.optional(v.id('members')),
        rationale: v.string(),
        selected: v.boolean(),
        source: v.union(v.literal('mention'), v.literal('intent_default'), v.literal('user_manual')),
        updatedAt: v.number(),
      })
    ),
  }),
  handler: async (ctx, args): Promise<any> => {
    await requireAuthUser(ctx);
    const conversation = await requireOwnedConversation(ctx, args.conversationId);

    if (conversation.kind !== 'hall') {
      throw new Error('Roundtable rounds are only supported for hall conversations');
    }

    if (normalizeHallMode(conversation) !== 'roundtable') {
      throw new Error('Conversation is not in roundtable mode');
    }

    const [membersById, participants, activeMessages, maxSpeakers] = await Promise.all([
      loadActiveMembersMap(ctx),
      loadActiveParticipants(ctx, args.conversationId),
      ctx.runQuery(api.messages.listActive as any, { conversationId: args.conversationId }) as Promise<Array<any>>,
      resolveRoundtableMaxSpeakers(ctx),
    ]);

    const activeMemberIds = participants.map((row) => row.memberId as string);
    const filteredMentioned = (args.mentionedMemberIds ?? []).filter((memberId) =>
      activeMemberIds.includes(memberId as string)
    );

    const triggerMessage = args.triggerMessageId
      ? activeMessages.find((message) => message._id === args.triggerMessageId)
      : undefined;

    const recentMessages = activeMessages
      .filter((message) => message.role !== 'system' && message.status !== 'error')
      .slice(-12)
      .map((message) => ({
        author:
          message.role === 'user'
            ? 'User'
            : (membersById.get(message.authorMemberId as string)?.name ?? 'Member'),
        content: message.content as string,
      }));

    const roundContext = buildRoundContext({
      userMessage: triggerMessage?.content as string | undefined,
      recentMessages,
    });

    const provider = createProvider();

    const proposed = await Promise.all(
      activeMemberIds.map(async (memberId) => {
        const member = membersById.get(memberId);
        if (!member) {
          return {
            memberId,
            intent: 'pass' as const,
            rationale: 'Member unavailable.',
          } satisfies RoundIntentProposal & { memberId: string };
        }

        try {
          const intent = await withTimeout(
            provider.proposeRoundIntentPromptOnly({
              member: {
                id: member._id as string,
                name: member.name as string,
                specialties: (member.specialties ?? []) as string[],
                systemPrompt: member.systemPrompt as string,
              },
              conversationContext: roundContext,
              memberIds: activeMemberIds,
            }),
            2500
          );

          return {
            memberId,
            intent: intent.intent,
            targetMemberId: intent.targetMemberId,
            rationale: intent.rationale,
          };
        } catch {
          return {
            memberId,
            intent: 'speak' as const,
            rationale: 'Can add one point.',
          };
        }
      })
    );

    const preparedIntents = applyRoundDefaultSelection({
      intents: proposed.map((row) => ({
        memberId: row.memberId,
        intent: row.intent,
        targetMemberId: row.targetMemberId,
        rationale: row.rationale,
        selected: false,
        source: 'intent_default',
      })),
      mentionedMemberIds: filteredMentioned.map((id) => id as string),
      maxSpeakers,
    });

    return await (ctx as any).runMutation('hallRounds:createRoundWithIntents', {
      conversationId: args.conversationId,
      trigger: args.trigger,
      triggerMessageId: args.triggerMessageId,
      maxSpeakers,
      intents: preparedIntents.map((row) => ({
        memberId: row.memberId as Id<'members'>,
        intent: row.intent,
        targetMemberId: row.targetMemberId as Id<'members'> | undefined,
        rationale: row.rationale,
        selected: row.selected,
        source: row.source,
      })),
    });
  },
});

async function runRoundtableSpeaker(options: {
  ctx: any;
  conversationId: Id<'conversations'>;
  roundNumber: number;
  memberId: Id<'members'>;
  intentRow: any;
  membersById: Map<string, any>;
  activeMessages: Array<any>;
  latestUserMessage?: any;
  activeMembers: Array<any>;
  retrievalModel?: string;
  chatModel?: string;
  provider: ReturnType<typeof createProvider>;
}) {
  const member = options.membersById.get(options.memberId as string);
  if (!member || member.deletedAt) {
    const memberName = member?.name ?? 'Member';
    return {
      memberId: options.memberId,
      status: 'error' as const,
      answer: `${memberName} could not speak in this round.`,
      intent: options.intentRow.intent as 'speak' | 'challenge' | 'support',
      targetMemberId: options.intentRow.targetMemberId as Id<'members'> | undefined,
      error: 'Member not found',
    };
  }

  const targetName = options.intentRow.targetMemberId
    ? (options.membersById.get(options.intentRow.targetMemberId as string)?.name ?? 'another member')
    : undefined;

  const roundPrompt = [
    `Round #${options.roundNumber} intent: ${options.intentRow.intent}.`,
    targetName ? `Focus target: ${targetName}.` : '',
    options.latestUserMessage
      ? `User topic: ${options.latestUserMessage.content}`
      : 'User topic: Continue deliberation.',
    'Give one concise contribution for this round.',
  ]
    .filter(Boolean)
    .join('\n');

  const kbDigests = (await options.ctx.runQuery(api.kbDigests.listByMember as any, {
    memberId: options.memberId,
    includeDeleted: false,
  })) as Array<any>;

  try {
    const result = await options.provider.chatMember({
      query: roundPrompt,
      storeName: member.kbStoreName ?? null,
      memoryHint: undefined,
      kbDigests: kbDigests.map((item: any) => ({
        displayName: item.displayName as string,
        geminiDocumentName: item.geminiDocumentName as string | undefined,
        topics: (item.topics ?? []) as string[],
        entities: (item.entities ?? []) as string[],
        lexicalAnchors: (item.lexicalAnchors ?? []) as string[],
        styleAnchors: (item.styleAnchors ?? []) as string[],
        digestSummary: (item.digestSummary ?? '') as string,
      })),
      responseModel: options.chatModel,
      retrievalModel: options.retrievalModel,
      temperature: 0.35,
      personaPrompt: buildHallSystemPrompt({
        member,
        participants: options.activeMembers,
        messages: options.activeMessages,
        conversationId: options.conversationId,
      }),
      contextMessages: buildContextMessages({
        messages: options.activeMessages,
        membersById: options.membersById,
        selfMemberId: options.memberId,
      }),
      useKnowledgeBase: true,
    });

    return {
      memberId: options.memberId,
      status: 'sent' as const,
      answer: result.answer,
      intent: options.intentRow.intent as 'speak' | 'challenge' | 'support',
      targetMemberId: options.intentRow.targetMemberId as Id<'members'> | undefined,
      error: undefined,
    };
  } catch (error) {
    const memberName = member.name ?? 'Member';
    const errorMessage = error instanceof Error ? error.message : 'Request failed';
    return {
      memberId: options.memberId,
      status: 'error' as const,
      answer: `${memberName} could not speak in this round.`,
      intent: options.intentRow.intent as 'speak' | 'challenge' | 'support',
      targetMemberId: options.intentRow.targetMemberId as Id<'members'> | undefined,
      error: errorMessage,
    };
  }
}

export const chatRoundtableSpeakers = action({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    retrievalModel: v.optional(v.string()),
    chatModel: v.optional(v.string()),
  },
  returns: v.object({
    results: v.array(
      v.object({
        memberId: v.id('members'),
        status: v.union(v.literal('sent'), v.literal('error')),
        answer: v.string(),
        intent: roundtableSpeakIntentValidator,
        targetMemberId: v.optional(v.id('members')),
        error: v.optional(v.string()),
      })
    ),
  }),
  handler: async (ctx, args): Promise<any> => {
    await requireAuthUser(ctx);
    const conversation = await requireOwnedConversation(ctx, args.conversationId);

    if (conversation.kind !== 'hall') {
      throw new Error('Roundtable speaking is only supported for hall conversations');
    }

    if (normalizeHallMode(conversation) !== 'roundtable') {
      throw new Error('Conversation is not in roundtable mode');
    }

    const state = (await (ctx as any).runQuery('hallRounds:getRoundtableState', {
      conversationId: args.conversationId,
    })) as any;

    if (!state || state.round.roundNumber !== args.roundNumber) {
      throw new Error('Round not found');
    }

    if (state.round.status !== 'awaiting_user' && state.round.status !== 'in_progress') {
      throw new Error('Round is not open for speaking');
    }

    const selectedRows = (state.intents as Array<any>).filter(
      (row) => row.selected && row.intent !== 'pass'
    );

    if (selectedRows.length === 0) {
      return { results: [] };
    }

    const [participants, membersById, activeMessages, allMessages] = await Promise.all([
      loadActiveParticipants(ctx, args.conversationId),
      loadActiveMembersMap(ctx),
      ctx.runQuery(api.messages.listActive as any, { conversationId: args.conversationId }) as Promise<Array<any>>,
      ctx.runQuery(api.messages.listAll as any, { conversationId: args.conversationId }) as Promise<Array<any>>,
    ]);

    const activeMembers = participants
      .map((row) => membersById.get(row.memberId as string))
      .filter((item): item is any => Boolean(item));

    const latestUserMessage = [...allMessages]
      .reverse()
      .find((message) => message.role === 'user' && message.status !== 'error');

    const provider = createProvider();
    const results = await Promise.all(
      selectedRows.map((intentRow) =>
        runRoundtableSpeaker({
          ctx,
          conversationId: args.conversationId,
          roundNumber: args.roundNumber,
          memberId: intentRow.memberId as Id<'members'>,
          intentRow,
          membersById,
          activeMessages,
          latestUserMessage,
          activeMembers,
          retrievalModel: args.retrievalModel,
          chatModel: args.chatModel,
          provider,
        })
      )
    );

    return { results };
  },
});

export const chatRoundtableSpeaker = action({
  args: {
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    memberId: v.id('members'),
    retrievalModel: v.optional(v.string()),
    chatModel: v.optional(v.string()),
  },
  returns: v.object({
    answer: v.string(),
    grounded: v.boolean(),
    citations: v.array(v.object({ title: v.string(), uri: v.optional(v.string()) })),
    model: v.string(),
    retrievalModel: v.string(),
    usedKnowledgeBase: v.boolean(),
    debug: v.optional(v.any()),
    intent: v.union(v.literal('speak'), v.literal('challenge'), v.literal('support')),
    targetMemberId: v.optional(v.id('members')),
  }),
  handler: async (ctx, args): Promise<any> => {
    await requireAuthUser(ctx);
    const [conversation, member] = await Promise.all([
      requireOwnedConversation(ctx, args.conversationId),
      requireOwnedMember(ctx, args.memberId),
    ]);

    if (conversation.kind !== 'hall') {
      throw new Error('Roundtable speaking is only supported for hall conversations');
    }

    if (normalizeHallMode(conversation) !== 'roundtable') {
      throw new Error('Conversation is not in roundtable mode');
    }

    const state = (await (ctx as any).runQuery('hallRounds:getRoundtableState', {
      conversationId: args.conversationId,
    })) as any;

    if (!state || state.round.roundNumber !== args.roundNumber) {
      throw new Error('Round not found');
    }

    if (state.round.status !== 'awaiting_user' && state.round.status !== 'in_progress') {
      throw new Error('Round is not open for speaking');
    }

    const intentRow = (state.intents as Array<any>).find(
      (row) => row.memberId === args.memberId && row.selected
    );

    if (!intentRow) {
      throw new Error('Member is not selected for this round');
    }

    if (intentRow.intent === 'pass') {
      throw new Error('Pass intent cannot be spoken');
    }

    const [participants, membersById, activeMessages, allMessages] = await Promise.all([
      loadActiveParticipants(ctx, args.conversationId),
      loadActiveMembersMap(ctx),
      ctx.runQuery(api.messages.listActive as any, { conversationId: args.conversationId }) as Promise<Array<any>>,
      ctx.runQuery(api.messages.listAll as any, { conversationId: args.conversationId }) as Promise<Array<any>>,
    ]);

    const activeMembers = participants
      .map((row) => membersById.get(row.memberId as string))
      .filter((item): item is any => Boolean(item));

    const latestUserMessage = [...allMessages]
      .reverse()
      .find((message) => message.role === 'user' && message.status !== 'error');
    const provider = createProvider();
    const single = await runRoundtableSpeaker({
      ctx,
      conversationId: args.conversationId,
      roundNumber: args.roundNumber,
      memberId: args.memberId,
      intentRow,
      membersById,
      activeMessages,
      latestUserMessage,
      activeMembers,
      retrievalModel: args.retrievalModel,
      chatModel: args.chatModel,
      provider,
    });

    if (single.status === 'error') {
      throw new Error(single.error ?? 'Roundtable speaker failed');
    }

    return {
      answer: single.answer,
      grounded: false,
      citations: [],
      model: args.chatModel ?? process.env.GEMINI_CHAT_MODEL ?? process.env.GEMINI_MODEL ?? 'gemini',
      retrievalModel:
        args.retrievalModel ?? process.env.GEMINI_RETRIEVAL_MODEL ?? process.env.GEMINI_MODEL ?? 'gemini',
      usedKnowledgeBase: true,
      intent: single.intent,
      targetMemberId: single.targetMemberId,
    };
  },
});

export const ensureMemberKnowledgeStore = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const service = createGeminiServiceForKnowledgeBase();
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

    const service = createGeminiServiceForKnowledgeBase();
    return await uploadStagedDocuments(ctx, service, args.memberId, args.stagedFiles);
  },
});

export const listMemberKnowledgeDocuments = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const service = createGeminiServiceForKnowledgeBase();
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
    const service = createGeminiServiceForKnowledgeBase();
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
    const service = createGeminiServiceForKnowledgeBase();
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
    const service = createGeminiServiceForKnowledgeBase();
    return await rebuildMemberDigests(ctx, service, args.memberId);
  },
});
