/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_chat from "../ai/chat.js";
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
import type * as ai_knowledge from "../ai/knowledge.js";
import type * as ai_modelConfig from "../ai/modelConfig.js";
import type * as ai_openaiEmbeddings from "../ai/openaiEmbeddings.js";
import type * as ai_orchestration_advisoryHall from "../ai/orchestration/advisoryHall.js";
import type * as ai_orchestration_roundtableHall from "../ai/orchestration/roundtableHall.js";
import type * as ai_provider_factory from "../ai/provider/factory.js";
import type * as ai_provider_langchainProvider from "../ai/provider/langchainProvider.js";
import type * as ai_provider_types from "../ai/provider/types.js";
import type * as ai_ragConfig from "../ai/ragConfig.js";
import type * as ai_ragExtraction from "../ai/ragExtraction.js";
import type * as ai_ragStore from "../ai/ragStore.js";
import type * as ai_roundtable from "../ai/roundtable.js";
import type * as ai_roundtablePolicy from "../ai/roundtablePolicy.js";
import type * as ai_routing from "../ai/routing.js";
import type * as ai_runtime_messages from "../ai/runtime/messages.js";
import type * as ai_runtime_modelFactory from "../ai/runtime/modelFactory.js";
import type * as ai_runtime_modelRegistry from "../ai/runtime/modelRegistry.js";
import type * as ai_runtime_structured from "../ai/runtime/structured.js";
import type * as ai_runtime_tracing from "../ai/runtime/tracing.js";
import type * as ai_runtime_types from "../ai/runtime/types.js";
import type * as auth from "../auth.js";
import type * as contexts_chamber_application_chatWithMember from "../contexts/chamber/application/chatWithMember.js";
import type * as contexts_chamber_application_compactConversation from "../contexts/chamber/application/compactConversation.js";
import type * as contexts_chamber_contracts from "../contexts/chamber/contracts.js";
import type * as contexts_chamber_infrastructure_chamberRepo from "../contexts/chamber/infrastructure/chamberRepo.js";
import type * as contexts_hall_application_chatRoundtableSpeaker from "../contexts/hall/application/chatRoundtableSpeaker.js";
import type * as contexts_hall_application_chatRoundtableSpeakers from "../contexts/hall/application/chatRoundtableSpeakers.js";
import type * as contexts_hall_application_prepareRoundtableRound from "../contexts/hall/application/prepareRoundtableRound.js";
import type * as contexts_hall_application_routeHallMembers from "../contexts/hall/application/routeHallMembers.js";
import type * as contexts_hall_application_suggestHallTitle from "../contexts/hall/application/suggestHallTitle.js";
import type * as contexts_hall_application_suggestMemberSpecialties from "../contexts/hall/application/suggestMemberSpecialties.js";
import type * as contexts_hall_contracts from "../contexts/hall/contracts.js";
import type * as contexts_hall_domain_hallMode from "../contexts/hall/domain/hallMode.js";
import type * as contexts_hall_domain_hallPrompt from "../contexts/hall/domain/hallPrompt.js";
import type * as contexts_hall_infrastructure_membersRepo from "../contexts/hall/infrastructure/membersRepo.js";
import type * as contexts_hall_infrastructure_messagesRepo from "../contexts/hall/infrastructure/messagesRepo.js";
import type * as contexts_hall_infrastructure_participantsRepo from "../contexts/hall/infrastructure/participantsRepo.js";
import type * as contexts_hall_infrastructure_roundtableRepo from "../contexts/hall/infrastructure/roundtableRepo.js";
import type * as contexts_knowledge_application_deleteMemberKnowledgeDocument from "../contexts/knowledge/application/deleteMemberKnowledgeDocument.js";
import type * as contexts_knowledge_application_ensureMemberKnowledgeStore from "../contexts/knowledge/application/ensureMemberKnowledgeStore.js";
import type * as contexts_knowledge_application_listMemberKnowledgeDocuments from "../contexts/knowledge/application/listMemberKnowledgeDocuments.js";
import type * as contexts_knowledge_application_purgeExpiredStagedKnowledgeDocuments from "../contexts/knowledge/application/purgeExpiredStagedKnowledgeDocuments.js";
import type * as contexts_knowledge_application_rebuildMemberKnowledgeDigests from "../contexts/knowledge/application/rebuildMemberKnowledgeDigests.js";
import type * as contexts_knowledge_application_rehydrateMemberKnowledgeStore from "../contexts/knowledge/application/rehydrateMemberKnowledgeStore.js";
import type * as contexts_knowledge_application_uploadMemberDocuments from "../contexts/knowledge/application/uploadMemberDocuments.js";
import type * as contexts_knowledge_contracts from "../contexts/knowledge/contracts.js";
import type * as contexts_knowledge_infrastructure_knowledgeIngestGateway from "../contexts/knowledge/infrastructure/knowledgeIngestGateway.js";
import type * as contexts_knowledge_infrastructure_knowledgeRepo from "../contexts/knowledge/infrastructure/knowledgeRepo.js";
import type * as contexts_shared_auth from "../contexts/shared/auth.js";
import type * as contexts_shared_contracts from "../contexts/shared/contracts.js";
import type * as contexts_shared_convexGateway from "../contexts/shared/convexGateway.js";
import type * as contexts_shared_types from "../contexts/shared/types.js";
import type * as conversations from "../conversations.js";
import type * as hallRounds from "../hallRounds.js";
import type * as http from "../http.js";
import type * as kbDigests from "../kbDigests.js";
import type * as kbDocumentChunks from "../kbDocumentChunks.js";
import type * as kbDocuments from "../kbDocuments.js";
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
  "ai/chat": typeof ai_chat;
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
  "ai/knowledge": typeof ai_knowledge;
  "ai/modelConfig": typeof ai_modelConfig;
  "ai/openaiEmbeddings": typeof ai_openaiEmbeddings;
  "ai/orchestration/advisoryHall": typeof ai_orchestration_advisoryHall;
  "ai/orchestration/roundtableHall": typeof ai_orchestration_roundtableHall;
  "ai/provider/factory": typeof ai_provider_factory;
  "ai/provider/langchainProvider": typeof ai_provider_langchainProvider;
  "ai/provider/types": typeof ai_provider_types;
  "ai/ragConfig": typeof ai_ragConfig;
  "ai/ragExtraction": typeof ai_ragExtraction;
  "ai/ragStore": typeof ai_ragStore;
  "ai/roundtable": typeof ai_roundtable;
  "ai/roundtablePolicy": typeof ai_roundtablePolicy;
  "ai/routing": typeof ai_routing;
  "ai/runtime/messages": typeof ai_runtime_messages;
  "ai/runtime/modelFactory": typeof ai_runtime_modelFactory;
  "ai/runtime/modelRegistry": typeof ai_runtime_modelRegistry;
  "ai/runtime/structured": typeof ai_runtime_structured;
  "ai/runtime/tracing": typeof ai_runtime_tracing;
  "ai/runtime/types": typeof ai_runtime_types;
  auth: typeof auth;
  "contexts/chamber/application/chatWithMember": typeof contexts_chamber_application_chatWithMember;
  "contexts/chamber/application/compactConversation": typeof contexts_chamber_application_compactConversation;
  "contexts/chamber/contracts": typeof contexts_chamber_contracts;
  "contexts/chamber/infrastructure/chamberRepo": typeof contexts_chamber_infrastructure_chamberRepo;
  "contexts/hall/application/chatRoundtableSpeaker": typeof contexts_hall_application_chatRoundtableSpeaker;
  "contexts/hall/application/chatRoundtableSpeakers": typeof contexts_hall_application_chatRoundtableSpeakers;
  "contexts/hall/application/prepareRoundtableRound": typeof contexts_hall_application_prepareRoundtableRound;
  "contexts/hall/application/routeHallMembers": typeof contexts_hall_application_routeHallMembers;
  "contexts/hall/application/suggestHallTitle": typeof contexts_hall_application_suggestHallTitle;
  "contexts/hall/application/suggestMemberSpecialties": typeof contexts_hall_application_suggestMemberSpecialties;
  "contexts/hall/contracts": typeof contexts_hall_contracts;
  "contexts/hall/domain/hallMode": typeof contexts_hall_domain_hallMode;
  "contexts/hall/domain/hallPrompt": typeof contexts_hall_domain_hallPrompt;
  "contexts/hall/infrastructure/membersRepo": typeof contexts_hall_infrastructure_membersRepo;
  "contexts/hall/infrastructure/messagesRepo": typeof contexts_hall_infrastructure_messagesRepo;
  "contexts/hall/infrastructure/participantsRepo": typeof contexts_hall_infrastructure_participantsRepo;
  "contexts/hall/infrastructure/roundtableRepo": typeof contexts_hall_infrastructure_roundtableRepo;
  "contexts/knowledge/application/deleteMemberKnowledgeDocument": typeof contexts_knowledge_application_deleteMemberKnowledgeDocument;
  "contexts/knowledge/application/ensureMemberKnowledgeStore": typeof contexts_knowledge_application_ensureMemberKnowledgeStore;
  "contexts/knowledge/application/listMemberKnowledgeDocuments": typeof contexts_knowledge_application_listMemberKnowledgeDocuments;
  "contexts/knowledge/application/purgeExpiredStagedKnowledgeDocuments": typeof contexts_knowledge_application_purgeExpiredStagedKnowledgeDocuments;
  "contexts/knowledge/application/rebuildMemberKnowledgeDigests": typeof contexts_knowledge_application_rebuildMemberKnowledgeDigests;
  "contexts/knowledge/application/rehydrateMemberKnowledgeStore": typeof contexts_knowledge_application_rehydrateMemberKnowledgeStore;
  "contexts/knowledge/application/uploadMemberDocuments": typeof contexts_knowledge_application_uploadMemberDocuments;
  "contexts/knowledge/contracts": typeof contexts_knowledge_contracts;
  "contexts/knowledge/infrastructure/knowledgeIngestGateway": typeof contexts_knowledge_infrastructure_knowledgeIngestGateway;
  "contexts/knowledge/infrastructure/knowledgeRepo": typeof contexts_knowledge_infrastructure_knowledgeRepo;
  "contexts/shared/auth": typeof contexts_shared_auth;
  "contexts/shared/contracts": typeof contexts_shared_contracts;
  "contexts/shared/convexGateway": typeof contexts_shared_convexGateway;
  "contexts/shared/types": typeof contexts_shared_types;
  conversations: typeof conversations;
  hallRounds: typeof hallRounds;
  http: typeof http;
  kbDigests: typeof kbDigests;
  kbDocumentChunks: typeof kbDocumentChunks;
  kbDocuments: typeof kbDocuments;
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
