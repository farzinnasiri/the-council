import type {
  Conversation,
  ConversationParticipant,
  Member,
  Message,
  ThemeMode,
} from '../types/domain';

export interface CreateMemberInput {
  name: string;
  systemPrompt: string;
  specialties?: string[];
}

export interface UpdateMemberPatch {
  name?: string;
  systemPrompt?: string;
  specialties?: string[];
  kbStoreName?: string | null;
  deletedAt?: number;
}

export interface CreateHallInput {
  title: string;
  memberIds: string[];
}

export interface AppendMessagesInput {
  conversationId: string;
  messages: Omit<Message, 'id' | 'createdAt' | 'compacted'>[];
}

export interface CouncilSnapshot {
  themeMode: ThemeMode;
  members: Member[];
  conversations: Conversation[];
  chamberMap: Record<string, Conversation>;
}

export interface CouncilRepository {
  init(): Promise<void>;
  getSnapshot(): Promise<CouncilSnapshot>;

  getThemeMode(): Promise<ThemeMode>;
  setThemeMode(mode: ThemeMode): Promise<void>;

  listMembers(includeArchived?: boolean): Promise<Member[]>;
  createMember(input: CreateMemberInput): Promise<Member>;
  updateMember(memberId: string, patch: UpdateMemberPatch): Promise<Member>;
  archiveMember(memberId: string): Promise<void>;
  setMemberStoreName(memberId: string, storeName: string): Promise<void>;

  listConversations(includeArchived?: boolean): Promise<Conversation[]>;
  listHalls(includeArchived?: boolean): Promise<Conversation[]>;
  listChambers(includeArchived?: boolean): Promise<Conversation[]>;
  createHall(input: CreateHallInput): Promise<Conversation>;
  renameHall(conversationId: string, title: string): Promise<Conversation>;
  archiveHall(conversationId: string): Promise<void>;
  getOrCreateChamber(memberId: string): Promise<Conversation>;
  getChamberByMember(memberId: string): Promise<Conversation | null>;
  listChamberMap(): Promise<Record<string, Conversation>>;

  listParticipants(conversationId: string, includeRemoved?: boolean): Promise<ConversationParticipant[]>;
  addHallParticipant(conversationId: string, memberId: string): Promise<void>;
  removeHallParticipant(conversationId: string, memberId: string): Promise<void>;

  listMessages(conversationId: string): Promise<Message[]>;
  appendMessages(input: AppendMessagesInput): Promise<void>;
  clearMessages(conversationId: string): Promise<void>;
  applyCompaction(conversationId: string, summary: string, compactedMessageIds: string[]): Promise<void>;

  setToken(token: string | null): void;
  generateUploadUrl(): Promise<string>;
  setMemberAvatar(memberId: string, storageId: string): Promise<Member>;
}
