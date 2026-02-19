import { create } from 'zustand';
import type { Conversation, ConversationType, Member, Message, ThemeMode } from '../types/domain';
import { councilRepository } from '../repository/IndexedDbCouncilRepository';
import { formatClock, nowIso } from '../lib/time';
import { chatWithMember, routeHallMembers, uploadMemberDocuments, listMemberDocuments, deleteMemberDocument } from '../lib/geminiClient';
import { routeToMembers } from '../lib/mockRouting';

interface CreateMemberPayload {
  name: string;
  systemPrompt: string;
  emoji?: string;
  role?: string;
  specialties?: string[];
}

interface AppState {
  hydrated: boolean;
  isRouting: boolean;
  themeMode: ThemeMode;
  members: Member[];
  conversations: Conversation[];
  messages: Message[];
  selectedConversationId: string;
  pendingReplyCount: Record<string, number>;
  memberDocuments: Record<string, Array<{ name?: string; displayName?: string }>>;
  initializeApp: () => Promise<void>;
  selectConversation: (conversationId: string) => void;
  createConversation: (type: ConversationType) => Promise<Conversation>;
  createChamberForMember: (memberId: string) => Promise<Conversation>;
  sendUserMessage: (conversationId: string, text: string) => Promise<void>;
  generateDeterministicReplies: (conversationId: string, text: string) => Promise<void>;
  addMemberToConversation: (conversationId: string, memberId: string) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  createMember: (payload: CreateMemberPayload) => Promise<Member>;
  updateMember: (memberId: string, patch: Partial<CreateMemberPayload>) => Promise<Member>;
  archiveMember: (memberId: string) => Promise<void>;
  uploadDocsForMember: (memberId: string, files: File[]) => Promise<void>;
  fetchDocsForMember: (memberId: string) => Promise<void>;
  hydrateMemberDocuments: () => Promise<void>;
  deleteDocForMember: (memberId: string, documentName: string) => Promise<void>;
}

function buildMessage(message: Omit<Message, 'id' | 'timestamp' | 'createdAt'>): Message {
  const createdAt = nowIso();
  return {
    ...message,
    id: `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    createdAt,
    timestamp: formatClock(createdAt),
  };
}

function updateConversationStamp(conversations: Conversation[], conversationId: string): Conversation[] {
  const updatedAt = nowIso();
  return conversations.map((item) => (item.id === conversationId ? { ...item, updatedAt } : item));
}

function buildMemberContextWindow(
  messages: Message[],
  conversationId: string,
  memberId: string,
  conversationType: Conversation['type']
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((message) => {
      if (message.conversationId !== conversationId) return false;
      if (message.senderType === 'system') return false;
      if (message.senderType === 'user') return true;
      if (message.senderType === 'member') {
        if (conversationType === 'chamber') {
          return true;
        }
        return message.memberId === memberId;
      }
      return false;
    })
    .slice(-12)
    .map((message) => ({
      role: message.senderType === 'user' ? 'user' : 'assistant',
      content: message.content,
    }));
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  isRouting: false,
  themeMode: 'system',
  members: [],
  conversations: [],
  messages: [],
  selectedConversationId: '',
  pendingReplyCount: {},
  memberDocuments: {},

  initializeApp: async () => {
    await councilRepository.init();
    const snapshot = await councilRepository.getSnapshot();
    const firstHall = snapshot.conversations.find((item) => item.type === 'hall');

    set({
      hydrated: true,
      themeMode: snapshot.themeMode,
      members: snapshot.members,
      conversations: snapshot.conversations,
      messages: snapshot.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      selectedConversationId: firstHall?.id ?? snapshot.conversations[0]?.id ?? '',
    });

    // Fire-and-forget preload so KB doc counts survive page refresh.
    void get().hydrateMemberDocuments();
  },

  selectConversation: (conversationId) => {
    set({ selectedConversationId: conversationId });
  },

  createConversation: async (type) => {
    const state = get();
    const activeMembers = state.members.filter((member) => member.status === 'active');
    const seedMembers = activeMembers.slice(0, type === 'hall' ? 2 : 1).map((member) => member.id);
    const title = type === 'hall' ? 'New Hall' : 'New Chamber';

    const created = await councilRepository.createConversation({
      type,
      title,
      memberIds: seedMembers,
      memberId: type === 'chamber' ? seedMembers[0] : undefined,
    });

    set((current) => ({
      conversations: [created, ...current.conversations],
      selectedConversationId: created.id,
    }));

    return created;
  },

  createChamberForMember: async (memberId) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member) {
      throw new Error('Member not found');
    }

    const created = await councilRepository.createConversation({
      type: 'chamber',
      title: `Chamber · ${member.name}`,
      memberIds: [member.id],
      memberId: member.id,
    });

    set((current) => ({
      conversations: [created, ...current.conversations],
      selectedConversationId: created.id,
    }));

    return created;
  },

  sendUserMessage: async (conversationId, text) => {
    const message = buildMessage({
      conversationId,
      senderType: 'user',
      content: text,
      status: 'sent',
    });

    set((state) => ({
      messages: [...state.messages, message],
      conversations: updateConversationStamp(state.conversations, conversationId),
    }));

    await Promise.all([
      councilRepository.appendMessages(conversationId, [message]),
      councilRepository.updateConversation(conversationId, { updatedAt: nowIso() }),
    ]);
  },

  generateDeterministicReplies: async (conversationId, text) => {
    const state = get();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    const membersMap = new Map(state.members.map((member) => [member.id, member]));

    let memberIds: string[] = [];
    let routingSource: Message['routingSource'] = 'chamber-fixed';

    if (conversation.type === 'chamber') {
      memberIds = conversation.memberId ? [conversation.memberId] : conversation.memberIds.slice(0, 1);
    } else {
      const candidates = conversation.memberIds
        .map((id) => membersMap.get(id))
        .filter((member): member is Member => Boolean(member) && member.status === 'active');

      if (candidates.length > 0) {
        set({ isRouting: true });
        try {
          const routed = await routeHallMembers({
            message: text,
            conversationId,
            candidates: candidates.map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
              specialties: candidate.specialties,
              systemPrompt: candidate.systemPrompt,
            })),
            maxSelections: 3,
          });
          memberIds = routed.chosenMemberIds;
          routingSource = routed.source;
        } catch {
          memberIds = routeToMembers(text, conversation).filter((id) => candidates.some((item) => item.id === id));
          routingSource = 'fallback';
        } finally {
          set({ isRouting: false });
        }
      }

      if (memberIds.length === 0) {
        memberIds = routeToMembers(text, conversation).filter((id) => membersMap.has(id));
        routingSource = 'fallback';
      }

      const routeMessage = buildMessage({
        conversationId,
        senderType: 'system',
        content: `Routed to ${memberIds
          .map((id) => membersMap.get(id)?.name ?? id)
          .join(', ')}`,
        routeMemberIds: memberIds,
        routingSource,
        status: 'sent',
      });

      set((current) => ({
        messages: [...current.messages, routeMessage],
      }));
      await councilRepository.appendMessages(conversationId, [routeMessage]);
    }

    if (memberIds.length === 0) {
      return;
    }

    set((current) => ({
      pendingReplyCount: {
        ...current.pendingReplyCount,
        [conversationId]: memberIds.length,
      },
    }));

    const replies = await Promise.all(
      memberIds.map(async (memberId) => {
        const member = membersMap.get(memberId);
        if (!member) {
          return buildMessage({
            conversationId,
            senderType: 'member',
            memberId,
            content: 'Member unavailable.',
            status: 'error',
            error: 'Member unavailable',
            meta: { canReply: true, canDM: true },
          });
        }

        try {
          const result = await chatWithMember({
            message: text,
            member,
            conversationId,
            storeName: member.kbStoreName,
            contextMessages: buildMemberContextWindow(get().messages, conversationId, member.id, conversation.type),
          });

          return buildMessage({
            conversationId,
            senderType: 'member',
            memberId,
            senderName: member.name,
            content: result.answer,
            status: 'sent',
            meta: { canReply: true, canDM: true },
          });
        } catch (error) {
          const errorText = error instanceof Error ? error.message : 'Request failed';
          return buildMessage({
            conversationId,
            senderType: 'member',
            memberId,
            senderName: member.name,
            content: 'Could not generate a response right now.',
            status: 'error',
            error: errorText,
            meta: { canReply: true, canDM: true },
          });
        }
      })
    );

    set((current) => ({
      messages: [...current.messages, ...replies],
      conversations: updateConversationStamp(current.conversations, conversationId),
      pendingReplyCount: {
        ...current.pendingReplyCount,
        [conversationId]: 0,
      },
    }));

    await Promise.all([
      councilRepository.appendMessages(conversationId, replies),
      councilRepository.updateConversation(conversationId, { updatedAt: nowIso() }),
    ]);
  },

  addMemberToConversation: async (conversationId, memberId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.memberIds.includes(memberId)) {
      return;
    }

    const updated = await councilRepository.updateConversation(conversationId, {
      memberIds: [...conversation.memberIds, memberId],
      updatedAt: nowIso(),
    });

    set((state) => ({
      conversations: state.conversations.map((item) => (item.id === conversationId ? updated : item)),
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
      members: state.members.map((member) => (member.id === memberId ? updated : member)),
    }));
    return updated;
  },

  archiveMember: async (memberId) => {
    await councilRepository.archiveMember(memberId);
    set((state) => ({
      members: state.members.map((member) =>
        member.id === memberId
          ? {
              ...member,
              status: 'archived',
              updatedAt: nowIso(),
            }
          : member
      ),
    }));
  },

  uploadDocsForMember: async (memberId, files) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member || files.length === 0) {
      return;
    }

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
          ? {
              ...item,
              kbStoreName: response.storeName,
              updatedAt: nowIso(),
            }
          : item
      ),
      memberDocuments: {
        ...state.memberDocuments,
        [memberId]: response.documents,
      },
    }));
  },

  fetchDocsForMember: async (memberId) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member?.kbStoreName) {
      set((state) => ({
        memberDocuments: {
          ...state.memberDocuments,
          [memberId]: [],
        },
      }));
      return;
    }

    const docs = await listMemberDocuments(member.kbStoreName);
    set((state) => ({
      memberDocuments: {
        ...state.memberDocuments,
        [memberId]: docs,
      },
    }));
  },

  hydrateMemberDocuments: async () => {
    const membersWithStore = get().members.filter((member) => member.status !== 'archived' && member.kbStoreName);
    if (membersWithStore.length === 0) {
      return;
    }

    const results = await Promise.all(
      membersWithStore.map(async (member) => {
        try {
          const docs = await listMemberDocuments(member.kbStoreName as string);
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
    if (!member?.kbStoreName || !documentName) {
      return;
    }

    const docs = await deleteMemberDocument({
      storeName: member.kbStoreName,
      documentName,
    });

    set((state) => ({
      memberDocuments: {
        ...state.memberDocuments,
        [memberId]: docs,
      },
    }));
  },
}));
