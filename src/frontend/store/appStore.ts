import { create } from 'zustand';
import type {
  Conversation,
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
  chatRoundtableSpeakers,
  compactConversation,
  getRoundtableState,
  markRoundtableCompleted,
  markRoundtableInProgress,
  prepareRoundtableRound,
  routeHallMembers,
  setRoundtableSelections,
  suggestHallTitle,
  uploadMemberDocuments,
  listMemberDocuments,
  deleteMemberDocument,
} from '../lib/geminiClient';
import { routeToMembers } from '../lib/mockRouting';

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
  chamberByMemberId: Record<string, Conversation>;
  chamberMemoryByConversation: Record<string, string>;
  hallParticipantsByConversation: Record<string, string[]>;
  roundtableStateByConversation: Record<string, RoundtableState | null>;
  roundtablePreparingByConversation: Record<string, boolean>;
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
  evaluateChamberCompactionOnLoad: (conversationId: string) => Promise<void>;
  createConversation: (type: ConversationType) => Promise<Conversation>;
  renameHallConversation: (conversationId: string, title: string) => Promise<void>;
  archiveHallConversation: (conversationId: string) => Promise<void>;
  createChamberForMember: (memberId: string) => Promise<Conversation>;
  getChamberForMember: (memberId: string) => Conversation | undefined;
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
  clearChamberHistory: (conversationId: string) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  createMember: (payload: CreateMemberPayload) => Promise<Member>;
  updateMember: (memberId: string, patch: Partial<CreateMemberPayload>) => Promise<Member>;
  archiveMember: (memberId: string) => Promise<void>;
  uploadDocsForMember: (memberId: string, files: File[]) => Promise<void>;
  fetchDocsForMember: (memberId: string) => Promise<void>;
  hydrateMemberDocuments: () => Promise<void>;
  deleteDocForMember: (memberId: string, documentName: string) => Promise<void>;
}

type BuildMessageInput = Omit<Message, 'id' | 'createdAt' | 'compacted'>;
type ConversationPatch = Partial<Conversation> | ((conversation: Conversation) => Conversation);
type ConversationStateSlice = Pick<AppState, 'conversations' | 'chamberByMemberId'>;

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
  let nextTarget: Conversation | undefined;
  const conversations = state.conversations.map((item) => {
    if (item.id !== conversationId) return item;
    nextTarget = typeof patch === 'function' ? patch(item) : { ...item, ...patch };
    return nextTarget;
  });

  if (!nextTarget || nextTarget.kind !== 'chamber' || !nextTarget.chamberMemberId) {
    return { conversations, chamberByMemberId: state.chamberByMemberId };
  }

  return {
    conversations,
    chamberByMemberId: {
      ...state.chamberByMemberId,
      [nextTarget.chamberMemberId]: nextTarget,
    },
  };
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

function buildMemberContextWindow(
  messages: Message[],
  conversationId: string,
  memberId: string,
  conversationKind: Conversation['kind'],
  membersById: Map<string, Member>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
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
    })
    .slice(-12)
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
  messages: Message[],
  conversationId: string
): string {
  const presentMemberNames = activeParticipants.map((m) => m.name);
  const otherNames = activeParticipants.filter((m) => m.id !== member.id).map((m) => m.name);

  const recentOtherOpinions = messages
    .filter(
      (msg) =>
        msg.conversationId === conversationId &&
        !msg.compacted &&
        msg.role === 'member' &&
        msg.status !== 'error' &&
        msg.authorMemberId &&
        msg.authorMemberId !== member.id
    )
    .slice(-6)
    .map((msg) => {
      const author = activeParticipants.find((m) => m.id === msg.authorMemberId)?.name ?? 'Member';
      return `${author}: ${msg.content}`;
    });

  return [
    `Hall context: You are ${member.name}, one council member in a live hall conversation.`,
    `Present members: ${presentMemberNames.join(', ') || member.name}.`,
    `Other members currently present: ${otherNames.join(', ') || 'none'}.`,
    'You can reference, build on, or challenge other members respectfully.',
    recentOtherOpinions.length > 0
      ? `Recent member opinions:\n- ${recentOtherOpinions.join('\n- ')}`
      : 'Recent member opinions: none yet.',
  ].join('\n');
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
  chamberByMemberId: {},
  chamberMemoryByConversation: {},
  hallParticipantsByConversation: {},
  roundtableStateByConversation: {},
  roundtablePreparingByConversation: {},
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
      chamberByMemberId: snapshot.chamberMap,
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
      const results = await chatRoundtableSpeakers({
        conversationId,
        roundNumber,
      });

      const replies = results.map((row) =>
        buildMessage({
          conversationId,
          role: 'member',
          authorMemberId: row.memberId,
          content: row.answer,
          status: row.status,
          error: row.error,
          roundNumber,
          roundIntent: row.intent,
          roundTargetMemberId: row.targetMemberId,
        })
      );

      if (replies.length > 0) {
        set((state) => ({
          messages: [...state.messages, ...replies],
          ...updateConversationStamp(state, conversationId, true),
        }));

        await councilRepository.appendMessages({
          conversationId,
          messages: replies,
        });
      }

      const completed = await markRoundtableCompleted({
        conversationId,
        roundNumber,
      });

      set((state) => ({
        roundtableStateByConversation: {
          ...state.roundtableStateByConversation,
          [conversationId]: null,
        },
      }));
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

  createConversation: async (type) => {
    if (type !== 'hall') {
      throw new Error('Use createChamberForMember for chamber conversations');
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

  renameHallConversation: async (conversationId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const updated = await councilRepository.renameHall(conversationId, trimmed);
    set((state) => ({
      conversations: state.conversations.map((item) =>
        item.id === conversationId ? updated : item
      ),
    }));
  },

  archiveHallConversation: async (conversationId) => {
    await councilRepository.archiveHall(conversationId);
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

  createChamberForMember: async (memberId) => {
    const created = await councilRepository.getOrCreateChamber(memberId);

    set((state) => {
      const exists = state.conversations.some((item) => item.id === created.id);
      return {
        conversations: exists
          ? state.conversations.map((item) => (item.id === created.id ? created : item))
          : [created, ...state.conversations],
        chamberByMemberId: {
          ...state.chamberByMemberId,
          [memberId]: created,
        },
        selectedConversationId: created.id,
      };
    });

    return created;
  },

  getChamberForMember: (memberId) => get().chamberByMemberId[memberId],

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
        return get().renameHallConversation(created.id, nextTitle);
      })
      .catch(() => undefined);

    return created;
  },

  sendMessageToChamberMember: async (memberId, text) => {
    let conversation = get().chamberByMemberId[memberId];
    if (!conversation) {
      conversation = await councilRepository.getOrCreateChamber(memberId);
      set((state) => {
        const exists = state.conversations.some((item) => item.id === conversation!.id);
        return {
          conversations: exists
            ? state.conversations.map((item) => (item.id === conversation!.id ? conversation! : item))
            : [conversation!, ...state.conversations],
          chamberByMemberId: {
            ...state.chamberByMemberId,
            [memberId]: conversation!,
          },
          selectedConversationId: conversation!.id,
        };
      });
    }

    await get().sendUserMessage(conversation.id, text);
    await get().generateDeterministicReplies(conversation.id, text);

    return conversation;
  },

  sendUserMessage: async (conversationId, text, mentionedMemberIds = []) => {
    const message = buildMessage({
      conversationId,
      role: 'user',
      content: text,
      status: 'sent',
    });

    set((state) => ({
      messages: [...state.messages, message],
      ...updateConversationStamp(state, conversationId, true),
    }));

    await councilRepository.appendMessages({
      conversationId,
      messages: [message],
    });
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

    if (conversation.kind === 'hall' && conversation.hallMode === 'roundtable') {
      const membersMap = new Map(state.members.map((m) => [m.id, m]));
      const participantIds = state.hallParticipantsByConversation[conversationId] ?? [];
      let activeParticipantIds = participantIds;
      const isFirstRound = activeParticipantIds.length === 0;

      if (isFirstRound) {
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

      if (isFirstRound) {
        const activeMembers = activeParticipantIds
          .map((id) => membersMap.get(id))
          .filter((member): member is Member => Boolean(member && !member.deletedAt));

        set((current) => ({
          pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: activeParticipantIds.length },
          pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: activeParticipantIds },
        }));

        const contextSourceMessages = get().messages;
        const replies = await Promise.all(
          activeParticipantIds.map(async (memberId) => {
            const member = membersMap.get(memberId);
            if (!member) {
              return buildMessage({
                conversationId,
                role: 'member',
                authorMemberId: memberId,
                content: 'Member unavailable.',
                status: 'error',
                error: 'Member not found',
              });
            }

            try {
              const result = await chatWithMember({
                message: text,
                memberId: member.id,
                conversationId,
                contextMessages: buildMemberContextWindow(
                  contextSourceMessages,
                  conversationId,
                  member.id,
                  conversation.kind,
                  membersMap
                ),
                hallContext: buildHallSystemContext(member, activeMembers, contextSourceMessages, conversationId),
              });

              return buildMessage({
                conversationId,
                role: 'member',
                authorMemberId: memberId,
                content: result.answer,
                status: 'sent',
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Request failed';
              return buildMessage({
                conversationId,
                role: 'member',
                authorMemberId: memberId,
                content: `${member.name} could not speak in this round.`,
                status: 'error',
                error: errorMessage,
              });
            }
          })
        );

        set((current) => ({
          messages: [...current.messages, ...replies],
          ...updateConversationStamp(current, conversationId, true),
          pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: 0 },
          pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: [] },
          roundtableStateByConversation: {
            ...current.roundtableStateByConversation,
            [conversationId]: null,
          },
        }));

        await councilRepository.appendMessages({
          conversationId,
          messages: replies,
        });
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

        set((current) => ({
          roundtableStateByConversation: {
            ...current.roundtableStateByConversation,
            [conversationId]: nextRound,
          },
        }));
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
              get().messages,
              conversationId,
              member.id,
              conversation.kind,
              membersMap
            ),
            hallContext:
              conversation.kind === 'hall'
                ? buildHallSystemContext(member, hallParticipants, get().messages, conversationId)
                : undefined,
          });

          reply = buildMessage({
            conversationId,
            role: 'member',
            authorMemberId: memberId,
            content: result.answer,
            status: 'sent',
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

  clearChamberHistory: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'chamber') return;

    await councilRepository.clearMessages(conversationId);
    await councilRepository.clearChamberSummary(conversationId);

    set((state) => ({
      messages: state.messages.filter((message) => message.conversationId !== conversationId),
      pendingReplyCount: { ...state.pendingReplyCount, [conversationId]: 0 },
      pendingReplyMemberIds: { ...state.pendingReplyMemberIds, [conversationId]: [] },
      chamberMemoryByConversation: Object.fromEntries(
        Object.entries(state.chamberMemoryByConversation).filter(([id]) => id !== conversationId)
      ),
      messagePaginationByConversation: {
        ...state.messagePaginationByConversation,
        [conversationId]: {
          oldestLoadedAt: undefined,
          hasOlder: false,
          isLoadingOlder: false,
        },
      },
      ...patchConversationEverywhere(state, conversationId, {
        lastMessageAt: undefined,
      }),
    }));
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

    const response = await uploadMemberDocuments({
      memberId: member.id,
      files,
    });

    await councilRepository.setMemberStoreName(memberId, response.storeName);

    set((state) => ({
      members: state.members.map((item) =>
        item.id === memberId
          ? { ...item, kbStoreName: response.storeName, updatedAt: Date.now() }
          : item
      ),
      memberDocuments: { ...state.memberDocuments, [memberId]: response.documents },
    }));
  },

  fetchDocsForMember: async (memberId) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member) return;
    const docs = await listMemberDocuments(member.id);
    set((state) => ({ memberDocuments: { ...state.memberDocuments, [memberId]: docs } }));
  },

  hydrateMemberDocuments: async () => {
    const membersWithStore = get().members.filter((m) => !m.deletedAt);
    if (membersWithStore.length === 0) return;

    const results = await Promise.all(
      membersWithStore.map(async (member) => {
        try {
          const docs = await listMemberDocuments(member.id);
          return { memberId: member.id, docs };
        } catch {
          return { memberId: member.id, docs: [] as Array<{ name?: string; displayName?: string }> };
        }
      })
    );

    set((state) => ({
      memberDocuments: {
        ...state.memberDocuments,
        ...Object.fromEntries(results.map((result) => [result.memberId, result.docs])),
      },
    }));
  },

  deleteDocForMember: async (memberId, documentName) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member || !documentName) return;

    const docs = await deleteMemberDocument({ memberId, documentName });
    set((state) => ({
      memberDocuments: { ...state.memberDocuments, [memberId]: docs },
    }));
  },
}));
