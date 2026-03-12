export type ThemeMode = 'light' | 'dark' | 'system';
export type ConversationKind = 'hall' | 'chamber';
export type ConversationType = ConversationKind;
export type HallMode = 'advisory' | 'roundtable';
export type ChamberResponseMode = 'instant' | 'short' | 'think' | 'deep_dive';
export type MessageRole = 'user' | 'member' | 'system';
export type MessageStatus = 'sent' | 'error';
export type RoutingSource = 'llm' | 'fallback' | 'chamber-fixed';
export type RoundtableIntent = 'speak' | 'challenge' | 'support' | 'pass';
export type RoundtableRoundStatus = 'awaiting_user' | 'in_progress' | 'completed' | 'superseded';
export type PersonalArchiveBucket = 'reflection' | 'cookie_jar' | 'accountability' | 'world_model';

export interface PersonalArchiveAccess {
  reflection: boolean;
  cookieJar: boolean;
  accountability: boolean;
  worldModel: boolean;
}

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
  personalArchiveAccess: PersonalArchiveAccess;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  hallMode?: HallMode;
  chamberResponseMode?: ChamberResponseMode;
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
  scope: 'chamber' | 'hall';
  roundNumber?: number;
  memory?: string;
  totalMessagesAtRun: number;
  activeMessagesAtRun: number;
  compactedMessageCount: number;
  recentRawTail: number;
  deletedAt?: number;
  createdAt: number;
}

export interface ConversationNotebook {
  id: string;
  conversationId: string;
  content: string;
  updatedAt: number;
  createdAt: number;
  archivedAt?: number;
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
  deletedAt?: number;
  supersededAt?: number;
  supersededByMessageId?: string;
  supersedesMessageId?: string;
  revisionKind?: 'think_harder' | 'deep_dive' | 'shorter' | 'elaborate';
  generationProfile?: ChamberResponseMode;
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

export interface PersonalArchiveProfile {
  id: string;
  identity: string;
  updatedAt: number;
}

export interface PersonalArchiveCapturePreview {
  captureId: string;
  parseStatus: 'ready' | 'failed';
  parseError?: string;
  rawText: string;
  proposedEntries: Array<{
    bucket: PersonalArchiveBucket;
    title?: string;
    content: string;
  }>;
}

export interface PersonalArchiveEntry {
  id: string;
  captureId?: string;
  bucket: PersonalArchiveBucket;
  title?: string;
  content: string;
  archivedAt?: number;
  updatedAt: number;
  createdAt: number;
}
