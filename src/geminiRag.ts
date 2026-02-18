import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface Citation {
  title: string;
  uri?: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  model: string;
  retrievalModel: string;
  grounded: boolean;
  usedKnowledgeBase?: boolean;
}

export interface UploadConfig {
  displayName?: string;
  mimeType?: string;
  maxTokensPerChunk?: number;
  maxOverlapTokens?: number;
}

export class GeminiRAGChatbot {
  private ai: GoogleGenAI;
  private fileSearchStoreName: string | null = null;
  private conversationHistory: ChatMessage[] = [];

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY not found in environment');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  async createKnowledgeBase(storeName = 'web-rag-store'): Promise<string> {
    const store = await this.ai.fileSearchStores.create({
      config: { displayName: storeName },
    });
    if (!store.name) {
      throw new Error('File Search store was created but no store name was returned');
    }
    this.fileSearchStoreName = store.name;
    return store.name;
  }

  async connectKnowledgeBaseByName(storeName: string): Promise<boolean> {
    try {
      const store = await this.ai.fileSearchStores.get({ name: storeName });
      if (!store?.name) {
        return false;
      }
      this.fileSearchStoreName = store.name;
      return true;
    } catch {
      return false;
    }
  }

  async findKnowledgeBaseByDisplayName(displayName: string): Promise<string | null> {
    const pager = await this.ai.fileSearchStores.list();
    for await (const store of pager) {
      if (store.displayName === displayName && store.name) {
        return store.name;
      }
    }
    return null;
  }

  getKnowledgeBaseName(): string | null {
    return this.fileSearchStoreName;
  }

  async ensureKnowledgeBase(options: { storeName?: string | null; displayName: string }): Promise<{ storeName: string; created: boolean }> {
    if (options.storeName) {
      const connected = await this.connectKnowledgeBaseByName(options.storeName);
      if (connected) {
        return { storeName: options.storeName, created: false };
      }
    }

    const createdStoreName = await this.createKnowledgeBase(options.displayName);
    return { storeName: createdStoreName, created: true };
  }

  async uploadDocument(filePath: string, config: UploadConfig = {}): Promise<void> {
    if (!this.fileSearchStoreName) {
      throw new Error('Create knowledge base first');
    }
    await this.uploadDocumentToStore(this.fileSearchStoreName, filePath, config);
  }

  async uploadDocumentToStore(storeName: string, filePath: string, config: UploadConfig = {}): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const displayName = config.displayName ?? path.basename(filePath);
    const mimeType = config.mimeType ?? this.inferMimeType(displayName, filePath);

    let operation = await this.ai.fileSearchStores.uploadToFileSearchStore({
      file: filePath,
      fileSearchStoreName: storeName,
      config: {
        displayName,
        mimeType,
        chunkingConfig: {
          whiteSpaceConfig: {
            maxTokensPerChunk: config.maxTokensPerChunk ?? 500,
            maxOverlapTokens: config.maxOverlapTokens ?? 50,
          },
        },
      },
    });

    while (!operation.done) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      operation = await this.ai.operations.get({ operation });
    }
  }

  async uploadMany(filePaths: string[]): Promise<void> {
    await Promise.all(filePaths.map((filePath) => this.uploadDocument(filePath)));
  }

  async listDocuments(): Promise<Array<{ name?: string; displayName?: string }>> {
    if (!this.fileSearchStoreName) {
      throw new Error('No knowledge base created');
    }

    return this.listDocumentsFromStore(this.fileSearchStoreName);
  }

  async listDocumentsFromStore(storeName: string): Promise<Array<{ name?: string; displayName?: string }>> {
    const docs: Array<{ name?: string; displayName?: string }> = [];
    const pager = await this.ai.fileSearchStores.documents.list({
      parent: storeName,
    });
    for await (const doc of pager) {
      docs.push({ name: doc.name, displayName: doc.displayName });
    }
    return docs;
  }

  async routeMembersLite(options: {
    message: string;
    candidates: Array<{ id: string; name: string; specialties?: string[]; systemPrompt?: string }>;
    maxSelections?: number;
    model?: string;
  }): Promise<{ chosenMemberIds: string[]; model: string }> {
    const model = options.model ?? process.env.GEMINI_ROUTER_MODEL ?? 'gemini-2.5-flash-lite';
    const maxSelections = Math.max(1, Math.min(options.maxSelections ?? 3, options.candidates.length));

    const candidateLines = options.candidates
      .map((candidate, index) => {
        const specialties = candidate.specialties?.length ? candidate.specialties.join(', ') : 'general';
        return `${index + 1}. id=${candidate.id}; name=${candidate.name}; specialties=${specialties}`;
      })
      .join('\n');

    const prompt = [
      'Choose the most relevant council members for the user message.',
      `Return JSON only: {"chosenMemberIds":["id1","id2"]}.`,
      `Rules: choose between 1 and ${maxSelections} IDs.`,
      'IDs must come from the candidate list only. No extra keys, no markdown.',
      '',
      `User message: ${options.message}`,
      '',
      'Candidates:',
      candidateLines,
    ].join('\n');

    const response = await this.ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: Number(process.env.GEMINI_ROUTER_TEMPERATURE ?? 0),
      },
    });

    const text = (response.text ?? '').trim();
    const parsed = this.parseStructuredJson<{ chosenMemberIds?: string[] }>(text);

    const candidateIds = new Set(options.candidates.map((candidate) => candidate.id));
    const picked = (parsed.chosenMemberIds ?? []).filter((id, index, list) => candidateIds.has(id) && list.indexOf(id) === index);

    return {
      chosenMemberIds: picked.slice(0, maxSelections),
      model,
    };
  }

  async chat(
    query: string,
    options: {
      retrievalModel?: string;
      responseModel?: string;
      temperature?: number;
      metadataFilter?: string;
      personaPrompt?: string;
    } = {}
  ): Promise<ChatResponse> {
    if (!this.fileSearchStoreName) {
      throw new Error('Create knowledge base and upload documents first');
    }

    const result = await this.chatWithOptionalKnowledgeBase({
      query,
      storeName: this.fileSearchStoreName,
      retrievalModel: options.retrievalModel,
      responseModel: options.responseModel,
      temperature: options.temperature,
      metadataFilter: options.metadataFilter,
      personaPrompt: options.personaPrompt,
      useHistory: true,
    });

    return result;
  }

  async chatWithOptionalKnowledgeBase(options: {
    query: string;
    storeName?: string | null;
    retrievalModel?: string;
    responseModel?: string;
    temperature?: number;
    metadataFilter?: string;
    personaPrompt?: string;
    useHistory?: boolean;
  }): Promise<ChatResponse> {
    const responseModel = options.responseModel ?? 'gemini-3-flash-preview';
    const retrievalModel = options.retrievalModel ?? 'gemini-2.5-flash-lite';

    const docs = options.storeName ? await this.safeListDocuments(options.storeName) : [];
    if (!options.storeName || docs.length === 0) {
      const promptOnly = await this.chatPromptOnly({
        query: options.query,
        responseModel,
        temperature: options.temperature,
        personaPrompt: options.personaPrompt,
        useHistory: options.useHistory ?? false,
      });

      return {
        ...promptOnly,
        retrievalModel,
        usedKnowledgeBase: false,
      };
    }

    const grounded = await this.chatWithStore({
      query: options.query,
      storeName: options.storeName,
      retrievalModel,
      responseModel,
      temperature: options.temperature,
      metadataFilter: options.metadataFilter,
      personaPrompt: options.personaPrompt,
      useHistory: options.useHistory ?? false,
    });

    return {
      ...grounded,
      usedKnowledgeBase: true,
    };
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  private async safeListDocuments(storeName: string): Promise<Array<{ name?: string; displayName?: string }>> {
    try {
      return await this.listDocumentsFromStore(storeName);
    } catch {
      return [];
    }
  }

  private async chatPromptOnly(options: {
    query: string;
    responseModel: string;
    temperature?: number;
    personaPrompt?: string;
    useHistory: boolean;
  }): Promise<ChatResponse> {
    const personaPrompt =
      options.personaPrompt ??
      'You are a strategic advisor. Give concise, practical recommendations and be explicit about tradeoffs.';

    const recentHistory = options.useHistory
      ? this.conversationHistory
          .slice(-8)
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n')
      : '';

    const prompt = [
      personaPrompt,
      '',
      'Conversation so far:',
      recentHistory || '(none)',
      '',
      `User question: ${options.query}`,
      '',
      'Provide a concise, practical answer.',
    ].join('\n');

    const response = await this.ai.models.generateContent({
      model: options.responseModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: options.temperature ?? 0.4,
      },
    });

    const answer = (response.text ?? '').trim() || 'I could not generate a response.';

    if (options.useHistory) {
      this.conversationHistory.push({ role: 'user', content: options.query });
      this.conversationHistory.push({ role: 'model', content: answer });
    }

    return {
      answer,
      citations: [],
      model: options.responseModel,
      retrievalModel: 'gemini-2.5-flash-lite',
      grounded: false,
    };
  }

  private async chatWithStore(options: {
    query: string;
    storeName: string;
    retrievalModel: string;
    responseModel: string;
    temperature?: number;
    metadataFilter?: string;
    personaPrompt?: string;
    useHistory: boolean;
  }): Promise<ChatResponse> {
    const fileSearchConfig: { fileSearchStoreNames: string[]; metadataFilter?: string } = {
      fileSearchStoreNames: [options.storeName],
    };

    if (options.metadataFilter) {
      fileSearchConfig.metadataFilter = options.metadataFilter;
    }

    const retrievalResponse = await this.ai.models.generateContent({
      model: options.retrievalModel,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'You are a retrieval worker.',
                'Use ONLY the File Search tool results from the uploaded knowledge base.',
                'Task: extract evidence snippets relevant to the user question.',
                'If nothing relevant is found, output exactly: NO_EVIDENCE',
                '',
                `User question: ${options.query}`,
              ].join('\n'),
            },
          ],
        },
      ],
      config: {
        tools: [{ fileSearch: fileSearchConfig }],
        temperature: 0,
      },
    });

    const retrievalText = (retrievalResponse.text ?? '').trim();
    const groundingMetadata = retrievalResponse.candidates?.[0]?.groundingMetadata;
    const { citations, snippets } = this.extractGroundedEvidence(groundingMetadata);
    const grounded = citations.length > 0;

    if (!grounded) {
      return this.chatPromptOnly({
        query: options.query,
        responseModel: options.responseModel,
        temperature: options.temperature,
        personaPrompt: options.personaPrompt,
        useHistory: options.useHistory,
      });
    }

    const evidenceBlocks: string[] = [];
    if (snippets.length > 0) {
      evidenceBlocks.push(...snippets.map((snippet, index) => `[Evidence ${index + 1}] ${snippet}`));
    } else if (retrievalText && !/^NO_EVIDENCE$/i.test(retrievalText)) {
      evidenceBlocks.push(`[Retrieved Notes]\n${retrievalText}`);
    }

    if (evidenceBlocks.length === 0) {
      return this.chatPromptOnly({
        query: options.query,
        responseModel: options.responseModel,
        temperature: options.temperature,
        personaPrompt: options.personaPrompt,
        useHistory: options.useHistory,
      });
    }

    const personaPrompt =
      options.personaPrompt ??
      [
        'You are a focused knowledge-base assistant.',
        'Answer conversationally, but use ONLY the provided evidence.',
        'If the evidence is insufficient, say you do not have enough information in the knowledge base.',
        'Do not add outside facts.',
      ].join(' ');

    const recentHistory = options.useHistory
      ? this.conversationHistory
          .slice(-8)
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n')
      : '';

    const answerPrompt = [
      personaPrompt,
      '',
      'Conversation so far:',
      recentHistory || '(none)',
      '',
      `Current user question: ${options.query}`,
      '',
      'Evidence from retrieval pass:',
      evidenceBlocks.join('\n\n'),
      '',
      'Now provide the final answer. Keep it concise and grounded in the evidence.',
    ].join('\n');

    const answerResponse = await this.ai.models.generateContent({
      model: options.responseModel,
      contents: [{ role: 'user', parts: [{ text: answerPrompt }] }],
      config: { temperature: options.temperature ?? 0.35 },
    });

    const answer = (answerResponse.text ?? '').trim() || 'I could not generate a grounded answer.';

    if (options.useHistory) {
      this.conversationHistory.push({ role: 'user', content: options.query });
      this.conversationHistory.push({ role: 'model', content: answer });
    }

    return {
      answer,
      citations,
      model: options.responseModel,
      retrievalModel: options.retrievalModel,
      grounded: true,
    };
  }

  private parseStructuredJson<T>(raw: string): T {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned) as T;
  }

  private extractGroundedEvidence(groundingMetadata: any): { citations: Citation[]; snippets: string[] } {
    if (!groundingMetadata?.groundingChunks) {
      return { citations: [], snippets: [] };
    }

    const citationKeys = new Set<string>();
    const snippetKeys = new Set<string>();
    const citations: Citation[] = [];
    const snippets: string[] = [];

    for (const chunk of groundingMetadata.groundingChunks) {
      const retrieved = chunk?.retrievedContext;
      const web = chunk?.web;
      const titleCandidate = retrieved?.title ?? web?.title;
      const uriCandidate = retrieved?.uri ?? web?.uri;
      const title = typeof titleCandidate === 'string' && titleCandidate.trim() ? titleCandidate.trim() : 'Untitled source';
      const uri = typeof uriCandidate === 'string' ? uriCandidate : undefined;
      const citationKey = `${title}::${uri ?? ''}`;

      if (!citationKeys.has(citationKey)) {
        citationKeys.add(citationKey);
        citations.push({ title, uri });
      }

      const textCandidate = retrieved?.text ?? retrieved?.ragChunk?.text;
      if (typeof textCandidate === 'string') {
        const normalized = textCandidate.replace(/\s+/g, ' ').trim();
        if (normalized) {
          const snippetKey = normalized.toLowerCase();
          if (!snippetKeys.has(snippetKey)) {
            snippetKeys.add(snippetKey);
            snippets.push(normalized);
          }
        }
      }
    }

    return { citations, snippets };
  }

  private inferMimeType(displayName: string, filePath: string): string {
    const source = (displayName || filePath).toLowerCase();
    const extension = path.extname(source);

    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.markdown': 'text/markdown',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.xml': 'application/xml',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.py': 'text/x-python',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
    };

    return mimeMap[extension] ?? 'text/plain';
  }
}
