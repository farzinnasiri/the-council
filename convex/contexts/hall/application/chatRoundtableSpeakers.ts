'use node';

import { api } from '../../../_generated/api';
import type { Id } from '../../../_generated/dataModel';
import { ensureMemberStore } from '../../../ai/kbIngest';
import { resolveHallRawRoundTail } from '../../../ai/hallMemoryPolicy';
import { assertHallConversationOpen, requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import { createAiProvider, createKnowledgeRetriever, toKBDigestHints, withTimeout } from '../../shared/convexGateway';
import type { MemberListRow, MessageRow, RoundCandidateRow, RoundtableSpeakerResult } from '../../shared/types';
import { normalizeHallMode } from '../domain/hallMode';
import { resolveOpeningHallDefaults } from '../domain/openingRoundDefaults';
import { moveTypeToRoundIntent } from '../domain/roundtableAllocator';
import { buildContextMessages, buildHallSystemPrompt, buildHallSystemPromptSections } from '../domain/hallPrompt';
import type { ChatRoundtableSpeakersInput } from '../contracts';
import { runWithChatResponseFallback } from '../../shared/chatResponseFallback';
import { listHallRoundSummaries } from '../infrastructure/memoryRepo';
import { listMemberKBDigests, loadActiveMembersMap } from '../infrastructure/membersRepo';
import { listActiveMessages, listAllMessages } from '../infrastructure/messagesRepo';
import { listActiveParticipants } from '../infrastructure/participantsRepo';
import { getRoundtableState } from '../infrastructure/roundtableRepo';

interface RunRoundtableSpeakerOptions {
  ctx: any;
  conversationId: Id<'conversations'>;
  roundNumber: number;
  memberId: Id<'members'>;
  candidateRow: RoundCandidateRow;
  membersById: Map<string, MemberListRow>;
  rawContextMessages: MessageRow[];
  roundSummaries: string[];
  latestUserMessage?: MessageRow;
  activeMembers: MemberListRow[];
  chatResponseModelSlot: number;
  retrievalModel?: string;
  chatModel?: string;
  debugPromptTrace?: boolean;
}

export interface RoundtableSpeakerContribution extends RoundtableSpeakerResult {
  model?: string;
  retrievalModel?: string;
  usedKnowledgeBase?: boolean;
  grounded?: boolean;
  citations?: Array<{ title: string; uri?: string }>;
}

const ROUND_SPEAKER_TIMEOUT_MS = 45_000;

function stripLeadingSpeakerLabel(text: string, memberName: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const first = (lines[0] ?? '').trim();
  const normalized = memberName.trim().toLowerCase();
  const firstLower = first.toLowerCase();
  if (
    normalized &&
    (firstLower === `${normalized}:` ||
      firstLower === `${normalized} -` ||
      firstLower === `${normalized} —`)
  ) {
    const rest = lines.slice(1).join('\n').trim();
    return rest || text;
  }
  return text;
}

export function buildRoundtableHallContext(options: {
  activeMessages: MessageRow[];
  hallSummaryRows: Array<{ roundNumber?: number; memory?: string }>;
  roundNumber: number;
  rawRoundTail: number;
}): { rawContextMessages: MessageRow[]; roundSummaries: string[] } {
  const hasRoundNumbers = options.activeMessages.some(
    (message) => message.role === 'member' && message.status !== 'error' && typeof message.roundNumber === 'number'
  );
  const firstRawRound = Math.max(1, options.roundNumber - options.rawRoundTail);
  const roundSummaries = hasRoundNumbers
    ? options.hallSummaryRows
        .filter((row) => typeof row.roundNumber === 'number' && row.roundNumber < firstRawRound)
        .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0))
        .map((row) => row.memory?.trim())
        .filter((row): row is string => Boolean(row))
    : [];

  const allowedRecentUserIds = new Set(
    options.activeMessages
      .filter((message) => message.role === 'user' && message.status !== 'error')
      .slice(-options.rawRoundTail)
      .map((message) => message._id)
  );

  const rawContextMessages = hasRoundNumbers
    ? options.activeMessages.filter((message) => {
        if (message.role === 'system' || message.status === 'error') return false;
        if (message.role === 'member') {
          if (typeof message.roundNumber !== 'number') return false;
          return message.roundNumber >= firstRawRound;
        }
        return allowedRecentUserIds.has(message._id);
      })
    : options.activeMessages.filter((message) => message.role !== 'system' && message.status !== 'error').slice(-12);

  return {
    rawContextMessages,
    roundSummaries,
  };
}

export async function runRoundtableSpeakerContribution(
  options: RunRoundtableSpeakerOptions
): Promise<RoundtableSpeakerContribution> {
  const ensured = await ensureMemberStore(options.ctx, options.memberId);
  const member = ensured.member;
  const effectiveStoreName = ensured.storeName;
  if (!member || member.deletedAt) {
    const memberName = member?.name ?? 'Member';
    return {
      memberId: options.memberId,
      status: 'error',
      answer: `${memberName} could not speak in this round.`,
      intent: moveTypeToRoundIntent(options.candidateRow.moveType),
      targetMemberId: options.candidateRow.targetMemberId,
      error: 'Member not found',
    };
  }

  const targetName = options.candidateRow.targetMemberId
    ? (options.membersById.get(options.candidateRow.targetMemberId as string)?.name ?? 'another member')
    : undefined;

  const effectiveIntent = moveTypeToRoundIntent(options.candidateRow.moveType);
  const openingRoundDefaults = resolveOpeningHallDefaults({
    isOpeningRound: options.roundNumber === 1,
  });

  const roundPrompt = [
    `Round #${options.roundNumber} intent: ${effectiveIntent}.`,
    targetName ? `Focus target: ${targetName}.` : '',
    options.latestUserMessage
      ? `User topic: ${options.latestUserMessage.content}`
      : 'User topic: Continue deliberation.',
    'Give one concise contribution for this round.',
  ]
    .filter(Boolean)
    .join('\n');

  const kbDigests = await listMemberKBDigests(options.ctx, options.memberId);

  try {
    const provider = createAiProvider();
    const hallPromptSections = buildHallSystemPromptSections({
      member,
      participants: options.activeMembers,
      hallMode: 'roundtable',
      roundSummaries: options.roundSummaries,
      rawMessages: options.rawContextMessages,
      conversationId: options.conversationId,
    });
    const invokeProvider = async (responseModel: string) =>
      await withTimeout(
        provider.chatMember({
          query: roundPrompt,
          storeName: effectiveStoreName,
          knowledgeRetriever: createKnowledgeRetriever(options.ctx, options.memberId),
          personalSourceRetriever: undefined,
          identityContext: undefined,
          memoryHint: undefined,
            kbDigests: toKBDigestHints(kbDigests),
            responseModel,
            chatProfile: openingRoundDefaults.chatProfile,
            retrievalModel: options.retrievalModel,
            retrievalStrategy: openingRoundDefaults.retrievalStrategy,
            temperature: 0.35,
          personaPrompt: buildHallSystemPrompt({
            member,
            participants: options.activeMembers,
            hallMode: 'roundtable',
            roundSummaries: options.roundSummaries,
            rawMessages: options.rawContextMessages,
            conversationId: options.conversationId,
          }),
          promptTraceKind: 'hall_roundtable',
          promptTraceSections: hallPromptSections,
          debugPromptTrace: Boolean(options.debugPromptTrace),
          contextMessages: buildContextMessages({
            messages: options.rawContextMessages,
            membersById: options.membersById,
            selfMemberId: options.memberId,
            omitLatestUserMessage: true,
          }),
          includeConversationContext: false,
          knowledgeMode: 'force',
        }),
        ROUND_SPEAKER_TIMEOUT_MS,
      );
    const { result, metadata } = await runWithChatResponseFallback({
      preferredSlot: options.chatResponseModelSlot,
      responseModelOverride: options.chatModel,
      invoke: invokeProvider,
    });

    return {
      memberId: options.memberId,
      status: 'sent',
      answer: stripLeadingSpeakerLabel(result.answer, member.name),
      intent: effectiveIntent,
      targetMemberId: options.candidateRow.targetMemberId,
      model: result.model,
      retrievalModel: result.retrievalModel,
      usedKnowledgeBase: result.usedKnowledgeBase,
      grounded: result.grounded,
      citations: result.citations,
      attemptedResponseModelSlot: metadata.attemptedResponseModelSlot,
      attemptedResponseModelSpec: metadata.attemptedResponseModelSpec,
      finalResponseModelSlot: metadata.finalResponseModelSlot,
      finalResponseModelSpec: metadata.finalResponseModelSpec,
      fallbackUsed: metadata.fallbackUsed,
      promptTraceDraft: result.promptTraceDraft,
      error: undefined,
    };
  } catch (error) {
    const memberName = member.name ?? 'Member';
    const errorMessage = error instanceof Error ? error.message : 'Request failed';
    return {
      memberId: options.memberId,
      status: 'error',
      answer: `${memberName} could not speak in this round.`,
      intent: effectiveIntent,
      targetMemberId: options.candidateRow.targetMemberId,
      error: errorMessage,
    };
  }
}

export async function chatRoundtableSpeakersUseCase(
  ctx: any,
  args: ChatRoundtableSpeakersInput
): Promise<{ results: RoundtableSpeakerResult[] }> {
  await requireAuthUser(ctx);
  const conversation = await requireOwnedConversation(ctx, args.conversationId);

  if (conversation.kind !== 'hall') {
    throw new Error('Roundtable speaking is only supported for hall conversations');
  }
  assertHallConversationOpen(conversation, {
    errorCode: 'roundtable-speakers-conversation-closed',
    message: 'This table is closed.',
  });

  if (normalizeHallMode(conversation) !== 'roundtable') {
    throw new Error('Conversation is not in roundtable mode');
  }

  await ctx.runMutation(api.conversations.ensureHallParticipantResponseSlots, {
    conversationId: args.conversationId,
  });

  const state = await getRoundtableState(ctx, args.conversationId);

  if (!state || state.round.roundNumber !== args.roundNumber) {
    throw new Error('Round not found');
  }

  if (state.round.status !== 'awaiting_user' && state.round.status !== 'in_progress') {
    throw new Error('Round is not open for speaking');
  }

  const selectedRows = state.candidates.filter((row) => row.status === 'shortlisted' || row.status === 'speaking');

  if (selectedRows.length === 0) {
    return { results: [] };
  }

  const [participants, membersById, activeMessages, allMessages, hallSummaryRows, rawRoundTail] = await Promise.all([
    listActiveParticipants(ctx, args.conversationId),
    loadActiveMembersMap(ctx),
    listActiveMessages(ctx, args.conversationId),
    listAllMessages(ctx, args.conversationId),
    listHallRoundSummaries(ctx, args.conversationId),
    resolveHallRawRoundTail(ctx),
  ]);

  const activeMembers = participants
    .map((row) => membersById.get(row.memberId as string))
    .filter((item): item is MemberListRow => Boolean(item));
  const participantSlotsByMemberId = new Map(
    participants.map((row) => [String(row.memberId), row.chatResponseModelSlot ?? 1])
  );

  const latestUserMessage = [...allMessages]
    .reverse()
    .find((message) => message.role === 'user' && message.status !== 'error');

  const { rawContextMessages, roundSummaries } = buildRoundtableHallContext({
    activeMessages,
    hallSummaryRows,
    roundNumber: args.roundNumber,
    rawRoundTail,
  });
  const results = await Promise.all(
    selectedRows.map((candidateRow) =>
      runRoundtableSpeakerContribution({
        ctx,
        conversationId: args.conversationId,
        roundNumber: args.roundNumber,
        memberId: candidateRow.memberId,
        candidateRow,
        membersById,
        rawContextMessages,
        roundSummaries,
        latestUserMessage,
        activeMembers,
        chatResponseModelSlot: participantSlotsByMemberId.get(String(candidateRow.memberId)) ?? 1,
        retrievalModel: args.retrievalModel,
        chatModel: args.chatModel,
        debugPromptTrace: args.debugPromptTrace,
      })
    )
  );

  return {
    results: results.map((result) => ({
      memberId: result.memberId,
      status: result.status,
      answer: result.answer,
      intent: result.intent,
      targetMemberId: result.targetMemberId,
      error: result.error,
      attemptedResponseModelSlot: result.attemptedResponseModelSlot,
      attemptedResponseModelSpec: result.attemptedResponseModelSpec,
      finalResponseModelSlot: result.finalResponseModelSlot,
      finalResponseModelSpec: result.finalResponseModelSpec,
      fallbackUsed: result.fallbackUsed,
      promptTraceDraft: result.promptTraceDraft,
    })),
  };
}
