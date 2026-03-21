'use node';

import { runChamberTitleGraph, runHallTitleGraph } from '../graphs/hallTitleGraph';
import { runKBDigestGraph } from '../graphs/kbDigestGraph';
import { runChamberGuidanceReflectionGraph, runMemberGuidanceProfileGraph } from '../graphs/memberGuidanceGraph';
import { runMemberChatGraph } from '../graphs/memberChatGraph';
import { runMemberVoicePersonaGraph } from '../graphs/memberVoiceGraph';
import { runRoundBidGraph } from '../graphs/roundBidGraph';
import { runRouteMembersGraph } from '../graphs/routeMembersGraph';
import { runSpecialtiesGraph } from '../graphs/specialtiesGraph';
import { runChamberSummaryGraph, runHallFollowUpSeedGraph, runHallRoundSummaryGraph, runSummaryGraph } from '../graphs/summaryGraph';
import type {
  CouncilAiProvider,
  CouncilContextMessage,
  CouncilKBDocumentDigestHint,
  CouncilKnowledgeRetriever,
  CouncilPersonalArchiveAccess,
  CouncilPersonalArchiveRetriever,
  CouncilRouteMemberCandidate,
  RoundBidProposal,
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

  async generateMemberGuidanceProfile(input: {
    memberName: string;
    systemPrompt: string;
    specialties?: string[];
    existingGuidanceProfilePrompt?: string;
    model?: string;
  }): Promise<{ guidanceProfilePrompt: string; model: string }> {
    return await runMemberGuidanceProfileGraph(input);
  }

  async generateMemberVoicePersona(input: {
    memberName: string;
    systemPrompt: string;
    specialties?: string[];
    selectedVoiceName: 'Kore' | 'Zephyr' | 'Fenrir' | 'Puck' | 'Charon';
    existingTtsPersonaPrompt?: string;
    model?: string;
  }): Promise<{ ttsPersonaPrompt: string; model: string }> {
    return await runMemberVoicePersonaGraph(input);
  }

  async reflectChamberGuidance(input: {
    memberName: string;
    guidanceProfilePrompt: string;
    previousSummary?: string;
    trigger: 'interval' | 'feedback';
    recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
    activeDirectiveNotes?: string[];
    feedbackKeys?: string[];
    model?: string;
  }): Promise<{
    directives: Array<{
      note: string;
      ttlUserTurns: 1 | 2 | 3;
    }>;
    model: string;
  }> {
    return await runChamberGuidanceReflectionGraph(input);
  }

  async chatMember(input: {
    query: string;
    storeName?: string | null;
    knowledgeRetriever?: CouncilKnowledgeRetriever;
    personalArchiveRetriever?: CouncilPersonalArchiveRetriever;
    personalArchiveAccess?: CouncilPersonalArchiveAccess;
    identityContext?: string;
    memoryHint?: string;
    kbDigests?: CouncilKBDocumentDigestHint[];
    retrievalModel?: string;
    responseModel?: string;
    chatProfile?: 'instant' | 'short' | 'think' | 'deep_dive';
    retrievalProfile?: 'default' | 'deep_dive';
    temperature?: number;
    metadataFilter?: string;
    personaPrompt?: string;
    contextMessages?: CouncilContextMessage[];
    includeConversationContext?: boolean;
    knowledgeMode?: 'auto' | 'force' | 'off';
    turnDirective?: 'shorter' | 'elaborate';
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

  async summarizeHallFollowUpThread(input: {
    memberName: string;
    hallMode: 'advisory' | 'roundtable';
    participants: string[];
    roundSummaries: string[];
    transcript: Array<{ author: string; content: string }>;
    pairedUserMessage?: string;
    anchorMemberMessage: string;
    model?: string;
  }): Promise<string> {
    return await runHallFollowUpSeedGraph(input);
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

  async proposeRoundBidPromptOnly(input: {
    member: { id: string; name: string; specialties?: string[]; systemPrompt: string };
    conversationContext: string;
    memberIds: string[];
    recentSpeakerIds?: string[];
    mentionedMemberIds?: string[];
    model?: string;
  }): Promise<RoundBidProposal> {
    return await runRoundBidGraph(input);
  }
}
