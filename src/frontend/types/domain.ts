export type ThemeMode = 'light' | 'dark' | 'system';
export type ConversationKind = 'hall' | 'chamber';
export type ConversationType = ConversationKind;
export type HallMode = 'advisory' | 'roundtable';
export type MessageRole = 'user' | 'member' | 'system';
export type MessageStatus = 'sent' | 'error';
export type RoutingSource = 'llm' | 'fallback' | 'chamber-fixed';
export type RoundtableIntent = 'speak' | 'challenge' | 'support' | 'pass';
export type RoundtableRoundStatus = 'awaiting_user' | 'in_progress' | 'completed' | 'superseded';

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
  hallMode?: HallMode;
  title: string;
  chamberMemberId?: string;
  deletedAt?: number;
  lastMessageAt?: number;
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

export interface ConversationMemoryLog {
  id: string;
  conversationId: string;
  scope: 'chamber';
  memory?: string;
  totalMessagesAtRun: number;
  activeMessagesAtRun: number;
  compactedMessageCount: number;
  recentRawTail: number;
  deletedAt?: number;
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
  mentionedMemberIds?: string[];
  roundNumber?: number;
  roundIntent?: Exclude<RoundtableIntent, 'pass'>;
  roundTargetMemberId?: string;
  error?: string;
  createdAt: number;
}

export interface RoundtableRound {
  id: string;
  conversationId: string;
  roundNumber: number;
  status: RoundtableRoundStatus;
  trigger: 'user_message' | 'continue';
  triggerMessageId?: string;
  maxSpeakers: number;
  updatedAt: number;
  createdAt: number;
}

export interface RoundtableIntentState {
  id: string;
  conversationId: string;
  roundNumber: number;
  memberId: string;
  intent: RoundtableIntent;
  targetMemberId?: string;
  rationale: string;
  selected: boolean;
  source: 'mention' | 'intent_default' | 'user_manual';
  updatedAt: number;
  createdAt: number;
}

export interface RoundtableState {
  round: RoundtableRound;
  intents: RoundtableIntentState[];
}

export interface KnowledgeDocument {
  name?: string;
  displayName?: string;
  uploadedAt?: string;
}
