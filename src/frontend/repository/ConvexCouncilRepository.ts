import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type {
  Conversation,
  ConversationMemoryLog,
  ConversationParticipant,
  Member,
  Message,
  ThemeMode,
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
  CouncilRepository,
  CouncilSnapshot,
  CreateHallInput,
  CreateMemberInput,
  HallTitleResult,
  KBDigestMetadata,
  MemberChatResult,
  MemberSpecialtiesResult,
  RouteResult,
  UpdateMemberPatch,
} from './CouncilRepository';

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

type ConvexMemberDoc = any;
type ConvexConversationDoc = any;
type ConvexParticipantDoc = any;
type ConvexMessageDoc = any;

function toMember(doc: ConvexMemberDoc): Member {
  return {
    id: doc._id,
    name: doc.name,
    avatarUrl: (doc as any).avatarUrl ?? null,
    specialties: doc.specialties,
    systemPrompt: doc.systemPrompt,
    kbStoreName: doc.kbStoreName,
    deletedAt: doc.deletedAt,
    createdAt: doc._creationTime,
    updatedAt: doc.updatedAt,
  };
}

function toConversation(doc: ConvexConversationDoc): Conversation {
  return {
    id: doc._id,
    kind: doc.kind,
    title: doc.title,
    chamberMemberId: doc.chamberMemberId as string | undefined,
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
    status: doc.status,
    joinedAt: doc.joinedAt,
    leftAt: doc.leftAt,
    createdAt: doc._creationTime,
  };
}

function toMessage(doc: ConvexMessageDoc): Message {
  return {
    id: doc._id,
    conversationId: doc.conversationId,
    role: doc.role,
    authorMemberId: doc.authorMemberId,
    content: doc.content,
    status: doc.status,
    compacted: doc.compacted,
    routing: doc.routing,
    inReplyToMessageId: doc.inReplyToMessageId,
    originConversationId: doc.originConversationId,
    originMessageId: doc.originMessageId,
    error: doc.error,
    createdAt: doc._creationTime,
  };
}

function toMemoryLog(doc: ConvexMessageDoc): ConversationMemoryLog {
  return {
    id: doc._id,
    conversationId: doc.conversationId,
    scope: doc.scope,
    memory: doc.memory,
    totalMessagesAtRun: doc.totalMessagesAtRun,
    activeMessagesAtRun: doc.activeMessagesAtRun,
    compactedMessageCount: doc.compactedMessageCount,
    recentRawTail: doc.recentRawTail,
    deletedAt: doc.deletedAt,
    createdAt: doc._creationTime,
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
    const [themeMode, members, conversations, chamberMap] = await Promise.all([
      this.getThemeMode(),
      this.listMembers(true),
      this.listConversations(),
      this.listChamberMap(),
    ]);

    return { themeMode, members, conversations, chamberMap };
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
      specialties: input.specialties,
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

  async createHall(input: CreateHallInput): Promise<Conversation> {
    const doc = await this.clientAny.mutation('conversations:createHall', {
      title: input.title,
      memberIds: input.memberIds as Id<'members'>[],
    });
    return toConversation(doc);
  }

  async renameHall(conversationId: string, title: string): Promise<Conversation> {
    const doc = await this.clientAny.mutation('conversations:renameHall', {
      conversationId: conversationId as Id<'conversations'>,
      title,
    });
    return toConversation(doc);
  }

  async archiveHall(conversationId: string): Promise<void> {
    await this.clientAny.mutation('conversations:archiveHall', {
      conversationId: conversationId as Id<'conversations'>,
    });
  }

  async getOrCreateChamber(memberId: string): Promise<Conversation> {
    const doc = await this.clientAny.mutation('conversations:getOrCreateChamber', {
      memberId: memberId as Id<'members'>,
    });
    return toConversation(doc);
  }

  async getChamberByMember(memberId: string): Promise<Conversation | null> {
    const doc = await this.clientAny.query('conversations:getChamberByMember', {
      memberId: memberId as Id<'members'>,
    });
    return doc ? toConversation(doc) : null;
  }

  async listChamberMap(): Promise<Record<string, Conversation>> {
    const chambers = await this.listChambers();
    return Object.fromEntries(
      chambers
        .filter((conversation) => conversation.chamberMemberId)
        .map((conversation) => [conversation.chamberMemberId!, conversation])
    );
  }

  async listParticipants(conversationId: string, includeRemoved = false): Promise<ConversationParticipant[]> {
    const docs = await this.clientAny.query('conversations:listParticipants', {
      conversationId: conversationId as Id<'conversations'>,
      includeRemoved,
    });
    return docs.map(toParticipant);
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
    const docs = await this.client.query(api.messages.listActive, {
      conversationId: conversationId as Id<'conversations'>,
    });
    return docs.map(toMessage);
  }

  async listMessagesPage(
    conversationId: string,
    options: { beforeCreatedAt?: number; limit?: number } = {}
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const result = await this.client.query(api.messages.listActivePage, {
      conversationId: conversationId as Id<'conversations'>,
      beforeCreatedAt: options.beforeCreatedAt,
      limit: options.limit,
    });
    return {
      messages: result.messages.map(toMessage),
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

  async getCompactionPolicy(): Promise<CompactionPolicy> {
    const [thresholdRaw, recentRawTailRaw] = await Promise.all([
      this.client.query(api.settings.get, { key: COMPACTION_POLICY_KEYS.threshold }),
      this.client.query(api.settings.get, { key: COMPACTION_POLICY_KEYS.recentRawTail }),
    ]);

    return {
      threshold: normalizePolicyNumber(thresholdRaw, COMPACTION_POLICY_DEFAULTS.threshold, 1),
      recentRawTail: normalizePolicyNumber(recentRawTailRaw, COMPACTION_POLICY_DEFAULTS.recentRawTail, 1),
    };
  }

  async appendMessages(input: AppendMessagesInput): Promise<void> {
    const conversationId = input.conversationId as Id<'conversations'>;
    await this.client.mutation(api.messages.appendMany, {
      messages: input.messages.map((message) => ({
        conversationId,
        role: message.role,
        authorMemberId: message.authorMemberId as Id<'members'> | undefined,
        content: message.content,
        status: message.status,
        routing: message.routing
          ? {
            memberIds: message.routing.memberIds as Id<'members'>[],
            source: message.routing.source,
          }
          : undefined,
        inReplyToMessageId: message.inReplyToMessageId as Id<'messages'> | undefined,
        originConversationId: message.originConversationId as Id<'conversations'> | undefined,
        originMessageId: message.originMessageId as Id<'messages'> | undefined,
        error: message.error,
      })),
    });
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
    return (await this.client.action(api.ai.routeHallMembers as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      message: input.message,
      maxSelections: input.maxSelections,
    })) as RouteResult;
  }

  async suggestHallTitle(input: { message: string; model?: string }): Promise<HallTitleResult> {
    return (await this.client.action(api.ai.suggestHallTitle as any, {
      message: input.message,
      model: input.model,
    })) as HallTitleResult;
  }

  async suggestMemberSpecialties(input: {
    name: string;
    systemPrompt: string;
    model?: string;
  }): Promise<MemberSpecialtiesResult> {
    return (await this.client.action(api.ai.suggestMemberSpecialties as any, {
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
  }): Promise<MemberChatResult> {
    return (await this.client.action(api.ai.chatWithMember as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      memberId: input.memberId as Id<'members'>,
      message: input.message,
      previousSummary: input.previousSummary,
      contextMessages: input.contextMessages,
      hallContext: input.hallContext,
    })) as MemberChatResult;
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
    return (await this.client.action(api.ai.compactConversation as any, {
      conversationId: input.conversationId as Id<'conversations'>,
      previousSummary: input.previousSummary,
      messages: input.messages,
      messageIds: input.messageIds as Id<'messages'>[],
      memoryScope: input.memoryScope,
      memoryContext: input.memoryContext,
    })) as { summary: string };
  }

  async ensureMemberStore(input: { memberId: string }): Promise<{ storeName: string; created: boolean }> {
    return (await this.client.action(api.ai.ensureMemberKnowledgeStore as any, {
      memberId: input.memberId as Id<'members'>,
    })) as { storeName: string; created: boolean };
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
    return (await this.client.action(api.ai.uploadMemberDocuments as any, {
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
    return (await this.client.action(api.ai.listMemberKnowledgeDocuments as any, {
      memberId: input.memberId as Id<'members'>,
    })) as Array<{ name?: string; displayName?: string }>;
  }

  async deleteMemberDocument(input: {
    memberId: string;
    documentName: string;
  }): Promise<{ ok: boolean; documents?: Array<{ name?: string; displayName?: string }> }> {
    return (await this.client.action(api.ai.deleteMemberKnowledgeDocument as any, {
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
      geminiDocumentName: row.geminiDocumentName as string | undefined,
      displayName: row.displayName as string,
      topics: (row.topics ?? []) as string[],
      entities: (row.entities ?? []) as string[],
      lexicalAnchors: (row.lexicalAnchors ?? []) as string[],
      styleAnchors: (row.styleAnchors ?? []) as string[],
      digestSummary: (row.digestSummary ?? '') as string,
      updatedAt: row.updatedAt as number,
    }));
  }

  async updateMemberDigestMetadata(input: {
    digestId: string;
    displayName: string;
    topics: string[];
    entities: string[];
    lexicalAnchors: string[];
    styleAnchors: string[];
    digestSummary: string;
  }): Promise<{ ok: boolean }> {
    await this.client.mutation(api.kbDigests.updateDigestMetadata as any, {
      digestId: input.digestId as Id<'kbDocumentDigests'>,
      displayName: input.displayName,
      topics: input.topics,
      entities: input.entities,
      lexicalAnchors: input.lexicalAnchors,
      styleAnchors: input.styleAnchors,
      digestSummary: input.digestSummary,
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
    return (await this.client.action(api.ai.rehydrateMemberKnowledgeStore as any, {
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
    return (await this.client.action(api.ai.purgeExpiredStagedKnowledgeDocuments as any, {
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
