import type {
  Conversation,
  ChamberResponseMode,
  ConversationMemoryLog,
  ConversationNotebook,
  ConversationParticipant,
  CustomGuidanceChipKey,
  HallMode,
  Member,
  Message,
  MessageCustomGuidance,
  MessageFeedback,
  MessageFeedbackKey,
  MemberMemoryDocument,
  MemberMemoryEpisode,
  MemberMemoryRefreshState,
  PersonalSourceDigest,
  PersonalSourceDocument,
  RoundtableState,
  RetrievalStrategy,
  ConversationGuidanceDirective,
  TimeAwareReentryGapBucket,
  MemberVoiceName,
  PromptTraceDraft,
  PromptTraceRecord,
  ThemeMode,
  User,
} from "../types/domain";
import type { CompactionPolicy as CompactionPolicyConfig } from "../constants/compactionPolicy";

export interface CreateMemberInput {
  name: string;
  systemPrompt: string;
  chatResponseModelSlot?: number;
  guidanceProfilePrompt?: string;
  ttsVoiceName?: MemberVoiceName;
  ttsPersonaPrompt?: string;
  specialties?: string[];
  personalSourcesPermissionEnabled?: boolean;
}

export interface UpdateMemberPatch {
  name?: string;
  systemPrompt?: string;
  chatResponseModelSlot?: number;
  guidanceProfilePrompt?: string;
  guidanceProfileGeneratedAt?: number;
  ttsVoiceName?: MemberVoiceName;
  ttsPersonaPrompt?: string;
  ttsPersonaGeneratedAt?: number;
  specialties?: string[];
  personalSourcesPermissionEnabled?: boolean;
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
  messages: Array<
    Omit<Message, "id" | "createdAt" | "compacted"> & {
      promptTraceDraft?: PromptTraceDraft;
    }
  >;
}

export interface CouncilSnapshot {
  themeMode: ThemeMode;
  members: Member[];
  conversations: Conversation[];
}

export interface RouteResult {
  chosenMemberIds: string[];
  model: string;
  source: "llm" | "fallback";
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
  usedPersonalSources?: boolean;
  attemptedResponseModelSlot?: number;
  attemptedResponseModelSpec?: string;
  finalResponseModelSlot?: number;
  finalResponseModelSpec?: string;
  fallbackUsed?: boolean;
  promptTraceDraft?: PromptTraceDraft;
}

export interface ChatResponseModelSlotOption {
  slot: number;
  envKey: string;
  modelSpec: string;
  isDefault: boolean;
}

export interface MessageSpeechResult {
  mimeType: string;
  segments: Array<{
    index: number;
    audioBase64: string;
  }>;
  voiceName: MemberVoiceName;
  cacheKey: string;
}

export interface KBDocumentCardMetadata {
  docType: string;
  about: string;
  bestFor: string[];
  evidenceKinds: string[];
  notFor: string[];
}

export interface KBDigestMetadata {
  id: string;
  memberId: string;
  kbDocumentName?: string;
  displayName: string;
  documentCard: KBDocumentCardMetadata;
  queryHints: string[];
  updatedAt: number;
}

export interface KbChunkConfig {
  chunkSizeChars: number;
  chunkOverlapChars: number;
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
  uploadStatus: "uploaded" | "failed";
  chunkingStatus: "pending" | "running" | "completed" | "failed";
  indexingStatus: "pending" | "running" | "completed" | "failed";
  metadataStatus: "pending" | "running" | "completed" | "failed";
  chunkConfig: KbChunkConfig;
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
  listChatResponseModelSlots(): Promise<ChatResponseModelSlotOption[]>;
  archiveMember(memberId: string): Promise<void>;
  setMemberStoreName(memberId: string, storeName: string): Promise<void>;
  generateMemberGuidanceProfile(input: {
    memberId: string;
    systemPrompt: string;
    specialties?: string[];
    force?: boolean;
  }): Promise<{ guidanceProfilePrompt: string; model: string }>;
  generateMemberVoicePersona(input: {
    memberId: string;
    systemPrompt: string;
    specialties?: string[];
    ttsVoiceName?: MemberVoiceName;
    force?: boolean;
  }): Promise<{ ttsPersonaPrompt: string; model: string }>;
  getMemberMemoryBundle(memberId: string): Promise<{
    interactionPolicy: MemberMemoryDocument | null;
    mentalModel: MemberMemoryDocument | null;
    episodes: MemberMemoryEpisode[];
    refreshState: MemberMemoryRefreshState | null;
  }>;
  saveMemberInteractionPolicy(input: {
    memberId: string;
    body: string;
  }): Promise<MemberMemoryDocument | null>;
  saveMemberMentalModel(input: {
    memberId: string;
    body: string;
  }): Promise<MemberMemoryDocument | null>;
  unlockMemberMemory(input: {
    memberId: string;
    kind: "interaction_policy" | "mental_model";
  }): Promise<void>;
  queueMemberMemoryRefresh(input: {
    memberId: string;
    force?: boolean;
  }): Promise<{ scheduled: boolean }>;
  updateMemberMemoryEpisode(input: {
    episodeId: string;
    title?: string;
    body?: string;
    archivedAt?: number | null;
  }): Promise<MemberMemoryEpisode | null>;

  listConversations(includeArchived?: boolean): Promise<Conversation[]>;
  listHalls(includeArchived?: boolean): Promise<Conversation[]>;
  listChambers(includeArchived?: boolean): Promise<Conversation[]>;
  listChamberThreadsByMember(
    memberId: string,
    includeArchived?: boolean,
  ): Promise<Conversation[]>;
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
  setChamberResponseMode(
    conversationId: string,
    mode: ChamberResponseMode,
  ): Promise<Conversation>;
  setChamberTimeAwareReentryEnabled(
    conversationId: string,
    enabled: boolean,
  ): Promise<Conversation>;
  setChamberPersonalSourcesEnabled(
    conversationId: string,
    enabled: boolean,
  ): Promise<Conversation>;
  setChamberTimeAwareReentryState(input: {
    conversationId: string;
    state?: {
      gapBucket: TimeAwareReentryGapBucket;
      repliesRemaining: 1 | 2;
      explicitContinuation: boolean;
      activatedAt: number;
    };
  }): Promise<Conversation>;
  markChamberTimeAwareReentryNoticeSeen(
    conversationId: string,
  ): Promise<Conversation>;
  renameConversation(
    conversationId: string,
    title: string,
  ): Promise<Conversation>;
  archiveConversation(conversationId: string): Promise<void>;
  closeHall(
    conversationId: string,
  ): Promise<{ conversation: Conversation; closingMessage: Message }>;
  clearChamberByMember(memberId: string): Promise<void>;
  listConversationGuidanceDirectives(
    conversationId: string,
  ): Promise<ConversationGuidanceDirective[]>;
  listMessageFeedback(conversationId: string): Promise<MessageFeedback[]>;
  setMessageFeedback(input: {
    messageId: string;
    key: MessageFeedbackKey;
    active: boolean;
  }): Promise<MessageFeedback[]>;
  upsertCustomFeedbackGuidance(input: {
    messageId: string;
    chips: CustomGuidanceChipKey[];
    text?: string;
  }): Promise<MessageCustomGuidance>;
  clearCustomFeedbackGuidance(messageId: string): Promise<void>;
  setMessagePinned(input: {
    messageId: string;
    active: boolean;
  }): Promise<Message | null>;
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
    trigger: "interval" | "feedback";
    messageId?: string;
    feedbackKeys?: MessageFeedbackKey[];
  }): Promise<{
    directivesCreated: number;
    model?: string;
    skippedReason?: string;
  }>;

  listParticipants(
    conversationId: string,
    includeRemoved?: boolean,
  ): Promise<ConversationParticipant[]>;
  syncHallParticipants(conversationId: string, memberIds: string[]): Promise<void>;
  ensureHallParticipantResponseSlots(
    conversationId: string,
  ): Promise<{ updatedCount: number }>;
  addHallParticipant(conversationId: string, memberId: string): Promise<void>;
  removeHallParticipant(
    conversationId: string,
    memberId: string,
  ): Promise<void>;

  listMessages(conversationId: string): Promise<Message[]>;
  listMessagesPage(
    conversationId: string,
    options?: { cursor?: string | null; limit?: number },
  ): Promise<{
    messages: Message[];
    continueCursor: string | null;
    hasMore: boolean;
  }>;
  getMessageCounts(
    conversationId: string,
  ): Promise<{ totalNonSystem: number; activeNonSystem: number }>;
  getLatestChamberMemoryLog(
    conversationId: string,
  ): Promise<ConversationMemoryLog | null>;
  listMemoryLogsByScope(
    conversationId: string,
    scope: "chamber" | "hall",
  ): Promise<ConversationMemoryLog[]>;
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
  getMessagePromptTrace(messageId: string): Promise<PromptTraceRecord | null>;
  listPromptTraceMessageIds(conversationId: string): Promise<string[]>;
  appendMessages(input: AppendMessagesInput): Promise<Message[]>;
  deleteLatestTurn(input: {
    conversationId: string;
    expectedLatestUserMessageId?: string;
  }): Promise<{
    latestUserMessageId: string;
    deletedMessageIds: string[];
    deletedAt: number;
    updatedAt: number;
    lastMessageAt?: number;
    guidanceLastReflectedUserTurnCount?: number;
  }>;
  discardMessage(messageId: string): Promise<Message | null>;
  replaceWithRefinement(input: {
    targetMessageId: string;
    replacement: Omit<Message, "id" | "createdAt" | "compacted"> & {
      promptTraceDraft?: PromptTraceDraft;
    };
  }): Promise<{ superseded: Message; replacement: Message }>;
  appendElaborationReply(input: {
    targetMessageId: string;
    reply: Omit<Message, "id" | "createdAt" | "compacted"> & {
      promptTraceDraft?: PromptTraceDraft;
    };
  }): Promise<Message>;
  clearMessages(conversationId: string): Promise<void>;
  clearChamberSummary(conversationId: string): Promise<void>;
  applyCompaction(
    conversationId: string,
    summary: string,
    compactedMessageIds: string[],
    recentRawTail?: number,
  ): Promise<void>;

  setToken(token: string | null): void;
  generateUploadUrl(): Promise<string>;
  setMemberAvatar(memberId: string, storageId: string): Promise<Member>;
  migrateLegacyProfileNote(): Promise<User>;
  updateProfileNote(profileNote: string): Promise<User>;
  listPersonalSourceDocuments(): Promise<PersonalSourceDocument[]>;
  createPersonalSourceRecord(input: {
    stagedFile: {
      storageId: string;
      displayName: string;
      mimeType?: string;
      sizeBytes?: number;
    };
    chunkConfig?: KbChunkConfig;
  }): Promise<{
    personalSourceDocumentId: string;
    document: PersonalSourceDocument;
  }>;
  processPersonalSource(input: {
    personalSourceDocumentId: string;
  }): Promise<{ ok: boolean; document: PersonalSourceDocument }>;
  reprocessPersonalSource(input: {
    personalSourceDocumentId: string;
    chunkConfig?: KbChunkConfig;
  }): Promise<{ ok: boolean; document: PersonalSourceDocument }>;
  deletePersonalSource(input: {
    personalSourceDocumentId: string;
  }): Promise<{ ok: boolean }>;
  getPersonalSourceDownloadUrl(input: {
    personalSourceDocumentId: string;
  }): Promise<string | null>;
  listPersonalSourceDigests(): Promise<PersonalSourceDigest[]>;
  updatePersonalSourceDigestMetadata(input: {
    digestId: string;
    displayName: string;
    metadata: {
      documentKinds: string[];
      semanticClasses: string[];
      queryHints: string[];
      voice?: "first_person" | "second_person" | "mixed" | "unknown";
    };
  }): Promise<{ ok: boolean }>;
  getConversationNotebook(
    conversationId: string,
  ): Promise<ConversationNotebook | null>;
  listActiveConversationNotebooks(): Promise<ConversationNotebook[]>;
  saveConversationNotebook(
    conversationId: string,
    content: string,
  ): Promise<ConversationNotebook | null>;
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
  synthesizeMessageSpeech(input: {
    conversationId: string;
    messageId: string;
  }): Promise<MessageSpeechResult>;
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
    contextMessages?: Array<{ role: "user" | "assistant"; content: string }>;
    hallContext?: string;
    chatProfile?: ChamberResponseMode;
    retrievalStrategy?: RetrievalStrategy;
    turnDirective?: "shorter" | "elaborate";
    timeAwareReentry?: {
      gapBucket: TimeAwareReentryGapBucket;
      repliesRemaining: 1 | 2;
      explicitContinuation: boolean;
    };
    guidanceDirectives?: Array<{
      note: string;
    }>;
    debugPromptTrace?: boolean;
  }): Promise<MemberChatResult>;
  prepareRoundtableRound(input: {
    conversationId: string;
    trigger: "user_message" | "continue";
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
    speakingMemberId?: string;
    selectedBy?: "allocator" | "mention_boost" | "user_manual_fallback";
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
    debugPromptTrace?: boolean;
  }): Promise<
    MemberChatResult & {
      intent: "speak" | "challenge" | "support";
      targetMemberId?: string;
    }
  >;
  chatRoundtableSpeakers(input: {
    conversationId: string;
    roundNumber: number;
    debugPromptTrace?: boolean;
  }): Promise<
    Array<{
      memberId: string;
      status: "sent" | "error";
      answer: string;
      intent: "speak" | "challenge" | "support";
      targetMemberId?: string;
      error?: string;
      attemptedResponseModelSlot?: number;
      attemptedResponseModelSpec?: string;
      finalResponseModelSlot?: number;
      finalResponseModelSpec?: string;
      fallbackUsed?: boolean;
      promptTraceDraft?: PromptTraceDraft;
    }>
  >;
  compactConversation(input: {
    conversationId: string;
    previousSummary?: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    messageIds: string[];
    memoryScope?: "chamber" | "hall";
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
  ensureMemberStore(input: {
    memberId: string;
  }): Promise<{ storeName: string; created: boolean }>;
  createKbDocumentRecord(input: {
    memberId: string;
    stagedFile: {
      storageId: string;
      displayName: string;
      mimeType?: string;
      sizeBytes?: number;
    };
    chunkConfig?: KbChunkConfig;
  }): Promise<{ kbDocumentId: string; document: KbDocumentLifecycle }>;
  startKbDocumentProcessing(input: {
    kbDocumentId: string;
  }): Promise<{ ok: boolean; document: KbDocumentLifecycle }>;
  retryKbDocumentIndexing(input: {
    kbDocumentId: string;
  }): Promise<{ ok: boolean; document: KbDocumentLifecycle }>;
  retryKbDocumentMetadata(input: {
    kbDocumentId: string;
  }): Promise<{ ok: boolean; document: KbDocumentLifecycle }>;
  reprocessKbDocument(input: {
    kbDocumentId: string;
    chunkConfig?: KbChunkConfig;
  }): Promise<{ ok: boolean; document: KbDocumentLifecycle }>;
  getKbDocumentDownloadUrl(input: {
    kbDocumentId: string;
  }): Promise<string | null>;
  listKbDocuments(input: { memberId: string }): Promise<KbDocumentLifecycle[]>;
  deleteKbDocument(input: {
    kbDocumentId: string;
  }): Promise<{
    ok: boolean;
    alreadyDeleted?: boolean;
    deletedChunkCount?: number;
    clearedStoreName?: boolean;
    error?: string;
  }>;
  uploadMemberDocuments(input: {
    memberId: string;
    stagedFiles: Array<{
      storageId: string;
      displayName: string;
      mimeType?: string;
      sizeBytes?: number;
    }>;
  }): Promise<{
    storeName: string;
    documents: Array<{ name?: string; displayName?: string }>;
  }>;
  listMemberDocuments(input: {
    memberId: string;
  }): Promise<Array<{ name?: string; displayName?: string }>>;
  deleteMemberDocument(input: {
    memberId: string;
    documentName: string;
  }): Promise<{
    ok: boolean;
    documents?: Array<{ name?: string; displayName?: string }>;
  }>;
  listMemberDigestMetadata(input: {
    memberId: string;
  }): Promise<KBDigestMetadata[]>;
  updateMemberDigestMetadata(input: {
    digestId: string;
    displayName: string;
    documentCard: KBDocumentCardMetadata;
    queryHints: string[];
  }): Promise<{ ok: boolean }>;
  rehydrateMemberStore(input: {
    memberId: string;
    mode?: "missing-only" | "all";
  }): Promise<{
    storeName: string;
    rehydratedCount: number;
    skippedCount: number;
    documents: Array<{ name?: string; displayName?: string }>;
  }>;
  purgeExpiredStagedDocuments(input: {
    memberId?: string;
  }): Promise<{ purgedCount: number }>;
}
