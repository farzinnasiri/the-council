import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { upsertPromptTraceForMessage } from "./promptTraces";
import { promptTraceDraftValidator } from "./promptTraceValidators";

const routingValidator = v.object({
  memberIds: v.array(v.id("members")),
  source: v.union(
    v.literal("llm"),
    v.literal("fallback"),
    v.literal("chamber-fixed"),
  ),
});

const messageDoc = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  userId: v.id("users"),
  conversationId: v.id("conversations"),
  role: v.union(v.literal("user"), v.literal("member"), v.literal("system")),
  systemKind: v.optional(
    v.union(
      v.literal("routing"),
      v.literal("hall_followup_context"),
      v.literal("hall_closure"),
    ),
  ),
  authorMemberId: v.optional(v.id("members")),
  content: v.string(),
  status: v.union(v.literal("sent"), v.literal("error")),
  compacted: v.boolean(),
  deletedAt: v.optional(v.number()),
  supersededAt: v.optional(v.number()),
  supersededByMessageId: v.optional(v.id("messages")),
  supersedesMessageId: v.optional(v.id("messages")),
  revisionKind: v.optional(
    v.union(
      v.literal("think_harder"),
      v.literal("brainstorm"),
      v.literal("deep_dive"),
      v.literal("shorter"),
      v.literal("elaborate"),
    ),
  ),
  generationProfile: v.optional(
    v.union(
      v.literal("instant"),
      v.literal("short"),
      v.literal("think"),
      v.literal("brainstorm"),
      v.literal("deep_dive"),
    ),
  ),
  routing: v.optional(routingValidator),
  inReplyToMessageId: v.optional(v.id("messages")),
  originConversationId: v.optional(v.id("conversations")),
  originMessageId: v.optional(v.id("messages")),
  mentionedMemberIds: v.optional(v.array(v.id("members"))),
  roundNumber: v.optional(v.number()),
  roundIntent: v.optional(
    v.union(v.literal("speak"), v.literal("challenge"), v.literal("support")),
  ),
  roundTargetMemberId: v.optional(v.id("members")),
  pinnedAt: v.optional(v.number()),
  error: v.optional(v.string()),
});

const messageInputFields = {
  conversationId: v.id("conversations"),
  role: v.union(v.literal("user"), v.literal("member"), v.literal("system")),
  systemKind: v.optional(
    v.union(
      v.literal("routing"),
      v.literal("hall_followup_context"),
      v.literal("hall_closure"),
    ),
  ),
  authorMemberId: v.optional(v.id("members")),
  content: v.string(),
  status: v.union(v.literal("sent"), v.literal("error")),
  deletedAt: v.optional(v.number()),
  supersededAt: v.optional(v.number()),
  supersededByMessageId: v.optional(v.id("messages")),
  supersedesMessageId: v.optional(v.id("messages")),
  revisionKind: v.optional(
    v.union(
      v.literal("think_harder"),
      v.literal("brainstorm"),
      v.literal("deep_dive"),
      v.literal("shorter"),
      v.literal("elaborate"),
    ),
  ),
  generationProfile: v.optional(
    v.union(
      v.literal("instant"),
      v.literal("short"),
      v.literal("think"),
      v.literal("brainstorm"),
      v.literal("deep_dive"),
    ),
  ),
  routing: v.optional(routingValidator),
  inReplyToMessageId: v.optional(v.id("messages")),
  originConversationId: v.optional(v.id("conversations")),
  originMessageId: v.optional(v.id("messages")),
  mentionedMemberIds: v.optional(v.array(v.id("members"))),
  roundNumber: v.optional(v.number()),
  roundIntent: v.optional(
    v.union(v.literal("speak"), v.literal("challenge"), v.literal("support")),
  ),
  roundTargetMemberId: v.optional(v.id("members")),
  pinnedAt: v.optional(v.number()),
  error: v.optional(v.string()),
};

const messageInputValidator = v.object(messageInputFields);

const messagePersistInputValidator = v.object({
  ...messageInputFields,
  promptTraceDraft: v.optional(promptTraceDraftValidator),
});

const conversationCounts = v.object({
  totalNonSystem: v.number(),
  activeNonSystem: v.number(),
});

const deleteLatestTurnResult = v.object({
  latestUserMessageId: v.id("messages"),
  deletedMessageIds: v.array(v.id("messages")),
  deletedAt: v.number(),
  updatedAt: v.number(),
  lastMessageAt: v.optional(v.number()),
  guidanceLastReflectedUserTurnCount: v.optional(v.number()),
});

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

async function getOwnedConversation(
  ctx: any,
  userId: any,
  conversationId: any,
) {
  const conversation = await ctx.db.get(conversationId);
  if (
    !conversation ||
    conversation.userId !== userId ||
    conversation.deletedAt
  ) {
    throw new Error("Conversation not found");
  }
  return conversation;
}

async function assertOwnedMember(ctx: any, userId: any, memberId: any) {
  if (!memberId) return;
  const member = await ctx.db.get(memberId);
  if (!member || member.userId !== userId || member.deletedAt)
    throw new Error("Member not found");
}

async function getOwnedMessage(ctx: any, userId: any, messageId: any) {
  const message = await ctx.db.get(messageId);
  if (!message || message.userId !== userId) {
    throw new Error("Message not found");
  }
  return message;
}

function isVisibleHistoryRow(row: {
  deletedAt?: number;
  supersededAt?: number;
}) {
  return !row.deletedAt && !row.supersededAt;
}

function findLatestVisibleUserTurn(rows: Array<any>) {
  const visibleRows = rows.filter(
    (row) => isVisibleHistoryRow(row) && !row.compacted,
  );
  let latestUserIndex = -1;
  for (let index = visibleRows.length - 1; index >= 0; index -= 1) {
    if (visibleRows[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }
  if (latestUserIndex < 0) {
    return null;
  }

  return {
    visibleRows,
    latestUserMessage: visibleRows[latestUserIndex],
    affectedRows: visibleRows.slice(latestUserIndex),
  };
}

export const listActive = query({
  args: { conversationId: v.id("conversations") },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation_active", (q) =>
        q.eq("conversationId", args.conversationId).eq("compacted", false),
      )
      .order("asc")
      .collect();
    return rows.filter(isVisibleHistoryRow);
  },
});

export const listVisible = query({
  args: { conversationId: v.id("conversations") },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();
    return rows.filter(isVisibleHistoryRow);
  },
});

export const listActivePage = query({
  args: {
    conversationId: v.id("conversations"),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    messages: v.array(messageDoc),
    continueCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const limit = Math.max(10, Math.min(args.limit ?? 40, 120));
    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversation_active", (q) =>
        q.eq("conversationId", args.conversationId).eq("compacted", false),
      )
      .order("desc")
      .paginate({
        numItems: limit,
        cursor: args.cursor ?? null,
      });

    return {
      messages: page.page.filter(isVisibleHistoryRow).reverse(),
      continueCursor: page.isDone ? null : page.continueCursor,
      hasMore: !page.isDone,
    };
  },
});

export const listPage = query({
  args: {
    conversationId: v.id("conversations"),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    messages: v.array(messageDoc),
    continueCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const limit = Math.max(10, Math.min(args.limit ?? 40, 120));
    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .paginate({
        numItems: limit,
        cursor: args.cursor ?? null,
      });

    return {
      messages: page.page.filter(isVisibleHistoryRow).reverse(),
      continueCursor: page.isDone ? null : page.continueCursor,
      hasMore: !page.isDone,
    };
  },
});

export const listAll = query({
  args: { conversationId: v.id("conversations") },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();
    return rows.filter(isVisibleHistoryRow);
  },
});

export const listPinned = query({
  args: { conversationId: v.id("conversations") },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation_pinned", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();
    return rows.filter(
      (row) =>
        isVisibleHistoryRow(row) &&
        row.role !== "system" &&
        typeof row.pinnedAt === "number",
    );
  },
});

export const listReplies = query({
  args: {
    conversationId: v.id("conversations"),
    parentMessageId: v.id("messages"),
  },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation_parent", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("inReplyToMessageId", args.parentMessageId),
      )
      .order("asc")
      .collect();
    return rows.filter(isVisibleHistoryRow);
  },
});

export const getById = query({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  },
  returns: v.union(messageDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const message = await getOwnedMessage(ctx, userId, args.messageId);
    if (!message || message.conversationId !== args.conversationId) {
      return null;
    }
    return message;
  },
});

export const getConversationCounts = query({
  args: { conversationId: v.id("conversations") },
  returns: conversationCounts,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    const nonDeleted = rows.filter(
      (row) => row.userId === userId && !row.deletedAt && row.role !== "system",
    );
    return {
      totalNonSystem: nonDeleted.length,
      activeNonSystem: nonDeleted.filter(
        (row) => !row.compacted && !row.supersededAt,
      ).length,
    };
  },
});

export const appendMany = mutation({
  args: { messages: v.array(messagePersistInputValidator) },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.messages.length === 0) return [];

    const conversationId = args.messages[0].conversationId;
    const conversation = await getOwnedConversation(
      ctx,
      userId,
      conversationId,
    );
    if (conversation.kind === "hall" && conversation.closedAt) {
      throw new Error("This table is closed.");
    }

    const now = Date.now();
    const inserted: Array<any> = [];

    for (const msg of args.messages) {
      if (msg.conversationId !== conversationId) {
        throw new Error("All messages must target the same conversation");
      }

      await assertOwnedMember(ctx, userId, msg.authorMemberId);
      await assertOwnedMember(ctx, userId, msg.roundTargetMemberId);

      if (msg.mentionedMemberIds?.length) {
        await Promise.all(
          msg.mentionedMemberIds.map((memberId) =>
            assertOwnedMember(ctx, userId, memberId),
          ),
        );
      }

      if (msg.roundIntent && typeof msg.roundNumber !== "number") {
        throw new Error("roundNumber is required when roundIntent is set");
      }

      if (msg.inReplyToMessageId) {
        const parent = await ctx.db.get(msg.inReplyToMessageId);
        if (
          !parent ||
          parent.userId !== userId ||
          parent.conversationId !== conversationId
        ) {
          throw new Error("Invalid reply target");
        }
      }

      if (msg.originConversationId || msg.originMessageId) {
        if (!msg.originConversationId || !msg.originMessageId) {
          throw new Error(
            "originConversationId and originMessageId must be provided together",
          );
        }

        const originConversation = await ctx.db.get(msg.originConversationId);
        const originMessage = await ctx.db.get(msg.originMessageId);
        if (!originConversation || originConversation.userId !== userId) {
          throw new Error("Invalid origin conversation");
        }
        if (
          !originMessage ||
          originMessage.userId !== userId ||
          originMessage.conversationId !== msg.originConversationId
        ) {
          throw new Error("Invalid origin message");
        }
      }

      const { promptTraceDraft, ...messageFields } = msg;
      const insertedId = await ctx.db.insert("messages", {
        userId,
        ...messageFields,
        systemKind:
          msg.role === "system"
            ? (msg.systemKind ?? (msg.routing ? "routing" : undefined))
            : undefined,
        compacted: false,
      });
      await upsertPromptTraceForMessage(ctx, {
        userId,
        conversationId,
        messageId: insertedId,
        promptTraceDraft,
      });
      inserted.push(await ctx.db.get(insertedId));
    }

    await ctx.db.patch(conversationId, {
      updatedAt: now,
      lastMessageAt: now,
    });
    return inserted.filter(Boolean);
  },
});

export const setPinned = mutation({
  args: {
    messageId: v.id("messages"),
    active: v.boolean(),
  },
  returns: v.union(messageDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const message = await getOwnedMessage(ctx, userId, args.messageId);
    const conversation = await getOwnedConversation(
      ctx,
      userId,
      message.conversationId,
    );

    if (conversation.kind !== "chamber") {
      throw new Error(
        "Pinned thread context is only available in chamber threads",
      );
    }
    if (
      message.role === "system" ||
      message.deletedAt ||
      message.supersededAt
    ) {
      throw new Error("Message cannot be pinned");
    }

    await ctx.db.patch(args.messageId, {
      pinnedAt: args.active ? Date.now() : undefined,
    });
    return await ctx.db.get(args.messageId);
  },
});

export const discard = mutation({
  args: {
    messageId: v.id("messages"),
  },
  returns: v.union(messageDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const message = await getOwnedMessage(ctx, userId, args.messageId);
    if (message.role === "system") {
      throw new Error("System messages cannot be discarded");
    }
    const now = Date.now();
    await ctx.db.patch(args.messageId, {
      deletedAt: now,
      pinnedAt: undefined,
    });
    return await ctx.db.get(args.messageId);
  },
});

export const deleteLatestTurn = mutation({
  args: {
    conversationId: v.id("conversations"),
    expectedLatestUserMessageId: v.optional(v.id("messages")),
  },
  returns: deleteLatestTurnResult,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(
      ctx,
      userId,
      args.conversationId,
    );

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();
    const turn = findLatestVisibleUserTurn(rows);
    if (!turn) {
      throw new Error("There is no active user turn to delete.");
    }

    const { latestUserMessage, affectedRows } = turn;
    if (
      args.expectedLatestUserMessageId &&
      latestUserMessage._id !== args.expectedLatestUserMessageId
    ) {
      throw new Error("Only the latest user turn can be changed.");
    }

    const deletedMessageIds = affectedRows.map((row) => row._id);
    const deletedMessageIdSet = new Set(
      deletedMessageIds.map((id) => String(id)),
    );
    const now = Date.now();

    await Promise.all(
      affectedRows.map((row) =>
        ctx.db.patch(row._id, {
          deletedAt: now,
          pinnedAt: undefined,
        }),
      ),
    );

    const feedbackRows = await ctx.db
      .query("messageFeedback")
      .withIndex("by_conversation", (q: any) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    await Promise.all(
      feedbackRows
        .filter((row: any) => deletedMessageIdSet.has(String(row.messageId)))
        .map((row: any) => ctx.db.delete(row._id)),
    );

    const remainingUserTurnCount = rows.filter(
      (row: any) =>
        row.role === "user" &&
        !row.deletedAt &&
        !row.supersededAt &&
        !row.compacted &&
        !deletedMessageIdSet.has(String(row._id)),
    ).length;

    const directives = await ctx.db
      .query("conversationGuidanceDirectives")
      .withIndex("by_conversation", (q: any) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    await Promise.all(
      directives
        .filter(
          (row: any) =>
            (row.triggerMessageId &&
              deletedMessageIdSet.has(String(row.triggerMessageId))) ||
            row.createdAfterUserTurn > remainingUserTurnCount,
        )
        .map((row: any) => ctx.db.delete(row._id)),
    );

    const promptTraceRows = await ctx.db
      .query("messagePromptTraces")
      .withIndex("by_conversation", (q: any) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    await Promise.all(
      promptTraceRows
        .filter((row: any) => deletedMessageIdSet.has(String(row.messageId)))
        .map((row: any) => ctx.db.delete(row._id)),
    );

    if (
      conversation.kind === "hall" &&
      conversation.hallMode === "roundtable"
    ) {
      const deletedRoundNumber = latestUserMessage.roundNumber;
      if (typeof deletedRoundNumber === "number") {
        const [rounds, intents, bids, candidates, memoryLogs] =
          await Promise.all([
            ctx.db
              .query("hallRounds")
              .withIndex("by_conversation_round", (q: any) =>
                q.eq("conversationId", args.conversationId),
              )
              .collect(),
            ctx.db
              .query("hallRoundIntents")
              .withIndex("by_conversation_round", (q: any) =>
                q.eq("conversationId", args.conversationId),
              )
              .collect(),
            ctx.db
              .query("hallRoundBids")
              .withIndex("by_conversation_round", (q: any) =>
                q.eq("conversationId", args.conversationId),
              )
              .collect(),
            ctx.db
              .query("hallRoundCandidates")
              .withIndex("by_conversation_round", (q: any) =>
                q.eq("conversationId", args.conversationId),
              )
              .collect(),
            ctx.db
              .query("conversationMemoryLogs")
              .withIndex("by_user_conversation", (q: any) =>
                q
                  .eq("userId", userId)
                  .eq("conversationId", args.conversationId),
              )
              .collect(),
          ]);

        await Promise.all([
          ...rounds
            .filter((row: any) => row.roundNumber >= deletedRoundNumber)
            .map((row: any) => ctx.db.delete(row._id)),
          ...intents
            .filter((row: any) => row.roundNumber >= deletedRoundNumber)
            .map((row: any) => ctx.db.delete(row._id)),
          ...bids
            .filter((row: any) => row.roundNumber >= deletedRoundNumber)
            .map((row: any) => ctx.db.delete(row._id)),
          ...candidates
            .filter((row: any) => row.roundNumber >= deletedRoundNumber)
            .map((row: any) => ctx.db.delete(row._id)),
          ...memoryLogs
            .filter(
              (row: any) =>
                row.scope === "hall" &&
                typeof row.roundNumber === "number" &&
                row.roundNumber >= deletedRoundNumber &&
                !row.deletedAt,
            )
            .map((row: any) =>
              ctx.db.patch(row._id, {
                deletedAt: now,
              }),
            ),
        ]);
      }
    }

    const remainingVisibleRows = rows.filter(
      (row: any) =>
        !row.deletedAt &&
        !row.supersededAt &&
        !row.compacted &&
        !deletedMessageIdSet.has(String(row._id)),
    );
    const lastMessageAt =
      remainingVisibleRows.length > 0
        ? Math.max(...remainingVisibleRows.map((row: any) => row._creationTime))
        : undefined;
    const guidanceLastReflectedUserTurnCount =
      typeof conversation.guidanceLastReflectedUserTurnCount === "number"
        ? Math.min(
            conversation.guidanceLastReflectedUserTurnCount,
            remainingUserTurnCount,
          )
        : undefined;

    await ctx.db.patch(args.conversationId, {
      updatedAt: now,
      lastMessageAt,
      guidanceLastReflectedUserTurnCount,
      ...(conversation.kind === "chamber"
        ? {
            timeAwareReentryState: undefined,
            timeAwareReentryNoticeSeenAt: undefined,
          }
        : {}),
    });

    return {
      latestUserMessageId: latestUserMessage._id,
      deletedMessageIds,
      deletedAt: now,
      updatedAt: now,
      ...(typeof lastMessageAt === "number" ? { lastMessageAt } : {}),
      ...(typeof guidanceLastReflectedUserTurnCount === "number"
        ? { guidanceLastReflectedUserTurnCount }
        : {}),
    };
  },
});

export const replaceWithRefinement = mutation({
  args: {
    targetMessageId: v.id("messages"),
    replacement: messagePersistInputValidator,
  },
  returns: v.object({
    superseded: messageDoc,
    replacement: messageDoc,
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const target = await getOwnedMessage(ctx, userId, args.targetMessageId);
    await getOwnedConversation(ctx, userId, target.conversationId);

    if (target.deletedAt || target.supersededAt) {
      throw new Error("Message is no longer active");
    }
    if (target.role !== "member") {
      throw new Error("Only member replies can be refined");
    }
    if (args.replacement.conversationId !== target.conversationId) {
      throw new Error("Replacement must target the same conversation");
    }

    await assertOwnedMember(ctx, userId, args.replacement.authorMemberId);
    const now = Date.now();
    const { promptTraceDraft, ...replacementFields } = args.replacement;
    const replacementId = await ctx.db.insert("messages", {
      userId,
      ...replacementFields,
      compacted: false,
      pinnedAt: target.pinnedAt,
      supersedesMessageId: args.targetMessageId,
    });
    await upsertPromptTraceForMessage(ctx, {
      userId,
      conversationId: target.conversationId,
      messageId: replacementId,
      promptTraceDraft,
    });

    await ctx.db.patch(args.targetMessageId, {
      pinnedAt: undefined,
      supersededAt: now,
      supersededByMessageId: replacementId,
    });
    await ctx.db.patch(target.conversationId, {
      updatedAt: now,
      lastMessageAt: now,
    });

    return {
      superseded: (await ctx.db.get(args.targetMessageId))!,
      replacement: (await ctx.db.get(replacementId))!,
    };
  },
});

export const appendElaborationReply = mutation({
  args: {
    targetMessageId: v.id("messages"),
    reply: messagePersistInputValidator,
  },
  returns: messageDoc,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const target = await getOwnedMessage(ctx, userId, args.targetMessageId);
    await getOwnedConversation(ctx, userId, target.conversationId);

    if (target.deletedAt || target.supersededAt) {
      throw new Error("Message is no longer active");
    }
    if (target.role !== "member") {
      throw new Error("Only member replies can be elaborated");
    }
    if (args.reply.conversationId !== target.conversationId) {
      throw new Error("Reply must target the same conversation");
    }

    await assertOwnedMember(ctx, userId, args.reply.authorMemberId);
    const now = Date.now();
    const { promptTraceDraft, ...replyFields } = args.reply;
    const replyId = await ctx.db.insert("messages", {
      userId,
      ...replyFields,
      compacted: false,
      inReplyToMessageId: args.reply.inReplyToMessageId ?? args.targetMessageId,
    });
    await upsertPromptTraceForMessage(ctx, {
      userId,
      conversationId: target.conversationId,
      messageId: replyId,
      promptTraceDraft,
    });
    await ctx.db.patch(target.conversationId, {
      updatedAt: now,
      lastMessageAt: now,
    });
    return (await ctx.db.get(replyId))!;
  },
});

export const clearConversation = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await getOwnedConversation(ctx, userId, args.conversationId);

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();

    const now = Date.now();
    await Promise.all(
      rows
        .filter((row) => row.userId === userId && !row.deletedAt)
        .map((row) => ctx.db.patch(row._id, { deletedAt: now })),
    );

    const logs = await ctx.db
      .query("conversationMemoryLogs")
      .withIndex("by_user_conversation", (q: any) =>
        q.eq("userId", userId).eq("conversationId", args.conversationId),
      )
      .collect();
    await Promise.all(
      logs
        .filter((row: any) => !row.deletedAt)
        .map((row: any) => ctx.db.patch(row._id, { deletedAt: now })),
    );

    const directives = await ctx.db
      .query("conversationGuidanceDirectives")
      .withIndex("by_conversation", (q: any) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    await Promise.all(directives.map((row: any) => ctx.db.delete(row._id)));

    const feedbackRows = await ctx.db
      .query("messageFeedback")
      .withIndex("by_conversation", (q: any) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    await Promise.all(feedbackRows.map((row: any) => ctx.db.delete(row._id)));

    await ctx.db.patch(args.conversationId, {
      lastMessageAt: undefined,
    });
    return null;
  },
});
