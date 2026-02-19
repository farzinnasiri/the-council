import type {
  Conversation,
  Member,
  Message,
  ThemeMode,
} from '../types/domain';

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateMemberInput {
  name: string;
  systemPrompt: string;
  emoji?: string;
  role?: string;
  specialties?: string[];
}

export interface UpdateMemberPatch {
  name?: string;
  systemPrompt?: string;
  emoji?: string;
  role?: string;
  specialties?: string[];
  kbStoreName?: string | null;    // null = clear the KB store
  status?: Member['status'];
}

export interface CreateConversationInput {
  type: Conversation['type'];
  title: string;
  memberIds: string[];
}

export interface UpdateConversationPatch {
  title?: string;
  memberIds?: string[];
  status?: Conversation['status'];
}

export interface AppendMessagesInput {
  conversationId: string;
  messages: Omit<Message, 'id' | 'createdAt'>[];
}

// ── Snapshot loaded at startup ─────────────────────────────────────────────────

export interface CouncilSnapshot {
  themeMode: ThemeMode;
  members: Member[];
  conversations: Conversation[];
  // Messages are loaded per-conversation, not all at once
}

// ── Repository interface ──────────────────────────────────────────────────────

export interface CouncilRepository {
  /** One-time initialization (marks DB as ready) */
  init(): Promise<void>;
  /** Bulk load for startup */
  getSnapshot(): Promise<CouncilSnapshot>;

  // Settings
  getThemeMode(): Promise<ThemeMode>;
  setThemeMode(mode: ThemeMode): Promise<void>;

  // Members
  listMembers(includeArchived?: boolean): Promise<Member[]>;
  createMember(input: CreateMemberInput): Promise<Member>;
  updateMember(memberId: string, patch: UpdateMemberPatch): Promise<Member>;
  archiveMember(memberId: string): Promise<void>;
  setMemberStoreName(memberId: string, storeName: string): Promise<void>;

  // Conversations
  listConversations(): Promise<Conversation[]>;
  createConversation(input: CreateConversationInput): Promise<Conversation>;
  updateConversation(conversationId: string, patch: UpdateConversationPatch): Promise<Conversation>;

  // Messages
  listMessages(conversationId: string): Promise<Message[]>;
  appendMessages(input: AppendMessagesInput): Promise<void>;
  clearMessages(conversationId: string): Promise<void>;
}
