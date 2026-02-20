import { create } from 'zustand';
import type {
  Conversation,
  ConversationType,
  Member,
  Message,
  MessageRouting,
  ThemeMode,
} from '../types/domain';
import { convexRepository as councilRepository } from '../repository/ConvexCouncilRepository';
import {
  chatWithMember,
  compactConversation,
  routeHallMembers,
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
  memberDocuments: Record<string, Array<{ name?: string; displayName?: string }>>;
  chamberByMemberId: Record<string, Conversation>;
  hallParticipantsByConversation: Record<string, string[]>;

  initializeApp: () => Promise<void>;
  selectConversation: (conversationId: string) => void;
  loadMessages: (conversationId: string) => Promise<void>;
  refreshHallParticipants: (conversationId: string) => Promise<void>;
  createConversation: (type: ConversationType) => Promise<Conversation>;
  renameHallConversation: (conversationId: string, title: string) => Promise<void>;
  archiveHallConversation: (conversationId: string) => Promise<void>;
  createChamberForMember: (memberId: string) => Promise<Conversation>;
  getChamberForMember: (memberId: string) => Conversation | undefined;
  sendHallDraftMessage: (text: string) => Promise<Conversation>;
  sendMessageToChamberMember: (memberId: string, text: string) => Promise<Conversation>;
  sendUserMessage: (conversationId: string, text: string) => Promise<void>;
  generateDeterministicReplies: (conversationId: string, text: string) => Promise<void>;
  addMemberToConversation: (conversationId: string, memberId: string) => Promise<void>;
  removeMemberFromConversation: (conversationId: string, memberId: string) => Promise<void>;
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

function buildMessage(input: BuildMessageInput): Message {
  return {
    ...input,
    id: `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    compacted: false,
    createdAt: Date.now(),
  };
}

function updateConversationStamp(conversations: Conversation[], conversationId: string): Conversation[] {
  const now = Date.now();
  return conversations.map((item) =>
    item.id === conversationId ? { ...item, updatedAt: now } : item
  );
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

const COMPACTION_THRESHOLD = 20;

async function maybeCompact(
  conversationId: string,
  messages: Message[],
  conversation: Conversation
): Promise<{ summary: string; compactedIds: string[] } | null> {
  const active = messages.filter(
    (m) => m.conversationId === conversationId && !m.compacted && m.role !== 'system'
  );
  if (active.length < COMPACTION_THRESHOLD) return null;

  const toCompact = active.slice(0, Math.floor(active.length / 2));
  const contextMsgs = toCompact.map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }));

  const result = await compactConversation({
    conversationId,
    previousSummary: conversation.summary,
    messages: contextMsgs,
    messageIds: toCompact.map((m) => m.id),
  });

  await councilRepository.applyCompaction(conversationId, result.summary, toCompact.map((m) => m.id));

  return { summary: result.summary, compactedIds: toCompact.map((m) => m.id) };
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
  memberDocuments: {},
  chamberByMemberId: {},
  hallParticipantsByConversation: {},

  initializeApp: async () => {
    await councilRepository.init();
    const snapshot = await councilRepository.getSnapshot();

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
      selectedConversationId: firstHall?.id ?? '',
    });

    const hallIds = conversations.filter((item) => item.kind === 'hall').map((item) => item.id);
    await Promise.all(hallIds.map((conversationId) => get().refreshHallParticipants(conversationId)));

    if (firstHall) {
      await get().loadMessages(firstHall.id);
    }

    void get().hydrateMemberDocuments();
  },

  selectConversation: (conversationId) => {
    set({ selectedConversationId: conversationId });
    const already = get().messages.some((m) => m.conversationId === conversationId);
    if (!already) {
      void get().loadMessages(conversationId);
    }
  },

  loadMessages: async (conversationId) => {
    const msgs = await councilRepository.listMessages(conversationId);
    set((state) => ({
      messages: [
        ...state.messages.filter((m) => m.conversationId !== conversationId),
        ...msgs.sort((a, b) => a.createdAt - b.createdAt),
      ],
    }));
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
      return {
        conversations: nextConversations,
        hallParticipantsByConversation: nextParticipants,
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

  sendHallDraftMessage: async (text) => {
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

    await get().sendUserMessage(created.id, text);
    // Generate member replies in background so navigation + first bubble feel immediate.
    void get().generateDeterministicReplies(created.id, text);
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

  sendUserMessage: async (conversationId, text) => {
    const message = buildMessage({
      conversationId,
      role: 'user',
      content: text,
      status: 'sent',
    });

    set((state) => ({
      messages: [...state.messages, message],
      conversations: updateConversationStamp(state.conversations, conversationId),
    }));

    await councilRepository.appendMessages({
      conversationId,
      messages: [message],
    });
  },

  generateDeterministicReplies: async (conversationId, text) => {
    const state = get();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    const membersMap = new Map(state.members.map((m) => [m.id, m]));

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
        set({ isRouting: true, routingConversationId: conversationId });
        try {
          const dynamicMaxSelections = Math.max(
            1,
            Math.min(8, Math.ceil(candidates.length * 0.5))
          );
          const routed = await routeHallMembers({
            message: text,
            conversationId,
            candidates: candidates.map((c) => ({
              id: c.id,
              name: c.name,
              specialties: c.specialties.filter((item) => item.trim().length > 0),
              systemPrompt: c.systemPrompt,
            })),
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
          content: `Routed to ${memberIds.map((id) => membersMap.get(id)?.name ?? id).join(', ')}`,
          status: 'sent',
          routing: { memberIds, source: routingSource },
        });

        set((current) => ({ messages: [...current.messages, routeMessage] }));
        await councilRepository.appendMessages({ conversationId, messages: [routeMessage] });
      } else {
        memberIds = participantIds.filter((memberId) => {
          const member = membersMap.get(memberId);
          return Boolean(member && !member.deletedAt);
        });
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
            member,
            conversationId,
            storeName: member.kbStoreName,
            previousSummary: conversation.summary,
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
          reply = buildMessage({
            conversationId,
            role: 'member',
            authorMemberId: memberId,
            content: 'Could not generate a response right now.',
            status: 'error',
            error: error instanceof Error ? error.message : 'Request failed',
          });
        }
      }

      set((current) => ({
        messages: [...current.messages, reply],
        conversations: updateConversationStamp(current.conversations, conversationId),
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
      const compacted = await maybeCompact(conversationId, get().messages, conversation);
      if (compacted) {
        set((current) => ({
          conversations: current.conversations.map((item) =>
            item.id === conversationId ? { ...item, summary: compacted.summary, updatedAt: Date.now() } : item
          ),
          messages: current.messages.map((item) =>
            compacted.compactedIds.includes(item.id) ? { ...item, compacted: true } : item
          ),
        }));
      }
    } catch (error) {
      console.warn('[compaction] failed, will retry next round:', error);
    }
  },

  addMemberToConversation: async (conversationId, memberId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall') return;

    await councilRepository.addHallParticipant(conversationId, memberId);
    await get().refreshHallParticipants(conversationId);

    set((state) => ({
      conversations: updateConversationStamp(state.conversations, conversationId),
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
      conversations: updateConversationStamp(state.conversations, conversationId),
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
      memberName: member.name,
      storeName: member.kbStoreName,
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
    if (!member?.kbStoreName) {
      set((state) => ({ memberDocuments: { ...state.memberDocuments, [memberId]: [] } }));
      return;
    }
    const docs = await listMemberDocuments(member.kbStoreName);
    set((state) => ({ memberDocuments: { ...state.memberDocuments, [memberId]: docs } }));
  },

  hydrateMemberDocuments: async () => {
    const membersWithStore = get().members.filter((m) => !m.deletedAt && m.kbStoreName);
    if (membersWithStore.length === 0) return;

    const results = await Promise.all(
      membersWithStore.map(async (member) => {
        try {
          const docs = await listMemberDocuments(member.kbStoreName!);
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
    if (!member?.kbStoreName || !documentName) return;

    const docs = await deleteMemberDocument({ storeName: member.kbStoreName, documentName });
    set((state) => ({
      memberDocuments: { ...state.memberDocuments, [memberId]: docs },
    }));
  },
}));
