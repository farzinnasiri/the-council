/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as ai_graphs_fallbacks from "../ai/graphs/fallbacks.js";
import type * as ai_graphs_hallTitleGraph from "../ai/graphs/hallTitleGraph.js";
import type * as ai_graphs_kbDigestGraph from "../ai/graphs/kbDigestGraph.js";
import type * as ai_graphs_memberChatGraph from "../ai/graphs/memberChatGraph.js";
import type * as ai_graphs_roundIntentGraph from "../ai/graphs/roundIntentGraph.js";
import type * as ai_graphs_routeMembersGraph from "../ai/graphs/routeMembersGraph.js";
import type * as ai_graphs_specialtiesGraph from "../ai/graphs/specialtiesGraph.js";
import type * as ai_graphs_summaryGraph from "../ai/graphs/summaryGraph.js";
import type * as ai_graphs_types from "../ai/graphs/types.js";
import type * as ai_graphs_utils from "../ai/graphs/utils.js";
import type * as ai_kbIngest from "../ai/kbIngest.js";
import type * as ai_modelConfig from "../ai/modelConfig.js";
import type * as ai_openaiEmbeddings from "../ai/openaiEmbeddings.js";
import type * as ai_orchestration_advisoryHall from "../ai/orchestration/advisoryHall.js";
import type * as ai_orchestration_roundtableHall from "../ai/orchestration/roundtableHall.js";
import type * as ai_ownership from "../ai/ownership.js";
import type * as ai_provider_factory from "../ai/provider/factory.js";
import type * as ai_provider_langchainProvider from "../ai/provider/langchainProvider.js";
import type * as ai_provider_types from "../ai/provider/types.js";
import type * as ai_ragConfig from "../ai/ragConfig.js";
import type * as ai_ragExtraction from "../ai/ragExtraction.js";
import type * as ai_ragStore from "../ai/ragStore.js";
import type * as ai_roundtablePolicy from "../ai/roundtablePolicy.js";
import type * as ai_runtime_messages from "../ai/runtime/messages.js";
import type * as ai_runtime_modelFactory from "../ai/runtime/modelFactory.js";
import type * as ai_runtime_modelRegistry from "../ai/runtime/modelRegistry.js";
import type * as ai_runtime_structured from "../ai/runtime/structured.js";
import type * as ai_runtime_tracing from "../ai/runtime/tracing.js";
import type * as ai_runtime_types from "../ai/runtime/types.js";
import type * as auth from "../auth.js";
import type * as conversations from "../conversations.js";
import type * as hallRounds from "../hallRounds.js";
import type * as http from "../http.js";
import type * as kbDigests from "../kbDigests.js";
import type * as kbDocumentChunks from "../kbDocumentChunks.js";
import type * as kbStagedDocuments from "../kbStagedDocuments.js";
import type * as members from "../members.js";
import type * as memoryLogs from "../memoryLogs.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as upload from "../upload.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  "ai/graphs/fallbacks": typeof ai_graphs_fallbacks;
  "ai/graphs/hallTitleGraph": typeof ai_graphs_hallTitleGraph;
  "ai/graphs/kbDigestGraph": typeof ai_graphs_kbDigestGraph;
  "ai/graphs/memberChatGraph": typeof ai_graphs_memberChatGraph;
  "ai/graphs/roundIntentGraph": typeof ai_graphs_roundIntentGraph;
  "ai/graphs/routeMembersGraph": typeof ai_graphs_routeMembersGraph;
  "ai/graphs/specialtiesGraph": typeof ai_graphs_specialtiesGraph;
  "ai/graphs/summaryGraph": typeof ai_graphs_summaryGraph;
  "ai/graphs/types": typeof ai_graphs_types;
  "ai/graphs/utils": typeof ai_graphs_utils;
  "ai/kbIngest": typeof ai_kbIngest;
  "ai/modelConfig": typeof ai_modelConfig;
  "ai/openaiEmbeddings": typeof ai_openaiEmbeddings;
  "ai/orchestration/advisoryHall": typeof ai_orchestration_advisoryHall;
  "ai/orchestration/roundtableHall": typeof ai_orchestration_roundtableHall;
  "ai/ownership": typeof ai_ownership;
  "ai/provider/factory": typeof ai_provider_factory;
  "ai/provider/langchainProvider": typeof ai_provider_langchainProvider;
  "ai/provider/types": typeof ai_provider_types;
  "ai/ragConfig": typeof ai_ragConfig;
  "ai/ragExtraction": typeof ai_ragExtraction;
  "ai/ragStore": typeof ai_ragStore;
  "ai/roundtablePolicy": typeof ai_roundtablePolicy;
  "ai/runtime/messages": typeof ai_runtime_messages;
  "ai/runtime/modelFactory": typeof ai_runtime_modelFactory;
  "ai/runtime/modelRegistry": typeof ai_runtime_modelRegistry;
  "ai/runtime/structured": typeof ai_runtime_structured;
  "ai/runtime/tracing": typeof ai_runtime_tracing;
  "ai/runtime/types": typeof ai_runtime_types;
  auth: typeof auth;
  conversations: typeof conversations;
  hallRounds: typeof hallRounds;
  http: typeof http;
  kbDigests: typeof kbDigests;
  kbDocumentChunks: typeof kbDocumentChunks;
  kbStagedDocuments: typeof kbStagedDocuments;
  members: typeof members;
  memoryLogs: typeof memoryLogs;
  messages: typeof messages;
  migrations: typeof migrations;
  seed: typeof seed;
  settings: typeof settings;
  upload: typeof upload;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
