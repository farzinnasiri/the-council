'use node';

import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import { hallTitleModelCandidates, MODEL_IDS, resolveModel } from './modelConfig';

export interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Citation {
  title: string;
  uri?: string;
}

export interface KBDocumentDigestHint {
  displayName: string;
  geminiDocumentName?: string;
  topics: string[];
  entities: string[];
  lexicalAnchors: string[];
  styleAnchors: string[];
  digestSummary: string;
}

export interface QueryPlanDebug {
  originalQuery: string;
  standaloneQuery: string;
  queryAlternates: string[];
  gateUsed: boolean;
  gateReason: string;
  matchedDigestSignals: string[];
}

interface GateDecision {
  useKnowledgeBase: boolean;
  reason: string;
  mode: 'heuristic' | 'llm-gate';
  matchedDigestSignals: string[];
}

interface QueryRewriteResult {
  standaloneQuery: string;
  alternates: string[];
  intent: string;
  confidence: number;
}

interface GroundedSnippet {
  text: string;
  citationIndices: number[];
}

interface GroundedEvidence {
  citations: Citation[];
  snippets: GroundedSnippet[];
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
    queryPlan?: QueryPlanDebug;
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
      citations: Citation[];
      snippets: string[];
      queryUsed?: string;
      usedAlternateQuery?: boolean;
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

export interface RouteMemberCandidate {
  id: string;
  name: string;
  specialties?: string[];
  systemPrompt?: string;
}

export function fallbackRouteMemberIds(message: string, candidates: RouteMemberCandidate[], maxSelections = 3): string[] {
  if (candidates.length === 0) {
    return [];
  }

  const seed = Array.from(message).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
  const count = Math.max(1, Math.min(maxSelections, candidates.length));
  const start = seed % candidates.length;
  const selected: string[] = [];
  for (let index = 0; index < count; index += 1) {
    selected.push(candidates[(start + index) % candidates.length].id);
  }
  return selected;
}

export class GeminiService {
  private ai: GoogleGenAI;
  private debugLogsEnabled: boolean;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY not found in Convex environment');
    }

    this.ai = new GoogleGenAI({ apiKey: key });
    this.debugLogsEnabled = process.env.GEMINI_DEBUG_LOGS === '1';
  }

  async createKnowledgeBase(displayName = 'web-rag-store'): Promise<string> {
    const store = await this.ai.fileSearchStores.create({
      config: { displayName },
    });

    if (!store.name) {
      throw new Error('File Search store was created but no store name was returned');
    }

    return store.name;
  }

  async connectKnowledgeBaseByName(storeName: string): Promise<boolean> {
    try {
      const store = await this.ai.fileSearchStores.get({ name: storeName });
      return Boolean(store?.name);
    } catch {
      return false;
    }
  }

  async ensureKnowledgeBase(options: {
    storeName?: string | null;
    displayName: string;
  }): Promise<{ storeName: string; created: boolean }> {
    if (options.storeName) {
      const connected = await this.connectKnowledgeBaseByName(options.storeName);
      if (connected) {
        return { storeName: options.storeName, created: false };
      }
    }

    const storeName = await this.createKnowledgeBase(options.displayName);
    return { storeName, created: true };
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

  async listDocumentsFromStore(storeName: string): Promise<Array<{ name?: string; displayName?: string }>> {
    const docs: Array<{ name?: string; displayName?: string }> = [];
    const pager = await this.ai.fileSearchStores.documents.list({ parent: storeName });
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
    candidates: RouteMemberCandidate[];
    maxSelections?: number;
    model?: string;
  }): Promise<{ chosenMemberIds: string[]; model: string }> {
    const model = resolveModel('router', options.model);
    const maxSelections = Math.max(1, Math.min(options.maxSelections ?? 3, options.candidates.length));

    const candidateLines = options.candidates
      .map((candidate, index) => {
        const specialties = candidate.specialties?.length ? candidate.specialties.join(', ') : 'general';
        const profile = (candidate.systemPrompt ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
        return `${index + 1}. id=${candidate.id}; name=${candidate.name}; specialties=${specialties}; profile=${profile || 'n/a'}`;
      })
      .join('\n');

    const prompt = [
      'Choose the most relevant council members for the user message.',
      'Return JSON only: {"chosenMemberIds":["id1","id2"]}.',
      `Rules: choose between 1 and ${maxSelections} IDs.`,
      'Select all and only members who are materially relevant to the request.',
      'Do not include members with weak or generic relevance.',
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
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          required: ['chosenMemberIds'],
          properties: {
            chosenMemberIds: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      } as any,
    });

    const parsed = this.tryParseStructuredJson<{ chosenMemberIds?: string[] }>((response.text ?? '').trim()) ?? {
      chosenMemberIds: [],
    };

    const candidateIds = new Set(options.candidates.map((candidate) => candidate.id));
    const picked = (parsed.chosenMemberIds ?? []).filter(
      (id, index, list) => candidateIds.has(id) && list.indexOf(id) === index
    );

    return {
      chosenMemberIds: picked.slice(0, maxSelections),
      model,
    };
  }

  async suggestHallTitle(options: { message: string; model?: string }): Promise<{ title: string; model: string }> {
    const fallbackTitle = this.fallbackHallTitle(options.message);
    const candidateModels = hallTitleModelCandidates(options.model);

    const prompt = [
      'Generate a concise title for this conversation.',
      'Requirements:',
      '- 2 to 6 words',
      '- Title Case',
      '- No quotes',
      '- No punctuation at the end',
      '- Reflect the user intent',
      '',
      `User message: ${options.message}`,
      '',
      'Return only the title text.',
    ].join('\n');

    for (const model of candidateModels) {
      try {
        const response = await this.ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { temperature: 0.2 },
        });

        const raw = (response.text ?? '').trim();
        const cleaned = raw
          .replace(/^["'`]+|["'`]+$/g, '')
          .replace(/[.!?]+$/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (cleaned.length >= 3) {
          return { title: cleaned.slice(0, 72), model };
        }
      } catch {
        // try next model
      }
    }

    return {
      title: fallbackTitle,
      model: candidateModels[0] ?? 'heuristic',
    };
  }

  async suggestMemberSpecialties(options: {
    name: string;
    systemPrompt: string;
    model?: string;
  }): Promise<{ specialties: string[]; model: string }> {
    const fallback = this.fallbackSpecialties(options.systemPrompt);
    const model = resolveModel('specialties', options.model);

    const prompt = [
      'Infer routing specialties from the member profile.',
      'Return broad umbrella domains, not micro-skills.',
      'Prefer distinct, non-overlapping specialties.',
      'Avoid near-duplicates, synonyms, and narrow variations of the same idea.',
      'Use concise labels (1-4 words each).',
      'Return 5 to 7 specialties.',
      '',
      `Member name: ${options.name}`,
      `Member profile: ${options.systemPrompt}`,
      '',
      'Output JSON only: {"specialties":["item1","item2"]}',
    ].join('\n');

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.15,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            required: ['specialties'],
            properties: {
              specialties: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        } as any,
      });

      const parsed = this.tryParseStructuredJson<{ specialties?: string[] }>((response.text ?? '').trim());
      const cleaned = (parsed?.specialties ?? [])
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .map((item) => item.slice(0, 42))
        .filter((item, index, list) => list.indexOf(item) === index)
        .slice(0, 8);

      return {
        specialties: cleaned.length > 0 ? cleaned : fallback,
        model,
      };
    } catch {
      return {
        specialties: fallback,
        model,
      };
    }
  }

  async summarizeMessages(options: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousSummary?: string;
    model?: string;
  }): Promise<string> {
    const model = resolveModel('summary', options.model);
    const historyBlock = options.messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
    const previousBlock = options.previousSummary ? `Previous summary:\n${options.previousSummary}\n\n` : '';

    const prompt = [
      'You are a conversation summariser. Your job is to produce a concise, dense summary of the conversation below.',
      'The summary will be passed as context to an AI on future turns - keep all key facts, decisions and conclusions.',
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

  async summarizeChamberMemory(options: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousSummary?: string;
    memberName: string;
    memberSpecialties?: string[];
    model?: string;
  }): Promise<string> {
    const model = resolveModel('chamberMemory', options.model);
    const historyBlock = options.messages
      .map((m) => `${m.role === 'user' ? 'User' : options.memberName}: ${m.content}`)
      .join('\n');

    const specialties = options.memberSpecialties?.filter(Boolean).join(', ') || 'none provided';
    const previousBlock = options.previousSummary
      ? `Previous session memory:\n${options.previousSummary}\n\n`
      : 'Previous session memory:\n(none)\n\n';

    const prompt = [
      `You are the internal subconscious memory system of ${options.memberName}.`,
      `Specialties of ${options.memberName}: ${specialties}.`,
      '',
      'Write private session notes FOR YOURSELF so future replies stay coherent.',
      'Voice and framing rules:',
      '1) Write in first person as the member (use "I", "my", and "we" where natural).',
      '2) Treat this as internal notes, not a user-facing response.',
      '3) Never add catchphrases, sign-offs, or persona performance lines.',
      `4) Do NOT include slogans like "${options.memberName}" catchphrases.`,
      '',
      'Memory update rules:',
      '1) Preserve durable facts, user preferences, goals, constraints, decisions, and unresolved threads.',
      '2) Prefer recent evidence when it conflicts with older assumptions.',
      '3) Surgically add, update, or delete memory items. Remove stale or resolved noise.',
      '4) Retain important long-term context from earlier conversation when still relevant.',
      '5) Keep high signal density. Be factual, concise, and context-ready.',
      '6) Output plain text only (no JSON).',
      '',
      'Preferred section style (plain text headings):',
      '- My profile of the user',
      '- What we discussed recently',
      '- Key concepts I mentioned',
      '- My current goal',
      '- Open loops / what to verify next',
      '',
      `${previousBlock}Recent messages:\n${historyBlock}`,
      '',
      'Write the updated internal session memory now:',
    ].join('\n');

    const response = await this.ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.1 },
    });

    return ((response.text ?? '').trim() || options.previousSummary) ?? '';
  }

  async summarizeDocumentDigest(options: {
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
    const model = resolveModel('kbDigest', options.model);
    const fallback = this.fallbackDocumentDigest(options.displayName, options.memberSystemPrompt);
    const sampleBlock = options.sampleText?.trim()
      ? `Document sample:\n${options.sampleText.trim().slice(0, 6000)}`
      : 'Document sample:\n(unavailable)';

    const prompt = [
      'Generate a lightweight retrieval digest for one document.',
      'Keep it short, practical, and retrieval-oriented.',
      'Output JSON only with keys:',
      'topics (3-8), entities (3-12), lexicalAnchors (3-12), styleAnchors (3-8), digestSummary (<=240 chars).',
      'lexicalAnchors must be exact or near-exact terms likely to appear in queries.',
      'styleAnchors should capture writing voice cues or signature phrasing.',
      '',
      `Document name: ${options.displayName}`,
      options.memberSystemPrompt ? `Member style prompt hint: ${options.memberSystemPrompt.slice(0, 500)}` : '',
      sampleBlock,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            required: ['topics', 'entities', 'lexicalAnchors', 'styleAnchors', 'digestSummary'],
            properties: {
              topics: { type: 'array', items: { type: 'string' } },
              entities: { type: 'array', items: { type: 'string' } },
              lexicalAnchors: { type: 'array', items: { type: 'string' } },
              styleAnchors: { type: 'array', items: { type: 'string' } },
              digestSummary: { type: 'string' },
            },
          },
        } as any,
      });

      const parsed = this.tryParseStructuredJson<{
        topics?: string[];
        entities?: string[];
        lexicalAnchors?: string[];
        styleAnchors?: string[];
        digestSummary?: string;
      }>((response.text ?? '').trim());

      if (!parsed) {
        return { ...fallback, model };
      }

      const topics = this.normalizeKeywordList(parsed.topics ?? [], 8);
      const entities = this.normalizeKeywordList(parsed.entities ?? [], 12);
      const lexicalAnchors = this.normalizeKeywordList(parsed.lexicalAnchors ?? [], 12);
      const styleAnchors = this.normalizeKeywordList(parsed.styleAnchors ?? [], 8);
      const digestSummary = (parsed.digestSummary ?? '').trim().slice(0, 300);

      if (!topics.length || !lexicalAnchors.length || !digestSummary) {
        return { ...fallback, model };
      }

      return {
        topics,
        entities: entities.length ? entities : fallback.entities,
        lexicalAnchors,
        styleAnchors: styleAnchors.length ? styleAnchors : fallback.styleAnchors,
        digestSummary,
        model,
      };
    } catch {
      return { ...fallback, model };
    }
  }

  async chatWithOptionalKnowledgeBase(options: {
    query: string;
    storeName?: string | null;
    memoryHint?: string;
    kbDigests?: KBDocumentDigestHint[];
    retrievalModel?: string;
    responseModel?: string;
    temperature?: number;
    metadataFilter?: string;
    personaPrompt?: string;
    contextMessages?: ContextMessage[];
  }): Promise<ChatResponse> {
    const traceId = crypto.randomUUID().slice(0, 8);
    const responseModel = resolveModel('chatResponse', options.responseModel);
    const retrievalModel = resolveModel('retrieval', options.retrievalModel);
    const kbDigests = options.kbDigests ?? [];

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
          queryPlan: {
            originalQuery: options.query,
            standaloneQuery: options.query,
            queryAlternates: [],
            gateUsed: false,
            gateReason: options.storeName ? 'no-documents-in-store' : 'no-store-provided',
            matchedDigestSignals: [],
          },
        },
      };
    }

    const rewritePlan = await this.rewriteKnowledgeQuery({
      originalQuery: options.query,
      contextMessages: options.contextMessages ?? [],
      memoryHint: options.memoryHint,
      kbDigests,
    });

    const gateDecision = await this.resolveKnowledgeGate({
      originalQuery: options.query,
      standaloneQuery: rewritePlan.standaloneQuery,
      contextMessages: options.contextMessages ?? [],
      kbDigests,
      hasDocs: docs.length > 0,
    });

    const queryPlanDebug: QueryPlanDebug = {
      originalQuery: options.query,
      standaloneQuery: rewritePlan.standaloneQuery,
      queryAlternates: rewritePlan.alternates,
      gateUsed: gateDecision.useKnowledgeBase,
      gateReason: gateDecision.reason,
      matchedDigestSignals: gateDecision.matchedDigestSignals,
    };

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
              mode: gateDecision.mode,
              useKnowledgeBase: false,
              reason: gateDecision.reason,
            },
          },
          queryPlan: queryPlanDebug,
        },
      };
    }

    const grounded = await this.chatWithStore({
      originalQuery: options.query,
      standaloneQuery: rewritePlan.standaloneQuery,
      alternateQueries: rewritePlan.alternates,
      queryPlan: queryPlanDebug,
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
            mode: gateDecision.mode,
            useKnowledgeBase: true,
            reason: gateDecision.reason,
          },
        },
        queryPlan: grounded.debug?.queryPlan ?? queryPlanDebug,
      },
    };
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
      retrievalModel: MODEL_IDS.retrieval,
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
    originalQuery: string;
    standaloneQuery: string;
    alternateQueries: string[];
    queryPlan: QueryPlanDebug;
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
    const primaryPass = await this.retrieveEvidencePass({
      storeName: options.storeName,
      retrievalModel: options.retrievalModel,
      query: options.standaloneQuery,
      metadataFilter: options.metadataFilter,
      traceId,
    });

    let finalPass = primaryPass;
    let alternateQuery: string | undefined;
    if (
      !primaryPass.grounded &&
      options.alternateQueries.length > 0 &&
      options.alternateQueries[0].trim() &&
      options.alternateQueries[0].trim().toLowerCase() !== options.standaloneQuery.trim().toLowerCase()
    ) {
      alternateQuery = options.alternateQueries[0].trim();
      finalPass = await this.retrieveEvidencePass({
        storeName: options.storeName,
        retrievalModel: options.retrievalModel,
        query: alternateQuery,
        metadataFilter: options.metadataFilter,
        traceId,
      });
    }

    const citations = finalPass.evidence.citations;
    const snippets = finalPass.evidence.snippets;
    const grounded = finalPass.grounded;

    this.logDebug('file-search:response', {
      traceId,
      grounded,
      citationsCount: citations.length,
      snippetsCount: snippets.length,
      retrievalText: finalPass.retrievalText,
      citations,
      snippets: snippets.map((item) => item.text),
    });
    const evidencePack = this.buildEvidencePack(finalPass.evidence);
    const evidenceSection = evidencePack.length ? evidencePack.join('\n\n') : 'No grounded snippets found for this turn.';

    const personaPrompt =
      options.personaPrompt ??
      [
        'You are a focused knowledge-base assistant.',
        'Use the evidence pack as context when it is relevant.',
        'Keep response style aligned to your persona instructions.',
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
      `Current user question: ${options.originalQuery}`,
      '',
      'Evidence Pack (verbatim snippets + citations):',
      evidenceSection,
      '',
      'Now provide the final answer.',
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

    const answer = (answerResponse.text ?? '').trim() || 'I could not generate a response.';

    return {
      answer,
      citations,
      model: options.responseModel,
      retrievalModel: options.retrievalModel,
      grounded,
      debug: {
        traceId,
        mode: 'with-kb',
        fileSearchStart: {
          storeName: options.storeName,
          retrievalModel: options.retrievalModel,
          query: options.standaloneQuery,
          metadataFilter: options.metadataFilter,
          alternateQuery,
        },
        fileSearchResponse: {
          grounded,
          citationsCount: citations.length,
          snippetsCount: snippets.length,
          retrievalText: finalPass.retrievalText,
          citations,
          snippets: snippets.map((item) => item.text),
          queryUsed: finalPass.query,
          usedAlternateQuery: Boolean(alternateQuery && finalPass.query === alternateQuery),
        },
        queryPlan: options.queryPlan,
        answerPrompt,
      },
    };
  }

  private async retrieveEvidencePass(options: {
    storeName: string;
    retrievalModel: string;
    query: string;
    metadataFilter?: string;
    traceId: string;
  }): Promise<{
    query: string;
    grounded: boolean;
    retrievalText: string;
    evidence: GroundedEvidence;
  }> {
    const fileSearchConfig: { fileSearchStoreNames: string[]; metadataFilter?: string } = {
      fileSearchStoreNames: [options.storeName],
    };
    if (options.metadataFilter) {
      fileSearchConfig.metadataFilter = options.metadataFilter;
    }

    this.logDebug('file-search:start', {
      traceId: options.traceId,
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
                'Use ONLY the File Search tool and return verbatim evidence spans relevant to the user question.',
                'Prioritize exact quoted fragments from source passages.',
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
    const evidence = this.extractGroundedEvidence(groundingMetadata);
    const grounded = evidence.snippets.length > 0;

    return {
      query: options.query,
      grounded,
      retrievalText,
      evidence,
    };
  }

  private buildEvidencePack(evidence: GroundedEvidence): string[] {
    const lines: string[] = [];

    if (evidence.citations.length > 0) {
      lines.push('[Sources]');
      evidence.citations.forEach((citation, index) => {
        const ref = citation.uri ? ` (${citation.uri})` : '';
        lines.push(`Source ${index + 1}: ${citation.title}${ref}`);
      });
    }

    if (evidence.snippets.length > 0) {
      lines.push('[Quotes]');
      evidence.snippets.forEach((snippet, index) => {
        const mapped = snippet.citationIndices
          .map((sourceIndex) => `S${sourceIndex + 1}`)
          .filter(Boolean)
          .join(', ');
        const sourceLabel = mapped ? ` [${mapped}]` : '';
        lines.push(`Quote ${index + 1}${sourceLabel}: ${snippet.text}`);
      });
    }

    return lines;
  }

  private async rewriteKnowledgeQuery(input: {
    originalQuery: string;
    contextMessages: ContextMessage[];
    kbDigests: KBDocumentDigestHint[];
    memoryHint?: string;
  }): Promise<QueryRewriteResult> {
    const contextBlock = input.contextMessages
      .slice(-8)
      .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
      .join('\n');
    const digestHints = input.kbDigests
      .slice(0, 6)
      .map((digest) => {
        const topics = digest.topics.slice(0, 3).join(', ');
        const entities = digest.entities.slice(0, 4).join(', ');
        return `${digest.displayName} | topics: ${topics || 'n/a'} | entities: ${entities || 'n/a'}`;
      })
      .join('\n');

    const model = resolveModel('kbQueryRewrite');
    const prompt = [
      'Rewrite the user question into a standalone retrieval query for File Search.',
      'Resolve pronouns/ellipsis from conversation context.',
      'Keep query concise and specific.',
      'Return JSON only:',
      '{"standaloneQuery":"...","alternates":["..."],"intent":"...","confidence":0.0}',
      '',
      `Original user question: ${input.originalQuery}`,
      '',
      'Recent conversation:',
      contextBlock || '(none)',
      '',
      'Chamber memory hint:',
      input.memoryHint?.slice(0, 500) || '(none)',
      '',
      'KB digest hints:',
      digestHints || '(none)',
    ].join('\n');

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            required: ['standaloneQuery', 'alternates', 'intent', 'confidence'],
            properties: {
              standaloneQuery: { type: 'string' },
              alternates: { type: 'array', items: { type: 'string' } },
              intent: { type: 'string' },
              confidence: { type: 'number' },
            },
          },
        } as any,
      });

      const parsed = this.tryParseStructuredJson<{
        standaloneQuery?: string;
        alternates?: string[];
        intent?: string;
        confidence?: number;
      }>((response.text ?? '').trim());

      const standaloneQuery = parsed?.standaloneQuery?.trim() || input.originalQuery;
      const alternates = this.normalizeKeywordList(parsed?.alternates ?? [], 2);
      const intent = parsed?.intent?.trim() || 'knowledge-lookup';
      const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence ?? 0.5)));

      return {
        standaloneQuery,
        alternates,
        intent,
        confidence,
      };
    } catch {
      const historyTail = input.contextMessages.filter((m) => m.role === 'user').slice(-2).map((m) => m.content.trim());
      const fallbackStandalone = historyTail.join(' ').trim() || input.originalQuery;
      return {
        standaloneQuery: fallbackStandalone,
        alternates: [],
        intent: 'fallback-context-query',
        confidence: 0.35,
      };
    }
  }

  private async resolveKnowledgeGate(input: {
    originalQuery: string;
    standaloneQuery: string;
    contextMessages: ContextMessage[];
    kbDigests: KBDocumentDigestHint[];
    hasDocs: boolean;
  }): Promise<GateDecision> {
    if (!input.hasDocs) {
      return { useKnowledgeBase: false, reason: 'no-docs', mode: 'heuristic', matchedDigestSignals: [] };
    }

    const explicitKb = ['document', 'pdf', 'according to', 'knowledge base', 'from the file', 'in your files'];
    const queryLower = `${input.originalQuery} ${input.standaloneQuery}`.toLowerCase();
    if (explicitKb.some((term) => queryLower.includes(term))) {
      return { useKnowledgeBase: true, reason: 'explicit-kb-request', mode: 'heuristic', matchedDigestSignals: [] };
    }

    const digestMatches = this.collectDigestSignals(input.standaloneQuery, input.kbDigests);
    if (digestMatches.length > 0) {
      return {
        useKnowledgeBase: true,
        reason: 'digest-overlap',
        mode: 'heuristic',
        matchedDigestSignals: digestMatches,
      };
    }

    const followupTerms = ['it', 'that', 'this', 'what does it mean', 'what about that', 'and this'];
    const looksFollowup = followupTerms.some((term) => queryLower.includes(term));
    const hasHistory = input.contextMessages.length > 0;
    if (looksFollowup && hasHistory) {
      return {
        useKnowledgeBase: true,
        reason: 'follow-up-anaphora',
        mode: 'heuristic',
        matchedDigestSignals: [],
      };
    }

    const llmGate = await this.llmKnowledgeGate({
      query: input.standaloneQuery,
      candidatesHint: input.kbDigests
        .slice(0, 6)
        .flatMap((digest) => [digest.displayName, ...digest.topics.slice(0, 2), ...digest.entities.slice(0, 2)]),
    });
    return {
      useKnowledgeBase: llmGate.useKnowledgeBase,
      reason: llmGate.reason,
      mode: llmGate.mode,
      matchedDigestSignals: [],
    };
  }

  private collectDigestSignals(query: string, kbDigests: KBDocumentDigestHint[]): string[] {
    const normalizedQuery = query.toLowerCase();
    const terms = kbDigests.flatMap((digest) => [
      ...digest.topics,
      ...digest.entities,
      ...digest.lexicalAnchors,
      ...digest.styleAnchors,
    ]);
    return this.normalizeKeywordList(
      terms.filter((term) => {
        const normalized = term.toLowerCase();
        return normalized.length >= 3 && normalizedQuery.includes(normalized);
      }),
      12
    );
  }

  private tryParseStructuredJson<T>(raw: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
  }

  private fallbackSpecialties(systemPrompt: string): string[] {
    const lowered = systemPrompt.toLowerCase();
    const buckets = [
      ['strategy', ['strategy', 'roadmap', 'priorit', 'vision']],
      ['operations', ['ops', 'process', 'execution', 'workflow']],
      ['finance', ['finance', 'budget', 'pricing', 'p&l', 'economics']],
      ['product', ['product', 'ux', 'feature', 'customer']],
      ['growth', ['growth', 'marketing', 'acquisition', 'retention', 'go-to-market']],
      ['people', ['hiring', 'team', 'culture', 'leadership', 'management']],
      ['technology', ['engineering', 'architecture', 'tech', 'system', 'platform']],
    ] as const;

    const hits = buckets
      .filter(([, terms]) => terms.some((term) => lowered.includes(term)))
      .map(([label]) => label);

    const base = ['strategy', 'operations', 'product', 'growth', 'people', 'technology'];
    return Array.from(new Set([...hits, ...base])).slice(0, 7);
  }

  private fallbackHallTitle(message: string): string {
    const cleaned = message
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.!?]+$/g, '');

    if (!cleaned) return 'New Hall';

    const words = cleaned.split(' ').slice(0, 6);
    const title = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    return title.slice(0, 72);
  }

  private extractGroundedEvidence(groundingMetadata: any): GroundedEvidence {
    const chunks = groundingMetadata?.groundingChunks ?? [];
    const supports = groundingMetadata?.groundingSupports ?? [];

    const citations: Citation[] = [];
    const snippets: GroundedSnippet[] = [];

    for (const chunk of chunks) {
      const title = chunk?.web?.title || chunk?.retrievedContext?.title || chunk?.document?.title;
      const uri = chunk?.web?.uri || chunk?.retrievedContext?.uri || chunk?.document?.uri;
      if (title) {
        citations.push({ title, uri });
      }
    }

    for (const support of supports) {
      const segmentText = support?.segment?.text;
      if (typeof segmentText === 'string' && segmentText.trim()) {
        const indices = Array.isArray(support?.groundingChunkIndices)
          ? support.groundingChunkIndices
              .filter((value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0)
              .map((value: number) => Number(value))
          : [];
        snippets.push({
          text: segmentText.trim(),
          citationIndices: indices,
        });
      }
    }

    const dedupedSnippets = snippets.reduce<Array<GroundedSnippet>>((acc, item) => {
      const existing = acc.find((entry) => entry.text === item.text);
      if (!existing) {
        acc.push(item);
        return acc;
      }
      const merged = Array.from(new Set([...existing.citationIndices, ...item.citationIndices]));
      existing.citationIndices = merged;
      return acc;
    }, []);

    return {
      citations: citations.filter((item, index, list) => list.findIndex((x) => x.title === item.title && x.uri === item.uri) === index),
      snippets: dedupedSnippets,
    };
  }

  private fallbackDocumentDigest(displayName: string, memberSystemPrompt?: string): {
    topics: string[];
    entities: string[];
    lexicalAnchors: string[];
    styleAnchors: string[];
    digestSummary: string;
  } {
    const nameParts = displayName
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter((part) => part.length >= 3)
      .slice(0, 8);
    const personaHints = memberSystemPrompt
      ? this.normalizeKeywordList(
          memberSystemPrompt
            .toLowerCase()
            .split(/[^a-z0-9]+/g)
            .filter((word) => word.length >= 5),
          8
        )
      : [];
    const topics = this.normalizeKeywordList([...nameParts.slice(0, 4), ...personaHints.slice(0, 3)], 8);
    const lexicalAnchors = this.normalizeKeywordList([...nameParts, ...personaHints], 12);
    return {
      topics: topics.length ? topics : ['general', 'reference', 'notes'],
      entities: nameParts.slice(0, 6),
      lexicalAnchors: lexicalAnchors.length ? lexicalAnchors : ['knowledge', 'document', 'reference'],
      styleAnchors: this.normalizeKeywordList(personaHints.slice(0, 4), 8),
      digestSummary: `Lightweight digest for ${displayName}.`,
    };
  }

  private normalizeKeywordList(items: string[], max = 12): string[] {
    return items
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.slice(0, 120))
      .filter((item, index, list) => list.indexOf(item) === index)
      .slice(0, max);
  }

  private inferMimeType(displayName: string, filePath: string): string {
    const byExt: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.rtf': 'application/rtf',
      '.html': 'text/html',
      '.xml': 'application/xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };

    const ext = path.extname(displayName || filePath).toLowerCase();
    return byExt[ext] ?? 'application/octet-stream';
  }

  private logDebug(event: string, payload: unknown): void {
    if (!this.debugLogsEnabled) return;
    try {
      console.log(`[convex-ai] ${event}`, JSON.stringify(payload));
    } catch {
      console.log(`[convex-ai] ${event}`, payload);
    }
  }

  private async llmKnowledgeGate(input: {
    query: string;
    candidatesHint: string[];
  }): Promise<{ useKnowledgeBase: boolean; reason: string; mode: 'heuristic' | 'llm-gate' }> {
    const model = resolveModel('kbGate');

    const prompt = [
      'Decide whether the following user question likely needs the private knowledge base documents to answer well.',
      'Return JSON only: {"useKnowledgeBase":true|false,"reason":"short-string"}',
      '',
      `Question: ${input.query}`,
      `Document hints: ${input.candidatesHint.join(', ') || 'none'}`,
    ].join('\n');

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            required: ['useKnowledgeBase', 'reason'],
            properties: {
              useKnowledgeBase: { type: 'boolean' },
              reason: { type: 'string' },
            },
          },
        } as any,
      });

      const parsed = this.tryParseStructuredJson<{ useKnowledgeBase?: boolean; reason?: string }>((response.text ?? '').trim());
      return {
        useKnowledgeBase: Boolean(parsed?.useKnowledgeBase),
        reason: parsed?.reason?.trim() || 'llm-gate',
        mode: 'llm-gate',
      };
    } catch {
      return {
        useKnowledgeBase: false,
        reason: 'kb-gate-fallback',
        mode: 'heuristic',
      };
    }
  }
}

export function sanitizeLabel(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'member';
}
