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
    summary: v.optional(v.string()),
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

  messages: defineTable({
    userId: v.id('users'),
    conversationId: v.id('conversations'),
    role: v.union(v.literal('user'), v.literal('member'), v.literal('system')),
    authorMemberId: v.optional(v.id('members')),
    content: v.string(),
    status: v.union(v.literal('sent'), v.literal('error')),
    compacted: v.boolean(),
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
});
