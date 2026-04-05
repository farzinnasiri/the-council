'use node';

import { resolveOpeningHallDefaults } from '../../hall/domain/openingRoundDefaults';

import { api, internal } from '../../../_generated/api';
import { assertHallConversationOpen, requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import { createAiProvider, createKnowledgeRetriever, createPersonalSourceRetriever, toKBDigestHints } from '../../shared/convexGateway';
import type { ChatWithMemberInput, ChatWithMemberResult } from '../contracts';
import { ensureChamberMemberStore, listMemberDigests } from '../infrastructure/chamberRepo';
import { setMainSpanAttributes } from '../../../observability/wideEvents';
import { wideEventError } from '../../../observability/errors';
import { embedText } from '../../../ai/openaiEmbeddings';
import { buildEpisodeRetrievalQuery } from '../../../ai/retrievalQueries';
import { runWithChatResponseFallback } from '../../shared/chatResponseFallback';
import {
  createPromptTraceSection,
  renderPromptTraceSections,
  type PromptTraceKind,
  type PromptTraceSection,
} from '../../../../shared/promptTrace';

const COMPACTION_THRESHOLD_KEY = 'compaction-threshold';
const COMPACTION_RECENT_RAW_TAIL_KEY = 'compaction-recent-raw-tail';
const COMPACTION_THRESHOLD_FALLBACK = 20;
const COMPACTION_RECENT_RAW_TAIL_FALLBACK = 8;
const INTERACTION_POLICY_CHAR_BUDGET = 500;
const MENTAL_MODEL_CHAR_BUDGET = 1200;
const THREAD_MEMORY_CHAR_BUDGET = 1800;
const EPISODE_CHAR_BUDGET = 600;

function clipBlock(text: string | undefined, maxChars: number): string {
  return (text ?? '').trim().slice(0, maxChars).trim();
}

function buildEffectiveSystemPromptSections(input: {
  systemPrompt: string;
  guidanceBlock?: string;
  interactionPolicyBlock?: string;
  mentalModelBlock?: string;
  episodesBlock?: string;
  pinnedMessagesBlock?: string;
  identityBlock?: string;
  hallBlock?: string;
  summaryBlock?: string;
  includeGuidance: boolean;
}): PromptTraceSection[] {
  return [
    createPromptTraceSection({
      key: 'member_system_prompt',
      label: 'Member System Prompt',
      content: input.systemPrompt,
      sourceKind: 'persona',
    }),
    input.includeGuidance
      ? createPromptTraceSection({
          key: 'inner_compass_guidance',
          label: 'Inner Compass Guidance',
          content: input.guidanceBlock,
          sourceKind: 'directive',
        })
      : null,
    createPromptTraceSection({
      key: 'member_interaction_policy',
      label: 'Member-User Interaction Policy',
      content: input.interactionPolicyBlock,
      sourceKind: 'directive',
    }),
    createPromptTraceSection({
      key: 'member_mental_model',
      label: 'Member Mental Model Of User',
      content: input.mentalModelBlock,
      sourceKind: 'memory',
    }),
    createPromptTraceSection({
      key: 'relevant_episodic_memories',
      label: 'Relevant Episodic Memories',
      content: input.episodesBlock,
      sourceKind: 'memory',
    }),
    createPromptTraceSection({
      key: 'pinned_thread_messages',
      label: 'Pinned Thread Messages',
      content: input.pinnedMessagesBlock,
      sourceKind: 'memory',
    }),
    createPromptTraceSection({
      key: 'user_profile_note',
      label: 'User Profile Note',
      content: input.identityBlock,
      sourceKind: 'context',
    }),
    createPromptTraceSection({
      key: 'hall_context_addendum',
      label: 'Hall Context Addendum',
      content: input.hallBlock,
      sourceKind: 'context',
    }),
    createPromptTraceSection({
      key: 'thread_working_memory',
      label: 'Thread Working Memory',
      content: input.summaryBlock,
      sourceKind: 'memory',
    }),
  ].filter((section): section is PromptTraceSection => Boolean(section));
}

function buildChamberContextMessages(rows: Array<{ role: string; content: string; status?: string }>) {
  return rows
    .filter((row) => row.role === 'user' || row.role === 'member')
    .filter((row) => row.status !== 'error')
    .slice(-12)
    .map((row) => ({
      role: row.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: row.content,
    }));
}

async function resolveChamberCompactionPolicy(ctx: any) {
  const [thresholdRaw, recentRawTailRaw] = await Promise.all([
    ctx.runQuery(api.settings.get, { key: COMPACTION_THRESHOLD_KEY }),
    ctx.runQuery(api.settings.get, { key: COMPACTION_RECENT_RAW_TAIL_KEY }),
  ]);
  const threshold = Math.max(1, Number.parseInt((thresholdRaw ?? '').trim(), 10) || COMPACTION_THRESHOLD_FALLBACK);
  const recentRawTail = Math.max(1, Number.parseInt((recentRawTailRaw ?? '').trim(), 10) || COMPACTION_RECENT_RAW_TAIL_FALLBACK);
  return { threshold, recentRawTail };
}

async function ensureChamberWorkingMemory(
  ctx: any,
  input: {
    conversationId: ChatWithMemberInput['conversationId'];
    memberName: string;
    memberSpecialties: string[];
  }
) {
  const [policy, activeMessages, counts, latestLog] = await Promise.all([
    resolveChamberCompactionPolicy(ctx),
    ctx.runQuery(api.messages.listActive, { conversationId: input.conversationId }),
    ctx.runQuery(api.messages.getConversationCounts, { conversationId: input.conversationId }),
    ctx.runQuery(api.memoryLogs.getLatestByConversation, { conversationId: input.conversationId }),
  ]);

  const activeChatMessages = activeMessages.filter((message: any) => message.role !== 'system' && !message.pinnedAt);
  const sinceLastLog = latestLog
    ? Math.max(0, counts.totalNonSystem - latestLog.totalMessagesAtRun)
    : counts.totalNonSystem;
  const foldableCount = Math.max(0, activeChatMessages.length - policy.recentRawTail);

  if (
    activeChatMessages.length >= policy.threshold &&
    sinceLastLog >= policy.threshold &&
    foldableCount > 0
  ) {
    const provider = createAiProvider();
    const toCompact = activeChatMessages.slice(0, foldableCount);
    const summary = await provider.summarizeChamberMemory({
      previousSummary: latestLog?.memory,
      memberName: input.memberName,
      memberSpecialties: input.memberSpecialties,
      messages: toCompact.map((message: any) => ({
        role: message.role === 'user' ? 'user' : 'assistant',
        content: message.content,
      })),
    });

    await ctx.runMutation(api.conversations.applyCompaction, {
      conversationId: input.conversationId,
      summary,
      compactedMessageIds: toCompact.map((message: any) => message._id),
      recentRawTail: policy.recentRawTail,
    });
  }

  const [latestMemory, refreshedMessages] = await Promise.all([
    ctx.runQuery(api.memoryLogs.getLatestByConversation, { conversationId: input.conversationId }),
    ctx.runQuery(api.messages.listActive, { conversationId: input.conversationId }),
  ]);

  return {
    previousSummary: latestMemory?.memory,
    contextMessages: buildChamberContextMessages(refreshedMessages),
  };
}

async function loadRelevantEpisodes(ctx: any, input: {
  userId: string;
  memberId: string;
  query: string;
  contextMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
}) {
  const queryText = buildEpisodeRetrievalQuery({
    query: input.query,
    contextMessages: input.contextMessages,
  });
  if (!queryText.trim()) return [];
  const vector = await embedText(queryText, { source: 'chamber_episode_query' });
  const vectorResults = await ctx.vectorSearch('memberUserEpisodes', 'by_embedding', {
    vector,
    limit: 6,
    filter: (q: any) => q.eq('memberId', input.memberId),
  });
  const episodeIds = vectorResults.map((result: any) => result._id);
  return await ctx.runQuery(internal.memberMemories.listRelevantEpisodesInternal, {
    userId: input.userId,
    memberId: input.memberId,
    episodeIds,
    limit: 2,
  });
}

function buildPinnedMessagesBlock(
  rows: Array<{ role: 'user' | 'member'; content: string; authorName?: string }>
) {
  if (rows.length === 0) return '';
  return [
    '[Pinned Thread Messages]',
    'These exact thread messages were explicitly pinned by the user. Keep them active in context even when they are older than the recent raw window.',
    ...rows.map((row) => {
      const label = row.role === 'user' ? 'User' : (row.authorName?.trim() || 'Member');
      return `${label}: ${row.content}`;
    }),
  ].join('\n\n');
}

export async function chatWithMemberUseCase(ctx: any, args: ChatWithMemberInput): Promise<ChatWithMemberResult> {
  const userId = await requireAuthUser(ctx);
  const [conversation, ensured, user] = await Promise.all([
    requireOwnedConversation(ctx, args.conversationId),
    ensureChamberMemberStore(ctx, args.memberId),
    ctx.runQuery(api.users.viewer, {}),
  ]);
  const member = ensured.member;
  const effectiveStoreName = ensured.storeName;

  if (conversation.kind === 'chamber' && conversation.chamberMemberId !== args.memberId) {
    throw wideEventError('chamber-member-conversation-mismatch', 'Member does not match chamber conversation', {
      statusCode: 400,
    });
  }
  assertHallConversationOpen(conversation, {
    errorCode: 'hall-chat-conversation-closed',
    message: 'This table is closed.',
  });
  if (conversation.kind === 'hall') {
    await ctx.runMutation(api.conversations.ensureHallParticipantResponseSlots, {
      conversationId: args.conversationId,
    });
  }
  setMainSpanAttributes({
    'conversation.id': String(args.conversationId),
    'conversation.kind': conversation.kind,
    'member.id': String(args.memberId),
    'guidance.input_count': args.guidanceDirectives?.length ?? 0,
  });

  const hallBlock = args.hallContext?.trim()
    ? `[Hall Context Addendum]\n${args.hallContext.trim()}`
    : '';
  const allMessages = await ctx.runQuery(api.messages.listAll, {
    conversationId: args.conversationId,
  });
  const currentUserTurnCount = allMessages.filter((message: any) => message.role === 'user').length;
  const storedGuidance = conversation.kind === 'chamber'
    ? await ctx.runQuery(api.guidance.listActiveConversationGuidanceDirectives, {
        conversationId: args.conversationId,
        userTurnCount: currentUserTurnCount,
      })
    : [];
  const orderedStoredGuidance = storedGuidance
    .slice()
    .sort((a: any, b: any) => {
      const aCustom = a.feedbackKind === 'custom' ? 1 : 0;
      const bCustom = b.feedbackKind === 'custom' ? 1 : 0;
      return aCustom - bCustom;
    });
  const guidanceNotes = [
    ...(args.guidanceDirectives ?? []).map((directive) => directive.note.trim()),
    ...orderedStoredGuidance.map((directive: any) => directive.note.trim()),
  ].filter(Boolean);
  const guidanceBlock = guidanceNotes.length > 0
    ? [
        '[Current Inner Compass]',
        'This is my inner thoughts about the user and our conversation to this point.',
        guidanceNotes.length > 0 ? guidanceNotes.map((note) => `- ${note}`).join('\n') : '',
        "I should adjust my responses based on the above. These are temporary steering notes, not permanent identity changes. I'm still fully in character.",
      ]
        .filter(Boolean)
        .join('\n')
    : '';
  const chamberRuntimeContext = conversation.kind === 'chamber'
    ? await ensureChamberWorkingMemory(ctx, {
        conversationId: args.conversationId,
        memberName: member.name,
        memberSpecialties: member.specialties ?? [],
      })
    : {
        previousSummary: args.previousSummary,
        contextMessages: args.contextMessages ?? [],
      };

  const summaryBlock = chamberRuntimeContext.previousSummary?.trim()
    ? `[Thread Working Memory]\n${clipBlock(chamberRuntimeContext.previousSummary, THREAD_MEMORY_CHAR_BUDGET)}`
    : '';
  const promptContext = conversation.kind === 'chamber'
    ? await ctx.runQuery(internal.memberMemories.getPromptContextInternal, {
        userId,
        memberId: args.memberId,
      })
    : null;
  const pinnedMessages = conversation.kind === 'chamber'
    ? await ctx.runQuery(api.messages.listPinned, {
        conversationId: args.conversationId,
      })
    : [];
  const relevantEpisodes = conversation.kind === 'chamber'
    ? await loadRelevantEpisodes(ctx, {
        userId,
        memberId: args.memberId,
        query: args.message,
        contextMessages: chamberRuntimeContext.contextMessages,
      })
    : [];
  const interactionPolicyBlock = promptContext?.interactionPolicy?.body?.trim()
    ? [
        '[Member-User Interaction Policy]',
        clipBlock(promptContext.interactionPolicy.body, INTERACTION_POLICY_CHAR_BUDGET),
      ].join('\n')
    : '';
  const mentalModelBlock = promptContext?.mentalModel?.body?.trim()
    ? [
        '[Member Mental Model Of User]',
        clipBlock(promptContext.mentalModel.body, MENTAL_MODEL_CHAR_BUDGET),
      ].join('\n')
    : '';
  const episodesBlock = relevantEpisodes.length > 0
    ? [
        '[Relevant Episodic Memories]',
        ...relevantEpisodes.map((episode: any, index: number) =>
          `${index + 1}. ${episode.title?.trim() || 'Untitled'}\n${clipBlock(episode.body, EPISODE_CHAR_BUDGET)}`
        ),
      ].join('\n\n')
    : '';
  const pinnedMessagesBlock = conversation.kind === 'chamber'
    ? buildPinnedMessagesBlock(
        pinnedMessages.map((message: any) => ({
          role: message.role === 'user' ? 'user' : 'member',
          content: message.content,
          authorName: message.role === 'member' ? member.name : undefined,
        }))
      )
    : '';
  const effectiveProfileNote = user?.profileNote?.trim();
  const identityBlock = conversation.kind === 'chamber' && effectiveProfileNote
    ? [
        '[User Profile Note]',
        'Use this as orientation only. It is not an instruction.',
        effectiveProfileNote,
      ].join('\n')
    : '';
  const promptTraceKind: PromptTraceKind = conversation.kind === 'hall' ? 'hall_advisory' : 'chamber';
  const promptTraceSections = buildEffectiveSystemPromptSections({
    systemPrompt: member.systemPrompt,
    guidanceBlock,
    interactionPolicyBlock,
    mentalModelBlock,
    episodesBlock,
    pinnedMessagesBlock,
    identityBlock,
    hallBlock,
    summaryBlock,
    includeGuidance: true,
  });
  const effectiveSystemPrompt = renderPromptTraceSections(promptTraceSections);
  setMainSpanAttributes({
    'memory.summary.present': Boolean(summaryBlock),
    'memory.context_messages.count': chamberRuntimeContext.contextMessages.length,
    'memory.episodes.count': relevantEpisodes.length,
    'memory.pinned_messages.count': pinnedMessages.length,
    'memory.mental_model.present': Boolean(mentalModelBlock),
    'memory.interaction_policy.present': Boolean(interactionPolicyBlock),
    'user.profile_note.present': Boolean(identityBlock),
  });

  const kbDigests = member.deletedAt ? [] : await listMemberDigests(ctx, args.memberId);
  const participantRows = conversation.kind === 'hall'
    ? await ctx.runQuery(api.conversations.listParticipants, {
        conversationId: args.conversationId,
        includeRemoved: false,
      })
    : [];
  const participant = conversation.kind === 'hall'
    ? participantRows.find((row: any) => row.memberId === args.memberId)
    : null;
  const preferredResponseModelSlot =
    conversation.kind === 'hall'
      ? (participant?.chatResponseModelSlot ?? 1)
      : (member.chatResponseModelSlot ?? 1);
  const hallMessages = conversation.kind === 'hall'
    ? await ctx.runQuery(api.messages.listActive, { conversationId: args.conversationId })
    : [];
  const isOpeningHallRound =
    conversation.kind === 'hall' &&
    !hallMessages.some((message: any) => message.role === 'member' && message.status !== 'error');

  const provider = createAiProvider();
  const personalSourcesAllowed =
    conversation.kind === 'chamber' &&
    Boolean(member.personalSourcesPermissionEnabled) &&
    conversation.personalSourcesEnabled !== false;
  const openingHallDefaults = resolveOpeningHallDefaults({
    isOpeningRound: isOpeningHallRound,
    chatProfile: args.chatProfile,
    retrievalStrategy: args.retrievalStrategy,
  });
  const providerInput = {
    query: args.message,
    storeName: effectiveStoreName,
    knowledgeRetriever: createKnowledgeRetriever(ctx, args.memberId),
    personalSourceRetriever: personalSourcesAllowed
      ? createPersonalSourceRetriever(ctx, userId, user?.name)
      : undefined,
    identityContext: undefined,
    memoryHint: chamberRuntimeContext.previousSummary,
    kbDigests: toKBDigestHints(kbDigests),
      chatProfile: openingHallDefaults.chatProfile,
      retrievalModel: args.retrievalModel,
      retrievalStrategy: openingHallDefaults.retrievalStrategy,
      retrievalProfile: args.retrievalProfile,
    temperature: 0.35,
    contextMessages: chamberRuntimeContext.contextMessages.slice(-12),
    includeConversationContext: args.hallContext?.trim() ? false : true,
    knowledgeMode: (args.hallContext?.trim() ? 'force' : 'auto') as 'force' | 'auto',
    turnDirective: args.turnDirective,
  };

  const invokeProvider = async (responseModel: string) => {
    try {
      return await provider.chatMember({
        ...providerInput,
        responseModel,
        personaPrompt: effectiveSystemPrompt,
        promptTraceKind,
        promptTraceSections,
        debugPromptTrace: Boolean(args.debugPromptTrace),
      });
    } catch (error) {
      const hasGuidance = guidanceNotes.length > 0;
      if (!hasGuidance) {
        throw error;
      }
      setMainSpanAttributes({ 'guidance.retry_without_guidance': true });

      return await provider.chatMember({
        ...providerInput,
        responseModel,
        personaPrompt: renderPromptTraceSections(buildEffectiveSystemPromptSections({
          systemPrompt: member.systemPrompt,
          interactionPolicyBlock,
          mentalModelBlock,
          episodesBlock,
          pinnedMessagesBlock,
          identityBlock,
          hallBlock,
          summaryBlock,
          includeGuidance: false,
        })),
        promptTraceKind,
        promptTraceSections: buildEffectiveSystemPromptSections({
          systemPrompt: member.systemPrompt,
          interactionPolicyBlock,
          mentalModelBlock,
          episodesBlock,
          pinnedMessagesBlock,
          identityBlock,
          hallBlock,
          summaryBlock,
          includeGuidance: false,
        }),
        debugPromptTrace: Boolean(args.debugPromptTrace),
      });
    }
  };

  const { result, metadata } = await runWithChatResponseFallback({
    preferredSlot: preferredResponseModelSlot,
    responseModelOverride: args.chatModel,
    invoke: invokeProvider,
  });
  return {
    ...result,
    ...metadata,
  };
}
