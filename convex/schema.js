import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
export default defineSchema({
    // ── Members ────────────────────────────────────────────────────────────────
    members: defineTable({
        name: v.string(),
        emoji: v.string(),
        role: v.string(),
        specialties: v.array(v.string()),
        systemPrompt: v.string(),
        kbStoreName: v.optional(v.string()), // undefined = no KB store
        status: v.union(v.literal('active'), v.literal('archived')),
        updatedAt: v.number(), // epoch ms; createdAt = _creationTime
    })
        .index('by_status', ['status'])
        .index('by_status_updated', ['status', 'updatedAt']),
    // ── Conversations ───────────────────────────────────────────────────────────
    conversations: defineTable({
        type: v.union(v.literal('hall'), v.literal('chamber')),
        title: v.string(),
        memberIds: v.array(v.id('members')), // proper FK references
        status: v.union(v.literal('active'), v.literal('archived')),
        // SummaryBuffer: rolling compaction of old messages
        summary: v.optional(v.string()),
        summaryTokens: v.optional(v.number()),
        messageCount: v.number(), // total messages ever sent (incl. compacted)
        updatedAt: v.number(),
    })
        .index('by_status', ['status'])
        .index('by_status_updated', ['status', 'updatedAt']),
    // ── Messages ────────────────────────────────────────────────────────────────
    messages: defineTable({
        conversationId: v.id('conversations'), // proper FK
        role: v.union(v.literal('user'), v.literal('member'), v.literal('system')),
        memberId: v.optional(v.id('members')), // set for role=member messages
        content: v.string(),
        status: v.union(v.literal('pending'), v.literal('sent'), v.literal('error')),
        // SummaryBuffer compaction tracking
        compacted: v.boolean(),
        // Routing metadata (hall messages only)
        routing: v.optional(v.object({
            memberIds: v.array(v.id('members')),
            source: v.union(v.literal('llm'), v.literal('fallback'), v.literal('chamber-fixed')),
        })),
        error: v.optional(v.string()),
    })
        .index('by_conversation', ['conversationId'])
        // Fetch active (non-compacted) messages efficiently
        // _creationTime is auto-appended to every index so ordering by creation time is free
        .index('by_conversation_active', ['conversationId', 'compacted']),
    // ── App Config ──────────────────────────────────────────────────────────────
    // Single KV table — replaces separate settings + meta tables
    appConfig: defineTable({
        key: v.string(),
        value: v.string(),
    }).index('by_key', ['key']),
});
