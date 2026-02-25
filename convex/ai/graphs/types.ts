export interface Citation {
  title: string;
  uri?: string;
}

export interface KBDocumentDigestHint {
  displayName: string;
  kbDocumentName?: string;
  topics: string[];
  entities: string[];
  lexicalAnchors: string[];
  styleAnchors: string[];
  digestSummary: string;
}

export interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GroundedSnippet {
  text: string;
  citationIndices: number[];
}

export interface KnowledgeRetriever {
  listDocuments(input: { storeName: string }): Promise<Array<{ name?: string; displayName?: string }>>;
  retrieve(input: {
    storeName: string;
    query: string;
    limit?: number;
    metadataFilter?: string;
    traceId: string;
  }): Promise<{
    retrievalText: string;
    citations: Citation[];
    snippets: GroundedSnippet[];
    grounded: boolean;
  }>;
}

export interface QueryPlanDebug {
  originalQuery: string;
  standaloneQuery: string;
  queryAlternates: string[];
  gateUsed: boolean;
  gateReason: string;
  matchedDigestSignals: string[];
}
