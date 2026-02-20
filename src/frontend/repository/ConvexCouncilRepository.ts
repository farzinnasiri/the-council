import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type {
  Conversation,
  ConversationParticipant,
  Member,
  Message,
  ThemeMode,
  User,
} from '../types/domain';
import type {
  AppendMessagesInput,
  CouncilRepository,
  CouncilSnapshot,
  CreateHallInput,
  CreateMemberInput,
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
    summary: doc.summary,
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

  async applyCompaction(conversationId: string, summary: string, compactedMessageIds: string[]): Promise<void> {
    await this.clientAny.mutation('conversations:applyCompaction', {
      conversationId: conversationId as Id<'conversations'>,
      summary,
      compactedMessageIds: compactedMessageIds as Id<'messages'>[],
    });
  }
}

export const convexRepository = new ConvexCouncilRepository();
