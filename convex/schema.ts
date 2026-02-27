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
    hallMode: v.optional(v.union(v.literal('advisory'), v.literal('roundtable'))),
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
    .index('by_user_kind_member', ['userId', 'kind', 'chamberMemberId'])
    .index('by_user_kind_member_updated', ['userId', 'kind', 'chamberMemberId', 'updatedAt']),

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

  hallRounds: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    status: v.union(
      v.literal('awaiting_user'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('superseded'),
    ),
    trigger: v.union(v.literal('user_message'), v.literal('continue')),
    triggerMessageId: v.optional(v.id('messages')),
    maxSpeakers: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_conversation', ['userId', 'conversationId'])
    .index('by_conversation_round', ['conversationId', 'roundNumber'])
    .index('by_conversation_status', ['conversationId', 'status']),

  hallRoundIntents: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    memberId: v.id('members'),
    intent: v.union(
      v.literal('speak'),
      v.literal('challenge'),
      v.literal('support'),
      v.literal('pass'),
    ),
    targetMemberId: v.optional(v.id('members')),
    rationale: v.string(),
    selected: v.boolean(),
    source: v.union(v.literal('mention'), v.literal('intent_default'), v.literal('user_manual')),
    updatedAt: v.number(),
  })
    .index('by_round_member', ['conversationId', 'roundNumber', 'memberId'])
    .index('by_conversation_round', ['conversationId', 'roundNumber'])
    .index('by_conversation_round_selected', ['conversationId', 'roundNumber', 'selected']),

  conversationMemoryLogs: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    scope: v.union(v.literal('chamber'), v.literal('hall')),
    roundNumber: v.optional(v.number()),
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
    mentionedMemberIds: v.optional(v.array(v.id('members'))),
    roundNumber: v.optional(v.number()),
    roundIntent: v.optional(
      v.union(v.literal('speak'), v.literal('challenge'), v.literal('support')),
    ),
    roundTargetMemberId: v.optional(v.id('members')),
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
    kbStoreName: v.string(),
    kbDocumentName: v.optional(v.string()),
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
    .index('by_kb_document_name', ['kbDocumentName']),

  kbDocuments: defineTable({
    userId: v.id('users'),
    memberId: v.id('members'),
    storageId: v.id('_storage'),
    displayName: v.string(),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    kbStoreName: v.string(),
    kbDocumentName: v.string(),
    uploadStatus: v.union(v.literal('uploaded'), v.literal('failed')),
    chunkingStatus: v.union(v.literal('pending'), v.literal('running'), v.literal('completed'), v.literal('failed')),
    indexingStatus: v.union(v.literal('pending'), v.literal('running'), v.literal('completed'), v.literal('failed')),
    metadataStatus: v.union(v.literal('pending'), v.literal('running'), v.literal('completed'), v.literal('failed')),
    chunkCountTotal: v.optional(v.number()),
    chunkCountIndexed: v.optional(v.number()),
    ingestErrorChunking: v.optional(v.string()),
    ingestErrorIndexing: v.optional(v.string()),
    ingestErrorMetadata: v.optional(v.string()),
    status: v.union(v.literal('active'), v.literal('deleted')),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_user_member', ['userId', 'memberId'])
    .index('by_member_storage', ['memberId', 'storageId'])
    .index('by_member_status', ['memberId', 'status'])
    .index('by_member_document_name', ['memberId', 'kbDocumentName']),

  kbDocumentDigests: defineTable({
    userId: v.id('users'),
    memberId: v.id('members'),
    kbStoreName: v.string(),
    kbDocumentName: v.optional(v.string()),
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
    .index('by_member_document', ['memberId', 'kbDocumentName'])
    .index('by_store_document', ['kbStoreName', 'kbDocumentName']),

  kbDocumentChunks: defineTable({
    userId: v.id('users'),
    memberId: v.id('members'),
    kbStoreName: v.string(),
    kbDocumentName: v.string(),
    displayName: v.string(),
    chunkIndex: v.number(),
    text: v.string(),
    embedding: v.array(v.float64()),
    createdAt: v.number(),
  })
    .index('by_member_document', ['memberId', 'kbDocumentName'])
    .index('by_member_createdAt', ['memberId', 'createdAt'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['userId', 'memberId', 'kbStoreName'],
    }),
});
