import type {
  Conversation,
  ChamberResponseMode,
  ConversationMemoryLog,
  ConversationNotebook,
  ConversationParticipant,
  HallMode,
  Member,
  Message,
  MessageFeedback,
  MessageFeedbackKey,
  PersonalArchiveAccess,
  PersonalArchiveCapturePreview,
  PersonalArchiveEntry,
  PersonalArchiveProfile,
  RoundtableState,
  ConversationGuidanceDirective,
  TimeAwareReentryGapBucket,
  ThemeMode,
} from '../types/domain';
import type { CompactionPolicy as CompactionPolicyConfig } from '../constants/compactionPolicy';

export interface CreateMemberInput {
  name: string;
  systemPrompt: string;
  guidanceProfilePrompt?: string;
  specialties?: string[];
  personalArchiveAccess?: PersonalArchiveAccess;
}

export interface UpdateMemberPatch {
  name?: string;
  systemPrompt?: string;
  guidanceProfilePrompt?: string;
  guidanceProfileGeneratedAt?: number;
  specialties?: string[];
  personalArchiveAccess?: PersonalArchiveAccess;
  kbStoreName?: string | null;
  deletedAt?: number;
}

export interface CreateHallInput {
  title: string;
  memberIds: string[];
  hallMode?: HallMode;
}

export interface AppendMessagesInput {
  conversationId: string;
  messages: Omit<Message, 'id' | 'createdAt' | 'compacted'>[];
}

export interface CouncilSnapshot {
  themeMode: ThemeMode;
  members: Member[];
  conversations: Conversation[];
}

export interface RouteResult {
  chosenMemberIds: string[];
  model: string;
  source: 'llm' | 'fallback';
}

export interface HallTitleResult {
  title: string;
  model: string;
}

export interface MemberSpecialtiesResult {
  specialties: string[];
  model: string;
}

export interface MemberChatResult {
  answer: string;
  grounded: boolean;
  citations: Array<{ title: string; uri?: string }>;
  model: string;
  retrievalModel: string;
  usedKnowledgeBase: boolean;
  usedPersonalArchive?: boolean;
  debug?: {
    traceId: string;
    mode: 'with-context' | 'prompt-only';
    reason?: string;
    contextPlanner?: {
      requestedSources: string[];
      availableKnowledgeDocs: number;
      availableArchiveBuckets: string[];
      decisionReason: string;
    };
    kbCheck?: {
      requestedStoreName: string | null;
      docsCount: number;
      listError?: string;
      fileSearchInvoked: boolean;
      gateDecision?: {
        mode: 'heuristic' | 'llm-gate';
        useKnowledgeBase: boolean;
        reason: string;
        decision?: 'required' | 'helpful' | 'unnecessary';
        confidence?: number;
      };
    };
    personalArchiveCheck?: {
      availableBuckets: string[];
      totalEntries: number;
      used: boolean;
    };
    queryPlan?: {
      originalQuery: string;
      standaloneQuery: string;
      queryAlternates: string[];
      deepDiveQueries?: string[];
      gateUsed: boolean;
      gateReason: string;
      matchedDigestSignals: string[];
    };
    fileSearchStart?: {
      storeName: string;
      retrievalModel: string;
      query: string;
      metadataFilter?: string;
      alternateQuery?: string;
    };
    fileSearchResponse?: {
      grounded: boolean;
      citationsCount: number;
      snippetsCount: number;
      retrievalText: string;
      citations: Array<{ title: string; uri?: string }>;
      snippets: string[];
      queryUsed?: string;
      usedAlternateQuery?: boolean;
      deepDivePasses?: Array<{
        query: string;
        grounded: boolean;
        citationsCount: number;
        snippetsCount: number;
        retrievalText: string;
        citations: Array<{ title: string; uri?: string }>;
        snippets: string[];
      }>;
    };
    personalArchiveSearchResponse?: {
      grounded: boolean;
      citationsCount: number;
      snippetsCount: number;
      retrievalText: string;
      citations: Array<{ title: string; uri?: string }>;
      snippets: string[];
      queryUsed?: string;
    };
    answerPrompt: string;
  };
}

export interface KBDigestMetadata {
  id: string;
  memberId: string;
  kbDocumentName?: string;
  displayName: string;
  topics: string[];
  entities: string[];
  lexicalAnchors: string[];
  styleAnchors: string[];
  digestSummary: string;
  updatedAt: number;
}

export interface KbDocumentLifecycle {
  id: string;
  memberId: string;
  storageId: string;
  displayName: string;
  mimeType?: string;
  sizeBytes?: number;
  kbStoreName: string;
  kbDocumentName: string;
  uploadStatus: 'uploaded' | 'failed';
  chunkingStatus: 'pending' | 'running' | 'completed' | 'failed';
  indexingStatus: 'pending' | 'running' | 'completed' | 'failed';
  metadataStatus: 'pending' | 'running' | 'completed' | 'failed';
  chunkCountTotal?: number;
  chunkCountIndexed?: number;
  ingestErrorChunking?: string;
  ingestErrorIndexing?: string;
  ingestErrorMetadata?: string;
  createdAt: number;
  updatedAt: number;
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
  generateMemberGuidanceProfile(input: {
    memberId: string;
    systemPrompt: string;
    specialties?: string[];
    force?: boolean;
  }): Promise<{ guidanceProfilePrompt: string; model: string }>;

  listConversations(includeArchived?: boolean): Promise<Conversation[]>;
  listHalls(includeArchived?: boolean): Promise<Conversation[]>;
  listChambers(includeArchived?: boolean): Promise<Conversation[]>;
  listChamberThreadsByMember(memberId: string, includeArchived?: boolean): Promise<Conversation[]>;
  createHall(input: CreateHallInput): Promise<Conversation>;
  createChamberThread(memberId: string): Promise<Conversation>;
  startHallFollowUpThread(input: {
    hallConversationId: string;
    hallMessageId: string;
  }): Promise<{
    conversation: Conversation;
    messages: Message[];
    memory: string;
  }>;
  getLatestChamberThread(memberId: string): Promise<Conversation | null>;
  setChamberResponseMode(conversationId: string, mode: ChamberResponseMode): Promise<Conversation>;
  setChamberTimeAwareReentryEnabled(conversationId: string, enabled: boolean): Promise<Conversation>;
  setChamberTimeAwareReentryState(input: {
    conversationId: string;
    state?: {
      gapBucket: TimeAwareReentryGapBucket;
      repliesRemaining: 1 | 2;
      explicitContinuation: boolean;
      activatedAt: number;
    };
  }): Promise<Conversation>;
  markChamberTimeAwareReentryNoticeSeen(conversationId: string): Promise<Conversation>;
  renameConversation(conversationId: string, title: string): Promise<Conversation>;
  archiveConversation(conversationId: string): Promise<void>;
  clearChamberByMember(memberId: string): Promise<void>;
  listConversationGuidanceDirectives(conversationId: string): Promise<ConversationGuidanceDirective[]>;
  listMessageFeedback(conversationId: string): Promise<MessageFeedback[]>;
  setMessageFeedback(input: {
    messageId: string;
    key: MessageFeedbackKey;
    active: boolean;
  }): Promise<MessageFeedback[]>;
  syncFeedbackGuidanceDirectives(input: {
    messageId: string;
  }): Promise<{ directivesCreated: number; activeKeys: MessageFeedbackKey[] }>;
  upsertTimeAwareReentryGuidance(input: {
    conversationId: string;
    gapBucket: TimeAwareReentryGapBucket;
    explicitContinuation: boolean;
  }): Promise<{ directivesCreated: number }>;
  reflectChamberGuidance(input: {
    conversationId: string;
    trigger: 'interval' | 'feedback';
    messageId?: string;
    feedbackKeys?: MessageFeedbackKey[];
  }): Promise<{ directivesCreated: number; model?: string; skippedReason?: string }>;

  listParticipants(conversationId: string, includeRemoved?: boolean): Promise<ConversationParticipant[]>;
  addHallParticipant(conversationId: string, memberId: string): Promise<void>;
  removeHallParticipant(conversationId: string, memberId: string): Promise<void>;

  listMessages(conversationId: string): Promise<Message[]>;
  listMessagesPage(
    conversationId: string,
    options?: { beforeCreatedAt?: number; limit?: number }
  ): Promise<{ messages: Message[]; hasMore: boolean }>;
  getMessageCounts(conversationId: string): Promise<{ totalNonSystem: number; activeNonSystem: number }>;
  getLatestChamberMemoryLog(conversationId: string): Promise<ConversationMemoryLog | null>;
  listMemoryLogsByScope(conversationId: string, scope: 'chamber' | 'hall'): Promise<ConversationMemoryLog[]>;
  upsertHallRoundSummary(input: {
    conversationId: string;
    roundNumber: number;
    memory: string;
    recentRawTail: number;
    totalMessagesAtRun: number;
    activeMessagesAtRun: number;
    compactedMessageCount: number;
  }): Promise<void>;
  getCompactionPolicy(): Promise<CompactionPolicyConfig>;
  appendMessages(input: AppendMessagesInput): Promise<Message[]>;
  replaceWithRefinement(input: {
    targetMessageId: string;
    replacement: Omit<Message, 'id' | 'createdAt' | 'compacted'>;
  }): Promise<{ superseded: Message; replacement: Message }>;
  appendElaborationReply(input: {
    targetMessageId: string;
    reply: Omit<Message, 'id' | 'createdAt' | 'compacted'>;
  }): Promise<Message>;
  clearMessages(conversationId: string): Promise<void>;
  clearChamberSummary(conversationId: string): Promise<void>;
  applyCompaction(
    conversationId: string,
    summary: string,
    compactedMessageIds: string[],
    recentRawTail?: number
  ): Promise<void>;

  setToken(token: string | null): void;
  generateUploadUrl(): Promise<string>;
  setMemberAvatar(memberId: string, storageId: string): Promise<Member>;
  getPersonalArchiveProfile(): Promise<PersonalArchiveProfile | null>;
  updatePersonalArchiveIdentity(identity: string): Promise<PersonalArchiveProfile>;
  previewPersonalArchiveCapture(input: {
    sourceType: 'text' | 'audio' | 'file' | 'import';
    rawText?: string;
    storageId?: string;
    originalLabel?: string;
    mimeType?: string;
    sizeBytes?: number;
    forcedBucket?: PersonalArchiveEntry['bucket'];
  }): Promise<PersonalArchiveCapturePreview>;
  commitPersonalArchiveCapture(input: {
    captureId: string;
    entries: Array<{
      bucket: PersonalArchiveEntry['bucket'];
      title?: string;
      content: string;
    }>;
  }): Promise<void>;
  listPersonalArchiveEntries(includeArchived?: boolean): Promise<PersonalArchiveEntry[]>;
  updatePersonalArchiveEntry(input: {
    entryId: string;
    bucket: PersonalArchiveEntry['bucket'];
    title?: string;
    content: string;
  }): Promise<void>;
  archivePersonalArchiveEntry(entryId: string): Promise<void>;
  deletePersonalArchiveEntry(entryId: string): Promise<void>;
  getConversationNotebook(conversationId: string): Promise<ConversationNotebook | null>;
  listActiveConversationNotebooks(): Promise<ConversationNotebook[]>;
  saveConversationNotebook(conversationId: string, content: string): Promise<ConversationNotebook | null>;
  archiveConversationNotebook(conversationId: string): Promise<void>;

  routeHallMembers(input: {
    conversationId: string;
    message: string;
    maxSelections?: number;
  }): Promise<RouteResult>;
  transcribeAudioFromStorage(input: {
    storageId: string;
    mimeType?: string;
  }): Promise<{ transcript: string; model: string }>;
  suggestHallTitle(input: {
    message: string;
    model?: string;
  }): Promise<HallTitleResult>;
  suggestChamberTitle(input: {
    message: string;
    model?: string;
  }): Promise<HallTitleResult>;
  suggestMemberSpecialties(input: {
    name: string;
    systemPrompt: string;
    model?: string;
  }): Promise<MemberSpecialtiesResult>;
  chatWithMember(input: {
    conversationId: string;
    memberId: string;
    message: string;
    previousSummary?: string;
    contextMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    hallContext?: string;
    chatProfile?: ChamberResponseMode;
    retrievalProfile?: 'default' | 'deep_dive';
    turnDirective?: 'shorter' | 'elaborate';
    timeAwareReentry?: {
      gapBucket: TimeAwareReentryGapBucket;
      repliesRemaining: 1 | 2;
      explicitContinuation: boolean;
    };
    guidanceDirectives?: Array<{
      note: string;
    }>;
  }): Promise<MemberChatResult>;
  prepareRoundtableRound(input: {
    conversationId: string;
    trigger: 'user_message' | 'continue';
    triggerMessageId?: string;
    mentionedMemberIds?: string[];
  }): Promise<RoundtableState>;
  refreshRoundtableRound(input: {
    conversationId: string;
    roundNumber: number;
  }): Promise<RoundtableState>;
  markRoundtableInProgress(input: {
    conversationId: string;
    roundNumber: number;
  }): Promise<RoundtableState>;
  markRoundtableCompleted(input: {
    conversationId: string;
    roundNumber: number;
  }): Promise<RoundtableState>;
  getRoundtableState(conversationId: string): Promise<RoundtableState | null>;
  chatRoundtableSpeaker(input: {
    conversationId: string;
    roundNumber: number;
    memberId: string;
    force?: boolean;
  }): Promise<MemberChatResult & { intent: 'speak' | 'challenge' | 'support'; targetMemberId?: string }>;
  compactConversation(input: {
    conversationId: string;
    previousSummary?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    messageIds: string[];
    memoryScope?: 'chamber' | 'hall';
    memoryContext?: {
      conversationId: string;
      memberName: string;
      memberSpecialties: string[];
    };
  }): Promise<{ summary: string }>;
  summarizeHallRound(input: {
    conversationId: string;
    roundNumber: number;
    messages: Array<{ author: string; content: string }>;
    model?: string;
  }): Promise<{ summary: string }>;
  ensureMemberStore(input: { memberId: string }): Promise<{ storeName: string; created: boolean }>;
  createKbDocumentRecord(input: {
    memberId: string;
    stagedFile: {
      storageId: string;
      displayName: string;
      mimeType?: string;
      sizeBytes?: number;
    };
  }): Promise<{ kbDocumentId: string; document: KbDocumentLifecycle }>;
  startKbDocumentProcessing(input: { kbDocumentId: string }): Promise<{ ok: boolean; document: KbDocumentLifecycle }>;
  retryKbDocumentIndexing(input: { kbDocumentId: string }): Promise<{ ok: boolean; document: KbDocumentLifecycle }>;
  retryKbDocumentMetadata(input: { kbDocumentId: string }): Promise<{ ok: boolean; document: KbDocumentLifecycle }>;
  listKbDocuments(input: { memberId: string }): Promise<KbDocumentLifecycle[]>;
  deleteKbDocument(input: {
    kbDocumentId: string;
  }): Promise<{ ok: boolean; alreadyDeleted?: boolean; deletedChunkCount?: number; clearedStoreName?: boolean; error?: string }>;
  uploadMemberDocuments(input: {
    memberId: string;
    stagedFiles: Array<{
      storageId: string;
      displayName: string;
      mimeType?: string;
      sizeBytes?: number;
    }>;
  }): Promise<{ storeName: string; documents: Array<{ name?: string; displayName?: string }> }>;
  listMemberDocuments(input: { memberId: string }): Promise<Array<{ name?: string; displayName?: string }>>;
  deleteMemberDocument(input: {
    memberId: string;
    documentName: string;
  }): Promise<{ ok: boolean; documents?: Array<{ name?: string; displayName?: string }> }>;
  listMemberDigestMetadata(input: { memberId: string }): Promise<KBDigestMetadata[]>;
  updateMemberDigestMetadata(input: {
    digestId: string;
    displayName: string;
    topics: string[];
    entities: string[];
    lexicalAnchors: string[];
    styleAnchors: string[];
    digestSummary: string;
  }): Promise<{ ok: boolean }>;
  rehydrateMemberStore(input: {
    memberId: string;
    mode?: 'missing-only' | 'all';
  }): Promise<{
    storeName: string;
    rehydratedCount: number;
    skippedCount: number;
    documents: Array<{ name?: string; displayName?: string }>;
  }>;
  purgeExpiredStagedDocuments(input: { memberId?: string }): Promise<{ purgedCount: number }>;
}
