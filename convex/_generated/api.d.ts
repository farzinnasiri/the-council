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
import type * as ai_geminiService from "../ai/geminiService.js";
import type * as ai_kbIngest from "../ai/kbIngest.js";
import type * as ai_modelConfig from "../ai/modelConfig.js";
import type * as ai_ownership from "../ai/ownership.js";
import type * as auth from "../auth.js";
import type * as conversations from "../conversations.js";
import type * as http from "../http.js";
import type * as kbDigests from "../kbDigests.js";
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
  "ai/geminiService": typeof ai_geminiService;
  "ai/kbIngest": typeof ai_kbIngest;
  "ai/modelConfig": typeof ai_modelConfig;
  "ai/ownership": typeof ai_ownership;
  auth: typeof auth;
  conversations: typeof conversations;
  http: typeof http;
  kbDigests: typeof kbDigests;
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
