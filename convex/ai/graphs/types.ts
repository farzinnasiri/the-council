export interface KBDocumentCard {
  docType: string;
  about: string;
  bestFor: string[];
  evidenceKinds: string[];
  notFor: string[];
}

export interface Citation {
  title: string;
  uri?: string;
}

export interface KBDocumentDigestHint {
  displayName: string;
  kbDocumentName?: string;
  documentCard: KBDocumentCard;
  queryHints: string[];
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
    documentNames?: string[];
    limit?: number;
    traceId: string;
  }): Promise<{
    retrievalText: string;
    citations: Citation[];
    snippets: GroundedSnippet[];
    grounded: boolean;
  }>;
}
