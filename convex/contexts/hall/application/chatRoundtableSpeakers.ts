'use node';

import type { Id } from '../../../_generated/dataModel';
import { ensureMemberStore } from '../../../ai/kbIngest';
import { requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import { createAiProvider, createKnowledgeRetriever, toKBDigestHints } from '../../shared/convexGateway';
import type { MemberListRow, MessageRow, RoundIntentRow, RoundtableSpeakerResult } from '../../shared/types';
import { normalizeHallMode } from '../domain/hallMode';
import { buildContextMessages, buildHallSystemPrompt } from '../domain/hallPrompt';
import type { ChatRoundtableSpeakersInput } from '../contracts';
import { listMemberKBDigests, loadActiveMembersMap } from '../infrastructure/membersRepo';
import { listActiveMessages, listAllMessages } from '../infrastructure/messagesRepo';
import { listActiveParticipants } from '../infrastructure/participantsRepo';
import { getRoundtableState } from '../infrastructure/roundtableRepo';

interface RunRoundtableSpeakerOptions {
  ctx: any;
  conversationId: Id<'conversations'>;
  roundNumber: number;
  memberId: Id<'members'>;
  intentRow: RoundIntentRow;
  membersById: Map<string, MemberListRow>;
  activeMessages: MessageRow[];
  latestUserMessage?: MessageRow;
  activeMembers: MemberListRow[];
  retrievalModel?: string;
  chatModel?: string;
}

export async function runRoundtableSpeakerContribution(
  options: RunRoundtableSpeakerOptions
): Promise<RoundtableSpeakerResult> {
  const ensured = await ensureMemberStore(options.ctx, options.memberId);
  const member = ensured.member;
  const effectiveStoreName = ensured.storeName;
  if (!member || member.deletedAt) {
    const memberName = member?.name ?? 'Member';
    return {
      memberId: options.memberId,
      status: 'error',
      answer: `${memberName} could not speak in this round.`,
      intent: options.intentRow.intent === 'pass' ? 'speak' : options.intentRow.intent,
      targetMemberId: options.intentRow.targetMemberId,
      error: 'Member not found',
    };
  }

  const targetName = options.intentRow.targetMemberId
    ? (options.membersById.get(options.intentRow.targetMemberId as string)?.name ?? 'another member')
    : undefined;

  const effectiveIntent = options.intentRow.intent === 'pass' ? 'speak' : options.intentRow.intent;

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
    const result = await provider.chatMember({
      query: roundPrompt,
      storeName: effectiveStoreName,
      knowledgeRetriever: createKnowledgeRetriever(options.ctx, options.memberId),
      memoryHint: undefined,
      kbDigests: toKBDigestHints(kbDigests),
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
      status: 'sent',
      answer: result.answer,
      intent: effectiveIntent,
      targetMemberId: options.intentRow.targetMemberId,
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
      targetMemberId: options.intentRow.targetMemberId,
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

  if (normalizeHallMode(conversation) !== 'roundtable') {
    throw new Error('Conversation is not in roundtable mode');
  }

  const state = await getRoundtableState(ctx, args.conversationId);

  if (!state || state.round.roundNumber !== args.roundNumber) {
    throw new Error('Round not found');
  }

  if (state.round.status !== 'awaiting_user' && state.round.status !== 'in_progress') {
    throw new Error('Round is not open for speaking');
  }

  const selectedRows = state.intents.filter((row) => row.selected);

  if (selectedRows.length === 0) {
    return { results: [] };
  }

  const [participants, membersById, activeMessages, allMessages] = await Promise.all([
    listActiveParticipants(ctx, args.conversationId),
    loadActiveMembersMap(ctx),
    listActiveMessages(ctx, args.conversationId),
    listAllMessages(ctx, args.conversationId),
  ]);

  const activeMembers = participants
    .map((row) => membersById.get(row.memberId as string))
    .filter((item): item is MemberListRow => Boolean(item));

  const latestUserMessage = [...allMessages]
    .reverse()
    .find((message) => message.role === 'user' && message.status !== 'error');

  const results = await Promise.all(
    selectedRows.map((intentRow) =>
      runRoundtableSpeakerContribution({
        ctx,
        conversationId: args.conversationId,
        roundNumber: args.roundNumber,
        memberId: intentRow.memberId,
        intentRow,
        membersById,
        activeMessages,
        latestUserMessage,
        activeMembers,
        retrievalModel: args.retrievalModel,
        chatModel: args.chatModel,
      })
    )
  );

  return { results };
}
