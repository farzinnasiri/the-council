export type RoundIntent = 'speak' | 'challenge' | 'support' | 'pass';

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

export interface CouncilKBDocumentDigestHint {
  displayName: string;
  kbDocumentName?: string;
  topics: string[];
  entities: string[];
  lexicalAnchors: string[];
  styleAnchors: string[];
  digestSummary: string;
}

export interface RoundIntentProposal {
  intent: RoundIntent;
  targetMemberId?: string;
  rationale: string;
}

export interface CouncilKnowledgeRetriever {
  listDocuments(input: {
    storeName: string;
  }): Promise<Array<{ name?: string; displayName?: string }>>;
  retrieve(input: {
    storeName: string;
    query: string;
    limit?: number;
    metadataFilter?: string;
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
  debug?: {
    traceId: string;
    mode: 'with-kb' | 'prompt-only';
    reason?: string;
    kbCheck?: {
      requestedStoreName: string | null;
      docsCount: number;
      listError?: string;
      fileSearchInvoked: boolean;
      gateDecision?: {
        mode: 'heuristic' | 'llm-gate';
        useKnowledgeBase: boolean;
        reason: string;
        decision?: 'required' | 'helpful' | 'unnecessary';
        confidence?: number;
      };
    };
    queryPlan?: {
      originalQuery: string;
      standaloneQuery: string;
      queryAlternates: string[];
      gateUsed: boolean;
      gateReason: string;
      matchedDigestSignals: string[];
    };
    fileSearchStart?: {
      storeName: string;
      retrievalModel: string;
      query: string;
      metadataFilter?: string;
      alternateQuery?: string;
    };
    fileSearchResponse?: {
      grounded: boolean;
      citationsCount: number;
      snippetsCount: number;
      retrievalText: string;
      citations: Array<{ title: string; uri?: string }>;
      snippets: string[];
      queryUsed?: string;
      usedAlternateQuery?: boolean;
    };
    answerPrompt: string;
  };
}

export interface CouncilAiProvider {
  routeMembers(input: {
    message: string;
    candidates: CouncilRouteMemberCandidate[];
    maxSelections?: number;
    model?: string;
  }): Promise<{ chosenMemberIds: string[]; model: string }>;

  suggestHallTitle(input: { message: string; model?: string }): Promise<{ title: string; model: string }>;

  suggestMemberSpecialties(input: {
    name: string;
    systemPrompt: string;
    model?: string;
  }): Promise<{ specialties: string[]; model: string }>;

  chatMember(input: {
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
    includeConversationContext?: boolean;
    useKnowledgeBase?: boolean;
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

  summarizeDocumentDigest(input: {
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
  }>;

  proposeRoundIntentPromptOnly(input: {
    member: { id: string; name: string; specialties?: string[]; systemPrompt: string };
    conversationContext: string;
    memberIds: string[];
    model?: string;
  }): Promise<RoundIntentProposal>;
}
