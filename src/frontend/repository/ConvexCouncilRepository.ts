/**
 * ConvexCouncilRepository — V2
 *
 * Implements CouncilRepository using Convex's imperative fetchQuery / fetchMutation
 * API so it can be used inside Zustand store actions (outside React component tree).
 *
 * V2 changes vs V1:
 * - All FK fields are now v.id() — no string casting needed
 * - Timestamps are epoch ms (number) — no ISO string handling
 * - No senderName / timestamp / meta conversion
 * - create/update mutations return the full doc — no re-fetch needed
 * - Messages loaded per-conversation, not globally
 * - settings → appConfig
 */
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { Conversation, Member, Message, ThemeMode } from '../types/domain';
import type {
    AppendMessagesInput,
    CouncilRepository,
    CouncilSnapshot,
    CreateConversationInput,
    CreateMemberInput,
    UpdateConversationPatch,
    UpdateMemberPatch,
} from './CouncilRepository';

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

// ── Mappers ───────────────────────────────────────────────────────────────────

type ConvexMemberDoc = Awaited<ReturnType<typeof api.members.list>>[number];
type ConvexConversationDoc = Awaited<ReturnType<typeof api.conversations.list>>[number];
type ConvexMessageDoc = Awaited<ReturnType<typeof api.messages.listActive>>[number];

function toMember(doc: ConvexMemberDoc): Member {
    return {
        id: doc._id,
        name: doc.name,
        emoji: doc.emoji,
        role: doc.role,
        specialties: doc.specialties,
        systemPrompt: doc.systemPrompt,
        kbStoreName: doc.kbStoreName,
        status: doc.status,
        createdAt: doc._creationTime,
        updatedAt: doc.updatedAt,
    };
}

function toConversation(doc: ConvexConversationDoc): Conversation {
    return {
        id: doc._id,
        type: doc.type,
        title: doc.title,
        memberIds: doc.memberIds as string[],
        status: doc.status,
        summary: doc.summary,
        messageCount: doc.messageCount,
        createdAt: doc._creationTime,
        updatedAt: doc.updatedAt,
    };
}

function toMessage(doc: ConvexMessageDoc): Message {
    return {
        id: doc._id,
        conversationId: doc.conversationId as string,
        role: doc.role,
        memberId: doc.memberId as string | undefined,
        content: doc.content,
        status: doc.status,
        compacted: doc.compacted,
        routing: doc.routing
            ? { memberIds: doc.routing.memberIds as string[], source: doc.routing.source }
            : undefined,
        error: doc.error,
        createdAt: doc._creationTime,
    };
}

// ── Repository ────────────────────────────────────────────────────────────────

export class ConvexCouncilRepository implements CouncilRepository {
    private client: ConvexHttpClient;

    constructor() {
        this.client = new ConvexHttpClient(CONVEX_URL);
    }

    async init(): Promise<void> {
        await this.client.mutation(api.seed.initializeIfNeeded, {});
    }

    async getSnapshot(): Promise<CouncilSnapshot> {
        const [themeMode, members, conversations] = await Promise.all([
            this.getThemeMode(),
            this.listMembers(true),
            this.listConversations(),
        ]);
        return { themeMode, members, conversations };
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    async getThemeMode(): Promise<ThemeMode> {
        const value = await this.client.query(api.settings.get, { key: 'theme-mode' });
        if (value === 'light' || value === 'dark' || value === 'system') return value;
        return 'system';
    }

    async setThemeMode(mode: ThemeMode): Promise<void> {
        await this.client.mutation(api.settings.set, { key: 'theme-mode', value: mode });
    }

    // ── Members ───────────────────────────────────────────────────────────────

    async listMembers(includeArchived = false): Promise<Member[]> {
        const docs = await this.client.query(api.members.list, { includeArchived });
        return docs.map(toMember);
    }

    async createMember(input: CreateMemberInput): Promise<Member> {
        const doc = await this.client.mutation(api.members.create, {
            name: input.name,
            systemPrompt: input.systemPrompt,
            emoji: input.emoji,
            role: input.role,
            specialties: input.specialties,
        });
        return toMember(doc);
    }

    async updateMember(memberId: string, patch: UpdateMemberPatch): Promise<Member> {
        const doc = await this.client.mutation(api.members.update, {
            memberId: memberId as Id<'members'>,
            ...patch,
        });
        return toMember(doc);
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

    // ── Conversations ─────────────────────────────────────────────────────────

    async listConversations(): Promise<Conversation[]> {
        const docs = await this.client.query(api.conversations.list, {});
        return docs.map(toConversation);
    }

    async createConversation(input: CreateConversationInput): Promise<Conversation> {
        const doc = await this.client.mutation(api.conversations.create, {
            type: input.type,
            title: input.title,
            memberIds: input.memberIds as Id<'members'>[],
        });
        return toConversation(doc);
    }

    async updateConversation(
        conversationId: string,
        patch: UpdateConversationPatch
    ): Promise<Conversation> {
        const doc = await this.client.mutation(api.conversations.update, {
            conversationId: conversationId as Id<'conversations'>,
            title: patch.title,
            memberIds: patch.memberIds as Id<'members'>[] | undefined,
            status: patch.status,
        });
        return toConversation(doc);
    }

    // ── Messages ──────────────────────────────────────────────────────────────

    async listMessages(conversationId: string): Promise<Message[]> {
        const docs = await this.client.query(api.messages.listActive, {
            conversationId: conversationId as Id<'conversations'>,
        });
        return docs.map(toMessage);
    }

    async appendMessages(input: AppendMessagesInput): Promise<void> {
        const convId = input.conversationId as Id<'conversations'>;
        await this.client.mutation(api.messages.appendMany, {
            messages: input.messages.map((m) => ({
                conversationId: convId,
                role: m.role,
                memberId: m.memberId as Id<'members'> | undefined,
                content: m.content,
                status: m.status,
                routing: m.routing
                    ? {
                        memberIds: m.routing.memberIds as Id<'members'>[],
                        source: m.routing.source,
                    }
                    : undefined,
                error: m.error,
            })),
        });
        // Touch the conversation to bump updatedAt and messageCount
        await this.client.mutation(api.conversations.touch, {
            conversationId: convId,
            increment: input.messages.length,
        });
    }

    async clearMessages(conversationId: string): Promise<void> {
        await this.client.mutation(api.messages.clearConversation, {
            conversationId: conversationId as Id<'conversations'>,
        });
    }
}

export const convexRepository = new ConvexCouncilRepository();
