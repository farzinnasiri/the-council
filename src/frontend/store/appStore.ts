import { create } from 'zustand';
import type {
  Conversation,
  ConversationMemoryLog,
  ConversationType,
  Member,
  Message,
  MessageRouting,
  RoundtableState,
  ThemeMode,
} from '../types/domain';
import {
  COMPACTION_POLICY_DEFAULTS,
  type CompactionPolicy,
} from '../constants/compactionPolicy';
import { convexRepository as councilRepository } from '../repository/ConvexCouncilRepository';
import {
  chatWithMember,
  chatRoundtableSpeaker,
  compactConversation,
  createKbDocumentRecord,
  deleteKbDocument,
  getRoundtableState,
  listKbDocuments,
  markRoundtableCompleted,
  markRoundtableInProgress,
  prepareRoundtableRound,
  retryKbDocumentIndexing,
  retryKbDocumentMetadata,
  routeHallMembers,
  suggestChamberTitle,
  setRoundtableSelections,
  startKbDocumentProcessing,
  suggestHallTitle,
  uploadFileToConvexStorage,
} from '../lib/aiClient';
import { routeToMembers } from '../lib/mockRouting';
import type { KbDocumentLifecycle } from '../repository/CouncilRepository';

interface CreateMemberPayload {
  name: string;
  systemPrompt: string;
  specialties?: string[];
}

interface AppState {
  hydrated: boolean;
  isRouting: boolean;
  routingConversationId?: string;
  themeMode: ThemeMode;
  members: Member[];
  conversations: Conversation[];
  messages: Message[];
  selectedConversationId: string;
  pendingReplyCount: Record<string, number>;
  pendingReplyMemberIds: Record<string, string[]>;
  compactionCheckInFlightByConversation: Record<string, boolean>;
  memberDocuments: Record<string, Array<{ name?: string; displayName?: string }>>;
  kbDocumentsByMember: Record<string, KbDocumentLifecycle[]>;
  kbUploadProgressByMember: Record<string, Array<{ localId: string; fileName: string; loaded: number; total: number; progress: number }>>;
  kbDeletingDocumentIds: Record<string, boolean>;
  kbRetryingIndexDocumentIds: Record<string, boolean>;
  kbRetryingMetadataDocumentIds: Record<string, boolean>;
  chamberMemoryByConversation: Record<string, string>;
  hallParticipantsByConversation: Record<string, string[]>;
  roundtableStateByConversation: Record<string, RoundtableState | null>;
  roundtablePreparingByConversation: Record<string, boolean>;
  hallSummaryFailureCountByConversation: Record<string, number>;
  messagePaginationByConversation: Record<
    string,
    {
      oldestLoadedAt?: number;
      hasOlder: boolean;
      isLoadingOlder: boolean;
    }
  >;
  compactionPolicy: CompactionPolicy;

  initializeApp: () => Promise<void>;
  refreshCompactionPolicy: () => Promise<CompactionPolicy>;
  selectConversation: (conversationId: string) => void;
  loadMessages: (conversationId: string) => Promise<void>;
  loadOlderMessages: (conversationId: string) => Promise<void>;
  refreshHallParticipants: (conversationId: string) => Promise<void>;
  syncHallRoundSummaries: (conversationId: string) => Promise<void>;
  evaluateChamberCompactionOnLoad: (conversationId: string) => Promise<void>;
  createConversation: (type: ConversationType) => Promise<Conversation>;
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  archiveConversation: (conversationId: string) => Promise<void>;
  createChamberThread: (memberId: string) => Promise<Conversation>;
  listChamberThreadsForMember: (memberId: string) => Conversation[];
  getLatestChamberThreadForMember: (memberId: string) => Conversation | undefined;
  sendHallDraftMessage: (
    text: string,
    hallMode?: 'advisory' | 'roundtable',
    routingMode?: 'auto' | 'manual',
    manualMemberIds?: string[]
  ) => Promise<Conversation>;
  sendMessageToChamberMember: (memberId: string, text: string) => Promise<Conversation>;
  sendUserMessage: (conversationId: string, text: string, mentionedMemberIds?: string[]) => Promise<void>;
  generateDeterministicReplies: (
    conversationId: string,
    text: string,
    mentionedMemberIds?: string[],
    routingOverride?: {
      mode: 'auto' | 'manual';
      memberIds?: string[];
    }
  ) => Promise<void>;
  refreshRoundtableState: (conversationId: string) => Promise<void>;
  setRoundtableSelectedSpeakers: (
    conversationId: string,
    roundNumber: number,
    selectedMemberIds: string[]
  ) => Promise<void>;
  startRoundtableRound: (conversationId: string) => Promise<void>;
  continueRoundtableRound: (conversationId: string) => Promise<void>;
  addMemberToConversation: (conversationId: string, memberId: string) => Promise<void>;
  removeMemberFromConversation: (conversationId: string, memberId: string) => Promise<void>;
  clearChamberByMember: (memberId: string) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  createMember: (payload: CreateMemberPayload) => Promise<Member>;
  updateMember: (memberId: string, patch: Partial<CreateMemberPayload>) => Promise<Member>;
  archiveMember: (memberId: string) => Promise<void>;
  uploadDocsForMember: (memberId: string, files: File[]) => Promise<void>;
  fetchDocsForMember: (memberId: string) => Promise<void>;
  hydrateMemberDocuments: () => Promise<void>;
  deleteDocForMember: (memberId: string, kbDocumentId: string) => Promise<{ ok: boolean; error?: string }>;
  retryKbDocumentIndexForMember: (memberId: string, kbDocumentId: string) => Promise<{ ok: boolean; error?: string }>;
  retryKbDocumentMetadataForMember: (memberId: string, kbDocumentId: string) => Promise<{ ok: boolean; error?: string }>;
}

type BuildMessageInput = Omit<Message, 'id' | 'createdAt' | 'compacted'>;
type ConversationPatch = Partial<Conversation> | ((conversation: Conversation) => Conversation);
type ConversationStateSlice = Pick<AppState, 'conversations'>;

function buildMessage(input: BuildMessageInput): Message {
  return {
    ...input,
    id: `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    compacted: false,
    createdAt: Date.now(),
  };
}

function patchConversationEverywhere(
  state: ConversationStateSlice,
  conversationId: string,
  patch: ConversationPatch
): ConversationStateSlice {
  const conversations = state.conversations.map((item) => {
    if (item.id !== conversationId) return item;
    return typeof patch === 'function' ? patch(item) : { ...item, ...patch };
  });
  return { conversations };
}

function updateConversationStamp(
  state: ConversationStateSlice,
  conversationId: string,
  includeMessageActivity = false
): ConversationStateSlice {
  const now = Date.now();
  return patchConversationEverywhere(state, conversationId, {
    updatedAt: now,
    ...(includeMessageActivity ? { lastMessageAt: now } : {}),
  });
}

function listChamberThreadsForMember(
  conversations: Conversation[],
  memberId: string
): Conversation[] {
  return conversations
    .filter(
      (conversation) =>
        conversation.kind === 'chamber' &&
        conversation.chamberMemberId === memberId &&
        !conversation.deletedAt
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function getLatestChamberThreadForMember(
  conversations: Conversation[],
  memberId: string
): Conversation | undefined {
  return listChamberThreadsForMember(conversations, memberId)[0];
}

function buildMemberContextWindow(
  messages: Message[],
  conversationId: string,
  memberId: string,
  conversationKind: Conversation['kind'],
  membersById: Map<string, Member>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const filtered = messages
    .filter((msg) => {
      if (msg.conversationId !== conversationId) return false;
      if (msg.compacted) return false;
      if (msg.role === 'system') return false;
      if (msg.status === 'error') return false;
      if (msg.role === 'user') return true;
      if (msg.role === 'member') {
        return true;
      }
      return false;
    });

  const scoped = conversationKind === 'hall' ? filtered : filtered.slice(-12);

  return scoped
    .map((msg) => {
      if (msg.role === 'user') {
        return {
          role: 'user' as const,
          content: msg.content,
        };
      }
      if (conversationKind === 'hall') {
        const authorName = msg.authorMemberId
          ? (membersById.get(msg.authorMemberId)?.name ?? 'Member')
          : 'Member';
        const selfTag = msg.authorMemberId === memberId ? ' (you)' : '';
        return {
          role: 'assistant' as const,
          content: `${authorName}${selfTag}: ${msg.content}`,
        };
      }
      return {
        role: 'assistant' as const,
        content: msg.content,
      };
    });
}

function buildHallSystemContext(
  member: Member,
  activeParticipants: Member[],
  rawMessages: Message[],
  roundSummaries: string[],
  hallMode: 'advisory' | 'roundtable',
  conversationId: string,
): string {
  const presentMemberNames = activeParticipants.map((m) => m.name);
  const otherNames = activeParticipants.filter((m) => m.id !== member.id).map((m) => m.name);

  const latestInteractions = rawMessages
    .filter(
      (msg) =>
        msg.conversationId === conversationId &&
        !msg.compacted &&
        msg.role !== 'system' &&
        msg.status !== 'error'
    )
    .slice(-10)
    .map((msg) => {
      const author =
        msg.role === 'user'
          ? 'User'
          : (activeParticipants.find((m) => m.id === msg.authorMemberId)?.name ?? 'Member');
      return `${author}: ${msg.content}`;
    });

  const modeLine =
    hallMode === 'roundtable'
      ? 'Mode: roundtable (selected speakers contribute each round).'
      : 'Mode: advisory (multiple members respond to the same user turn).';

  return [
    '[Hall Deliberation Context]',
    'You are participating in a live council discussion.',
    modeLine,
    `Participants: ${presentMemberNames.join(', ') || member.name}.`,
    `Other members currently present: ${otherNames.join(', ') || 'none'}.`,
    '',
    '[Completed Round Summaries]',
    roundSummaries.length > 0 ? roundSummaries.join('\n\n') : '(none yet)',
    '',
    '[Latest Interactions]',
    latestInteractions.length > 0 ? latestInteractions.join('\n') : '(none yet)',
    '',
    '[Response Rules]',
    'Use the context above to align with the ongoing discussion.',
    "Do not prefix your reply with your name or any speaker label (for example, do not write 'Name:').",
    'Give one concise contribution for this turn unless the user explicitly asks for detailed elaboration.',
  ].join('\n');
}

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

function selectOpeningRoundMembers(intents: RoundtableState['intents']): string[] {
  const nonPass = intents.filter((intent) => intent.intent !== 'pass').map((intent) => intent.memberId);
  if (nonPass.length > 0) return nonPass;
  return intents.map((intent) => intent.memberId);
}

function buildHallRoundAssignments(
  messages: Message[],
  conversationId: string,
  hallMode?: 'advisory' | 'roundtable'
): Map<string, number> {
  const ordered = messages
    .filter((msg) => msg.conversationId === conversationId && !msg.compacted && msg.status !== 'error')
    .sort((a, b) => a.createdAt - b.createdAt);

  if (hallMode === 'roundtable') {
    const assignments = new Map<string, number>();
    let fallbackRound = 0;

    for (const msg of ordered) {
      if (msg.role === 'system') continue;
      if (typeof msg.roundNumber === 'number') {
        assignments.set(msg.id, msg.roundNumber);
        fallbackRound = Math.max(fallbackRound, msg.roundNumber);
        continue;
      }
      if (msg.role === 'user') {
        fallbackRound += 1;
        assignments.set(msg.id, Math.max(1, fallbackRound));
        continue;
      }
      assignments.set(msg.id, Math.max(1, fallbackRound || 1));
    }

    return assignments;
  }

  const assignments = new Map<string, number>();
  let currentUserRound = 0;
  for (const msg of ordered) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user') {
      currentUserRound += 1;
      assignments.set(msg.id, currentUserRound);
      continue;
    }

    const explicitRound = typeof msg.roundNumber === 'number' ? msg.roundNumber : undefined;
    const fallbackRound = currentUserRound > 0 ? currentUserRound : 1;
    assignments.set(msg.id, explicitRound ?? fallbackRound);
  }

  return assignments;
}

function buildHallRoundAwareContext(options: {
  messages: Message[];
  conversationId: string;
  hallMemoryLogs: ConversationMemoryLog[];
  rawRoundTail: number;
  hallMode?: 'advisory' | 'roundtable';
}) {
  const assignments = buildHallRoundAssignments(options.messages, options.conversationId, options.hallMode);
  const maxRound = Math.max(0, ...Array.from(assignments.values()));
  const firstRawRound = Math.max(1, maxRound - Math.max(1, options.rawRoundTail) + 1);

  const rawMessages = options.messages.filter((msg) => {
    if (msg.conversationId !== options.conversationId) return false;
    if (msg.compacted || msg.status === 'error' || msg.role === 'system') return false;
    const round = assignments.get(msg.id);
    if (typeof round !== 'number') return true;
    return round >= firstRawRound;
  });

  const roundSummaries = options.hallMemoryLogs
    .filter((row) => row.scope === 'hall' && typeof row.roundNumber === 'number' && row.roundNumber < firstRawRound)
    .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0))
    .map((row) => row.memory?.trim())
    .filter((row): row is string => Boolean(row));

  return {
    roundAssignments: assignments,
    maxRound,
    firstRawRound,
    rawMessages,
    roundSummaries,
  };
}

async function maybeCompact(
  conversationId: string,
  conversation: Conversation,
  compactionPolicy: CompactionPolicy,
  previousMemory?: string,
  memoryContext?: {
    memberName: string;
    memberSpecialties: string[];
  }
): Promise<{ summary: string; activeMessages: Message[] } | null> {
  if (conversation.kind !== 'chamber') {
    return null;
  }

  const persistedActiveMessages = await councilRepository.listMessages(conversationId);
  const persistedActiveChatMessages = persistedActiveMessages.filter(
    (m) => m.role !== 'system'
  );

  if (persistedActiveChatMessages.length < compactionPolicy.threshold) {
    return null;
  }

  const [counts, latestLog] = await Promise.all([
    councilRepository.getMessageCounts(conversationId),
    councilRepository.getLatestChamberMemoryLog(conversationId),
  ]);
  const sinceLastLog = latestLog
    ? Math.max(0, counts.totalNonSystem - latestLog.totalMessagesAtRun)
    : counts.totalNonSystem;
  if (sinceLastLog < compactionPolicy.threshold) {
    return null;
  }

  const foldableCount = Math.max(0, persistedActiveChatMessages.length - compactionPolicy.recentRawTail);
  if (foldableCount === 0) {
    return null;
  }

  const toCompact = persistedActiveChatMessages.slice(0, foldableCount);

  const contextMsgs = toCompact.map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }));

  const result = await compactConversation({
    conversationId,
    previousSummary: previousMemory,
    messages: contextMsgs,
    messageIds: toCompact.map((m) => m.id),
    memoryScope: 'chamber',
    memoryContext: memoryContext
      ? {
        conversationId,
        memberName: memoryContext.memberName,
        memberSpecialties: memoryContext.memberSpecialties,
      }
      : undefined,
  });

  await councilRepository.applyCompaction(
    conversationId,
    result.summary,
    toCompact.map((m) => m.id),
    compactionPolicy.recentRawTail
  );

  const activeMessages = await councilRepository.listMessages(conversationId);
  return { summary: result.summary, activeMessages };
}

function lifecycleToMemberDocuments(rows: KbDocumentLifecycle[]): Array<{ name?: string; displayName?: string }> {
  return rows
    .filter((row) => row.indexingStatus === 'completed')
    .map((row) => ({
      name: row.kbDocumentName,
      displayName: row.displayName,
    }));
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  isRouting: false,
  routingConversationId: undefined,
  themeMode: 'system',
  members: [],
  conversations: [],
  messages: [],
  selectedConversationId: '',
  pendingReplyCount: {},
  pendingReplyMemberIds: {},
  compactionCheckInFlightByConversation: {},
  memberDocuments: {},
  kbDocumentsByMember: {},
  kbUploadProgressByMember: {},
  kbDeletingDocumentIds: {},
  kbRetryingIndexDocumentIds: {},
  kbRetryingMetadataDocumentIds: {},
  chamberMemoryByConversation: {},
  hallParticipantsByConversation: {},
  roundtableStateByConversation: {},
  roundtablePreparingByConversation: {},
  hallSummaryFailureCountByConversation: {},
  messagePaginationByConversation: {},
  compactionPolicy: COMPACTION_POLICY_DEFAULTS,

  refreshCompactionPolicy: async () => {
    const policy = await councilRepository.getCompactionPolicy();
    set({ compactionPolicy: policy });
    return policy;
  },

  initializeApp: async () => {
    await councilRepository.init();
    const [snapshot, policy] = await Promise.all([
      councilRepository.getSnapshot(),
      councilRepository.getCompactionPolicy(),
    ]);

    const conversations = snapshot.conversations
      .filter((item) => !item.deletedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const firstHall = conversations.find((item) => item.kind === 'hall');

    set({
      hydrated: true,
      themeMode: snapshot.themeMode,
      members: snapshot.members,
      conversations,
      chamberMemoryByConversation: {},
      roundtableStateByConversation: {},
      roundtablePreparingByConversation: {},
      compactionPolicy: policy,
      selectedConversationId: firstHall?.id ?? '',
    });

    const hallIds = conversations.filter((item) => item.kind === 'hall').map((item) => item.id);
    await Promise.all(hallIds.map((conversationId) => get().refreshHallParticipants(conversationId)));
    await Promise.all(
      conversations
        .filter((item) => item.kind === 'hall' && item.hallMode === 'roundtable')
        .map((item) => get().refreshRoundtableState(item.id))
    );

    if (firstHall) {
      await get().loadMessages(firstHall.id);
    }

    void get().hydrateMemberDocuments();
  },

  selectConversation: (conversationId) => {
    set({ selectedConversationId: conversationId });
    const already = get().messages.some((m) => m.conversationId === conversationId);
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (conversation?.kind === 'hall' && conversation.hallMode === 'roundtable') {
      void get().refreshRoundtableState(conversationId);
    }
    if (!already) {
      void get().loadMessages(conversationId);
    }
  },

  loadMessages: async (conversationId) => {
    const page = await councilRepository.listMessagesPage(conversationId, { limit: 40 });
    const msgs = page.messages;
    set((state) => ({
      messages: [
        ...state.messages.filter((m) => m.conversationId !== conversationId),
        ...msgs.sort((a, b) => a.createdAt - b.createdAt),
      ],
      messagePaginationByConversation: {
        ...state.messagePaginationByConversation,
        [conversationId]: {
          oldestLoadedAt: msgs[0]?.createdAt,
          hasOlder: page.hasMore,
          isLoadingOlder: false,
        },
      },
    }));
    void get().evaluateChamberCompactionOnLoad(conversationId);
    void get().refreshRoundtableState(conversationId);
  },

  loadOlderMessages: async (conversationId) => {
    const pagination = get().messagePaginationByConversation[conversationId];
    if (!pagination || pagination.isLoadingOlder || !pagination.hasOlder || !pagination.oldestLoadedAt) {
      return;
    }

    set((state) => ({
      messagePaginationByConversation: {
        ...state.messagePaginationByConversation,
        [conversationId]: {
          ...pagination,
          isLoadingOlder: true,
        },
      },
    }));

    try {
      const page = await councilRepository.listMessagesPage(conversationId, {
        beforeCreatedAt: pagination.oldestLoadedAt,
        limit: 30,
      });

      set((state) => {
        const existing = state.messages.filter((m) => m.conversationId === conversationId);
        const keepOther = state.messages.filter((m) => m.conversationId !== conversationId);
        const combined = [...page.messages, ...existing].sort((a, b) => a.createdAt - b.createdAt);
        const deduped = combined.filter((message, index, list) => list.findIndex((m) => m.id === message.id) === index);
        return {
          messages: [...keepOther, ...deduped],
          messagePaginationByConversation: {
            ...state.messagePaginationByConversation,
            [conversationId]: {
              oldestLoadedAt: deduped[0]?.createdAt,
              hasOlder: page.hasMore,
              isLoadingOlder: false,
            },
          },
        };
      });
    } catch {
      set((state) => ({
        messagePaginationByConversation: {
          ...state.messagePaginationByConversation,
          [conversationId]: {
            ...state.messagePaginationByConversation[conversationId],
            isLoadingOlder: false,
          },
        },
      }));
    }
  },

  evaluateChamberCompactionOnLoad: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'chamber') return;
    if (get().compactionCheckInFlightByConversation[conversationId]) return;

    set((state) => ({
      compactionCheckInFlightByConversation: {
        ...state.compactionCheckInFlightByConversation,
        [conversationId]: true,
      },
    }));

    try {
      const [policy, counts, latestLog] = await Promise.all([
        councilRepository.getCompactionPolicy(),
        councilRepository.getMessageCounts(conversationId),
        councilRepository.getLatestChamberMemoryLog(conversationId),
      ]);
      set({ compactionPolicy: policy });
      const latestMemory = latestLog?.memory;
      if (latestMemory) {
        set((state) => ({
          chamberMemoryByConversation: {
            ...state.chamberMemoryByConversation,
            [conversationId]: latestMemory,
          },
        }));
      }
      const sinceLastLog = latestLog
        ? Math.max(0, counts.totalNonSystem - latestLog.totalMessagesAtRun)
        : counts.totalNonSystem;
      const foldableCount = Math.max(0, counts.activeNonSystem - policy.recentRawTail);
      const shouldCompact =
        counts.activeNonSystem >= policy.threshold &&
        sinceLastLog >= policy.threshold &&
        foldableCount > 0;

      if (!shouldCompact) return;

      const membersMap = new Map(get().members.map((m) => [m.id, m]));
      const chamberMemoryContext = conversation.chamberMemberId
        ? {
          memberName: membersMap.get(conversation.chamberMemberId)?.name ?? 'Member',
          memberSpecialties: membersMap.get(conversation.chamberMemberId)?.specialties ?? [],
        }
        : undefined;

      const compacted = await maybeCompact(
        conversationId,
        conversation,
        policy,
        latestLog?.memory ?? get().chamberMemoryByConversation[conversationId],
        chamberMemoryContext
      );
      if (!compacted) return;

      set((state) => ({
        ...patchConversationEverywhere(state, conversationId, { updatedAt: Date.now() }),
        chamberMemoryByConversation: {
          ...state.chamberMemoryByConversation,
          [conversationId]: compacted.summary,
        },
        messages: [
          ...state.messages.filter((item) => item.conversationId !== conversationId),
          ...compacted.activeMessages,
        ],
      }));
    } catch (error) {
      void error;
    } finally {
      set((state) => ({
        compactionCheckInFlightByConversation: {
          ...state.compactionCheckInFlightByConversation,
          [conversationId]: false,
        },
      }));
    }
  },

  refreshRoundtableState: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall' || conversation.hallMode !== 'roundtable') {
      return;
    }

    const state = await getRoundtableState(conversationId);
    set((current) => ({
      roundtableStateByConversation: {
        ...current.roundtableStateByConversation,
        [conversationId]: state,
      },
    }));
  },

  setRoundtableSelectedSpeakers: async (conversationId, roundNumber, selectedMemberIds) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall' || conversation.hallMode !== 'roundtable') {
      return;
    }

    const next = await setRoundtableSelections({
      conversationId,
      roundNumber,
      selectedMemberIds,
    });

    set((state) => ({
      roundtableStateByConversation: {
        ...state.roundtableStateByConversation,
        [conversationId]: next,
      },
    }));
  },

  continueRoundtableRound: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall' || conversation.hallMode !== 'roundtable') {
      return;
    }
    const snapshot = get().roundtableStateByConversation[conversationId];
    if (snapshot && (snapshot.round.status === 'awaiting_user' || snapshot.round.status === 'in_progress')) {
      return;
    }

    set((state) => ({
      roundtablePreparingByConversation: {
        ...state.roundtablePreparingByConversation,
        [conversationId]: true,
      },
    }));

    try {
      const next = await prepareRoundtableRound({
        conversationId,
        trigger: 'continue',
      });

      set((state) => ({
        roundtableStateByConversation: {
          ...state.roundtableStateByConversation,
          [conversationId]: next,
        },
      }));
    } finally {
      set((state) => ({
        roundtablePreparingByConversation: {
          ...state.roundtablePreparingByConversation,
          [conversationId]: false,
        },
      }));
    }
  },

  startRoundtableRound: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall' || conversation.hallMode !== 'roundtable') {
      return;
    }

    const snapshot = get().roundtableStateByConversation[conversationId];
    if (!snapshot || snapshot.round.status !== 'awaiting_user') {
      return;
    }

    const roundNumber = snapshot.round.roundNumber;
    const selected = snapshot.intents
      .filter((item) => item.selected)
      .map((item) => item.memberId);

    if (selected.length === 0) {
      return;
    }

    const inProgress = await markRoundtableInProgress({
      conversationId,
      roundNumber,
    });

    set((state) => ({
      roundtableStateByConversation: {
        ...state.roundtableStateByConversation,
        [conversationId]: inProgress,
      },
      pendingReplyCount: {
        ...state.pendingReplyCount,
        [conversationId]: selected.length,
      },
      pendingReplyMemberIds: {
        ...state.pendingReplyMemberIds,
        [conversationId]: selected,
      },
    }));

    try {
      const membersById = new Map(get().members.map((member) => [member.id, member]));
      await Promise.all(
        selected.map(async (memberId) => {
          const memberName = membersById.get(memberId)?.name ?? 'Member';
          let reply: Message;

          try {
            const result = await chatRoundtableSpeaker({
              conversationId,
              roundNumber,
              memberId,
            });
            reply = buildMessage({
              conversationId,
              role: 'member',
              authorMemberId: memberId,
              content: stripLeadingSpeakerLabel(result.answer, memberName),
              status: 'sent',
              roundNumber,
              roundIntent: result.intent,
              roundTargetMemberId: result.targetMemberId,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Request failed';
            reply = buildMessage({
              conversationId,
              role: 'member',
              authorMemberId: memberId,
              content: `${memberName} could not speak in this round.`,
              status: 'error',
              roundNumber,
              error: errorMessage,
            });
          }

          set((state) => ({
            messages: [...state.messages, reply],
            ...updateConversationStamp(state, conversationId, true),
            pendingReplyCount: {
              ...state.pendingReplyCount,
              [conversationId]: Math.max(0, (state.pendingReplyCount[conversationId] ?? 1) - 1),
            },
            pendingReplyMemberIds: {
              ...state.pendingReplyMemberIds,
              [conversationId]: (state.pendingReplyMemberIds[conversationId] ?? []).filter((id) => id !== memberId),
            },
          }));

          await councilRepository.appendMessages({
            conversationId,
            messages: [reply],
          });
        })
      );

      await markRoundtableCompleted({
        conversationId,
        roundNumber,
      });
      set((state) => ({
        roundtableStateByConversation: {
          ...state.roundtableStateByConversation,
          [conversationId]: null,
        },
      }));
      void get().syncHallRoundSummaries(conversationId);
    } catch (error) {
      await get().refreshRoundtableState(conversationId);
    } finally {
      set((state) => ({
        pendingReplyCount: {
          ...state.pendingReplyCount,
          [conversationId]: 0,
        },
        pendingReplyMemberIds: {
          ...state.pendingReplyMemberIds,
          [conversationId]: [],
        },
      }));
    }
  },

  refreshHallParticipants: async (conversationId) => {
    const participants = await councilRepository.listParticipants(conversationId);
    set((state) => ({
      hallParticipantsByConversation: {
        ...state.hallParticipantsByConversation,
        [conversationId]: participants.map((participant) => participant.memberId),
      },
    }));
  },

  syncHallRoundSummaries: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall') return;

    const state = get();
    const sourceMessages = state.messages
      .filter(
        (message) =>
          message.conversationId === conversationId &&
          !message.compacted &&
          message.status !== 'error' &&
          message.role !== 'system'
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    if (sourceMessages.length === 0) return;

    const assignments = buildHallRoundAssignments(
      sourceMessages,
      conversationId,
      conversation.hallMode ?? 'advisory'
    );
    const maxRound = Math.max(0, ...Array.from(assignments.values()));
    const rawTail = Math.max(1, state.compactionPolicy.hallRawRoundTail);
    const summarizeUntilRound = maxRound - rawTail;
    if (summarizeUntilRound <= 0) return;

    const [existingLogs, counts] = await Promise.all([
      councilRepository.listMemoryLogsByScope(conversationId, 'hall'),
      councilRepository.getMessageCounts(conversationId),
    ]);

    const existingRounds = new Set(
      existingLogs
        .filter((row) => typeof row.roundNumber === 'number' && row.memory)
        .map((row) => row.roundNumber as number)
    );
    const membersById = new Map(get().members.map((member) => [member.id, member]));

    for (let roundNumber = 1; roundNumber <= summarizeUntilRound; roundNumber += 1) {
      if (existingRounds.has(roundNumber)) continue;

      const roundMessages = sourceMessages.filter((message) => assignments.get(message.id) === roundNumber);
      const speakerMessages = roundMessages.filter((message) => message.role === 'member');
      if (speakerMessages.length === 0) continue;

      const transcript = roundMessages.map((message) => ({
        author:
          message.role === 'user'
            ? 'User'
            : (membersById.get(message.authorMemberId ?? '')?.name ?? 'Member'),
        content: message.content,
      }));

      try {
        const summarized = await councilRepository.summarizeHallRound({
          conversationId,
          roundNumber,
          messages: transcript,
        });

        await councilRepository.upsertHallRoundSummary({
          conversationId,
          roundNumber,
          memory: summarized.summary,
          recentRawTail: rawTail,
          totalMessagesAtRun: counts.totalNonSystem,
          activeMessagesAtRun: counts.activeNonSystem,
          compactedMessageCount: roundMessages.length,
        });
      } catch {
        // Non-fatal: round context can fall back to raw tail when summary generation fails.
        set((current) => ({
          hallSummaryFailureCountByConversation: {
            ...current.hallSummaryFailureCountByConversation,
            [conversationId]: (current.hallSummaryFailureCountByConversation[conversationId] ?? 0) + 1,
          },
        }));
      }
    }
  },

  createConversation: async (type) => {
    if (type !== 'hall') {
      throw new Error('Use createChamberThread for chamber conversations');
    }

    const created = await councilRepository.createHall({
      title: 'New Hall',
      memberIds: [],
    });

    set((state) => ({
      conversations: [created, ...state.conversations],
      selectedConversationId: created.id,
      hallParticipantsByConversation: {
        ...state.hallParticipantsByConversation,
        [created.id]: [],
      },
    }));

    return created;
  },

  renameConversation: async (conversationId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const updated = await councilRepository.renameConversation(conversationId, trimmed);
    set((state) => ({
      conversations: state.conversations.map((item) =>
        item.id === conversationId ? updated : item
      ),
    }));
  },

  archiveConversation: async (conversationId) => {
    await councilRepository.archiveConversation(conversationId);
    set((state) => {
      const nextConversations = state.conversations.filter((item) => item.id !== conversationId);
      const { [conversationId]: _removed, ...nextParticipants } = state.hallParticipantsByConversation;
      const { [conversationId]: _removedRoundtable, ...nextRoundtable } = state.roundtableStateByConversation;
      const { [conversationId]: _removedPreparing, ...nextPreparing } = state.roundtablePreparingByConversation;
      return {
        conversations: nextConversations,
        hallParticipantsByConversation: nextParticipants,
        roundtableStateByConversation: nextRoundtable,
        roundtablePreparingByConversation: nextPreparing,
        selectedConversationId:
          state.selectedConversationId === conversationId
            ? (nextConversations[0]?.id ?? '')
            : state.selectedConversationId,
      };
    });
  },

  createChamberThread: async (memberId) => {
    const created = await councilRepository.createChamberThread(memberId);

    set((state) => {
      const exists = state.conversations.some((item) => item.id === created.id);
      return {
        conversations: exists
          ? state.conversations.map((item) => (item.id === created.id ? created : item))
          : [created, ...state.conversations],
        selectedConversationId: created.id,
      };
    });

    return created;
  },

  listChamberThreadsForMember: (memberId) =>
    listChamberThreadsForMember(get().conversations, memberId),
  getLatestChamberThreadForMember: (memberId) =>
    getLatestChamberThreadForMember(get().conversations, memberId),

  sendHallDraftMessage: async (
    text,
    hallMode = 'advisory',
    routingMode: 'auto' | 'manual' = 'auto',
    manualMemberIds: string[] = []
  ) => {
    const created = await councilRepository.createHall({
      title: 'New Hall',
      memberIds: [],
      hallMode,
    });

    set((state) => ({
      conversations: [created, ...state.conversations],
      selectedConversationId: created.id,
      hallParticipantsByConversation: {
        ...state.hallParticipantsByConversation,
        [created.id]: [],
      },
    }));

    await get().sendUserMessage(created.id, text, []);
    // Generate member replies in background so navigation + first bubble feel immediate.
    void get().generateDeterministicReplies(created.id, text, [], {
      mode: routingMode,
      memberIds: manualMemberIds,
    });
    // Generate a smarter hall title from the first user message without blocking UX.
    void suggestHallTitle({ message: text })
      .then((result) => {
        const nextTitle = result.title?.trim();
        if (!nextTitle || nextTitle.toLowerCase() === 'new hall') return;
        return get().renameConversation(created.id, nextTitle);
      })
      .catch(() => undefined);

    return created;
  },

  sendMessageToChamberMember: async (memberId, text) => {
    let conversation = getLatestChamberThreadForMember(get().conversations, memberId);
    if (!conversation) {
      conversation = await councilRepository.createChamberThread(memberId);
      set((state) => {
        const exists = state.conversations.some((item) => item.id === conversation!.id);
        return {
          conversations: exists
            ? state.conversations.map((item) => (item.id === conversation!.id ? conversation! : item))
            : [conversation!, ...state.conversations],
          selectedConversationId: conversation!.id,
        };
      });
    }

    await get().sendUserMessage(conversation.id, text);
    await get().generateDeterministicReplies(conversation.id, text);

    return conversation;
  },

  sendUserMessage: async (conversationId, text, mentionedMemberIds = []) => {
    const state = get();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    const shouldAutoTitle =
      conversation.kind === 'chamber' &&
      conversation.title.trim().toLowerCase() === 'new thread' &&
      !conversation.lastMessageAt;
    const nextAdvisoryUserRound =
      state.messages.filter(
        (msg) =>
          msg.conversationId === conversationId &&
          msg.role === 'user' &&
          msg.status !== 'error' &&
          !msg.compacted
      ).length + 1;
    const maxExplicitRound = Math.max(
      0,
      ...state.messages
        .filter(
          (msg) =>
            msg.conversationId === conversationId &&
            msg.status !== 'error' &&
            !msg.compacted &&
            typeof msg.roundNumber === 'number'
        )
        .map((msg) => msg.roundNumber as number)
    );
    const snapshotRound = state.roundtableStateByConversation[conversationId]?.round.roundNumber ?? 0;
    const hallRoundNumber =
      conversation.kind === 'hall'
        ? conversation.hallMode === 'roundtable'
          ? Math.max(0, maxExplicitRound, snapshotRound) + 1
          : Math.max(1, nextAdvisoryUserRound)
        : undefined;
    const message = buildMessage({
      conversationId,
      role: 'user',
      content: text,
      status: 'sent',
      roundNumber: hallRoundNumber,
    });

    set((state) => ({
      messages: [...state.messages, message],
      ...updateConversationStamp(state, conversationId, true),
    }));

    await councilRepository.appendMessages({
      conversationId,
      messages: [message],
    });

    if (shouldAutoTitle) {
      void suggestChamberTitle({ message: text })
        .then((result) => {
          const nextTitle = result.title?.trim();
          if (!nextTitle || nextTitle.toLowerCase() === 'new thread') return;
          const latest = get().conversations.find((item) => item.id === conversationId);
          if (!latest || latest.kind !== 'chamber' || latest.deletedAt) return;
          if (latest.title.trim().toLowerCase() !== 'new thread') return;
          return get().renameConversation(conversationId, nextTitle);
        })
        .catch(() => undefined);
    }
  },

  generateDeterministicReplies: async (
    conversationId,
    text,
    mentionedMemberIds = [],
    routingOverride = { mode: 'auto' as const, memberIds: [] }
  ) => {
    const state = get();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    const currentHallRoundNumber =
      conversation.kind === 'hall'
        ? Math.max(
          1,
          state.messages.filter(
            (message) =>
              message.conversationId === conversationId &&
              message.role === 'user' &&
              message.status !== 'error' &&
              !message.compacted
          ).length
        )
        : undefined;

    if (conversation.kind === 'hall' && conversation.hallMode === 'roundtable') {
      const membersMap = new Map(state.members.map((m) => [m.id, m]));
      const participantIds = state.hallParticipantsByConversation[conversationId] ?? [];
      let activeParticipantIds = participantIds.filter((memberId) => {
        const member = membersMap.get(memberId);
        return Boolean(member && !member.deletedAt);
      });
      const isOpeningRound = activeParticipantIds.length === 0;

      if (isOpeningRound) {
        const candidates = state.members.filter((member) => !member.deletedAt);
        let routedIds: string[] = [];
        let routingSource: MessageRouting['source'] = 'fallback';

        if (routingOverride.mode === 'manual') {
          const allowed = new Set(candidates.map((member) => member.id));
          routedIds = (routingOverride.memberIds ?? []).filter((memberId) => allowed.has(memberId));
        } else {
          set({ isRouting: true, routingConversationId: conversationId });
          try {
            const dynamicMaxSelections = Math.max(1, Math.min(8, Math.ceil(candidates.length * 0.5)));
            const routed = await routeHallMembers({
              message: text,
              conversationId,
              maxSelections: dynamicMaxSelections,
            });
            routedIds = routed.chosenMemberIds;
            routingSource = routed.source;
          } catch {
            routedIds = routeToMembers(text, candidates.map((c) => c.id), conversationId);
            routingSource = 'fallback';
          } finally {
            set({ isRouting: false, routingConversationId: undefined });
          }
        }

        if (routedIds.length === 0 && routingOverride.mode === 'manual') {
          set((current) => ({
            pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: 0 },
            pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: [] },
          }));
          return;
        }

        if (routedIds.length === 0) {
          routedIds = routeToMembers(
            text,
            state.members.filter((member) => !member.deletedAt).map((member) => member.id),
            conversationId
          );
          routingSource = 'fallback';
        }

        await Promise.all(routedIds.map((memberId) => councilRepository.addHallParticipant(conversationId, memberId)));

        activeParticipantIds = routedIds;
        set((current) => ({
          hallParticipantsByConversation: {
            ...current.hallParticipantsByConversation,
            [conversationId]: routedIds,
          },
        }));

        const routeMessage = buildMessage({
          conversationId,
          role: 'system',
          content:
            routingOverride.mode === 'manual'
              ? `Manually routed to ${routedIds.map((id) => membersMap.get(id)?.name ?? id).join(', ')}`
              : `Routed to ${routedIds.map((id) => membersMap.get(id)?.name ?? id).join(', ')}`,
          status: 'sent',
          routing: { memberIds: routedIds, source: routingSource },
        });

        set((current) => ({
          messages: [...current.messages, routeMessage],
          ...updateConversationStamp(current, conversationId, true),
        }));

        await councilRepository.appendMessages({ conversationId, messages: [routeMessage] });
      }

      if (activeParticipantIds.length === 0) {
        set((current) => ({
          pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: 0 },
          pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: [] },
        }));
        return;
      }

      set((current) => ({
        roundtablePreparingByConversation: {
          ...current.roundtablePreparingByConversation,
          [conversationId]: true,
        },
      }));

      try {
        const nextRound = await prepareRoundtableRound({
          conversationId,
          trigger: 'user_message',
          mentionedMemberIds: mentionedMemberIds.filter((memberId) => activeParticipantIds.includes(memberId)),
        });
        let effectiveRound = nextRound;

        if (isOpeningRound) {
          const autoSelectedIds = selectOpeningRoundMembers(nextRound.intents);
          if (autoSelectedIds.length > 0) {
            effectiveRound = await setRoundtableSelections({
              conversationId,
              roundNumber: nextRound.round.roundNumber,
              selectedMemberIds: autoSelectedIds,
            });
          }
        }

        set((current) => ({
          roundtableStateByConversation: {
            ...current.roundtableStateByConversation,
            [conversationId]: effectiveRound,
          },
        }));

        if (
          isOpeningRound &&
          effectiveRound.round.status === 'awaiting_user' &&
          effectiveRound.intents.some((intent) => intent.selected)
        ) {
          void get().startRoundtableRound(conversationId);
        }
      } finally {
        set((current) => ({
          roundtablePreparingByConversation: {
            ...current.roundtablePreparingByConversation,
            [conversationId]: false,
          },
        }));
      }
      return;
    }

    const compactionPolicy = await councilRepository.getCompactionPolicy();
    set({ compactionPolicy });

    const membersMap = new Map(state.members.map((m) => [m.id, m]));
    let chamberMemory =
      conversation.kind === 'chamber'
        ? state.chamberMemoryByConversation[conversationId]
        : undefined;
    if (conversation.kind === 'chamber' && !chamberMemory) {
      const latestLog = await councilRepository.getLatestChamberMemoryLog(conversationId);
      chamberMemory = latestLog?.memory;
      const latestMemory = latestLog?.memory;
      if (latestMemory) {
        set((current) => ({
          chamberMemoryByConversation: {
            ...current.chamberMemoryByConversation,
            [conversationId]: latestMemory,
          },
        }));
      }
    }

    let memberIds: string[] = [];
    let routingSource: MessageRouting['source'] = 'chamber-fixed';

    if (conversation.kind === 'chamber') {
      memberIds = conversation.chamberMemberId ? [conversation.chamberMemberId] : [];
    } else {
      const participantIds = state.hallParticipantsByConversation[conversationId] ?? [];
      const hasRoutedOnce = state.messages.some(
        (message) =>
          message.conversationId === conversationId &&
          message.role === 'system' &&
          Boolean(message.routing)
      );

      if (!hasRoutedOnce) {
        const candidates = state.members.filter((member) => !member.deletedAt);
        if (routingOverride.mode === 'manual') {
          const allowed = new Set(candidates.map((member) => member.id));
          memberIds = (routingOverride.memberIds ?? []).filter((memberId) => allowed.has(memberId));
        } else {
          set({ isRouting: true, routingConversationId: conversationId });
          try {
            const dynamicMaxSelections = Math.max(
              1,
              Math.min(8, Math.ceil(candidates.length * 0.5))
            );
            const routed = await routeHallMembers({
              message: text,
              conversationId,
              maxSelections: dynamicMaxSelections,
            });
            memberIds = routed.chosenMemberIds;
            routingSource = routed.source;
          } catch {
            memberIds = routeToMembers(text, candidates.map((c) => c.id), conversationId);
            routingSource = 'fallback';
          } finally {
            set({ isRouting: false, routingConversationId: undefined });
          }
        }

        if (memberIds.length === 0 && routingOverride.mode === 'manual') {
          set((current) => ({
            pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: 0 },
            pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: [] },
          }));
          return;
        }

        if (memberIds.length === 0) {
          memberIds = routeToMembers(text, state.members.filter((m) => !m.deletedAt).map((m) => m.id), conversationId);
          routingSource = 'fallback';
        }

        const chosenSet = new Set(memberIds);
        const toAdd = memberIds.filter((memberId) => !participantIds.includes(memberId));
        const toRemove = participantIds.filter((memberId) => !chosenSet.has(memberId));
        await Promise.all([
          ...toAdd.map((memberId) => councilRepository.addHallParticipant(conversationId, memberId)),
          ...toRemove.map((memberId) => councilRepository.removeHallParticipant(conversationId, memberId)),
        ]);

        set((current) => ({
          hallParticipantsByConversation: {
            ...current.hallParticipantsByConversation,
            [conversationId]: memberIds,
          },
        }));

        const routeMessage = buildMessage({
          conversationId,
          role: 'system',
          content:
            routingOverride.mode === 'manual'
              ? `Manually routed to ${memberIds.map((id) => membersMap.get(id)?.name ?? id).join(', ')}`
              : `Routed to ${memberIds.map((id) => membersMap.get(id)?.name ?? id).join(', ')}`,
          status: 'sent',
          routing: { memberIds, source: routingSource },
        });

        set((current) => ({
          messages: [...current.messages, routeMessage],
          ...updateConversationStamp(current, conversationId, true),
        }));
        await councilRepository.appendMessages({ conversationId, messages: [routeMessage] });
      } else if (routingOverride.mode === 'manual') {
        const allowed = new Set(
          state.members.filter((member) => !member.deletedAt).map((member) => member.id)
        );
        memberIds = (routingOverride.memberIds ?? []).filter((memberId) => allowed.has(memberId));
        const participantSet = new Set(participantIds);
        const toAdd = memberIds.filter((memberId) => !participantSet.has(memberId));
        if (toAdd.length > 0) {
          await Promise.all(
            toAdd.map((memberId) => councilRepository.addHallParticipant(conversationId, memberId))
          );
          set((current) => ({
            hallParticipantsByConversation: {
              ...current.hallParticipantsByConversation,
              [conversationId]: Array.from(
                new Set([...(current.hallParticipantsByConversation[conversationId] ?? []), ...toAdd])
              ),
            },
          }));
        }
      } else {
        memberIds = participantIds.filter((memberId) => {
          const member = membersMap.get(memberId);
          return Boolean(member && !member.deletedAt);
        });
      }

      if (conversation.hallMode !== 'roundtable' && mentionedMemberIds.length > 0) {
        const mentionedSet = new Set(mentionedMemberIds);
        memberIds = memberIds.filter((memberId) => mentionedSet.has(memberId));
      }
    }

    if (memberIds.length === 0) {
      set((current) => ({
        pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: 0 },
        pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: [] },
      }));
      return;
    }

    set((current) => ({
      pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: memberIds.length },
      pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: memberIds },
    }));
    const hallParticipants = conversation.kind === 'hall'
      ? (state.hallParticipantsByConversation[conversationId] ?? [])
          .map((id) => membersMap.get(id))
          .filter((member): member is Member => Boolean(member && !member.deletedAt))
      : [];
    const hallContextBundle =
      conversation.kind === 'hall'
        ? buildHallRoundAwareContext({
          messages: get().messages,
          conversationId,
          hallMemoryLogs: await councilRepository.listMemoryLogsByScope(conversationId, 'hall'),
          rawRoundTail: get().compactionPolicy.hallRawRoundTail,
          hallMode: conversation.hallMode ?? 'advisory',
        })
        : null;
    const replyTasks = memberIds.map(async (memberId) => {
      const member = membersMap.get(memberId);
      let reply: Message;

      if (!member) {
        reply = buildMessage({
          conversationId,
          role: 'member',
          authorMemberId: memberId,
          content: 'Member unavailable.',
          status: 'error',
          error: 'Member not found',
        });
      } else {
        try {
          const result = await chatWithMember({
            message: text,
            memberId: member.id,
            conversationId,
            previousSummary: conversation.kind === 'chamber' ? chamberMemory : undefined,
            contextMessages: buildMemberContextWindow(
              conversation.kind === 'hall' ? (hallContextBundle?.rawMessages ?? get().messages) : get().messages,
              conversationId,
              member.id,
              conversation.kind,
              membersMap
            ),
            hallContext:
              conversation.kind === 'hall'
                ? buildHallSystemContext(
                  member,
                  hallParticipants,
                  hallContextBundle?.rawMessages ?? [],
                  hallContextBundle?.roundSummaries ?? [],
                  conversation.hallMode ?? 'advisory',
                  conversationId,
                )
                : undefined,
          });

          reply = buildMessage({
            conversationId,
            role: 'member',
            authorMemberId: memberId,
            content: conversation.kind === 'hall'
              ? stripLeadingSpeakerLabel(result.answer, member.name)
              : result.answer,
            status: 'sent',
            roundNumber: currentHallRoundNumber,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Request failed';
          reply = buildMessage({
            conversationId,
            role: 'member',
            authorMemberId: memberId,
            content: 'Could not generate a response right now.',
            status: 'error',
            error: errorMessage,
          });
        }
      }

      set((current) => ({
        messages: [...current.messages, reply],
        ...updateConversationStamp(current, conversationId, true),
        pendingReplyCount: {
          ...current.pendingReplyCount,
          [conversationId]: Math.max(0, (current.pendingReplyCount[conversationId] ?? 1) - 1),
        },
        pendingReplyMemberIds: {
          ...current.pendingReplyMemberIds,
          [conversationId]: (current.pendingReplyMemberIds[conversationId] ?? []).filter((id) => id !== memberId),
        },
      }));

      await councilRepository.appendMessages({ conversationId, messages: [reply] });
    });

    await Promise.all(replyTasks);
    if (conversation.kind === 'hall') {
      await get().syncHallRoundSummaries(conversationId);
    }

    try {
      const chamberMemoryContext = conversation.kind === 'chamber' && conversation.chamberMemberId
        ? {
          memberName: membersMap.get(conversation.chamberMemberId)?.name ?? 'Member',
          memberSpecialties: membersMap.get(conversation.chamberMemberId)?.specialties ?? [],
        }
        : undefined;
      const compacted = await maybeCompact(
        conversationId,
        conversation,
        compactionPolicy,
        chamberMemory,
        chamberMemoryContext
      );
      if (compacted) {
        set((current) => ({
          ...patchConversationEverywhere(current, conversationId, { updatedAt: Date.now() }),
          chamberMemoryByConversation: {
            ...current.chamberMemoryByConversation,
            [conversationId]: compacted.summary,
          },
          messages: [
            ...current.messages.filter((item) => item.conversationId !== conversationId),
            ...compacted.activeMessages,
          ],
        }));
      }
    } catch (error) {
      void error;
    }
  },

  addMemberToConversation: async (conversationId, memberId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall') return;

    await councilRepository.addHallParticipant(conversationId, memberId);
    await get().refreshHallParticipants(conversationId);

    set((state) => ({
      ...updateConversationStamp(state, conversationId),
    }));
  },

  removeMemberFromConversation: async (conversationId, memberId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall') return;
    const currentParticipants = get().hallParticipantsByConversation[conversationId] ?? [];
    if (currentParticipants.length <= 1) return;

    await councilRepository.removeHallParticipant(conversationId, memberId);
    await get().refreshHallParticipants(conversationId);

    set((state) => ({
      ...updateConversationStamp(state, conversationId),
    }));
  },

  clearChamberByMember: async (memberId) => {
    const targetIds = listChamberThreadsForMember(get().conversations, memberId).map((conversation) => conversation.id);
    if (targetIds.length === 0) return;

    await councilRepository.clearChamberByMember(memberId);
    const targetSet = new Set(targetIds);

    set((state) => {
      const nextConversations = state.conversations.filter((conversation) => !targetSet.has(conversation.id));
      const nextPendingReplyCount = { ...state.pendingReplyCount };
      const nextPendingReplyMemberIds = { ...state.pendingReplyMemberIds };
      const nextCompactionInFlight = { ...state.compactionCheckInFlightByConversation };
      const nextPagination = { ...state.messagePaginationByConversation };

      for (const id of targetIds) {
        delete nextPendingReplyCount[id];
        delete nextPendingReplyMemberIds[id];
        delete nextCompactionInFlight[id];
        delete nextPagination[id];
      }

      return {
        conversations: nextConversations,
        messages: state.messages.filter((message) => !targetSet.has(message.conversationId)),
        pendingReplyCount: nextPendingReplyCount,
        pendingReplyMemberIds: nextPendingReplyMemberIds,
        compactionCheckInFlightByConversation: nextCompactionInFlight,
        chamberMemoryByConversation: Object.fromEntries(
          Object.entries(state.chamberMemoryByConversation).filter(([id]) => !targetSet.has(id))
        ),
        messagePaginationByConversation: nextPagination,
        selectedConversationId: targetSet.has(state.selectedConversationId)
          ? (nextConversations[0]?.id ?? '')
          : state.selectedConversationId,
      };
    });
  },

  setThemeMode: async (mode) => {
    set({ themeMode: mode });
    await councilRepository.setThemeMode(mode);
  },

  createMember: async (payload) => {
    const created = await councilRepository.createMember(payload);
    set((state) => ({ members: [created, ...state.members] }));
    return created;
  },

  updateMember: async (memberId, patch) => {
    const updated = await councilRepository.updateMember(memberId, patch);
    set((state) => ({
      members: state.members.map((m) => (m.id === memberId ? updated : m)),
    }));
    return updated;
  },

  archiveMember: async (memberId) => {
    await councilRepository.archiveMember(memberId);
    set((state) => ({
      members: state.members.map((m) =>
        m.id === memberId ? { ...m, deletedAt: Date.now(), updatedAt: Date.now() } : m
      ),
    }));
  },

  uploadDocsForMember: async (memberId, files) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member || files.length === 0) return;

    for (const file of files) {
      const localId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      set((state) => ({
        kbUploadProgressByMember: {
          ...state.kbUploadProgressByMember,
          [memberId]: [
            ...(state.kbUploadProgressByMember[memberId] ?? []),
            { localId, fileName: file.name, loaded: 0, total: Math.max(file.size, 1), progress: 0 },
          ],
        },
      }));

      try {
        const staged = await uploadFileToConvexStorage(file, ({ loaded, total, progress }) => {
          set((state) => ({
            kbUploadProgressByMember: {
              ...state.kbUploadProgressByMember,
              [memberId]: (state.kbUploadProgressByMember[memberId] ?? []).map((entry) =>
                entry.localId === localId
                  ? {
                      ...entry,
                      loaded,
                      total: Math.max(total, 1),
                      progress,
                    }
                  : entry
              ),
            },
          }));
        });

        const created = await createKbDocumentRecord({
          memberId,
          stagedFile: staged,
        });

        set((state) => {
          const current = state.kbDocumentsByMember[memberId] ?? [];
          const deduped = current.filter((row) => row.id !== created.document.id);
          const nextRows = [created.document, ...deduped].sort((a, b) => b.updatedAt - a.updatedAt);
          return {
            members: state.members.map((item) =>
              item.id === memberId
                ? { ...item, kbStoreName: created.document.kbStoreName, updatedAt: Date.now() }
                : item
            ),
            kbDocumentsByMember: {
              ...state.kbDocumentsByMember,
              [memberId]: nextRows,
            },
            memberDocuments: {
              ...state.memberDocuments,
              [memberId]: lifecycleToMemberDocuments(nextRows),
            },
          };
        });

        void startKbDocumentProcessing({ kbDocumentId: created.kbDocumentId })
          .then(() => get().fetchDocsForMember(memberId))
          .catch(() => get().fetchDocsForMember(memberId));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        const failedRow: KbDocumentLifecycle = {
          id: `upload-failed-${localId}`,
          memberId,
          storageId: '',
          displayName: file.name,
          mimeType: file.type || undefined,
          sizeBytes: file.size,
          kbStoreName: member.kbStoreName ?? '',
          kbDocumentName: '',
          uploadStatus: 'failed',
          chunkingStatus: 'failed',
          indexingStatus: 'failed',
          metadataStatus: 'failed',
          ingestErrorChunking: message,
          ingestErrorIndexing: message,
          ingestErrorMetadata: message,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          kbDocumentsByMember: {
            ...state.kbDocumentsByMember,
            [memberId]: [failedRow, ...(state.kbDocumentsByMember[memberId] ?? [])],
          },
        }));
      } finally {
        set((state) => ({
          kbUploadProgressByMember: {
            ...state.kbUploadProgressByMember,
            [memberId]: (state.kbUploadProgressByMember[memberId] ?? []).filter((entry) => entry.localId !== localId),
          },
        }));
      }
    }
  },

  fetchDocsForMember: async (memberId) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member) return;
    const lifecycleRows = await listKbDocuments(member.id);
    set((state) => ({
      kbDocumentsByMember: {
        ...state.kbDocumentsByMember,
        [memberId]: lifecycleRows,
      },
      memberDocuments: {
        ...state.memberDocuments,
        [memberId]: lifecycleToMemberDocuments(lifecycleRows),
      },
    }));
  },

  hydrateMemberDocuments: async () => {
    const membersWithStore = get().members.filter((m) => !m.deletedAt);
    if (membersWithStore.length === 0) return;

    const results = await Promise.all(
      membersWithStore.map(async (member) => {
        try {
          const docs = await listKbDocuments(member.id);
          return { memberId: member.id, docs };
        } catch {
          return { memberId: member.id, docs: [] as KbDocumentLifecycle[] };
        }
      })
    );

    set((state) => ({
      kbDocumentsByMember: {
        ...state.kbDocumentsByMember,
        ...Object.fromEntries(results.map((result) => [result.memberId, result.docs])),
      },
      memberDocuments: {
        ...state.memberDocuments,
        ...Object.fromEntries(results.map((result) => [result.memberId, lifecycleToMemberDocuments(result.docs)])),
      },
    }));
  },

  deleteDocForMember: async (memberId, kbDocumentId) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member || !kbDocumentId) return { ok: false, error: 'Member or document not found' };

    set((state) => ({
      kbDeletingDocumentIds: {
        ...state.kbDeletingDocumentIds,
        [kbDocumentId]: true,
      },
    }));

    try {
      const result = await deleteKbDocument({ kbDocumentId });
      await get().fetchDocsForMember(memberId);
      if (!result.ok) {
        return { ok: false, error: result.error ?? 'Delete failed' };
      }
      if (result.clearedStoreName) {
        set((state) => ({
          members: state.members.map((item) =>
            item.id === memberId ? { ...item, kbStoreName: undefined, updatedAt: Date.now() } : item
          ),
        }));
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Delete failed' };
    } finally {
      set((state) => ({
        kbDeletingDocumentIds: {
          ...state.kbDeletingDocumentIds,
          [kbDocumentId]: false,
        },
      }));
    }
  },

  retryKbDocumentIndexForMember: async (memberId, kbDocumentId) => {
    set((state) => ({
      kbRetryingIndexDocumentIds: {
        ...state.kbRetryingIndexDocumentIds,
        [kbDocumentId]: true,
      },
    }));

    try {
      await retryKbDocumentIndexing({ kbDocumentId });
      await get().fetchDocsForMember(memberId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Retry indexing failed' };
    } finally {
      set((state) => ({
        kbRetryingIndexDocumentIds: {
          ...state.kbRetryingIndexDocumentIds,
          [kbDocumentId]: false,
        },
      }));
    }
  },

  retryKbDocumentMetadataForMember: async (memberId, kbDocumentId) => {
    set((state) => ({
      kbRetryingMetadataDocumentIds: {
        ...state.kbRetryingMetadataDocumentIds,
        [kbDocumentId]: true,
      },
    }));

    try {
      await retryKbDocumentMetadata({ kbDocumentId });
      await get().fetchDocsForMember(memberId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Retry metadata failed' };
    } finally {
      set((state) => ({
        kbRetryingMetadataDocumentIds: {
          ...state.kbRetryingMetadataDocumentIds,
          [kbDocumentId]: false,
        },
      }));
    }
  },
}));
