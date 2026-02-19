import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ContextMessage {
  role: 'user' | 'assistant';
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
      };
    };
    fileSearchStart?: {
      storeName: string;
      retrievalModel: string;
      query: string;
      metadataFilter?: string;
    };
    fileSearchResponse?: {
      grounded: boolean;
      citationsCount: number;
      snippetsCount: number;
      retrievalText: string;
      citations: Citation[];
      snippets: string[];
    };
    answerPrompt: string;
  };
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
  private debugLogsEnabled: boolean;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY not found in environment');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.debugLogsEnabled = process.env.GEMINI_DEBUG_LOGS === '1';
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
    // Browser-provided MIME types are inconsistent across clients; infer server-side for stability.
    const mimeType = this.inferMimeType(displayName, filePath);

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

  async deleteDocumentByName(documentName: string, force = true): Promise<void> {
    const aiAny = this.ai as any;
    const documentsApi = aiAny.documents ?? aiAny.fileSearchStores?.documents;
    if (!documentsApi?.delete) {
      throw new Error('Documents delete API is not available in current SDK runtime.');
    }

    await documentsApi.delete({
      name: documentName,
      config: { force },
    });
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

  /** Rolling summarisation for the SummaryBuffer compaction pattern.
   *  Combines previous summary + new message batch → one compact summary. */
  async summarizeMessages(options: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousSummary?: string;
    model?: string;
  }): Promise<string> {
    const model = options.model ?? process.env.GEMINI_ROUTER_MODEL ?? 'gemini-2.5-flash-lite';

    const historyBlock = options.messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const previousBlock = options.previousSummary
      ? `Previous summary:\n${options.previousSummary}\n\n`
      : '';

    const prompt = [
      'You are a conversation summariser. Your job is to produce a concise, dense summary of the conversation below.',
      'The summary will be passed as context to an AI on future turns — keep all key facts, decisions and conclusions.',
      'Write in third person. Be factual, not conversational.',
      '',
      previousBlock + `Recent messages:\n${historyBlock}`,
      '',
      'Write the updated summary now:',
    ].join('\n');

    const response = await this.ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.1 },
    });

    return ((response.text ?? '').trim() || options.previousSummary) ?? '';
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
      contextMessages: this.conversationHistory.map((message) => ({
        role: message.role === 'user' ? 'user' : 'assistant',
        content: message.content,
      })),
    });

    this.conversationHistory.push({ role: 'user', content: query });
    this.conversationHistory.push({ role: 'model', content: result.answer });

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
    contextMessages?: ContextMessage[];
  }): Promise<ChatResponse> {
    const traceId = crypto.randomUUID().slice(0, 8);
    const responseModel = options.responseModel ?? 'gemini-3-flash-preview';
    const retrievalModel = options.retrievalModel ?? 'gemini-2.5-flash-lite';

    const storeProbe = options.storeName
      ? await this.safeListDocuments(options.storeName)
      : { docs: [], error: undefined as string | undefined };
    const docs = storeProbe.docs;
    if (!options.storeName || docs.length === 0) {
      const promptOnly = await this.chatPromptOnly({
        query: options.query,
        responseModel,
        temperature: options.temperature,
        personaPrompt: options.personaPrompt,
        contextMessages: options.contextMessages ?? [],
        traceId,
        reason: options.storeName ? 'no-documents-in-store' : 'no-store-provided',
      });

      return {
        ...promptOnly,
        retrievalModel,
        usedKnowledgeBase: false,
        debug: {
          ...(promptOnly.debug ?? {
            traceId,
            mode: 'prompt-only' as const,
            answerPrompt: '',
          }),
          kbCheck: {
            requestedStoreName: options.storeName ?? null,
            docsCount: docs.length,
            listError: storeProbe.error,
            fileSearchInvoked: false,
            gateDecision: {
              mode: 'heuristic',
              useKnowledgeBase: false,
              reason: options.storeName ? 'no-documents-in-store' : 'no-store-provided',
            },
          },
        },
      };
    }

    const gateHeuristic = this.heuristicKnowledgeGate(options.query, { hasDocs: docs.length > 0 });
    let gateDecision = gateHeuristic;
    if (gateHeuristic.mode === 'ambiguous') {
      gateDecision = await this.llmKnowledgeGate({
        query: options.query,
        candidatesHint: docs.slice(0, 5).map((doc) => doc.displayName || doc.name || 'document'),
      });
    }

    if (!gateDecision.useKnowledgeBase) {
      const promptOnly = await this.chatPromptOnly({
        query: options.query,
        responseModel,
        temperature: options.temperature,
        personaPrompt: options.personaPrompt,
        contextMessages: options.contextMessages ?? [],
        traceId,
        reason: gateDecision.reason,
      });

      return {
        ...promptOnly,
        retrievalModel,
        usedKnowledgeBase: false,
        debug: {
          ...(promptOnly.debug ?? {
            traceId,
            mode: 'prompt-only' as const,
            answerPrompt: '',
          }),
          kbCheck: {
            requestedStoreName: options.storeName ?? null,
            docsCount: docs.length,
            listError: storeProbe.error,
            fileSearchInvoked: false,
            gateDecision: {
              mode: gateDecision.mode === 'ambiguous' ? 'llm-gate' : 'heuristic',
              useKnowledgeBase: false,
              reason: gateDecision.reason,
            },
          },
        },
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
      contextMessages: options.contextMessages ?? [],
      traceId,
    });

    return {
      ...grounded,
      usedKnowledgeBase: true,
      debug: {
        ...(grounded.debug ?? {
          traceId,
          mode: 'with-kb' as const,
          answerPrompt: '',
        }),
        kbCheck: {
          requestedStoreName: options.storeName ?? null,
          docsCount: docs.length,
          listError: storeProbe.error,
          fileSearchInvoked: true,
          gateDecision: {
            mode: 'heuristic',
            useKnowledgeBase: true,
            reason: gateDecision.reason,
          },
        },
      },
    };
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  private async safeListDocuments(
    storeName: string
  ): Promise<{ docs: Array<{ name?: string; displayName?: string }>; error?: string }> {
    try {
      const docs = await this.listDocumentsFromStore(storeName);
      return { docs };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown listDocuments error';
      return { docs: [], error: message };
    }
  }

  private async chatPromptOnly(options: {
    query: string;
    responseModel: string;
    temperature?: number;
    personaPrompt?: string;
    contextMessages: ContextMessage[];
    traceId?: string;
    reason?: string;
  }): Promise<ChatResponse> {
    const traceId = options.traceId ?? crypto.randomUUID().slice(0, 8);
    const personaPrompt =
      options.personaPrompt ??
      'You are a strategic advisor. Give concise, practical recommendations and be explicit about tradeoffs.';

    const recentHistory = options.contextMessages
      .slice(-10)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

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

    return {
      answer,
      citations: [],
      model: options.responseModel,
      retrievalModel: 'gemini-2.5-flash-lite',
      grounded: false,
      debug: {
        traceId,
        mode: 'prompt-only',
        reason: options.reason,
        answerPrompt: prompt,
      },
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
    contextMessages: ContextMessage[];
    traceId?: string;
  }): Promise<ChatResponse> {
    const traceId = options.traceId ?? crypto.randomUUID().slice(0, 8);
    const fileSearchConfig: { fileSearchStoreNames: string[]; metadataFilter?: string } = {
      fileSearchStoreNames: [options.storeName],
    };

    if (options.metadataFilter) {
      fileSearchConfig.metadataFilter = options.metadataFilter;
    }

    this.logDebug('file-search:start', {
      traceId,
      storeName: options.storeName,
      retrievalModel: options.retrievalModel,
      query: options.query,
      metadataFilter: options.metadataFilter ?? null,
    });

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

    this.logDebug('file-search:response', {
      traceId,
      grounded,
      citationsCount: citations.length,
      snippetsCount: snippets.length,
      retrievalText,
      citations,
      snippets,
    });

    if (!grounded) {
      // No grounding chunks returned — fall back to prompt-only but preserve
      // fileSearch debug fields so we can diagnose what the retrieval returned.
      const promptOnly = await this.chatPromptOnly({
        query: options.query,
        responseModel: options.responseModel,
        temperature: options.temperature,
        personaPrompt: options.personaPrompt,
        contextMessages: options.contextMessages,
        traceId,
        reason: 'no-grounded-evidence',
      });
      return {
        ...promptOnly,
        debug: {
          ...promptOnly.debug!,
          fileSearchStart: {
            storeName: options.storeName,
            retrievalModel: options.retrievalModel,
            query: options.query,
            metadataFilter: options.metadataFilter,
          },
          fileSearchResponse: {
            grounded: false,
            citationsCount: 0,
            snippetsCount: 0,
            retrievalText,
            citations: [],
            snippets: [],
          },
        },
      };
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
        contextMessages: options.contextMessages,
        traceId,
        reason: 'empty-evidence-blocks',
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

    const recentHistory = options.contextMessages
      .slice(-10)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

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

    this.logDebug('chat-model:prompt', {
      traceId,
      responseModel: options.responseModel,
      prompt: answerPrompt,
    });

    const answerResponse = await this.ai.models.generateContent({
      model: options.responseModel,
      contents: [{ role: 'user', parts: [{ text: answerPrompt }] }],
      config: { temperature: options.temperature ?? 0.35 },
    });

    const answer = (answerResponse.text ?? '').trim() || 'I could not generate a grounded answer.';

    return {
      answer,
      citations,
      model: options.responseModel,
      retrievalModel: options.retrievalModel,
      grounded: true,
      debug: {
        traceId,
        mode: 'with-kb',
        fileSearchStart: {
          storeName: options.storeName,
          retrievalModel: options.retrievalModel,
          query: options.query,
          metadataFilter: options.metadataFilter,
        },
        fileSearchResponse: {
          grounded,
          citationsCount: citations.length,
          snippetsCount: snippets.length,
          retrievalText,
          citations,
          snippets,
        },
        answerPrompt,
      },
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
      '.md': 'text/plain',
      '.markdown': 'text/plain',
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
  private logDebug(event: string, payload: unknown): void {
    if (!this.debugLogsEnabled) {
      return;
    }
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [GeminiRAG] ${event}`, payload);
  }

  private heuristicKnowledgeGate(
    query: string,
    { hasDocs = false }: { hasDocs?: boolean } = {}
  ): {
    mode: 'heuristic' | 'ambiguous';
    useKnowledgeBase: boolean;
    reason: string;
  } {
    const text = query.trim().toLowerCase();
    const tokenCount = text.split(/\s+/).filter(Boolean).length;

    // Always skip KB for pure small-talk regardless of docs
    const smallTalkPattern =
      /^(hi|hello|hey|yo|thanks|thank you|ok|okay|cool|nice|great|good morning|good evening)[!.?]*$/i;
    if (smallTalkPattern.test(text)) {
      return { mode: 'heuristic', useKnowledgeBase: false, reason: 'small-talk' };
    }

    // Very short pings (≤3 tokens) skip KB
    if (tokenCount <= 3) {
      return { mode: 'heuristic', useKnowledgeBase: false, reason: 'very-short-query' };
    }

    // Explicit grounding signals always use KB
    const groundingSignals = [
      'according to',
      'from the document',
      'cite',
      'source',
      'numbers',
      'exactly',
      'policy',
      'contract',
      'spec',
      'in the file',
      'what does it say',
    ];
    if (groundingSignals.some((signal) => text.includes(signal))) {
      return { mode: 'heuristic', useKnowledgeBase: true, reason: 'explicit-grounding-signal' };
    }

    // When this member has uploaded documents, prefer KB for any substantive
    // question (4+ tokens). Users upload docs specifically to have them consulted.
    if (hasDocs && tokenCount >= 4) {
      return { mode: 'heuristic', useKnowledgeBase: true, reason: 'member-has-docs-substantive-query' };
    }

    // Without docs: send longer/question queries to LLM gate
    const hasQuestionMark = text.includes('?');
    if (tokenCount >= 18 || hasQuestionMark) {
      return { mode: 'ambiguous', useKnowledgeBase: false, reason: 'needs-llm-gate' };
    }

    return { mode: 'heuristic', useKnowledgeBase: false, reason: 'quick-conversational-turn' };
  }

  private async llmKnowledgeGate(input: {
    query: string;
    candidatesHint: string[];
  }): Promise<{ mode: 'ambiguous'; useKnowledgeBase: boolean; reason: string }> {
    const model = process.env.GEMINI_KB_GATE_MODEL ?? 'gemma-3-12b-it';
    const prompt = [
      'Decide if this user message needs retrieval grounding from a knowledge base.',
      'Return JSON only: {"useKnowledgeBase":true|false,"reason":"short-reason"}',
      'Use true only when grounding/citation/document lookup is likely necessary.',
      '',
      `User message: ${input.query}`,
      `Available docs (sample): ${input.candidatesHint.join(', ') || 'none'}`,
    ].join('\n');

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0 },
      });
      const parsed = this.parseStructuredJson<{ useKnowledgeBase?: boolean; reason?: string }>((response.text ?? '').trim());
      return {
        mode: 'ambiguous',
        useKnowledgeBase: Boolean(parsed.useKnowledgeBase),
        reason: parsed.reason?.trim() || 'llm-gate-decision',
      };
    } catch {
      return {
        mode: 'ambiguous',
        useKnowledgeBase: false,
        reason: 'llm-gate-fallback-no-kb',
      };
    }
  }
}
