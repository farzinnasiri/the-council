'use node';

import {
  GeminiService,
  type KBDocumentDigestHint,
  type RouteMemberCandidate,
} from '../geminiService';
import type {
  CouncilAiProvider,
  CouncilContextMessage,
  CouncilKBDocumentDigestHint,
  CouncilKnowledgeRetriever,
  CouncilRouteMemberCandidate,
  RoundIntentProposal,
} from './types';

function toRouteCandidates(input: CouncilRouteMemberCandidate[]): RouteMemberCandidate[] {
  return input.map((item) => ({
    id: item.id,
    name: item.name,
    specialties: item.specialties,
    systemPrompt: item.systemPrompt,
  }));
}

function toDigestHints(input?: CouncilKBDocumentDigestHint[]): KBDocumentDigestHint[] {
  return (input ?? []).map((item) => ({
    displayName: item.displayName,
    kbDocumentName: item.kbDocumentName,
    topics: item.topics,
    entities: item.entities,
    lexicalAnchors: item.lexicalAnchors,
    styleAnchors: item.styleAnchors,
    digestSummary: item.digestSummary,
  }));
}

export class GeminiCouncilAiProvider implements CouncilAiProvider {
  constructor(private readonly service: GeminiService) {}

  async routeMembers(input: {
    message: string;
    candidates: CouncilRouteMemberCandidate[];
    maxSelections?: number;
    model?: string;
  }): Promise<{ chosenMemberIds: string[]; model: string }> {
    return await this.service.routeMembersLite({
      message: input.message,
      candidates: toRouteCandidates(input.candidates),
      maxSelections: input.maxSelections,
      model: input.model,
    });
  }

  async suggestHallTitle(input: { message: string; model?: string }): Promise<{ title: string; model: string }> {
    return await this.service.suggestHallTitle({
      message: input.message,
      model: input.model,
    });
  }

  async suggestMemberSpecialties(input: {
    name: string;
    systemPrompt: string;
    model?: string;
  }): Promise<{ specialties: string[]; model: string }> {
    return await this.service.suggestMemberSpecialties({
      name: input.name,
      systemPrompt: input.systemPrompt,
      model: input.model,
    });
  }

  async chatMember(input: {
    query: string;
    storeName?: string | null;
    knowledgeRetriever?: CouncilKnowledgeRetriever;
    memoryHint?: string;
    kbDigests?: CouncilKBDocumentDigestHint[];
    retrievalModel?: string;
    responseModel?: string;
    temperature?: number;
    metadataFilter?: string;
    personaPrompt?: string;
    contextMessages?: CouncilContextMessage[];
    useKnowledgeBase?: boolean;
  }) {
    return await this.service.chatWithOptionalKnowledgeBase({
      query: input.query,
      storeName: input.useKnowledgeBase === false ? null : input.storeName,
      knowledgeRetriever: input.knowledgeRetriever,
      memoryHint: input.memoryHint,
      kbDigests: toDigestHints(input.kbDigests),
      retrievalModel: input.retrievalModel,
      responseModel: input.responseModel,
      temperature: input.temperature,
      metadataFilter: input.metadataFilter,
      personaPrompt: input.personaPrompt,
      contextMessages: input.contextMessages,
    });
  }

  async summarizeConversation(input: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousSummary?: string;
    model?: string;
  }): Promise<string> {
    return await this.service.summarizeMessages({
      messages: input.messages,
      previousSummary: input.previousSummary,
      model: input.model,
    });
  }

  async summarizeChamberMemory(input: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousSummary?: string;
    memberName: string;
    memberSpecialties?: string[];
    model?: string;
  }): Promise<string> {
    return await this.service.summarizeChamberMemory({
      messages: input.messages,
      previousSummary: input.previousSummary,
      memberName: input.memberName,
      memberSpecialties: input.memberSpecialties,
      model: input.model,
    });
  }

  async proposeRoundIntentPromptOnly(input: {
    member: { id: string; name: string; specialties?: string[]; systemPrompt: string };
    conversationContext: string;
    memberIds: string[];
    model?: string;
  }): Promise<RoundIntentProposal> {
    return await this.service.proposeRoundIntentPromptOnly(input);
  }
}
