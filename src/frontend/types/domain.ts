export type {
  PromptTraceDraft,
  PromptTraceKind,
  PromptTraceMeta,
  PromptTraceMetaValue,
  PromptTraceRecord,
  PromptTraceRetrievalMetadata,
  PromptTraceSection,
  PromptTraceSourceKind,
} from '../../../shared/promptTrace';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ConversationKind = 'hall' | 'chamber';
export type ConversationType = ConversationKind;
export type HallMode = 'advisory' | 'roundtable';
export type ChamberResponseMode = 'instant' | 'short' | 'think' | 'brainstorm' | 'deep_dive';
export type RetrievalStrategy = 'instant' | 'brainstorm' | 'deep_dive';
export type TimeAwareReentryGapBucket = 'mild' | 'medium' | 'strong' | 'very_strong';
export type MessageRole = 'user' | 'member' | 'system';
export type MessageStatus = 'sent' | 'error';
export type RoutingSource = 'llm' | 'fallback' | 'chamber-fixed';
export type RoundtableIntent = 'speak' | 'challenge' | 'support' | 'pass';
export type RoundtableMoveType =
  | 'rebuttal'
  | 'caveat'
  | 'synthesis'
  | 'evidence'
  | 'reframing'
  | 'clarification'
  | 'agreement'
  | 'pass';
export type RoundtableRoundStatus = 'awaiting_user' | 'in_progress' | 'completed' | 'superseded';
export type RoundtableCandidateStatus = 'shortlisted' | 'speaking' | 'spoken' | 'dismissed';
export type RoundtableCandidateSelectedBy = 'allocator' | 'mention_boost' | 'user_manual_fallback';
export type RoundtableRationaleTag = 'pushback' | 'new angle' | 'evidence' | 'synthesis' | 'clarify';
export type SystemMessageKind = 'routing' | 'hall_followup_context' | 'hall_closure';
export type MemberVoiceName = 'Kore' | 'Zephyr' | 'Fenrir' | 'Puck' | 'Charon';
export type MessageFeedbackKey =
  | 'like'
  | 'dislike'
  | 'helpful'
  | 'not_helpful'
  | 'shorter'
  | 'longer'
  | 'clearer'
  | 'more_direct'
  | 'softer'
  | 'harder';
export type GuidanceFeedbackKind = 'quick' | 'custom';
export type CustomGuidanceChipKey =
  | 'repetitive'
  | 'structure'
  | 'tone'
  | 'formatting'
  | 'persona'
  | 'missed_my_point';

export interface User {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  profileNote?: string;
  themeMode?: ThemeMode;
}

export interface Member {
  id: string;
  name: string;
  avatarUrl?: string | null;
  specialties: string[];
  systemPrompt: string;
  chatResponseModelSlot?: number;
  guidanceProfilePrompt?: string;
  guidanceProfileGeneratedAt?: number;
  guidanceProfileUpdatedAt?: number;
  ttsVoiceName: MemberVoiceName;
  ttsPersonaPrompt?: string;
  ttsPersonaGeneratedAt?: number;
  ttsPersonaUpdatedAt?: number;
  kbStoreName?: string;
  personalSourcesPermissionEnabled: boolean;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface MemberMemoryDocument {
  id: string;
  memberId: string;
  body: string;
  lockedByUser: boolean;
  generatedAt: number;
  updatedAt: number;
  userEditedAt?: number;
  lastProcessedMessageAt?: number;
}

export interface MemberMemoryEpisode {
  id: string;
  memberId: string;
  title?: string;
  body: string;
  lockedByUser: boolean;
  archivedAt?: number;
  generatedAt: number;
  updatedAt: number;
  userEditedAt?: number;
  lastProcessedMessageAt?: number;
}

export interface MemberMemoryRefreshState {
  id: string;
  memberId: string;
  processing: boolean;
  processingStartedAt?: number;
  nextEligibleAt: number;
  lastRunAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  retryCount: number;
  lastProcessedMessageAt?: number;
  lastError?: string;
  updatedAt: number;
}

export interface MemberRunningBrief {
  id: string;
  memberId: string;
  rawBody: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MemberRunningBriefStatus {
  memberId: string;
  enabled: boolean;
  hasContent: boolean;
  available: boolean;
  updatedAt?: number;
}

export interface ConversationMemberRunningBriefOverride {
  id: string;
  conversationId: string;
  memberId: string;
  runningBriefEnabled?: boolean;
  updatedAt: number;
  createdAt: number;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  hallMode?: HallMode;
  chamberResponseMode?: ChamberResponseMode;
  timeAwareReentryEnabled?: boolean;
  personalSourcesEnabled?: boolean;
  timeAwareReentryState?: {
    gapBucket: TimeAwareReentryGapBucket;
    repliesRemaining: 1 | 2;
    explicitContinuation: boolean;
    activatedAt: number;
  };
  timeAwareReentryNoticeSeenAt?: number;
  guidanceLastReflectedUserTurnCount?: number;
  title: string;
  chamberMemberId?: string;
  closedAt?: number;
  closedReason?: 'user_closed';
  deletedAt?: number;
  lastMessageAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationParticipant {
  id: string;
  conversationId: string;
  memberId: string;
  chatResponseModelSlot?: number;
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

export interface ConversationGuidanceDirective {
  id: string;
  conversationId: string;
  memberId: string;
  source: 'background_reflection' | 'feedback' | 'system_rule';
  triggerMessageId?: string;
  note: string;
  feedbackKind?: GuidanceFeedbackKind;
  feedbackChips?: CustomGuidanceChipKey[];
  feedbackText?: string;
  createdAfterUserTurn: number;
  expiresAfterUserTurn: number;
  createdAt: number;
}

export interface MessageCustomGuidance {
  directiveId: string;
  chips: CustomGuidanceChipKey[];
  text?: string;
  note: string;
}

export interface MessageRouting {
  memberIds: string[];
  source: RoutingSource;
}

export interface Message {
  id: string;
  renderId?: string;
  conversationId: string;
  role: MessageRole;
  systemKind?: SystemMessageKind;
  authorMemberId?: string;
  content: string;
  status: MessageStatus;
  compacted: boolean;
  deletedAt?: number;
  supersededAt?: number;
  supersededByMessageId?: string;
  supersedesMessageId?: string;
  revisionKind?: 'think_harder' | 'brainstorm' | 'deep_dive' | 'shorter' | 'elaborate';
  generationProfile?: ChamberResponseMode;
  routing?: MessageRouting;
  inReplyToMessageId?: string;
  originConversationId?: string;
  originMessageId?: string;
  mentionedMemberIds?: string[];
  roundNumber?: number;
  roundIntent?: Exclude<RoundtableIntent, 'pass'>;
  roundTargetMemberId?: string;
  pinnedAt?: number;
  error?: string;
  createdAt: number;
}

export interface MessageFeedback {
  id: string;
  conversationId: string;
  messageId: string;
  memberId: string;
  key: MessageFeedbackKey;
  createdAt: number;
  updatedAt: number;
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

export interface RoundtableCandidateState {
  id: string;
  conversationId: string;
  roundNumber: number;
  memberId: string;
  rank: number;
  status: RoundtableCandidateStatus;
  moveType: RoundtableMoveType;
  targetMemberId?: string;
  rationaleTag: RoundtableRationaleTag;
  allocatorReason: string;
  score: number;
  selectedBy: RoundtableCandidateSelectedBy;
  updatedAt: number;
  createdAt: number;
}

export interface RoundtableState {
  round: RoundtableRound;
  candidates: RoundtableCandidateState[];
  spokenMemberIds: string[];
}

export interface KnowledgeDocument {
  name?: string;
  displayName?: string;
  uploadedAt?: string;
}

export interface PersonalSourceMetadata {
  documentKinds: string[];
  semanticClasses: string[];
  queryHints: string[];
  voice?: 'first_person' | 'second_person' | 'mixed' | 'unknown';
}

export interface PersonalSourceDocument {
  id: string;
  storageId: string;
  displayName: string;
  mimeType?: string;
  sizeBytes?: number;
  personalSourceName: string;
  uploadStatus: 'uploaded' | 'failed';
  chunkingStatus: 'pending' | 'running' | 'completed' | 'failed';
  indexingStatus: 'pending' | 'running' | 'completed' | 'failed';
  metadataStatus: 'pending' | 'running' | 'completed' | 'failed';
  chunkConfig: {
    chunkSizeChars: number;
    chunkOverlapChars: number;
  };
  chunkCountTotal?: number;
  chunkCountIndexed?: number;
  ingestErrorChunking?: string;
  ingestErrorIndexing?: string;
  ingestErrorMetadata?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PersonalSourceDigest {
  id: string;
  personalSourceName: string;
  displayName: string;
  metadata: PersonalSourceMetadata;
  updatedAt: number;
}
