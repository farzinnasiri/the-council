import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { initialMembers } from '../mocks/members';
import { initialConversations } from '../mocks/sessions';
import { initialMessages } from '../mocks/messages';
import type { Conversation, Member, Message, ThemeMode } from '../types/domain';
import type {
  CouncilRepository,
  CouncilSnapshot,
  CreateConversationInput,
  CreateMemberInput,
  UpdateConversationPatch,
  UpdateMemberPatch,
} from './CouncilRepository';

const DB_NAME = 'council-local';
const DB_VERSION = 1;
const SETTINGS_THEME_KEY = 'theme-mode';
const META_SEEDED_KEY = 'seeded-v1';

interface CouncilDB extends DBSchema {
  members: {
    key: string;
    value: Member;
  };
  conversations: {
    key: string;
    value: Conversation;
  };
  messages: {
    key: string;
    value: Message;
    indexes: { 'by-conversation': string };
  };
  settings: {
    key: string;
    value: string;
  };
  meta: {
    key: string;
    value: string;
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export class IndexedDbCouncilRepository implements CouncilRepository {
  private dbPromise: Promise<IDBPDatabase<CouncilDB>>;

  constructor() {
    this.dbPromise = openDB<CouncilDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('members', { keyPath: 'id' });
        db.createObjectStore('conversations', { keyPath: 'id' });
        const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
        messageStore.createIndex('by-conversation', 'conversationId');
        db.createObjectStore('settings');
        db.createObjectStore('meta');
      },
    });
  }

  async init(): Promise<void> {
    const db = await this.dbPromise;
    const seeded = await db.get('meta', META_SEEDED_KEY);
    if (seeded) {
      return;
    }

    const tx = db.transaction(['members', 'conversations', 'messages', 'settings', 'meta'], 'readwrite');
    const membersStore = tx.objectStore('members');
    const conversationsStore = tx.objectStore('conversations');
    const messagesStore = tx.objectStore('messages');
    const settingsStore = tx.objectStore('settings');
    const metaStore = tx.objectStore('meta');

    for (const member of initialMembers) {
      await membersStore.put(member);
    }

    for (const conversation of initialConversations) {
      await conversationsStore.put(conversation);
    }

    for (const message of initialMessages) {
      await messagesStore.put(message);
    }

    await settingsStore.put('system', SETTINGS_THEME_KEY);
    await metaStore.put(nowIso(), META_SEEDED_KEY);
    await tx.done;
  }

  async getSnapshot(): Promise<CouncilSnapshot> {
    const [themeMode, members, conversations, messages] = await Promise.all([
      this.getThemeMode(),
      this.listMembers(true),
      this.listConversations(),
      this.listAllMessages(),
    ]);

    return {
      themeMode,
      members,
      conversations,
      messages,
    };
  }

  async getThemeMode(): Promise<ThemeMode> {
    const db = await this.dbPromise;
    const value = await db.get('settings', SETTINGS_THEME_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value;
    }
    return 'system';
  }

  async setThemeMode(mode: ThemeMode): Promise<void> {
    const db = await this.dbPromise;
    await db.put('settings', mode, SETTINGS_THEME_KEY);
  }

  async listMembers(includeArchived = false): Promise<Member[]> {
    const db = await this.dbPromise;
    const members = await db.getAll('members');
    const visible = includeArchived ? members : members.filter((member) => member.status !== 'archived');
    return visible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createMember(input: CreateMemberInput): Promise<Member> {
    const db = await this.dbPromise;
    const timestamp = nowIso();
    const member: Member = {
      id: `member-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name,
      systemPrompt: input.systemPrompt,
      emoji: input.emoji?.trim() || '🧠',
      role: input.role?.trim() || 'Advisor',
      specialties: input.specialties?.filter(Boolean) ?? [],
      kbStoreName: null,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.put('members', member);
    return member;
  }

  async updateMember(memberId: string, patch: UpdateMemberPatch): Promise<Member> {
    const db = await this.dbPromise;
    const current = await db.get('members', memberId);
    if (!current) {
      throw new Error('Member not found');
    }

    const updated: Member = {
      ...current,
      ...patch,
      specialties: patch.specialties ?? current.specialties,
      updatedAt: nowIso(),
    };

    await db.put('members', updated);
    return updated;
  }

  async archiveMember(memberId: string): Promise<void> {
    await this.updateMember(memberId, { status: 'archived' });
  }

  async listConversations(): Promise<Conversation[]> {
    const db = await this.dbPromise;
    const conversations = await db.getAll('conversations');
    return conversations.filter((item) => !item.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    const db = await this.dbPromise;
    const created: Conversation = {
      id: `${input.type}-${crypto.randomUUID().slice(0, 8)}`,
      type: input.type,
      title: input.title,
      updatedAt: nowIso(),
      memberIds: input.memberIds,
      memberId: input.memberId,
      archived: false,
    };

    await db.put('conversations', created);
    return created;
  }

  async updateConversation(conversationId: string, patch: UpdateConversationPatch): Promise<Conversation> {
    const db = await this.dbPromise;
    const current = await db.get('conversations', conversationId);
    if (!current) {
      throw new Error('Conversation not found');
    }

    const updated: Conversation = {
      ...current,
      ...patch,
    };

    await db.put('conversations', updated);
    return updated;
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    const db = await this.dbPromise;
    const messages = await db.getAllFromIndex('messages', 'by-conversation', conversationId);
    return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async appendMessages(conversationId: string, messages: Message[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('messages', 'readwrite');
    for (const message of messages) {
      await tx.store.put({ ...message, conversationId });
    }
    await tx.done;
  }

  async listAllMessages(): Promise<Message[]> {
    const db = await this.dbPromise;
    return db.getAll('messages');
  }

  async clearMessages(conversationId: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('messages', 'readwrite');
    const index = tx.store.index('by-conversation');
    for await (const cursor of index.iterate(conversationId)) {
      cursor.delete();
    }
    await tx.done;
  }

  async getMemberStoreName(memberId: string): Promise<string | null> {
    const db = await this.dbPromise;
    const member = await db.get('members', memberId);
    return member?.kbStoreName ?? null;
  }

  async setMemberStoreName(memberId: string, storeName: string): Promise<void> {
    await this.updateMember(memberId, { kbStoreName: storeName });
  }
}

export const councilRepository = new IndexedDbCouncilRepository();
