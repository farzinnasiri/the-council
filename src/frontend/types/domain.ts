export type ThemeMode = 'light' | 'dark' | 'system';
export type ConversationType = 'hall' | 'chamber';

export interface Member {
  id: string;
  name: string;
  emoji: string;
  role: string;
  specialties: string[];
  systemPrompt: string;
  kbStoreName: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string;
  updatedAt: string;
  memberIds: string[];
  memberId?: string;
  archived?: boolean;
}

export type MessageSenderType = 'user' | 'member' | 'system';

export interface Message {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderName?: string;
  memberId?: string;
  content: string;
  timestamp: string;
  createdAt: string;
  routeMemberIds?: string[];
  routingSource?: 'llm' | 'fallback' | 'chamber-fixed';
  status?: 'pending' | 'sent' | 'error';
  error?: string;
  meta?: {
    canReply?: boolean;
    canDM?: boolean;
  };
}

export interface KnowledgeDocument {
  name?: string;
  displayName?: string;
  uploadedAt?: string;
}
