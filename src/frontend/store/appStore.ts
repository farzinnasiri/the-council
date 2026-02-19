import { create } from 'zustand';
import type {
  Conversation,
  ConversationType,
  Member,
  Message,
  MessageRole,
  MessageRouting,
  ThemeMode,
} from '../types/domain';
import { convexRepository as councilRepository } from '../repository/ConvexCouncilRepository';
import {
  chatWithMember,
  compactConversation,
  routeHallMembers,
  uploadMemberDocuments,
  listMemberDocuments,
  deleteMemberDocument,
} from '../lib/geminiClient';
import { routeToMembers } from '../lib/mockRouting';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  loadMessages: (conversationId: string) => Promise<void>;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

type BuildMessageInput = Omit<Message, 'id' | 'createdAt' | 'compacted'>;

function buildMessage(input: BuildMessageInput): Message {
  return {
    ...input,
    id: `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    compacted: false,
    createdAt: Date.now(),
  };
}

/** Get the display name for a member from the members map */
function getMemberName(membersMap: Map<string, Member>, memberId: string): string {
  return membersMap.get(memberId)?.name ?? memberId;
}

function updateConversationStamp(
  conversations: Conversation[],
  conversationId: string
): Conversation[] {
  const now = Date.now();
  return conversations.map((item) =>
    item.id === conversationId ? { ...item, updatedAt: now } : item
  );
}

/** Build the context window for one member's LLM call.
 * - Excludes compacted messages (they're represented by the rolling summary).
 * - Returns at most 12 messages (6 rounds of back-and-forth per member).
 */
function buildMemberContextWindow(
  messages: Message[],
  conversationId: string,
  memberId: string,
  conversationType: Conversation['type']
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((msg) => {
      if (msg.conversationId !== conversationId) return false;
      if (msg.compacted) return false;           // ← skip compacted rows
      if (msg.role === 'system') return false;
      if (msg.role === 'user') return true;
      if (msg.role === 'member') {
        if (conversationType === 'chamber') return true;
        return msg.memberId === memberId;
      }
      return false;
    })
    .slice(-12)
    .map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));
}

const COMPACTION_THRESHOLD = 20; // active messages before triggering compaction

/** Fire-and-forget compaction: summarise oldest active messages, store result in Convex. */
async function maybeCompact(
  conversationId: string,
  messages: Message[],
  conversation: Conversation
): Promise<void> {
  const active = messages.filter(
    (m) => m.conversationId === conversationId && !m.compacted && m.role !== 'system'
  );
  if (active.length < COMPACTION_THRESHOLD) return;

  // Compact the oldest half of active messages
  const toCompact = active.slice(0, Math.floor(active.length / 2));
  const contextMsgs = toCompact.map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }));

  try {
    await compactConversation({
      conversationId,
      previousSummary: conversation.summary,
      messages: contextMsgs,
      messageIds: toCompact.map((m) => m.id),
    });
  } catch (err) {
    console.warn('[compaction] failed, will retry next round:', err);
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

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

    // Sort conversations newest-first
    const conversations = snapshot.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    const firstHall = conversations.find((item) => item.type === 'hall');

    set({
      hydrated: true,
      themeMode: snapshot.themeMode,
      members: snapshot.members,
      conversations,
      selectedConversationId: firstHall?.id ?? conversations[0]?.id ?? '',
    });

    // Load messages for the initially-selected conversation
    const initialId = firstHall?.id ?? conversations[0]?.id;
    if (initialId) {
      await get().loadMessages(initialId);
    }

    // Fire-and-forget preload so KB doc counts survive page refresh
    void get().hydrateMemberDocuments();
  },

  selectConversation: (conversationId) => {
    set({ selectedConversationId: conversationId });
    // Load messages for the newly selected conversation if not yet loaded
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

  createConversation: async (type) => {
    const state = get();
    const activeMembers = state.members.filter((m) => m.status === 'active');
    const seedMemberIds = activeMembers.slice(0, type === 'hall' ? 2 : 1).map((m) => m.id);
    const title = type === 'hall' ? 'New Hall' : 'New Chamber';

    const created = await councilRepository.createConversation({
      type,
      title,
      memberIds: seedMemberIds,
    });

    set((current) => ({
      conversations: [created, ...current.conversations],
      selectedConversationId: created.id,
    }));

    return created;
  },

  createChamberForMember: async (memberId) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member) throw new Error('Member not found');

    const created = await councilRepository.createConversation({
      type: 'chamber',
      title: `Chamber · ${member.name}`,
      memberIds: [member.id],
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

    if (conversation.type === 'chamber') {
      // Chamber: always reply from the first member
      memberIds = conversation.memberIds.slice(0, 1);
    } else {
      // Hall: route to relevant members
      const candidates = conversation.memberIds
        .map((id) => membersMap.get(id))
        .filter((m): m is Member => Boolean(m) && m.status === 'active');

      if (candidates.length > 0) {
        set({ isRouting: true });
        try {
          const routed = await routeHallMembers({
            message: text,
            conversationId,
            candidates: candidates.map((c) => ({
              id: c.id,
              name: c.name,
              specialties: c.specialties,
              systemPrompt: c.systemPrompt,
            })),
            maxSelections: 3,
          });
          memberIds = routed.chosenMemberIds;
          routingSource = routed.source;
        } catch {
          memberIds = routeToMembers(text, conversation).filter((id) =>
            candidates.some((c) => c.id === id)
          );
          routingSource = 'fallback';
        } finally {
          set({ isRouting: false });
        }
      }

      if (memberIds.length === 0) {
        memberIds = routeToMembers(text, conversation).filter((id) => membersMap.has(id));
        routingSource = 'fallback';
      }

      // Post a system routing message
      const routeMessage = buildMessage({
        conversationId,
        role: 'system',
        content: `Routed to ${memberIds.map((id) => getMemberName(membersMap, id)).join(', ')}`,
        status: 'sent',
        routing: { memberIds, source: routingSource },
      });

      set((current) => ({ messages: [...current.messages, routeMessage] }));
      await councilRepository.appendMessages({ conversationId, messages: [routeMessage] });
    }

    if (memberIds.length === 0) return;

    set((current) => ({
      pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: memberIds.length },
    }));

    const replies = await Promise.all(
      memberIds.map(async (memberId) => {
        const member = membersMap.get(memberId);
        if (!member) {
          return buildMessage({
            conversationId,
            role: 'member',
            memberId,
            content: 'Member unavailable.',
            status: 'error',
            error: 'Member not found',
          });
        }

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
              conversation.type
            ),
          });

          return buildMessage({
            conversationId,
            role: 'member',
            memberId,
            content: result.answer,
            status: 'sent',
          });
        } catch (error) {
          return buildMessage({
            conversationId,
            role: 'member',
            memberId,
            content: 'Could not generate a response right now.',
            status: 'error',
            error: error instanceof Error ? error.message : 'Request failed',
          });
        }
      })
    );

    set((current) => ({
      messages: [...current.messages, ...replies],
      conversations: updateConversationStamp(current.conversations, conversationId),
      pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: 0 },
    }));

    await councilRepository.appendMessages({ conversationId, messages: replies });

    // Fire-and-forget compaction — runs after the round is fully persisted
    void maybeCompact(conversationId, get().messages, conversation);
  },

  addMemberToConversation: async (conversationId, memberId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.memberIds.includes(memberId)) return;

    const updated = await councilRepository.updateConversation(conversationId, {
      memberIds: [...conversation.memberIds, memberId],
    });

    set((state) => ({
      conversations: state.conversations.map((item) =>
        item.id === conversationId ? updated : item
      ),
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
        m.id === memberId ? { ...m, status: 'archived', updatedAt: Date.now() } : m
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
    const membersWithStore = get().members.filter(
      (m) => m.status !== 'archived' && m.kbStoreName
    );
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
        ...Object.fromEntries(results.map((r) => [r.memberId, r.docs])),
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
