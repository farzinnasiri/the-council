export type ThemeMode = 'light' | 'dark' | 'system';
export type ConversationType = 'hall' | 'chamber';
export type MessageRole = 'user' | 'member' | 'system';
export type MessageStatus = 'pending' | 'sent' | 'error';
export type MemberStatus = 'active' | 'archived';
export type ConversationStatus = 'active' | 'archived';
export type RoutingSource = 'llm' | 'fallback' | 'chamber-fixed';

export interface Member {
  id: string;
  name: string;
  emoji: string;
  role: string;
  specialties: string[];
  systemPrompt: string;
  kbStoreName?: string;          // undefined = no KB store
  status: MemberStatus;
  createdAt: number;             // epoch ms (_creationTime)
  updatedAt: number;             // epoch ms
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string;
  memberIds: string[];           // Member.id references
  status: ConversationStatus;
  summary?: string;              // SummaryBuffer: rolling compaction summary
  messageCount: number;
  createdAt: number;             // epoch ms (_creationTime)
  updatedAt: number;             // epoch ms
}

export interface MessageRouting {
  memberIds: string[];           // Member.id references
  source: RoutingSource;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  memberId?: string;             // set for role=member messages
  content: string;
  status: MessageStatus;
  compacted: boolean;
  routing?: MessageRouting;     // set for system routing messages
  error?: string;
  createdAt: number;             // epoch ms (_creationTime)
}

export interface KnowledgeDocument {
  name?: string;
  displayName?: string;
  uploadedAt?: string;
}
