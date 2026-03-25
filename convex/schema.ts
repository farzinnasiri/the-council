import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { personalSourceDocumentMetadataValidator } from './personalSourcesShared';

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    profileNote: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
  }).index('email', ['email']),

  members: defineTable({
    userId: v.id('users'),
    name: v.string(),
    avatarId: v.optional(v.id('_storage')),
    specialties: v.array(v.string()),
    systemPrompt: v.string(),
    chatResponseModelSlot: v.optional(v.number()),
    guidanceProfilePrompt: v.optional(v.string()),
    guidanceProfileGeneratedAt: v.optional(v.number()),
    guidanceProfileUpdatedAt: v.optional(v.number()),
    ttsVoiceName: v.optional(
      v.union(
        v.literal('Kore'),
        v.literal('Zephyr'),
        v.literal('Fenrir'),
        v.literal('Puck'),
        v.literal('Charon')
      )
    ),
    ttsPersonaPrompt: v.optional(v.string()),
    ttsPersonaGeneratedAt: v.optional(v.number()),
    ttsPersonaUpdatedAt: v.optional(v.number()),
    kbStoreName: v.optional(v.string()),
    // Legacy compatibility shim for stored members created before Personal Sources replaced Personal Archive.
    personalArchiveAccess: v.optional(v.object({
      reflection: v.boolean(),
      cookieJar: v.boolean(),
      accountability: v.boolean(),
      worldModel: v.boolean(),
    })),
    personalSourcesPermissionEnabled: v.optional(v.boolean()),
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
    chamberResponseMode: v.optional(
      v.union(
        v.literal('instant'),
        v.literal('short'),
        v.literal('think'),
        v.literal('brainstorm'),
        v.literal('deep_dive')
    )
  ),
    timeAwareReentryEnabled: v.optional(v.boolean()),
    personalSourcesEnabled: v.optional(v.boolean()),
    timeAwareReentryState: v.optional(
      v.object({
        gapBucket: v.union(
          v.literal('mild'),
          v.literal('medium'),
          v.literal('strong'),
          v.literal('very_strong')
        ),
        repliesRemaining: v.union(v.literal(1), v.literal(2)),
        explicitContinuation: v.boolean(),
        activatedAt: v.number(),
      })
    ),
    timeAwareReentryNoticeSeenAt: v.optional(v.number()),
    guidanceLastReflectedUserTurnCount: v.optional(v.number()),
    title: v.string(),
    chamberMemberId: v.optional(v.id('members')),
    closedAt: v.optional(v.number()),
    closedReason: v.optional(v.literal('user_closed')),
    // Legacy compatibility only. Active/archived now derives from deletedAt.
    status: v.optional(v.union(v.literal('active'), v.literal('archived'))),
    deletedAt: v.optional(v.number()),
    lastMessageAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_kind', ['userId', 'kind'])
    .index('by_user_kind_member', ['userId', 'kind', 'chamberMemberId'])
    .index('by_user_kind_member_updated', ['userId', 'kind', 'chamberMemberId', 'updatedAt'])
    .index('by_kind_updated', ['kind', 'updatedAt']),

  conversationParticipants: defineTable({
    conversationId: v.id('conversations'),
    userId: v.id('users'),
    memberId: v.id('members'),
    chatResponseModelSlot: v.optional(v.number()),
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

  hallRoundBids: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    memberId: v.id('members'),
    wantsToSpeak: v.boolean(),
    moveType: v.union(
      v.literal('rebuttal'),
      v.literal('caveat'),
      v.literal('synthesis'),
      v.literal('evidence'),
      v.literal('reframing'),
      v.literal('clarification'),
      v.literal('agreement'),
      v.literal('pass'),
    ),
    targetMemberId: v.optional(v.id('members')),
    noveltyClaim: v.string(),
    confidence: v.number(),
    estimatedValue: v.number(),
    relevanceScore: v.number(),
    noveltyScore: v.number(),
    tensionScore: v.number(),
    coverageScore: v.number(),
    recencyPenalty: v.number(),
    dominancePenalty: v.number(),
    mentionBoost: v.number(),
    overlapPenalty: v.number(),
    allocatorScore: v.number(),
    allocatorReason: v.string(),
    updatedAt: v.number(),
  })
    .index('by_round_member', ['conversationId', 'roundNumber', 'memberId'])
    .index('by_conversation_round', ['conversationId', 'roundNumber']),

  hallRoundCandidates: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    roundNumber: v.number(),
    memberId: v.id('members'),
    rank: v.number(),
    status: v.union(
      v.literal('shortlisted'),
      v.literal('speaking'),
      v.literal('spoken'),
      v.literal('dismissed'),
    ),
    moveType: v.union(
      v.literal('rebuttal'),
      v.literal('caveat'),
      v.literal('synthesis'),
      v.literal('evidence'),
      v.literal('reframing'),
      v.literal('clarification'),
      v.literal('agreement'),
      v.literal('pass'),
    ),
    targetMemberId: v.optional(v.id('members')),
    rationaleTag: v.union(
      v.literal('pushback'),
      v.literal('new angle'),
      v.literal('evidence'),
      v.literal('synthesis'),
      v.literal('clarify'),
    ),
    allocatorReason: v.string(),
    score: v.number(),
    selectedBy: v.union(
      v.literal('allocator'),
      v.literal('mention_boost'),
      v.literal('user_manual_fallback'),
    ),
    updatedAt: v.number(),
  })
    .index('by_round_member', ['conversationId', 'roundNumber', 'memberId'])
    .index('by_conversation_round', ['conversationId', 'roundNumber'])
    .index('by_conversation_round_status', ['conversationId', 'roundNumber', 'status']),

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

  conversationGuidanceDirectives: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    memberId: v.id('members'),
    source: v.union(
      v.literal('background_reflection'),
      v.literal('feedback'),
      v.literal('system_rule')
    ),
    triggerMessageId: v.optional(v.id('messages')),
    note: v.string(),
    feedbackKind: v.optional(v.union(v.literal('quick'), v.literal('custom'))),
    feedbackChips: v.optional(v.array(v.union(
      v.literal('repetitive'),
      v.literal('structure'),
      v.literal('tone'),
      v.literal('formatting'),
      v.literal('persona'),
      v.literal('missed_my_point')
    ))),
    feedbackText: v.optional(v.string()),
    createdAfterUserTurn: v.number(),
    expiresAfterUserTurn: v.number(),
    createdAt: v.number(),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_conversation_expiry', ['conversationId', 'expiresAfterUserTurn']),

  messageFeedback: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    messageId: v.id('messages'),
    memberId: v.id('members'),
    key: v.union(
      v.literal('like'),
      v.literal('dislike'),
      v.literal('helpful'),
      v.literal('not_helpful'),
      v.literal('shorter'),
      v.literal('longer'),
      v.literal('clearer'),
      v.literal('more_direct'),
      v.literal('softer'),
      v.literal('harder')
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_message_key', ['messageId', 'key']),

  messages: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    role: v.union(v.literal('user'), v.literal('member'), v.literal('system')),
    systemKind: v.optional(v.union(v.literal('routing'), v.literal('hall_followup_context'), v.literal('hall_closure'))),
    authorMemberId: v.optional(v.id('members')),
    content: v.string(),
    status: v.union(v.literal('sent'), v.literal('error')),
    compacted: v.boolean(),
    deletedAt: v.optional(v.number()),
    supersededAt: v.optional(v.number()),
    supersededByMessageId: v.optional(v.id('messages')),
    supersedesMessageId: v.optional(v.id('messages')),
    revisionKind: v.optional(
      v.union(
        v.literal('think_harder'),
        v.literal('brainstorm'),
        v.literal('deep_dive'),
        v.literal('shorter'),
        v.literal('elaborate')
      )
    ),
    generationProfile: v.optional(
      v.union(
        v.literal('instant'),
        v.literal('short'),
        v.literal('think'),
        v.literal('brainstorm'),
        v.literal('deep_dive')
      )
    ),
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
    pinnedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_conversation_active', ['conversationId', 'compacted'])
    .index('by_conversation_pinned', ['conversationId', 'pinnedAt'])
    .index('by_conversation_parent', ['conversationId', 'inReplyToMessageId'])
    .index('by_origin', ['originConversationId', 'originMessageId']),

  conversationNotebooks: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    content: v.string(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_user_updated', ['userId', 'updatedAt']),

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
    chunkSizeChars: v.optional(v.number()),
    chunkOverlapChars: v.optional(v.number()),
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
    documentCard: v.object({
      docType: v.string(),
      about: v.string(),
      bestFor: v.array(v.string()),
      evidenceKinds: v.array(v.string()),
      notFor: v.array(v.string()),
    }),
    queryHints: v.array(v.string()),
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
      filterFields: ['userId', 'memberId', 'kbStoreName', 'kbDocumentName'],
    }),

  personalSourceDocuments: defineTable({
    userId: v.id('users'),
    storageId: v.id('_storage'),
    displayName: v.string(),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    personalSourceName: v.string(),
    uploadStatus: v.union(v.literal('uploaded'), v.literal('failed')),
    chunkingStatus: v.union(v.literal('pending'), v.literal('running'), v.literal('completed'), v.literal('failed')),
    indexingStatus: v.union(v.literal('pending'), v.literal('running'), v.literal('completed'), v.literal('failed')),
    metadataStatus: v.union(v.literal('pending'), v.literal('running'), v.literal('completed'), v.literal('failed')),
    chunkSizeChars: v.optional(v.number()),
    chunkOverlapChars: v.optional(v.number()),
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
    .index('by_user_status', ['userId', 'status'])
    .index('by_user_storage', ['userId', 'storageId'])
    .index('by_user_source', ['userId', 'personalSourceName']),

  personalSourceDigests: defineTable({
    userId: v.id('users'),
    personalSourceName: v.string(),
    displayName: v.string(),
    storageId: v.optional(v.id('_storage')),
    metadata: personalSourceDocumentMetadataValidator,
    status: v.union(v.literal('active'), v.literal('deleted')),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_user_status', ['userId', 'status'])
    .index('by_user_source', ['userId', 'personalSourceName']),

  personalSourceChunks: defineTable({
    userId: v.id('users'),
    personalSourceName: v.string(),
    displayName: v.string(),
    chunkIndex: v.number(),
    text: v.string(),
    embedding: v.array(v.float64()),
    createdAt: v.number(),
  })
    .index('by_user_source', ['userId', 'personalSourceName'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['userId', 'personalSourceName'],
    }),

  // Legacy compatibility shim used only to migrate old Personal Archive identity into users.profileNote.
  personalArchiveProfiles: defineTable({
    userId: v.id('users'),
    identity: v.string(),
    updatedAt: v.optional(v.number()),
  }).index('by_user', ['userId']),

  memberUserInteractionPolicies: defineTable({
    userId: v.id('users'),
    memberId: v.id('members'),
    body: v.string(),
    lockedByUser: v.boolean(),
    generatedAt: v.number(),
    updatedAt: v.number(),
    userEditedAt: v.optional(v.number()),
    lastProcessedMessageAt: v.optional(v.number()),
  })
    .index('by_user_member', ['userId', 'memberId']),

  memberUserMentalModels: defineTable({
    userId: v.id('users'),
    memberId: v.id('members'),
    body: v.string(),
    lockedByUser: v.boolean(),
    generatedAt: v.number(),
    updatedAt: v.number(),
    userEditedAt: v.optional(v.number()),
    lastProcessedMessageAt: v.optional(v.number()),
  })
    .index('by_user_member', ['userId', 'memberId']),

  memberUserEpisodes: defineTable({
    userId: v.id('users'),
    memberId: v.id('members'),
    title: v.optional(v.string()),
    body: v.string(),
    embedding: v.array(v.float64()),
    lockedByUser: v.boolean(),
    archivedAt: v.optional(v.number()),
    generatedAt: v.number(),
    updatedAt: v.number(),
    userEditedAt: v.optional(v.number()),
    lastProcessedMessageAt: v.optional(v.number()),
  })
    .index('by_user_member_updated', ['userId', 'memberId', 'updatedAt'])
    .index('by_user_member_archived_updated', ['userId', 'memberId', 'archivedAt', 'updatedAt'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['userId', 'memberId'],
    }),

  memberMemoryRefreshStates: defineTable({
    userId: v.id('users'),
    memberId: v.id('members'),
    processing: v.boolean(),
    processingStartedAt: v.optional(v.number()),
    nextEligibleAt: v.number(),
    lastRunAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    lastFailureAt: v.optional(v.number()),
    retryCount: v.number(),
    lastProcessedMessageAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_user_member', ['userId', 'memberId'])
    .index('by_next_eligible', ['nextEligibleAt']),
});
