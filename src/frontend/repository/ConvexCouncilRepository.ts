import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type {
  ChamberResponseMode,
  Conversation,
  ConversationGuidanceDirective,
  ConversationMemoryLog,
  ConversationNotebook,
  ConversationParticipant,
  CustomGuidanceChipKey,
  RoundtableState,
  Member,
  MemberVoiceName,
  MemberMemoryDocument,
  MemberMemoryEpisode,
  MemberMemoryRefreshState,
  Message,
  PromptTraceDraft,
  PromptTraceRecord,
  MessageCustomGuidance,
  MessageFeedback,
  MessageFeedbackKey,
  PersonalSourceDigest,
  PersonalSourceDocument,
  RetrievalStrategy,
  ThemeMode,
  TimeAwareReentryGapBucket,
  User,
} from '../types/domain';
import {
  COMPACTION_POLICY_DEFAULTS,
  COMPACTION_POLICY_KEYS,
  normalizePolicyNumber,
  type CompactionPolicy,
} from '../constants/compactionPolicy';
import type {
  AppendMessagesInput,
  ChatResponseModelSlotOption,
  CouncilRepository,
  CouncilSnapshot,
  CreateHallInput,
  CreateMemberInput,
  HallTitleResult,
  KbChunkConfig,
  KBDigestMetadata,
  KbDocumentLifecycle,
  MessageSpeechResult,
  MemberChatResult,
  MemberSpecialtiesResult,
  RouteResult,
  UpdateMemberPatch,
} from './CouncilRepository';
import { DEFAULT_MEMBER_VOICE } from '../constants/memberVoice';

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;
const DEFAULT_KB_CHUNK_CONFIG: KbChunkConfig = {
  chunkSizeChars: 2000,
  chunkOverlapChars: 500,
};
const PROMPT_TRACE_QUERY_TIMEOUT_MS = 12_000;

type ConvexMemberDoc = any;
type ConvexConversationDoc = any;
type ConvexParticipantDoc = any;
type ConvexMessageDoc = any;
type ConvexPromptTraceDoc = any;

function toMember(doc: ConvexMemberDoc): Member {
  return {
    id: doc._id,
    name: doc.name,
    avatarUrl: (doc as any).avatarUrl ?? null,
    specialties: doc.specialties,
    systemPrompt: doc.systemPrompt,
    chatResponseModelSlot: doc.chatResponseModelSlot,
    guidanceProfilePrompt: doc.guidanceProfilePrompt,
    guidanceProfileGeneratedAt: doc.guidanceProfileGeneratedAt,
    guidanceProfileUpdatedAt: doc.guidanceProfileUpdatedAt,
    ttsVoiceName: (doc.ttsVoiceName as MemberVoiceName | undefined) ?? DEFAULT_MEMBER_VOICE,
    ttsPersonaPrompt: doc.ttsPersonaPrompt,
    ttsPersonaGeneratedAt: doc.ttsPersonaGeneratedAt,
    ttsPersonaUpdatedAt: doc.ttsPersonaUpdatedAt,
    kbStoreName: doc.kbStoreName,
    personalSourcesPermissionEnabled: Boolean(doc.personalSourcesPermissionEnabled),
    deletedAt: doc.deletedAt,
    createdAt: doc._creationTime,
    updatedAt: doc.updatedAt,
  };
}

function toConversation(doc: ConvexConversationDoc): Conversation {
  return {
    id: doc._id,
    kind: doc.kind,
    hallMode: doc.kind === 'hall' ? ((doc.hallMode as 'advisory' | 'roundtable' | undefined) ?? 'advisory') : undefined,
    chamberResponseMode: doc.kind === 'chamber' ? (doc.chamberResponseMode as ChamberResponseMode | undefined) ?? 'instant' : undefined,
    timeAwareReentryEnabled: doc.kind === 'chamber' ? Boolean(doc.timeAwareReentryEnabled ?? true) : undefined,
    personalSourcesEnabled: doc.kind === 'chamber' ? Boolean(doc.personalSourcesEnabled ?? true) : undefined,
    timeAwareReentryState: doc.kind === 'chamber' && doc.timeAwareReentryState
      ? {
          gapBucket: doc.timeAwareReentryState.gapBucket as TimeAwareReentryGapBucket,
          repliesRemaining: doc.timeAwareReentryState.repliesRemaining as 1 | 2,
          explicitContinuation: Boolean(doc.timeAwareReentryState.explicitContinuation),
          activatedAt: doc.timeAwareReentryState.activatedAt,
        }
      : undefined,
    timeAwareReentryNoticeSeenAt: doc.kind === 'chamber' ? doc.timeAwareReentryNoticeSeenAt : undefined,
    guidanceLastReflectedUserTurnCount: doc.kind === 'chamber' ? doc.guidanceLastReflectedUserTurnCount : undefined,
    title: doc.title,
    chamberMemberId: doc.chamberMemberId as string | undefined,
    closedAt: doc.closedAt,
    closedReason: doc.closedReason,
    deletedAt: doc.deletedAt,
    lastMessageAt: doc.lastMessageAt,
    createdAt: doc._creationTime,
    updatedAt: doc.updatedAt,
  };
}

function toParticipant(doc: ConvexParticipantDoc): ConversationParticipant {
  return {
    id: doc._id,
    conversationId: doc.conversationId,
    memberId: doc.memberId,
    chatResponseModelSlot: doc.chatResponseModelSlot,
    status: doc.status,
    joinedAt: doc.joinedAt,
    leftAt: doc.leftAt,
    createdAt: doc._creationTime,
  };
}

function toMessage(doc: ConvexMessageDoc): Message {
  return {
    id: doc._id,
    renderId: doc._id,
    conversationId: doc.conversationId,
    role: doc.role,
    systemKind: doc.systemKind,
    authorMemberId: doc.authorMemberId,
    content: doc.content,
    status: doc.status,
    compacted: doc.compacted,
    deletedAt: doc.deletedAt,
    supersededAt: doc.supersededAt,
    supersededByMessageId: doc.supersededByMessageId,
    supersedesMessageId: doc.supersedesMessageId,
    revisionKind: doc.revisionKind,
    generationProfile: doc.generationProfile,
    routing: doc.routing,
    inReplyToMessageId: doc.inReplyToMessageId,
    originConversationId: doc.originConversationId,
    originMessageId: doc.originMessageId,
    mentionedMemberIds: doc.mentionedMemberIds,
    roundNumber: doc.roundNumber,
    roundIntent: doc.roundIntent,
    roundTargetMemberId: doc.roundTargetMemberId,
    pinnedAt: doc.pinnedAt,
    error: doc.error,
    createdAt: doc._creationTime,
  };
}

function toRoundtableState(doc: any): RoundtableState {
  return {
    round: {
      id: doc.round._id,
      conversationId: doc.round.conversationId,
      roundNumber: doc.round.roundNumber,
      status: doc.round.status,
      trigger: doc.round.trigger,
      triggerMessageId: doc.round.triggerMessageId,
      maxSpeakers: doc.round.maxSpeakers,
      updatedAt: doc.round.updatedAt,
      createdAt: doc.round._creationTime,
    },
    spokenMemberIds: doc.spokenMemberIds ?? [],
    candidates: (doc.candidates ?? []).map((row: any) => ({
      id: row._id,
      conversationId: row.conversationId,
      roundNumber: row.roundNumber,
      memberId: row.memberId,
      rank: row.rank,
      status: row.status,
      moveType: row.moveType,
      targetMemberId: row.targetMemberId,
      rationaleTag: row.rationaleTag,
      allocatorReason: row.allocatorReason,
      score: row.score,
      selectedBy: row.selectedBy,
      updatedAt: row.updatedAt,
      createdAt: row._creationTime,
    })),
  };
}

function toMemoryLog(doc: ConvexMessageDoc): ConversationMemoryLog {
  return {
    id: doc._id,
    conversationId: doc.conversationId,
    scope: doc.scope,
    roundNumber: doc.roundNumber,
    memory: doc.memory,
    totalMessagesAtRun: doc.totalMessagesAtRun,
    activeMessagesAtRun: doc.activeMessagesAtRun,
    compactedMessageCount: doc.compactedMessageCount,
    recentRawTail: doc.recentRawTail,
    deletedAt: doc.deletedAt,
    createdAt: doc._creationTime,
  };
}

function toConversationNotebook(doc: any): ConversationNotebook {
  return {
    id: doc._id,
    conversationId: doc.conversationId,
    content: doc.content,
    updatedAt: doc.updatedAt,
    createdAt: doc._creationTime,
    archivedAt: doc.archivedAt,
  };
}

function toPromptTraceRecord(doc: ConvexPromptTraceDoc): PromptTraceRecord {
  return {
    id: doc._id,
    conversationId: doc.conversationId,
    messageId: doc.messageId,
    kind: doc.kind,
    sections: doc.sections ?? [],
    retrieval: doc.retrieval ?? {
      plannerKbQueries: [],
      secondPassKbQueries: [],
      personalSourceQueries: [],
      selectedKbDocumentNames: [],
    },
    capturedAt: doc.capturedAt,
    createdAt: doc._creationTime,
  };
}

function toMemberMemoryDocument(doc: any): MemberMemoryDocument {
  return {
    id: doc._id,
    memberId: doc.memberId,
    body: doc.body,
    lockedByUser: Boolean(doc.lockedByUser),
    generatedAt: doc.generatedAt,
    updatedAt: doc.updatedAt,
    userEditedAt: doc.userEditedAt,
    lastProcessedMessageAt: doc.lastProcessedMessageAt,
  };
}

function toMemberMemoryEpisode(doc: any): MemberMemoryEpisode {
  return {
    id: doc._id,
    memberId: doc.memberId,
    title: doc.title,
    body: doc.body,
    lockedByUser: Boolean(doc.lockedByUser),
    archivedAt: doc.archivedAt,
    generatedAt: doc.generatedAt,
    updatedAt: doc.updatedAt,
    userEditedAt: doc.userEditedAt,
    lastProcessedMessageAt: doc.lastProcessedMessageAt,
  };
}

function toMemberMemoryRefreshState(doc: any): MemberMemoryRefreshState {
  return {
    id: doc._id,
    memberId: doc.memberId,
    processing: Boolean(doc.processing),
    processingStartedAt: doc.processingStartedAt,
    nextEligibleAt: doc.nextEligibleAt,
    lastRunAt: doc.lastRunAt,
    lastSuccessAt: doc.lastSuccessAt,
    lastFailureAt: doc.lastFailureAt,
    retryCount: doc.retryCount,
    lastProcessedMessageAt: doc.lastProcessedMessageAt,
    lastError: doc.lastError,
    updatedAt: doc.updatedAt,
  };
}

function toConversationGuidanceDirective(doc: any): ConversationGuidanceDirective {
  return {
    id: doc._id,
    conversationId: doc.conversationId,
    memberId: doc.memberId,
    source: doc.source,
    triggerMessageId: doc.triggerMessageId,
    note: doc.note,
    feedbackKind: doc.feedbackKind,
    feedbackChips: doc.feedbackChips,
    feedbackText: doc.feedbackText,
    createdAfterUserTurn: doc.createdAfterUserTurn,
    expiresAfterUserTurn: doc.expiresAfterUserTurn,
    createdAt: doc.createdAt ?? doc._creationTime,
  };
}

function toMessageFeedback(doc: any): MessageFeedback {
  return {
    id: doc._id,
    conversationId: doc.conversationId,
    messageId: doc.messageId,
    memberId: doc.memberId,
    key: doc.key,
    createdAt: doc.createdAt ?? doc._creationTime,
    updatedAt: doc.updatedAt ?? doc._creationTime,
  };
}

function toKbDocumentLifecycle(doc: any): KbDocumentLifecycle {
  if (!doc) {
    throw new Error('Missing KB document lifecycle payload');
  }
  return {
    id: doc._id,
    memberId: doc.memberId,
    storageId: doc.storageId,
    displayName: doc.displayName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    kbStoreName: doc.kbStoreName,
    kbDocumentName: doc.kbDocumentName,
    uploadStatus: doc.uploadStatus,
    chunkingStatus: doc.chunkingStatus,
    indexingStatus: doc.indexingStatus,
    metadataStatus: doc.metadataStatus,
    chunkConfig: {
      chunkSizeChars: doc.chunkSizeChars ?? DEFAULT_KB_CHUNK_CONFIG.chunkSizeChars,
      chunkOverlapChars: doc.chunkOverlapChars ?? DEFAULT_KB_CHUNK_CONFIG.chunkOverlapChars,
    },
    chunkCountTotal: doc.chunkCountTotal,
    chunkCountIndexed: doc.chunkCountIndexed,
    ingestErrorChunking: doc.ingestErrorChunking,
    ingestErrorIndexing: doc.ingestErrorIndexing,
    ingestErrorMetadata: doc.ingestErrorMetadata,
    createdAt: doc.createdAt ?? doc._creationTime,
    updatedAt: doc.updatedAt,
  };
}

function toPersonalSourceDocument(doc: any): PersonalSourceDocument {
  return {
    id: doc._id,
    storageId: doc.storageId,
    displayName: doc.displayName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    personalSourceName: doc.personalSourceName,
    uploadStatus: doc.uploadStatus,
    chunkingStatus: doc.chunkingStatus,
    indexingStatus: doc.indexingStatus,
    metadataStatus: doc.metadataStatus,
    chunkConfig: {
      chunkSizeChars: doc.chunkSizeChars ?? DEFAULT_KB_CHUNK_CONFIG.chunkSizeChars,
      chunkOverlapChars: doc.chunkOverlapChars ?? DEFAULT_KB_CHUNK_CONFIG.chunkOverlapChars,
    },
    chunkCountTotal: doc.chunkCountTotal,
    chunkCountIndexed: doc.chunkCountIndexed,
    ingestErrorChunking: doc.ingestErrorChunking,
    ingestErrorIndexing: doc.ingestErrorIndexing,
    ingestErrorMetadata: doc.ingestErrorMetadata,
    createdAt: doc.createdAt ?? doc._creationTime,
    updatedAt: doc.updatedAt,
  };
}

function toPersonalSourceDigest(doc: any): PersonalSourceDigest {
  return {
    id: doc._id,
    personalSourceName: doc.personalSourceName,
    displayName: doc.displayName,
    metadata: {
      documentKinds: doc.metadata?.documentKinds ?? [],
      semanticClasses: doc.metadata?.semanticClasses ?? [],
      queryHints: doc.metadata?.queryHints ?? [],
      voice: doc.metadata?.voice,
    },
    updatedAt: doc.updatedAt,
  };
}

class ConvexCouncilRepository implements CouncilRepository {
  private client: ConvexHttpClient;

  constructor() {
    this.client = new ConvexHttpClient(CONVEX_URL);
  }

  private get clientAny() {
    return this.client as any;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  }

  async init(): Promise<void> {
    await this.client.mutation(api.seed.initializeIfNeeded, {});
  }

  setToken(token: string | null): void {
    if (token) {
      this.client.setAuth(token);
      return;
    }
    this.client = new ConvexHttpClient(CONVEX_URL);
  }

  async getSnapshot(): Promise<CouncilSnapshot> {
    const [themeMode, members, conversations] = await Promise.all([
      this.getThemeMode(),
      this.listMembers(true),
      this.listConversations(),
    ]);

    return { themeMode, members, conversations };
  }

  async getThemeMode(): Promise<ThemeMode> {
    const value = await this.client.query(api.settings.getForUser, { key: 'theme-mode' });
    if (value === 'light' || value === 'dark' || value === 'system') return value;
    return 'system';
  }

  async setThemeMode(mode: ThemeMode): Promise<void> {
    await this.client.mutation(api.settings.setForUser, { key: 'theme-mode', value: mode });
  }

  async getCurrentUser(): Promise<User | null> {
    const user = await this.client.query(api.users.viewer, {});
    if (!user) return null;
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      image: user.image,
      profileNote: user.profileNote,
    };
  }

  async listMembers(includeArchived = false): Promise<Member[]> {
    const docs = await this.client.query(api.members.list, { includeArchived });
    return docs.map(toMember);
  }

  async createMember(input: CreateMemberInput): Promise<Member> {
    const doc = await this.client.mutation(api.members.create, {
      name: input.name,
      systemPrompt: input.systemPrompt,
      chatResponseModelSlot: input.chatResponseModelSlot,
      guidanceProfilePrompt: input.guidanceProfilePrompt,
      ttsVoiceName: input.ttsVoiceName,
      ttsPersonaPrompt: input.ttsPersonaPrompt,
      specialties: input.specialties,
      personalSourcesPermissionEnabled: input.personalSourcesPermissionEnabled,
    } as any);
    return toMember(doc as any);
  }

  async updateMember(memberId: string, patch: UpdateMemberPatch): Promise<Member> {
    const doc = await this.client.mutation(api.members.update, {
      memberId: memberId as Id<'members'>,
      ...patch,
      kbStoreName: patch.kbStoreName ?? undefined,
    });
    return toMember(doc as any);
  }

  async listChatResponseModelSlots(): Promise<ChatResponseModelSlotOption[]> {
    return await this.client.query(api.settings.listChatResponseModelSlots, {});
  }

  async archiveMember(memberId: string): Promise<void> {
    await this.client.mutation(api.members.archive, {
      memberId: memberId as Id<'members'>,
    });
  }

  async setMemberStoreName(memberId: string, storeName: string): Promise<void> {
    await this.client.mutation(api.members.setStoreName, {
      memberId: memberId as Id<'members'>,
      storeName,
    });
  }

  async generateMemberGuidanceProfile(input: {
    memberId: string;
    systemPrompt: string;
    specialties?: string[];
    force?: boolean;
  }): Promise<{ guidanceProfilePrompt: string; model: string }> {
    return (await this.client.action(api.ai.guidance.generateMemberGuidanceProfile as any, {
      memberId: input.memberId as Id<'members'>,
      systemPrompt: input.systemPrompt,
      specialties: input.specialties,
      force: input.force,
    })) as { guidanceProfilePrompt: string; model: string };
  }

  async generateMemberVoicePersona(input: {
    memberId: string;
    systemPrompt: string;
    specialties?: string[];
    ttsVoiceName?: MemberVoiceName;
    force?: boolean;
  }): Promise<{ ttsPersonaPrompt: string; model: string }> {
    return (await this.client.action(api.ai.voice.generateMemberVoicePersona as any, {
      memberId: input.memberId as Id<'members'>,
      systemPrompt: input.systemPrompt,
      specialties: input.specialties,
      ttsVoiceName: input.ttsVoiceName,
      force: input.force,
    })) as { ttsPersonaPrompt: string; model: string };
  }

  async getMemberMemoryBundle(memberId: string): Promise<{
    interactionPolicy: MemberMemoryDocument | null;
    mentalModel: MemberMemoryDocument | null;
    episodes: MemberMemoryEpisode[];
    refreshState: MemberMemoryRefreshState | null;
  }> {
    const result = await this.clientAny.query('memberMemories:getBundle', {
      memberId: memberId as Id<'members'>,
    });
    return {
      interactionPolicy: result.interactionPolicy ? toMemberMemoryDocument(result.interactionPolicy) : null,
      mentalModel: result.mentalModel ? toMemberMemoryDocument(result.mentalModel) : null,
      episodes: (result.episodes ?? []).map(toMemberMemoryEpisode),
      refreshState: result.refreshState ? toMemberMemoryRefreshState(result.refreshState) : null,
    };
  }

  async saveMemberInteractionPolicy(input: { memberId: string; body: string }): Promise<MemberMemoryDocument | null> {
    const result = await this.clientAny.mutation('memberMemories:saveInteractionPolicy', {
      memberId: input.memberId as Id<'members'>,
      body: input.body,
    });
    return result ? toMemberMemoryDocument(result) : null;
  }

  async saveMemberMentalModel(input: { memberId: string; body: string }): Promise<MemberMemoryDocument | null> {
    const result = await this.clientAny.mutation('memberMemories:saveMentalModel', {
      memberId: input.memberId as Id<'members'>,
      body: input.body,
    });
    return result ? toMemberMemoryDocument(result) : null;
  }

  async unlockMemberMemory(input: { memberId: string; kind: 'interaction_policy' | 'mental_model' }): Promise<void> {
    await this.clientAny.mutation('memberMemories:unlockSingleton', {
      memberId: input.memberId as Id<'members'>,
      kind: input.kind,
    });
  }

  async queueMemberMemoryRefresh(input: { memberId: string; force?: boolean }): Promise<{ scheduled: boolean }> {
    return await this.clientAny.mutation('memberMemories:queueRefresh', {
      memberId: input.memberId as Id<'members'>,
      force: input.force,
    });
  }

  async updateMemberMemoryEpisode(input: {
    episodeId: string;
    title?: string;
    body?: string;
    archivedAt?: number | null;
  }): Promise<MemberMemoryEpisode | null> {
    const result = await this.clientAny.action('memberMemories:updateEpisode', {
      episodeId: input.episodeId as Id<'memberUserEpisodes'>,
      title: input.title,
      body: input.body,
      archivedAt: input.archivedAt,
    });
    return result ? toMemberMemoryEpisode(result) : null;
  }

  async generateUploadUrl(): Promise<string> {
    return await this.client.mutation(api.upload.generateUploadUrl, {});
  }

  async setMemberAvatar(memberId: string, storageId: string): Promise<Member> {
    const doc = await this.client.mutation(api.members.update, {
      memberId: memberId as Id<'members'>,
      avatarId: storageId as Id<'_storage'>,
    });
    return toMember(doc as any);
  }

  async updateProfileNote(profileNote: string): Promise<User> {
    const doc = await this.client.mutation(api.users.update, { profileNote });
    return {
      id: doc._id,
      name: doc.name,
      email: doc.email,
      image: doc.image,
      profileNote: doc.profileNote,
    };
  }

  async migrateLegacyProfileNote(): Promise<User> {
    const doc = await this.client.mutation(api.users.migrateLegacyProfileNote, {});
    return {
      id: doc._id,
      name: doc.name,
      email: doc.email,
      image: doc.image,
      profileNote: doc.profileNote,
    };
  }

  async listPersonalSourceDocuments(): Promise<PersonalSourceDocument[]> {
    const rows = (await this.client.action(api.ai.personalSources.listPersonalSources as any, {})) as any[];
    return rows.map(toPersonalSourceDocument);
  }

  async createPersonalSourceRecord(input: {
    stagedFile: {
      storageId: string;
      displayName: string;
      mimeType?: string;
      sizeBytes?: number;
    };
    chunkConfig?: KbChunkConfig;
  }): Promise<{ personalSourceDocumentId: string; document: PersonalSourceDocument }> {
    const body = (await this.client.action(api.ai.personalSources.createPersonalSourceRecord as any, {
      stagedFile: {
        storageId: input.stagedFile.storageId as Id<'_storage'>,
        displayName: input.stagedFile.displayName,
        mimeType: input.stagedFile.mimeType,
        sizeBytes: input.stagedFile.sizeBytes,
      },
      chunkConfig: input.chunkConfig,
    })) as any;
    return {
      personalSourceDocumentId: body.personalSourceDocumentId,
      document: toPersonalSourceDocument(body.document),
    };
  }

  async processPersonalSource(input: {
    personalSourceDocumentId: string;
  }): Promise<{ ok: boolean; document: PersonalSourceDocument }> {
    const body = (await this.client.action(api.ai.personalSources.processPersonalSource as any, {
      personalSourceDocumentId: input.personalSourceDocumentId as Id<'personalSourceDocuments'>,
    })) as any;
    return {
      ok: Boolean(body.ok),
      document: toPersonalSourceDocument(body.document),
    };
  }

  async reprocessPersonalSource(input: {
    personalSourceDocumentId: string;
    chunkConfig?: KbChunkConfig;
  }): Promise<{ ok: boolean; document: PersonalSourceDocument }> {
    const body = (await this.client.action(api.ai.personalSources.reprocessPersonalSource as any, {
      personalSourceDocumentId: input.personalSourceDocumentId as Id<'personalSourceDocuments'>,
      chunkConfig: input.chunkConfig,
    })) as any;
    return {
      ok: Boolean(body.ok),
      document: toPersonalSourceDocument(body.document),
    };
  }

  async deletePersonalSource(input: { personalSourceDocumentId: string }): Promise<{ ok: boolean }> {
    return (await this.client.action(api.ai.personalSources.deletePersonalSource as any, {
      personalSourceDocumentId: input.personalSourceDocumentId as Id<'personalSourceDocuments'>,
    })) as { ok: boolean };
  }

  async getPersonalSourceDownloadUrl(input: { personalSourceDocumentId: string }): Promise<string | null> {
    return (await this.client.query(api.personalSourceDocuments.getDownloadUrl as any, {
      personalSourceDocumentId: input.personalSourceDocumentId as Id<'personalSourceDocuments'>,
    })) as string | null;
  }

  async listPersonalSourceDigests(): Promise<PersonalSourceDigest[]> {
    const rows = (await this.client.query(api.personalSourceDigests.listByUser as any, {
      includeDeleted: false,
    })) as any[];
    return rows.map(toPersonalSourceDigest);
  }

  async updatePersonalSourceDigestMetadata(input: {
    digestId: string;
    displayName: string;
    metadata: {
      documentKinds: string[];
      semanticClasses: string[];
      queryHints: string[];
      voice?: 'first_person' | 'second_person' | 'mixed' | 'unknown';
    };
  }): Promise<{ ok: boolean }> {
    await this.client.mutation(api.personalSourceDigests.updateDigestMetadata as any, {
      digestId: input.digestId as Id<'personalSourceDigests'>,
      displayName: input.displayName,
      metadata: input.metadata,
      updatedAt: Date.now(),
    });
    return { ok: true };
  }

  async getConversationNotebook(conversationId: string): Promise<ConversationNotebook | null> {
    const doc = await this.clientAny.query('notebooks:getNotebookByConversation', {
      conversationId: conversationId as Id<'conversations'>,
    });
    return doc ? toConversationNotebook(doc) : null;
  }

  async listActiveConversationNotebooks(): Promise<ConversationNotebook[]> {
    const docs = await this.clientAny.query('notebooks:listActiveNotebooks', {});
    return docs.map(toConversationNotebook);
  }

  async saveConversationNotebook(conversationId: string, content: string): Promise<ConversationNotebook | null> {
    const doc = await this.clientAny.mutation('notebooks:upsertNotebookContent', {
      conversationId: conversationId as Id<'conversations'>,
      content,
    });
    return doc ? toConversationNotebook(doc) : null;
  }

  async archiveConversationNotebook(conversationId: string): Promise<void> {
    await this.clientAny.mutation('notebooks:archiveNotebookByConversation', {
      conversationId: conversationId as Id<'conversations'>,
    });
  }

  async listConversations(includeArchived = false): Promise<Conversation[]> {
    const docs = await this.clientAny.query('conversations:list', { includeArchived });
    return docs.map(toConversation);
  }

  async listHalls(includeArchived = false): Promise<Conversation[]> {
    const docs = await this.clientAny.query('conversations:listHalls', { includeArchived });
    return docs.map(toConversation);
  }

  async listChambers(includeArchived = false): Promise<Conversation[]> {
    const docs = await this.clientAny.query('conversations:listChambers', { includeArchived });
    return docs.map(toConversation);
  }

  async listChamberThreadsByMember(memberId: string, includeArchived = false): Promise<Conversation[]> {
    const docs = await this.clientAny.query('conversations:listChambersByMember', {
      memberId: memberId as Id<'members'>,
      includeArchived,
    });
    return docs.map(toConversation);
  }

  async createHall(input: CreateHallInput): Promise<Conversation> {
    const payload: Record<string, unknown> = {
      title: input.title,
      memberIds: input.memberIds as Id<'members'>[],
    };
    if (input.hallMode === 'roundtable') {
      payload.hallMode = 'roundtable';
    }

    try {
      const doc = await this.clientAny.mutation('conversations:createHall', payload);
      return toConversation(doc);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isHallModeValidationError =
        input.hallMode === 'roundtable' &&
        message.includes('extra field `hallMode`') &&
        message.includes('conversations:createHall');

      if (isHallModeValidationError) {
        throw new Error(
          'Roundtable mode is not available on the current Convex deployment yet. Run `make deploy` and refresh.'
        );
      }

      throw error;
    }
  }

  async renameConversation(conversationId: string, title: string): Promise<Conversation> {
    const doc = await this.clientAny.mutation('conversations:renameConversation', {
      conversationId: conversationId as Id<'conversations'>,
      title,
    });
    return toConversation(doc);
  }

  async archiveConversation(conversationId: string): Promise<void> {
    await this.clientAny.mutation('conversations:archiveConversation', {
      conversationId: conversationId as Id<'conversations'>,
    });
  }

  async closeHall(conversationId: string): Promise<{ conversation: Conversation; closingMessage: Message }> {
    const result = await this.client.action(api.ai.chat.closeHall as any, {
      conversationId: conversationId as Id<'conversations'>,
    });
    return {
      conversation: toConversation(result.conversation),
      closingMessage: toMessage(result.closingMessage),
    };
  }

  async createChamberThread(memberId: string): Promise<Conversation> {
    const doc = await this.clientAny.mutation('conversations:createChamberThread', {
      memberId: memberId as Id<'members'>,
    });
    return toConversation(doc);
  }

  async startHallFollowUpThread(input: {
    hallConversationId: string;
    hallMessageId: string;
  }): Promise<{
    conversation: Conversation;
    messages: Message[];
    memory: string;
  }> {
    const result = await this.client.action(api.ai.chat.startHallFollowUpThread as any, {
      hallConversationId: input.hallConversationId as Id<'conversations'>,
      hallMessageId: input.hallMessageId as Id<'messages'>,
    });
    return {
      conversation: toConversation(result.conversation),
      messages: result.messages.map(toMessage),
      memory: result.memory,
    };
  }

  async getLatestChamberThread(memberId: string): Promise<Conversation | null> {
    const doc = await this.clientAny.query('conversations:getLatestChamberByMember', {
      memberId: memberId as Id<'members'>,
    });
    return doc ? toConversation(doc) : null;
  }

  async setChamberResponseMode(conversationId: string, mode: ChamberResponseMode): Promise<Conversation> {
    const doc = await this.clientAny.mutation('conversations:setChamberResponseMode', {
      conversationId: conversationId as Id<'conversations'>,
      mode,
    });
    return toConversation(doc);
  }

  async setChamberTimeAwareReentryEnabled(conversationId: string, enabled: boolean): Promise<Conversation> {
    const doc = await this.clientAny.mutation('conversations:setChamberTimeAwareReentryEnabled', {
      conversationId: conversationId as Id<'conversations'>,
      enabled,
    });
    return toConversation(doc);
  }

  async setChamberPersonalSourcesEnabled(conversationId: string, enabled: boolean): Promise<Conversation> {
    const doc = await this.clientAny.mutation('conversations:setChamberPersonalSourcesEnabled', {
      conversationId: conversationId as Id<'conversations'>,
      enabled,
    });
    return toConversation(doc);
  }

  async setChamberTimeAwareReentryState(input: {
    conversationId: string;
    state?: {
      gapBucket: TimeAwareReentryGapBucket;
      repliesRemaining: 1 | 2;
      explicitContinuation: boolean;
      activatedAt: number;
    };
  }): Promise<Conversation> {
    const doc = await this.clientAny.mutation('conversations:setChamberTimeAwareReentryState', {
      conversationId: input.conversationId as Id<'conversations'>,
      state: input.state,
    });
    return toConversation(doc);
  }

  async markChamberTimeAwareReentryNoticeSeen(conversationId: string): Promise<Conversation> {
    const doc = await this.clientAny.mutation('conversations:markChamberTimeAwareReentryNoticeSeen', {
      conversationId: conversationId as Id<'conversations'>,
    });
    return toConversation(doc);
  }

  async clearChamberByMember(memberId: string): Promise<void> {
    await this.clientAny.mutation('conversations:clearChamberByMember', {
      memberId: memberId as Id<'members'>,
    });
  }

  async listConversationGuidanceDirectives(conversationId: string): Promise<ConversationGuidanceDirective[]> {
    const rows = await this.client.query(api.guidance.listConversationGuidanceDirectives, {
      conversationId: conversationId as Id<'conversations'>,
    });
    return rows.map(toConversationGuidanceDirective);
  }

  async listMessageFeedback(conversationId: string): Promise<MessageFeedback[]> {
    const rows = await this.client.query(api.guidance.listMessageFeedback, {
      conversationId: conversationId as Id<'conversations'>,
    });
    return rows.map(toMessageFeedback);
  }

  async setMessageFeedback(input: {
    messageId: string;
    key: MessageFeedbackKey;
    active: boolean;
  }): Promise<MessageFeedback[]> {
    const rows = await this.client.mutation(api.guidance.setMessageFeedback, {
      messageId: input.messageId as Id<'messages'>,
      key: input.key,
      active: input.active,
    });
    return rows.map(toMessageFeedback);
  }

  async upsertCustomFeedbackGuidance(input: {
    messageId: string;
    chips: CustomGuidanceChipKey[];
    text?: string;
  }): Promise<MessageCustomGuidance> {
    const doc = await this.clientAny.mutation('guidance:upsertCustomFeedbackGuidance', {
      messageId: input.messageId as Id<'messages'>,
      chips: input.chips,
      text: input.text,
    });
    return {
      directiveId: doc._id,
      chips: doc.feedbackChips ?? [],
      text: doc.feedbackText,
      note: doc.note,
    };
  }

  async clearCustomFeedbackGuidance(messageId: string): Promise<void> {
    await this.clientAny.mutation('guidance:clearCustomFeedbackGuidance', {
      messageId: messageId as Id<'messages'>,
    });
  }

  async setMessagePinned(input: {
    messageId: string;
    active: boolean;
  }): Promise<Message | null> {
    const doc = await this.clientAny.mutation('messages:setPinned', {
      messageId: input.messageId as Id<'messages'>,
      active: input.active,
    });
    return doc ? toMessage(doc) : null;
  }

  async syncFeedbackGuidanceDirectives(input: {
    messageId: string;
  }): Promise<{ directivesCreated: number; activeKeys: MessageFeedbackKey[] }> {
    return (await this.client.mutation(api.guidance.syncFeedbackGuidanceDirectives, {
      messageId: input.messageId as Id<'messages'>,
    })) as { directivesCreated: number; activeKeys: MessageFeedbackKey[] };
  }

  async upsertTimeAwareReentryGuidance(input: {
    conversationId: string;
    gapBucket: TimeAwareReentryGapBucket;
    explicitContinuation: boolean;
  }): Promise<{ directivesCreated: number }> {
    return (await this.client.mutation(api.guidance.upsertTimeAwareReentryGuidance, {
      conversationId: input.conversationId as Id<'conversations'>,
      gapBucket: input.gapBucket,
      explicitContinuation: input.explicitContinuation,
    })) as { directivesCreated: number };
  }

  async reflectChamberGuidance(input: {
    conversationId: string;
    trigger: 'interval' | 'feedback';
    messageId?: string;
    feedbackKeys?: MessageFeedbackKey[];
  }): Promise<{ directivesCreated: number; model?: string; skippedReason?: string }> {
    return (await this.client.action(api.ai.guidance.reflectChamberGuidance as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      trigger: input.trigger,
      messageId: input.messageId as Id<'messages'> | undefined,
      feedbackKeys: input.feedbackKeys,
    })) as { directivesCreated: number; model?: string; skippedReason?: string };
  }

  async listParticipants(conversationId: string, includeRemoved = false): Promise<ConversationParticipant[]> {
    const docs = await this.clientAny.query('conversations:listParticipants', {
      conversationId: conversationId as Id<'conversations'>,
      includeRemoved,
    });
    return docs.map(toParticipant);
  }

  async ensureHallParticipantResponseSlots(conversationId: string): Promise<{ updatedCount: number }> {
    return await this.clientAny.mutation('conversations:ensureHallParticipantResponseSlots', {
      conversationId: conversationId as Id<'conversations'>,
    });
  }

  async addHallParticipant(conversationId: string, memberId: string): Promise<void> {
    await this.clientAny.mutation('conversations:addHallParticipant', {
      conversationId: conversationId as Id<'conversations'>,
      memberId: memberId as Id<'members'>,
    });
  }

  async removeHallParticipant(conversationId: string, memberId: string): Promise<void> {
    await this.clientAny.mutation('conversations:removeHallParticipant', {
      conversationId: conversationId as Id<'conversations'>,
      memberId: memberId as Id<'members'>,
    });
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    const docs = await this.client.query(api.messages.listVisible, {
      conversationId: conversationId as Id<'conversations'>,
    });
    return docs.map(toMessage);
  }

  async listMessagesPage(
    conversationId: string,
    options: { cursor?: string | null; limit?: number } = {}
  ): Promise<{ messages: Message[]; continueCursor: string | null; hasMore: boolean }> {
    const result = await this.client.query(api.messages.listPage, {
      conversationId: conversationId as Id<'conversations'>,
      cursor: options.cursor ?? null,
      limit: options.limit,
    });
    return {
      messages: result.messages.map(toMessage),
      continueCursor: result.continueCursor,
      hasMore: result.hasMore,
    };
  }

  async getMessageCounts(conversationId: string): Promise<{ totalNonSystem: number; activeNonSystem: number }> {
    return await this.client.query(api.messages.getConversationCounts, {
      conversationId: conversationId as Id<'conversations'>,
    });
  }

  async getLatestChamberMemoryLog(conversationId: string): Promise<ConversationMemoryLog | null> {
    const doc = await this.clientAny.query('memoryLogs:getLatestByConversation', {
      conversationId: conversationId as Id<'conversations'>,
    });
    return doc ? toMemoryLog(doc) : null;
  }

  async listMemoryLogsByScope(
    conversationId: string,
    scope: 'chamber' | 'hall'
  ): Promise<ConversationMemoryLog[]> {
    const docs = await this.clientAny.query('memoryLogs:listByConversationScope', {
      conversationId: conversationId as Id<'conversations'>,
      scope,
    });
    return docs.map(toMemoryLog);
  }

  async upsertHallRoundSummary(input: {
    conversationId: string;
    roundNumber: number;
    memory: string;
    recentRawTail: number;
    totalMessagesAtRun: number;
    activeMessagesAtRun: number;
    compactedMessageCount: number;
  }): Promise<void> {
    await this.clientAny.mutation('memoryLogs:upsertHallRoundSummary', {
      conversationId: input.conversationId as Id<'conversations'>,
      roundNumber: input.roundNumber,
      memory: input.memory,
      recentRawTail: input.recentRawTail,
      totalMessagesAtRun: input.totalMessagesAtRun,
      activeMessagesAtRun: input.activeMessagesAtRun,
      compactedMessageCount: input.compactedMessageCount,
    });
  }

  async getCompactionPolicy(): Promise<CompactionPolicy> {
    const [thresholdRaw, recentRawTailRaw, hallRawRoundTailRaw] = await Promise.all([
      this.client.query(api.settings.get, { key: COMPACTION_POLICY_KEYS.threshold }),
      this.client.query(api.settings.get, { key: COMPACTION_POLICY_KEYS.recentRawTail }),
      this.client.query(api.settings.get, { key: COMPACTION_POLICY_KEYS.hallRawRoundTail }),
    ]);

    return {
      threshold: normalizePolicyNumber(thresholdRaw, COMPACTION_POLICY_DEFAULTS.threshold, 1),
      recentRawTail: normalizePolicyNumber(recentRawTailRaw, COMPACTION_POLICY_DEFAULTS.recentRawTail, 1),
      hallRawRoundTail: normalizePolicyNumber(hallRawRoundTailRaw, COMPACTION_POLICY_DEFAULTS.hallRawRoundTail, 1),
    };
  }

  async getMessagePromptTrace(messageId: string): Promise<PromptTraceRecord | null> {
    const doc = await this.withTimeout(
      this.client.query(api.promptTraces.getByMessageId as any, {
        messageId: messageId as Id<'messages'>,
      }),
      PROMPT_TRACE_QUERY_TIMEOUT_MS,
      'Timed out loading prompt trace.',
    );
    return doc ? toPromptTraceRecord(doc) : null;
  }

  async listPromptTraceMessageIds(conversationId: string): Promise<string[]> {
    const ids = await this.withTimeout(
      this.client.query(api.promptTraces.listMessageIdsByConversation as any, {
        conversationId: conversationId as Id<'conversations'>,
      }),
      PROMPT_TRACE_QUERY_TIMEOUT_MS,
      'Timed out loading prompt trace availability.',
    );
    return (ids ?? []) as string[];
  }

  async appendMessages(input: AppendMessagesInput): Promise<Message[]> {
    const conversationId = input.conversationId as Id<'conversations'>;
    const rows = await this.client.mutation(api.messages.appendMany, {
      messages: input.messages.map((message) => ({
        conversationId,
        role: message.role,
        systemKind: message.systemKind,
        authorMemberId: message.authorMemberId as Id<'members'> | undefined,
        content: message.content,
        status: message.status,
        deletedAt: message.deletedAt,
        supersededAt: message.supersededAt,
        supersededByMessageId: message.supersededByMessageId as Id<'messages'> | undefined,
        supersedesMessageId: message.supersedesMessageId as Id<'messages'> | undefined,
        revisionKind: message.revisionKind,
        generationProfile: message.generationProfile,
        routing: message.routing
          ? {
            memberIds: message.routing.memberIds as Id<'members'>[],
            source: message.routing.source,
          }
          : undefined,
        inReplyToMessageId: message.inReplyToMessageId as Id<'messages'> | undefined,
        originConversationId: message.originConversationId as Id<'conversations'> | undefined,
        originMessageId: message.originMessageId as Id<'messages'> | undefined,
        mentionedMemberIds: message.mentionedMemberIds as Id<'members'>[] | undefined,
        roundNumber: message.roundNumber,
        roundIntent: message.roundIntent,
        roundTargetMemberId: message.roundTargetMemberId as Id<'members'> | undefined,
        error: message.error,
        promptTraceDraft: message.promptTraceDraft,
      })),
    });
    return rows.map(toMessage);
  }

  async discardMessage(messageId: string): Promise<Message | null> {
    const doc = await this.clientAny.mutation('messages:discard', {
      messageId: messageId as Id<'messages'>,
    });
    return doc ? toMessage(doc) : null;
  }

  async replaceWithRefinement(input: {
    targetMessageId: string;
    replacement: Omit<Message, 'id' | 'createdAt' | 'compacted'>;
  }): Promise<{ superseded: Message; replacement: Message }> {
    const result = await this.clientAny.mutation('messages:replaceWithRefinement', {
      targetMessageId: input.targetMessageId as Id<'messages'>,
      replacement: {
        conversationId: input.replacement.conversationId as Id<'conversations'>,
        role: input.replacement.role,
        systemKind: input.replacement.systemKind,
        authorMemberId: input.replacement.authorMemberId as Id<'members'> | undefined,
        content: input.replacement.content,
        status: input.replacement.status,
        deletedAt: input.replacement.deletedAt,
        supersededAt: input.replacement.supersededAt,
        supersededByMessageId: input.replacement.supersededByMessageId as Id<'messages'> | undefined,
        supersedesMessageId: input.replacement.supersedesMessageId as Id<'messages'> | undefined,
        revisionKind: input.replacement.revisionKind,
        generationProfile: input.replacement.generationProfile,
        routing: input.replacement.routing
          ? {
              memberIds: input.replacement.routing.memberIds as Id<'members'>[],
              source: input.replacement.routing.source,
            }
          : undefined,
        inReplyToMessageId: input.replacement.inReplyToMessageId as Id<'messages'> | undefined,
        originConversationId: input.replacement.originConversationId as Id<'conversations'> | undefined,
        originMessageId: input.replacement.originMessageId as Id<'messages'> | undefined,
        mentionedMemberIds: input.replacement.mentionedMemberIds as Id<'members'>[] | undefined,
        roundNumber: input.replacement.roundNumber,
        roundIntent: input.replacement.roundIntent,
        roundTargetMemberId: input.replacement.roundTargetMemberId as Id<'members'> | undefined,
        error: input.replacement.error,
        promptTraceDraft: input.replacement.promptTraceDraft,
      },
    });
    return {
      superseded: toMessage(result.superseded),
      replacement: toMessage(result.replacement),
    };
  }

  async appendElaborationReply(input: {
    targetMessageId: string;
    reply: Omit<Message, 'id' | 'createdAt' | 'compacted'>;
  }): Promise<Message> {
    const result = await this.clientAny.mutation('messages:appendElaborationReply', {
      targetMessageId: input.targetMessageId as Id<'messages'>,
      reply: {
        conversationId: input.reply.conversationId as Id<'conversations'>,
        role: input.reply.role,
        systemKind: input.reply.systemKind,
        authorMemberId: input.reply.authorMemberId as Id<'members'> | undefined,
        content: input.reply.content,
        status: input.reply.status,
        deletedAt: input.reply.deletedAt,
        supersededAt: input.reply.supersededAt,
        supersededByMessageId: input.reply.supersededByMessageId as Id<'messages'> | undefined,
        supersedesMessageId: input.reply.supersedesMessageId as Id<'messages'> | undefined,
        revisionKind: input.reply.revisionKind,
        generationProfile: input.reply.generationProfile,
        routing: input.reply.routing
          ? {
              memberIds: input.reply.routing.memberIds as Id<'members'>[],
              source: input.reply.routing.source,
            }
          : undefined,
        inReplyToMessageId: input.reply.inReplyToMessageId as Id<'messages'> | undefined,
        originConversationId: input.reply.originConversationId as Id<'conversations'> | undefined,
        originMessageId: input.reply.originMessageId as Id<'messages'> | undefined,
        mentionedMemberIds: input.reply.mentionedMemberIds as Id<'members'>[] | undefined,
        roundNumber: input.reply.roundNumber,
        roundIntent: input.reply.roundIntent,
        roundTargetMemberId: input.reply.roundTargetMemberId as Id<'members'> | undefined,
        error: input.reply.error,
        promptTraceDraft: input.reply.promptTraceDraft,
      },
    });
    return toMessage(result);
  }

  async clearMessages(conversationId: string): Promise<void> {
    await this.client.mutation(api.messages.clearConversation, {
      conversationId: conversationId as Id<'conversations'>,
    });
  }

  async clearChamberSummary(conversationId: string): Promise<void> {
    await this.clientAny.mutation('conversations:clearChamberSummary', {
      conversationId: conversationId as Id<'conversations'>,
    });
  }

  async routeHallMembers(input: {
    conversationId: string;
    message: string;
    maxSelections?: number;
  }): Promise<RouteResult> {
    return (await this.client.action(api.ai.routing.routeHallMembers as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      message: input.message,
      maxSelections: input.maxSelections,
    })) as RouteResult;
  }

  async transcribeAudioFromStorage(input: {
    storageId: string;
    mimeType?: string;
  }): Promise<{ transcript: string; model: string }> {
    return (await this.client.action(api.ai.voice.transcribeAudioFromStorage as any, {
      storageId: input.storageId as Id<'_storage'>,
      mimeType: input.mimeType,
    })) as { transcript: string; model: string };
  }

  async synthesizeMessageSpeech(input: {
    conversationId: string;
    messageId: string;
  }): Promise<MessageSpeechResult> {
    return (await this.client.action(api.ai.voice.synthesizeMessageSpeech as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      messageId: input.messageId as Id<'messages'>,
    })) as MessageSpeechResult;
  }

  async suggestHallTitle(input: { message: string; model?: string }): Promise<HallTitleResult> {
    return (await this.client.action(api.ai.routing.suggestHallTitle as any, {
      message: input.message,
      model: input.model,
    })) as HallTitleResult;
  }

  async suggestChamberTitle(input: { message: string; model?: string }): Promise<HallTitleResult> {
    return (await this.clientAny.action('ai/routing:suggestChamberTitle', {
      message: input.message,
      model: input.model,
    })) as HallTitleResult;
  }

  async suggestMemberSpecialties(input: {
    name: string;
    systemPrompt: string;
    model?: string;
  }): Promise<MemberSpecialtiesResult> {
    return (await this.client.action(api.ai.routing.suggestMemberSpecialties as any, {
      name: input.name,
      systemPrompt: input.systemPrompt,
      model: input.model,
    })) as MemberSpecialtiesResult;
  }

  async chatWithMember(input: {
    conversationId: string;
    memberId: string;
    message: string;
    previousSummary?: string;
    contextMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    hallContext?: string;
    chatProfile?: ChamberResponseMode;
    retrievalStrategy?: RetrievalStrategy;
    turnDirective?: 'shorter' | 'elaborate';
    timeAwareReentry?: {
      gapBucket: TimeAwareReentryGapBucket;
      repliesRemaining: 1 | 2;
      explicitContinuation: boolean;
    };
    guidanceDirectives?: Array<{
      note: string;
    }>;
    debugPromptTrace?: boolean;
  }): Promise<MemberChatResult> {
    return (await this.client.action(api.ai.chat.chatWithMember as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      memberId: input.memberId as Id<'members'>,
      message: input.message,
      previousSummary: input.previousSummary,
      contextMessages: input.contextMessages,
      hallContext: input.hallContext,
      chatProfile: input.chatProfile === 'brainstorm' ? 'instant' : input.chatProfile,
      retrievalStrategy: input.retrievalStrategy,
      retrievalProfile: input.retrievalStrategy === 'deep_dive' ? 'deep_dive' : 'default',
      turnDirective: input.turnDirective,
      timeAwareReentry: input.timeAwareReentry,
      guidanceDirectives: input.guidanceDirectives,
      debugPromptTrace: input.debugPromptTrace,
    })) as MemberChatResult;
  }

  async prepareRoundtableRound(input: {
    conversationId: string;
    trigger: 'user_message' | 'continue';
    triggerMessageId?: string;
    mentionedMemberIds?: string[];
  }): Promise<RoundtableState> {
    const result = await this.client.action(api.ai.roundtable.prepareRoundtableRound as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      trigger: input.trigger,
      triggerMessageId: input.triggerMessageId as Id<'messages'> | undefined,
      mentionedMemberIds: input.mentionedMemberIds as Id<'members'>[] | undefined,
    });
    return toRoundtableState(result);
  }

  async refreshRoundtableRound(input: {
    conversationId: string;
    roundNumber: number;
  }): Promise<RoundtableState> {
    const result = await this.client.action(api.ai.roundtable.refreshRoundtableRound as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      roundNumber: input.roundNumber,
    });
    return toRoundtableState(result);
  }

  async markRoundtableInProgress(input: {
    conversationId: string;
    roundNumber: number;
    speakingMemberId?: string;
    selectedBy?: 'allocator' | 'mention_boost' | 'user_manual_fallback';
  }): Promise<RoundtableState> {
    const result = await this.clientAny.mutation('hallRounds:markRoundInProgress', {
      conversationId: input.conversationId as Id<'conversations'>,
      roundNumber: input.roundNumber,
      speakingMemberId: input.speakingMemberId as Id<'members'> | undefined,
      selectedBy: input.selectedBy,
    });
    return toRoundtableState(result);
  }

  async markRoundtableCompleted(input: {
    conversationId: string;
    roundNumber: number;
  }): Promise<RoundtableState> {
    const result = await this.clientAny.mutation('hallRounds:markRoundCompleted', {
      conversationId: input.conversationId as Id<'conversations'>,
      roundNumber: input.roundNumber,
    });
    return toRoundtableState(result);
  }

  async getRoundtableState(conversationId: string): Promise<RoundtableState | null> {
    const result = await this.clientAny.query('hallRounds:getRoundtableState', {
      conversationId: conversationId as Id<'conversations'>,
    });
    return result ? toRoundtableState(result) : null;
  }

  async chatRoundtableSpeaker(input: {
    conversationId: string;
    roundNumber: number;
    memberId: string;
    force?: boolean;
    debugPromptTrace?: boolean;
  }): Promise<MemberChatResult & { intent: 'speak' | 'challenge' | 'support'; targetMemberId?: string }> {
    return (await this.client.action(api.ai.roundtable.chatRoundtableSpeaker as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      roundNumber: input.roundNumber,
      memberId: input.memberId as Id<'members'>,
      force: input.force,
      debugPromptTrace: input.debugPromptTrace,
    })) as MemberChatResult & { intent: 'speak' | 'challenge' | 'support'; targetMemberId?: string };
  }

  async chatRoundtableSpeakers(input: {
    conversationId: string;
    roundNumber: number;
    debugPromptTrace?: boolean;
  }): Promise<Array<{
    memberId: string;
    status: 'sent' | 'error';
    answer: string;
    intent: 'speak' | 'challenge' | 'support';
    targetMemberId?: string;
    error?: string;
    attemptedResponseModelSlot?: number;
    attemptedResponseModelSpec?: string;
    finalResponseModelSlot?: number;
    finalResponseModelSpec?: string;
      fallbackUsed?: boolean;
      promptTraceDraft?: PromptTraceDraft;
    }>> {
    const result = await this.client.action(api.ai.roundtable.chatRoundtableSpeakers as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      roundNumber: input.roundNumber,
      debugPromptTrace: input.debugPromptTrace,
    });
    return result.results as Array<{
      memberId: string;
      status: 'sent' | 'error';
      answer: string;
      intent: 'speak' | 'challenge' | 'support';
      targetMemberId?: string;
      error?: string;
      attemptedResponseModelSlot?: number;
      attemptedResponseModelSpec?: string;
      finalResponseModelSlot?: number;
      finalResponseModelSpec?: string;
      fallbackUsed?: boolean;
      promptTraceDraft?: PromptTraceDraft;
    }>;
  }

  async compactConversation(input: {
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
  }): Promise<{ summary: string }> {
    return (await this.client.action(api.ai.chat.compactConversation as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      previousSummary: input.previousSummary,
      messages: input.messages,
      messageIds: input.messageIds as Id<'messages'>[],
      memoryScope: input.memoryScope,
      memoryContext: input.memoryContext,
    })) as { summary: string };
  }

  async summarizeHallRound(input: {
    conversationId: string;
    roundNumber: number;
    messages: Array<{ author: string; content: string }>;
    model?: string;
  }): Promise<{ summary: string }> {
    return (await this.client.action(api.ai.chat.summarizeHallRound as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      roundNumber: input.roundNumber,
      messages: input.messages,
      model: input.model,
    })) as { summary: string };
  }

  async ensureMemberStore(input: { memberId: string }): Promise<{ storeName: string; created: boolean }> {
    return (await this.client.action(api.ai.knowledge.ensureMemberKnowledgeStore as any, {
      memberId: input.memberId as Id<'members'>,
    })) as { storeName: string; created: boolean };
  }

  async createKbDocumentRecord(input: {
    memberId: string;
    stagedFile: {
      storageId: string;
      displayName: string;
      mimeType?: string;
      sizeBytes?: number;
    };
    chunkConfig?: KbChunkConfig;
  }): Promise<{ kbDocumentId: string; document: KbDocumentLifecycle }> {
    const body = (await this.client.action(api.ai.knowledge.createKbDocumentRecord as any, {
      memberId: input.memberId as Id<'members'>,
      stagedFile: {
        storageId: input.stagedFile.storageId as Id<'_storage'>,
        displayName: input.stagedFile.displayName,
        mimeType: input.stagedFile.mimeType,
        sizeBytes: input.stagedFile.sizeBytes,
      },
      chunkConfig: input.chunkConfig,
    })) as any;

    return {
      kbDocumentId: body.kbDocumentId,
      document: toKbDocumentLifecycle(body.document),
    };
  }

  async startKbDocumentProcessing(input: { kbDocumentId: string }): Promise<{ ok: boolean; document: KbDocumentLifecycle }> {
    const body = (await this.client.action(api.ai.knowledge.startKbDocumentProcessing as any, {
      kbDocumentId: input.kbDocumentId as Id<'kbDocuments'>,
    })) as any;
    return {
      ok: Boolean(body.ok),
      document: toKbDocumentLifecycle(body.document),
    };
  }

  async retryKbDocumentIndexing(input: { kbDocumentId: string }): Promise<{ ok: boolean; document: KbDocumentLifecycle }> {
    const body = (await this.client.action(api.ai.knowledge.retryKbDocumentIndexing as any, {
      kbDocumentId: input.kbDocumentId as Id<'kbDocuments'>,
    })) as any;
    return {
      ok: Boolean(body.ok),
      document: toKbDocumentLifecycle(body.document),
    };
  }

  async retryKbDocumentMetadata(input: { kbDocumentId: string }): Promise<{ ok: boolean; document: KbDocumentLifecycle }> {
    const body = (await this.client.action(api.ai.knowledge.retryKbDocumentMetadata as any, {
      kbDocumentId: input.kbDocumentId as Id<'kbDocuments'>,
    })) as any;
    return {
      ok: Boolean(body.ok),
      document: toKbDocumentLifecycle(body.document),
    };
  }

  async reprocessKbDocument(input: {
    kbDocumentId: string;
    chunkConfig?: KbChunkConfig;
  }): Promise<{ ok: boolean; document: KbDocumentLifecycle }> {
    const body = (await this.client.action(api.ai.knowledge.reprocessKbDocument as any, {
      kbDocumentId: input.kbDocumentId as Id<'kbDocuments'>,
      chunkConfig: input.chunkConfig,
    })) as any;
    return {
      ok: Boolean(body.ok),
      document: toKbDocumentLifecycle(body.document),
    };
  }

  async getKbDocumentDownloadUrl(input: { kbDocumentId: string }): Promise<string | null> {
    return (await this.client.query(api.kbDocuments.getDownloadUrl as any, {
      kbDocumentId: input.kbDocumentId as Id<'kbDocuments'>,
    })) as string | null;
  }

  async listKbDocuments(input: { memberId: string }): Promise<KbDocumentLifecycle[]> {
    const rows = (await this.client.action(api.ai.knowledge.listKbDocumentsByMember as any, {
      memberId: input.memberId as Id<'members'>,
    })) as any[];
    return rows.map(toKbDocumentLifecycle);
  }

  async deleteKbDocument(input: {
    kbDocumentId: string;
  }): Promise<{ ok: boolean; alreadyDeleted?: boolean; deletedChunkCount?: number; clearedStoreName?: boolean; error?: string }> {
    return (await this.client.action(api.ai.knowledge.deleteKbDocument as any, {
      kbDocumentId: input.kbDocumentId as Id<'kbDocuments'>,
    })) as { ok: boolean; alreadyDeleted?: boolean; deletedChunkCount?: number; clearedStoreName?: boolean; error?: string };
  }

  async uploadMemberDocuments(input: {
    memberId: string;
    stagedFiles: Array<{
      storageId: string;
      displayName: string;
      mimeType?: string;
      sizeBytes?: number;
    }>;
  }): Promise<{ storeName: string; documents: Array<{ name?: string; displayName?: string }> }> {
    return (await this.client.action(api.ai.knowledge.uploadMemberDocuments as any, {
      memberId: input.memberId as Id<'members'>,
      stagedFiles: input.stagedFiles.map((file) => ({
        storageId: file.storageId as Id<'_storage'>,
        displayName: file.displayName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      })),
    })) as { storeName: string; documents: Array<{ name?: string; displayName?: string }> };
  }

  async listMemberDocuments(input: { memberId: string }): Promise<Array<{ name?: string; displayName?: string }>> {
    return (await this.client.action(api.ai.knowledge.listMemberKnowledgeDocuments as any, {
      memberId: input.memberId as Id<'members'>,
    })) as Array<{ name?: string; displayName?: string }>;
  }

  async deleteMemberDocument(input: {
    memberId: string;
    documentName: string;
  }): Promise<{ ok: boolean; documents?: Array<{ name?: string; displayName?: string }> }> {
    return (await this.client.action(api.ai.knowledge.deleteMemberKnowledgeDocument as any, {
      memberId: input.memberId as Id<'members'>,
      documentName: input.documentName,
    })) as { ok: boolean; documents?: Array<{ name?: string; displayName?: string }> };
  }

  async listMemberDigestMetadata(input: { memberId: string }): Promise<KBDigestMetadata[]> {
    const rows = (await this.client.query(api.kbDigests.listByMember as any, {
      memberId: input.memberId as Id<'members'>,
      includeDeleted: false,
    })) as Array<any>;

    return rows.map((row) => ({
      id: row._id as string,
      memberId: row.memberId as string,
      kbDocumentName: row.kbDocumentName as string | undefined,
      displayName: row.displayName as string,
      documentCard: {
        docType: (row.documentCard?.docType ?? 'other') as string,
        about: (row.documentCard?.about ?? '') as string,
        bestFor: (row.documentCard?.bestFor ?? []) as string[],
        evidenceKinds: (row.documentCard?.evidenceKinds ?? []) as string[],
        notFor: (row.documentCard?.notFor ?? []) as string[],
      },
      queryHints: (row.queryHints ?? []) as string[],
      updatedAt: row.updatedAt as number,
    }));
  }

  async updateMemberDigestMetadata(input: {
    digestId: string;
    displayName: string;
    documentCard: {
      docType: string;
      about: string;
      bestFor: string[];
      evidenceKinds: string[];
      notFor: string[];
    };
    queryHints: string[];
  }): Promise<{ ok: boolean }> {
    await this.client.mutation(api.kbDigests.updateDigestMetadata as any, {
      digestId: input.digestId as Id<'kbDocumentDigests'>,
      displayName: input.displayName,
      documentCard: input.documentCard,
      queryHints: input.queryHints,
      updatedAt: Date.now(),
    });
    return { ok: true };
  }

  async rehydrateMemberStore(input: {
    memberId: string;
    mode?: 'missing-only' | 'all';
  }): Promise<{
    storeName: string;
    rehydratedCount: number;
    skippedCount: number;
    documents: Array<{ name?: string; displayName?: string }>;
  }> {
    return (await this.client.action(api.ai.knowledge.rehydrateMemberKnowledgeStore as any, {
      memberId: input.memberId as Id<'members'>,
      mode: input.mode,
    })) as {
      storeName: string;
      rehydratedCount: number;
      skippedCount: number;
      documents: Array<{ name?: string; displayName?: string }>;
    };
  }

  async purgeExpiredStagedDocuments(input: { memberId?: string }): Promise<{ purgedCount: number }> {
    return (await this.client.action(api.ai.knowledge.purgeExpiredStagedKnowledgeDocuments as any, {
      memberId: input.memberId ? (input.memberId as Id<'members'>) : undefined,
    })) as { purgedCount: number };
  }

  async applyCompaction(
    conversationId: string,
    summary: string,
    compactedMessageIds: string[],
    recentRawTail?: number
  ): Promise<void> {
    await this.clientAny.mutation('conversations:applyCompaction', {
      conversationId: conversationId as Id<'conversations'>,
      summary,
      compactedMessageIds: compactedMessageIds as Id<'messages'>[],
      recentRawTail,
    });
  }
}

export const convexRepository = new ConvexCouncilRepository();
