import type { Conversation, Member, Message, ThemeMode } from '../types/domain';

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
  kbStoreName?: string | null;
  status?: Member['status'];
}

export interface CreateConversationInput {
  type: Conversation['type'];
  title: string;
  memberIds: string[];
  memberId?: string;
}

export interface UpdateConversationPatch {
  title?: string;
  updatedAt?: string;
  memberIds?: string[];
  memberId?: string;
  archived?: boolean;
}

export interface CouncilSnapshot {
  themeMode: ThemeMode;
  members: Member[];
  conversations: Conversation[];
  messages: Message[];
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
  listConversations(): Promise<Conversation[]>;
  createConversation(input: CreateConversationInput): Promise<Conversation>;
  updateConversation(conversationId: string, patch: UpdateConversationPatch): Promise<Conversation>;
  listMessages(conversationId: string): Promise<Message[]>;
  appendMessages(conversationId: string, messages: Message[]): Promise<void>;
  listAllMessages(): Promise<Message[]>;
  clearMessages(conversationId: string): Promise<void>;
  getMemberStoreName(memberId: string): Promise<string | null>;
  setMemberStoreName(memberId: string, storeName: string): Promise<void>;
}
