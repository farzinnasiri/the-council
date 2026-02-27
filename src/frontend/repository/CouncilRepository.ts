import type {
  Conversation,
  ConversationMemoryLog,
  ConversationParticipant,
  HallMode,
  Member,
  Message,
  RoundtableState,
  ThemeMode,
} from '../types/domain';
import type { CompactionPolicy as CompactionPolicyConfig } from '../constants/compactionPolicy';

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
  chamberMap: Record<string, Conversation>;
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
  debug?: {
    traceId: string;
    mode: 'with-kb' | 'prompt-only';
    reason?: string;
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
    queryPlan?: {
      originalQuery: string;
      standaloneQuery: string;
      queryAlternates: string[];
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
  appendMessages(input: AppendMessagesInput): Promise<void>;
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

  routeHallMembers(input: {
    conversationId: string;
    message: string;
    maxSelections?: number;
  }): Promise<RouteResult>;
  suggestHallTitle(input: {
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
  }): Promise<MemberChatResult>;
  prepareRoundtableRound(input: {
    conversationId: string;
    trigger: 'user_message' | 'continue';
    triggerMessageId?: string;
    mentionedMemberIds?: string[];
  }): Promise<RoundtableState>;
  setRoundtableSelections(input: {
    conversationId: string;
    roundNumber: number;
    selectedMemberIds: string[];
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
  }): Promise<MemberChatResult & { intent: 'speak' | 'challenge' | 'support'; targetMemberId?: string }>;
  chatRoundtableSpeakers(input: {
    conversationId: string;
    roundNumber: number;
  }): Promise<
    Array<{
      memberId: string;
      status: 'sent' | 'error';
      answer: string;
      intent: 'speak' | 'challenge' | 'support';
      targetMemberId?: string;
      error?: string;
    }>
  >;
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
