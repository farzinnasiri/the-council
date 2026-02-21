import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
  }).index('email', ['email']),

  members: defineTable({
    userId: v.id('users'),
    name: v.string(),
    avatarId: v.optional(v.id('_storage')),
    specialties: v.array(v.string()),
    systemPrompt: v.string(),
    kbStoreName: v.optional(v.string()),
    // Legacy compatibility only. Active/archived now derives from deletedAt.
    status: v.optional(v.union(v.literal('active'), v.literal('archived'))),
    deletedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId']),

  conversations: defineTable({
    userId: v.id('users'),
    kind: v.union(v.literal('hall'), v.literal('chamber')),
    title: v.string(),
    chamberMemberId: v.optional(v.id('members')),
    // Legacy compatibility only. Active/archived now derives from deletedAt.
    status: v.optional(v.union(v.literal('active'), v.literal('archived'))),
    deletedAt: v.optional(v.number()),
    lastMessageAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_kind', ['userId', 'kind'])
    .index('by_user_kind_member', ['userId', 'kind', 'chamberMemberId']),

  conversationParticipants: defineTable({
    conversationId: v.id('conversations'),
    userId: v.id('users'),
    memberId: v.id('members'),
    status: v.union(v.literal('active'), v.literal('removed')),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
  })
    .index('by_conversation_status', ['conversationId', 'status'])
    .index('by_member_status', ['memberId', 'status'])
    .index('by_user_conversation', ['userId', 'conversationId']),

  conversationMemoryLogs: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    scope: v.literal('chamber'),
    memory: v.optional(v.string()),
    totalMessagesAtRun: v.number(),
    activeMessagesAtRun: v.number(),
    compactedMessageCount: v.number(),
    recentRawTail: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_user_conversation', ['userId', 'conversationId']),

  messages: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    role: v.union(v.literal('user'), v.literal('member'), v.literal('system')),
    authorMemberId: v.optional(v.id('members')),
    content: v.string(),
    status: v.union(v.literal('sent'), v.literal('error')),
    compacted: v.boolean(),
    deletedAt: v.optional(v.number()),
    routing: v.optional(v.object({
      memberIds: v.array(v.id('members')),
      source: v.union(
        v.literal('llm'),
        v.literal('fallback'),
        v.literal('chamber-fixed'),
      ),
    })),
    inReplyToMessageId: v.optional(v.id('messages')),
    originConversationId: v.optional(v.id('conversations')),
    originMessageId: v.optional(v.id('messages')),
    error: v.optional(v.string()),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_conversation_active', ['conversationId', 'compacted'])
    .index('by_conversation_parent', ['conversationId', 'inReplyToMessageId'])
    .index('by_origin', ['originConversationId', 'originMessageId']),

  appConfig: defineTable({
    userId: v.optional(v.id('users')),
    key: v.string(),
    value: v.string(),
  })
    .index('by_key', ['key'])
    .index('by_user_key', ['userId', 'key']),

  kbStagedDocuments: defineTable({
    userId: v.id('users'),
    memberId: v.id('members'),
    storageId: v.id('_storage'),
    displayName: v.string(),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    geminiStoreName: v.string(),
    geminiDocumentName: v.optional(v.string()),
    status: v.union(
      v.literal('staged'),
      v.literal('ingested'),
      v.literal('skipped_duplicate'),
      v.literal('failed'),
      v.literal('rehydrated'),
      v.literal('purged'),
    ),
    ingestError: v.optional(v.string()),
    createdAt: v.number(),
    ingestedAt: v.optional(v.number()),
    expiresAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_user_member_status', ['userId', 'memberId', 'status'])
    .index('by_member_createdAt', ['memberId', 'createdAt'])
    .index('by_status_expiresAt', ['status', 'expiresAt'])
    .index('by_gemini_document_name', ['geminiDocumentName']),

  kbDocumentDigests: defineTable({
    userId: v.id('users'),
    memberId: v.id('members'),
    geminiStoreName: v.string(),
    geminiDocumentName: v.optional(v.string()),
    displayName: v.string(),
    storageId: v.optional(v.id('_storage')),
    topics: v.array(v.string()),
    entities: v.array(v.string()),
    lexicalAnchors: v.array(v.string()),
    styleAnchors: v.array(v.string()),
    digestSummary: v.string(),
    status: v.union(v.literal('active'), v.literal('deleted')),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_user_member_status', ['userId', 'memberId', 'status'])
    .index('by_member_document', ['memberId', 'geminiDocumentName'])
    .index('by_store_document', ['geminiStoreName', 'geminiDocumentName']),
});
