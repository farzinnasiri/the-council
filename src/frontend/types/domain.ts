export type ThemeMode = 'light' | 'dark' | 'system';
export type ConversationKind = 'hall' | 'chamber';
export type ConversationType = ConversationKind;
export type MessageRole = 'user' | 'member' | 'system';
export type MessageStatus = 'sent' | 'error';
export type RoutingSource = 'llm' | 'fallback' | 'chamber-fixed';

export interface User {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  themeMode?: ThemeMode;
}

export interface Member {
  id: string;
  name: string;
  avatarUrl?: string | null;
  specialties: string[];
  systemPrompt: string;
  kbStoreName?: string;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  chamberMemberId?: string;
  deletedAt?: number;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationParticipant {
  id: string;
  conversationId: string;
  memberId: string;
  status: 'active' | 'removed';
  joinedAt: number;
  leftAt?: number;
  createdAt: number;
}

export interface MessageRouting {
  memberIds: string[];
  source: RoutingSource;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  authorMemberId?: string;
  content: string;
  status: MessageStatus;
  compacted: boolean;
  routing?: MessageRouting;
  inReplyToMessageId?: string;
  originConversationId?: string;
  originMessageId?: string;
  error?: string;
  createdAt: number;
}

export interface KnowledgeDocument {
  name?: string;
  displayName?: string;
  uploadedAt?: string;
}
