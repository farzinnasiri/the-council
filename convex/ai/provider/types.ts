export type RoundIntent = 'speak' | 'challenge' | 'support' | 'pass';
export type RoundBidMoveType =
  | 'rebuttal'
  | 'caveat'
  | 'synthesis'
  | 'evidence'
  | 'reframing'
  | 'clarification'
  | 'agreement'
  | 'pass';

export interface CouncilContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CouncilRouteMemberCandidate {
  id: string;
  name: string;
  specialties?: string[];
  systemPrompt?: string;
}

export interface CouncilKBDocumentCard {
  docType: string;
  about: string;
  bestFor: string[];
  evidenceKinds: string[];
  notFor: string[];
}

export interface CouncilKBDocumentDigestHint {
  displayName: string;
  kbDocumentName?: string;
  documentCard: CouncilKBDocumentCard;
  queryHints: string[];
}

export interface CouncilPersonalSourceDigestHint {
  displayName: string;
  personalSourceName: string;
  documentKinds: string[];
  semanticClasses: string[];
  queryHints: string[];
}

export interface CouncilPersonalSourceRetriever {
  listSources(): Promise<{
    sources: CouncilPersonalSourceDigestHint[];
  }>;
  retrieve(input: {
    query: string;
    targetDocumentKinds?: string[];
    targetSemanticClasses?: string[];
    candidateSourceCount?: number;
    chunkLimitPerQuery?: number;
    injectedSourceGroupCount?: number;
    chunksPerSourceGroup?: number;
    traceId?: string;
  }): Promise<{
    retrievalText: string;
    citations: Array<{ title: string; uri?: string }>;
    snippets: Array<{ text: string; citationIndices: number[] }>;
    grounded: boolean;
  }>;
}

export interface RoundBidProposal {
  wantsToSpeak: boolean;
  moveType: RoundBidMoveType;
  targetMemberId?: string;
  noveltyClaim: string;
  confidence: number;
  estimatedValue: number;
}

export interface CouncilKnowledgeRetriever {
  listDocuments(input: {
    storeName: string;
  }): Promise<Array<{ name?: string; displayName?: string }>>;
  retrieve(input: {
    storeName: string;
    query: string;
    documentNames?: string[];
    limit?: number;
    traceId: string;
  }): Promise<{
    retrievalText: string;
    citations: Array<{ title: string; uri?: string }>;
    snippets: Array<{ text: string; citationIndices: number[] }>;
    grounded: boolean;
  }>;
}

export interface ProviderChatResponse {
  answer: string;
  citations: Array<{ title: string; uri?: string }>;
  model: string;
  retrievalModel: string;
  grounded: boolean;
  usedKnowledgeBase?: boolean;
  usedPersonalSources?: boolean;
  attemptedResponseModelSlot?: number;
  attemptedResponseModelSpec?: string;
  finalResponseModelSlot?: number;
  finalResponseModelSpec?: string;
  fallbackUsed?: boolean;
}

export type ChamberChatProfile = 'instant' | 'short' | 'think' | 'brainstorm' | 'deep_dive';
export type RetrievalStrategy = 'instant' | 'brainstorm' | 'deep_dive';
export type LegacyRetrievalProfile = 'default' | 'deep_dive';

export interface CouncilAiProvider {
  routeMembers(input: {
    message: string;
    candidates: CouncilRouteMemberCandidate[];
    maxSelections?: number;
    model?: string;
  }): Promise<{ chosenMemberIds: string[]; model: string }>;

  suggestHallTitle(input: { message: string; model?: string }): Promise<{ title: string; model: string }>;
  suggestChamberTitle(input: { message: string; model?: string }): Promise<{ title: string; model: string }>;

  suggestMemberSpecialties(input: {
    name: string;
    systemPrompt: string;
    model?: string;
  }): Promise<{ specialties: string[]; model: string }>;

  generateMemberGuidanceProfile(input: {
    memberName: string;
    systemPrompt: string;
    specialties?: string[];
    existingGuidanceProfilePrompt?: string;
    model?: string;
  }): Promise<{ guidanceProfilePrompt: string; model: string }>;

  generateMemberVoicePersona(input: {
    memberName: string;
    systemPrompt: string;
    specialties?: string[];
    selectedVoiceName: 'Kore' | 'Zephyr' | 'Fenrir' | 'Puck' | 'Charon';
    existingTtsPersonaPrompt?: string;
    model?: string;
  }): Promise<{ ttsPersonaPrompt: string; model: string }>;

  reflectChamberGuidance(input: {
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
  }>;

  chatMember(input: {
    query: string;
    storeName?: string | null;
    knowledgeRetriever?: CouncilKnowledgeRetriever;
    personalSourceRetriever?: CouncilPersonalSourceRetriever;
    identityContext?: string;
    memoryHint?: string;
    kbDigests?: CouncilKBDocumentDigestHint[];
    retrievalModel?: string;
    responseModel?: string;
    chatProfile?: ChamberChatProfile;
    retrievalStrategy?: RetrievalStrategy;
    // Deprecated compatibility alias for older callers and the current retrieval graph.
    retrievalProfile?: LegacyRetrievalProfile;
    temperature?: number;
    personaPrompt?: string;
    contextMessages?: CouncilContextMessage[];
    includeConversationContext?: boolean;
    knowledgeMode?: 'auto' | 'force' | 'off';
    turnDirective?: 'shorter' | 'elaborate';
  }): Promise<ProviderChatResponse>;

  summarizeConversation(input: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousSummary?: string;
    model?: string;
  }): Promise<string>;

  summarizeChamberMemory(input: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousSummary?: string;
    memberName: string;
    memberSpecialties?: string[];
    model?: string;
  }): Promise<string>;

  summarizeHallRound(input: {
    roundNumber: number;
    messages: Array<{ author: string; content: string }>;
    model?: string;
  }): Promise<string>;

  summarizeHallFollowUpThread(input: {
    memberName: string;
    hallMode: 'advisory' | 'roundtable';
    participants: string[];
    roundSummaries: string[];
    transcript: Array<{ author: string; content: string }>;
    pairedUserMessage?: string;
    anchorMemberMessage: string;
    model?: string;
  }): Promise<string>;

  summarizeDocumentDigest(input: {
    displayName: string;
    sampleText?: string;
    memberSystemPrompt?: string;
    model?: string;
  }): Promise<{
    documentCard: CouncilKBDocumentCard;
    queryHints: string[];
    model: string;
  }>;

  proposeRoundBidPromptOnly(input: {
    member: { id: string; name: string; specialties?: string[]; systemPrompt: string };
    conversationContext: string;
    memberIds: string[];
    recentSpeakerIds?: string[];
    mentionedMemberIds?: string[];
    model?: string;
  }): Promise<RoundBidProposal>;
}
