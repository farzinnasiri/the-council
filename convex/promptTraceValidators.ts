import { v } from 'convex/values';

export const promptTraceKindValidator = v.union(
  v.literal('chamber'),
  v.literal('hall_advisory'),
  v.literal('hall_roundtable'),
);

export const promptTraceSourceKindValidator = v.union(
  v.literal('persona'),
  v.literal('memory'),
  v.literal('context'),
  v.literal('question'),
  v.literal('retrieval'),
  v.literal('directive'),
  v.literal('sentinel'),
);

export const promptTraceSectionValidator = v.object({
  key: v.string(),
  label: v.string(),
  content: v.string(),
  sourceKind: promptTraceSourceKindValidator,
  meta: v.optional(v.any()),
});

export const promptTraceRetrievalValidator = v.object({
  plannerKbQueries: v.array(v.string()),
  secondPassKbQueries: v.array(v.string()),
  personalSourceQueries: v.array(v.string()),
  selectedKbDocumentNames: v.array(v.string()),
  knowledgeRouteMode: v.optional(v.string()),
  knowledgeRouteSummary: v.optional(v.string()),
  personalSourcePlanReason: v.optional(v.string()),
});

export const promptTraceDraftValidator = v.object({
  kind: promptTraceKindValidator,
  sections: v.array(promptTraceSectionValidator),
  retrieval: promptTraceRetrievalValidator,
  capturedAt: v.number(),
});

export const promptTraceRecordValidator = v.object({
  _id: v.id('messagePromptTraces'),
  _creationTime: v.number(),
  userId: v.id('users'),
  conversationId: v.id('conversations'),
  messageId: v.id('messages'),
  kind: promptTraceKindValidator,
  sections: v.array(promptTraceSectionValidator),
  retrieval: promptTraceRetrievalValidator,
  capturedAt: v.number(),
});
