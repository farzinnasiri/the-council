'use node';

import { runChamberTitleGraph, runHallTitleGraph } from '../graphs/hallTitleGraph';
import { runKBDigestGraph } from '../graphs/kbDigestGraph';
import { runMemberChatGraph } from '../graphs/memberChatGraph';
import { runRoundIntentGraph } from '../graphs/roundIntentGraph';
import { runRouteMembersGraph } from '../graphs/routeMembersGraph';
import { runSpecialtiesGraph } from '../graphs/specialtiesGraph';
import { runChamberSummaryGraph, runHallRoundSummaryGraph, runSummaryGraph } from '../graphs/summaryGraph';
import type {
  CouncilAiProvider,
  CouncilContextMessage,
  CouncilKBDocumentDigestHint,
  CouncilKnowledgeRetriever,
  CouncilRouteMemberCandidate,
  RoundIntentProposal,
} from './types';

export class LangChainCouncilAiProvider implements CouncilAiProvider {
  async routeMembers(input: {
    message: string;
    candidates: CouncilRouteMemberCandidate[];
    maxSelections?: number;
    model?: string;
  }): Promise<{ chosenMemberIds: string[]; model: string }> {
    return await runRouteMembersGraph(input);
  }

  async suggestHallTitle(input: { message: string; model?: string }): Promise<{ title: string; model: string }> {
    return await runHallTitleGraph(input);
  }

  async suggestChamberTitle(input: { message: string; model?: string }): Promise<{ title: string; model: string }> {
    return await runChamberTitleGraph(input);
  }

  async suggestMemberSpecialties(input: {
    name: string;
    systemPrompt: string;
    model?: string;
  }): Promise<{ specialties: string[]; model: string }> {
    return await runSpecialtiesGraph(input);
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
    return await runMemberChatGraph(input);
  }

  async summarizeConversation(input: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousSummary?: string;
    model?: string;
  }): Promise<string> {
    return await runSummaryGraph(input);
  }

  async summarizeChamberMemory(input: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousSummary?: string;
    memberName: string;
    memberSpecialties?: string[];
    model?: string;
  }): Promise<string> {
    return await runChamberSummaryGraph(input);
  }

  async summarizeHallRound(input: {
    roundNumber: number;
    messages: Array<{ author: string; content: string }>;
    model?: string;
  }): Promise<string> {
    return await runHallRoundSummaryGraph(input);
  }

  async summarizeDocumentDigest(input: {
    displayName: string;
    sampleText?: string;
    memberSystemPrompt?: string;
    model?: string;
  }): Promise<{
    topics: string[];
    entities: string[];
    lexicalAnchors: string[];
    styleAnchors: string[];
    digestSummary: string;
    model: string;
  }> {
    return await runKBDigestGraph(input);
  }

  async proposeRoundIntentPromptOnly(input: {
    member: { id: string; name: string; specialties?: string[]; systemPrompt: string };
    conversationContext: string;
    memberIds: string[];
    model?: string;
  }): Promise<RoundIntentProposal> {
    return await runRoundIntentGraph(input);
  }
}
