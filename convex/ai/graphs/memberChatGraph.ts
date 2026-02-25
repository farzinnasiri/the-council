'use node';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { modelRegistry } from '../runtime/modelRegistry';
import { createChatModel } from '../runtime/modelFactory';
import { formatContextMessages } from '../runtime/messages';
import { invokeStructured, invokeText } from '../runtime/structured';
import { makeTraceId, maybeLogDebug } from '../runtime/tracing';
import type { Citation, ContextMessage, GroundedSnippet, KBDocumentDigestHint, KnowledgeRetriever, QueryPlanDebug } from './types';
import { normalizeKeywordList } from './utils';

interface GateDecision {
  useKnowledgeBase: boolean;
  reason: string;
  mode: 'heuristic' | 'llm-gate';
  matchedDigestSignals: string[];
}

interface QueryRewriteResult {
  standaloneQuery: string;
  alternates: string[];
}

interface GroundedEvidence {
  citations: Citation[];
  snippets: GroundedSnippet[];
}

interface RetrievePass {
  query: string;
  grounded: boolean;
  retrievalText: string;
  evidence: GroundedEvidence;
}

export interface MemberChatInput {
  query: string;
  storeName?: string | null;
  knowledgeRetriever?: KnowledgeRetriever;
  memoryHint?: string;
  kbDigests?: KBDocumentDigestHint[];
  retrievalModel?: string;
  responseModel?: string;
  temperature?: number;
  metadataFilter?: string;
  personaPrompt?: string;
  contextMessages?: ContextMessage[];
  useKnowledgeBase?: boolean;
}

export interface MemberChatOutput {
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

interface MemberChatState {
  input: MemberChatInput;
  traceId: string;
  responseModelId: string;
  retrievalModelId: string;
  docs: Array<{ name?: string; displayName?: string }>;
  listError?: string;
  rewrite?: QueryRewriteResult;
  gate?: GateDecision;
  queryPlan?: QueryPlanDebug;
  primaryPass?: RetrievePass;
  finalPass?: RetrievePass;
  alternateQuery?: string;
  answerPrompt?: string;
  answer?: string;
  citations?: Citation[];
  grounded?: boolean;
  mode?: 'with-kb' | 'prompt-only';
  reason?: string;
}

const MemberChatStateAnnotation = Annotation.Root({
  input: Annotation<MemberChatInput>(),
  traceId: Annotation<string>(),
  responseModelId: Annotation<string>(),
  retrievalModelId: Annotation<string>(),
  docs: Annotation<Array<{ name?: string; displayName?: string }>>(),
  listError: Annotation<string | undefined>(),
  rewrite: Annotation<QueryRewriteResult | undefined>(),
  gate: Annotation<GateDecision | undefined>(),
  queryPlan: Annotation<QueryPlanDebug | undefined>(),
  primaryPass: Annotation<RetrievePass | undefined>(),
  finalPass: Annotation<RetrievePass | undefined>(),
  alternateQuery: Annotation<string | undefined>(),
  answerPrompt: Annotation<string | undefined>(),
  answer: Annotation<string | undefined>(),
  citations: Annotation<Citation[] | undefined>(),
  grounded: Annotation<boolean | undefined>(),
  mode: Annotation<'with-kb' | 'prompt-only' | undefined>(),
  reason: Annotation<string | undefined>(),
});

const rewriteSchema = z.object({
  standaloneQuery: z.string().default(''),
  alternates: z.array(z.string()).default([]),
  intent: z.string().optional(),
  confidence: z.number().optional(),
});

const gateSchema = z.object({
  useKnowledgeBase: z.boolean(),
  reason: z.string().default('llm-gate'),
});

async function safeListDocuments(state: MemberChatState): Promise<{ docs: Array<{ name?: string; displayName?: string }>; error?: string }> {
  const storeName = state.input.storeName;
  if (!storeName || !state.input.knowledgeRetriever) {
    return {
      docs: [],
      error: storeName ? 'knowledge-retriever-not-provided' : undefined,
    };
  }

  try {
    const docs = await state.input.knowledgeRetriever.listDocuments({ storeName });
    return { docs };
  } catch (error) {
    return {
      docs: [],
      error: error instanceof Error ? error.message : 'Unknown listDocuments error',
    };
  }
}

function buildEvidencePack(evidence: GroundedEvidence): string[] {
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
      const mapped = snippet.citationIndices.map((sourceIndex) => `S${sourceIndex + 1}`).join(', ');
      const sourceLabel = mapped ? ` [${mapped}]` : '';
      lines.push(`Quote ${index + 1}${sourceLabel}: ${snippet.text}`);
    });
  }

  return lines;
}

function collectDigestSignals(query: string, kbDigests: KBDocumentDigestHint[]): string[] {
  const normalizedQuery = query.toLowerCase();
  const terms = kbDigests.flatMap((digest) => [
    ...digest.topics,
    ...digest.entities,
    ...digest.lexicalAnchors,
    ...digest.styleAnchors,
  ]);
  return normalizeKeywordList(
    terms.filter((term) => {
      const normalized = term.toLowerCase();
      return normalized.length >= 3 && normalizedQuery.includes(normalized);
    }),
    12
  );
}

async function retrieveEvidencePass(state: MemberChatState, query: string): Promise<RetrievePass> {
  if (!state.input.knowledgeRetriever || !state.input.storeName) {
    throw new Error('Knowledge retriever is required for knowledge-base chat mode');
  }

  maybeLogDebug(process.env.GEMINI_DEBUG_LOGS === '1', 'file-search:start', {
    traceId: state.traceId,
    storeName: state.input.storeName,
    retrievalModel: state.retrievalModelId,
    query,
    metadataFilter: state.input.metadataFilter ?? null,
  });

  const retrieved = await state.input.knowledgeRetriever.retrieve({
    storeName: state.input.storeName,
    query,
    metadataFilter: state.input.metadataFilter,
    traceId: state.traceId,
  });

  const evidence: GroundedEvidence = {
    citations: retrieved.citations ?? [],
    snippets: retrieved.snippets ?? [],
  };

  return {
    query,
    grounded: typeof retrieved.grounded === 'boolean' ? retrieved.grounded : evidence.snippets.length > 0,
    retrievalText: (retrieved.retrievalText ?? '').trim(),
    evidence,
  };
}

async function llmKnowledgeGate(state: MemberChatState, query: string): Promise<{ useKnowledgeBase: boolean; reason: string; mode: 'heuristic' | 'llm-gate' }> {
  const target = modelRegistry.resolve('kbGate');
  const model = createChatModel(target, { temperature: 0 });

  const candidatesHint = (state.input.kbDigests ?? [])
    .slice(0, 6)
    .flatMap((digest) => [digest.displayName, ...digest.topics.slice(0, 2), ...digest.entities.slice(0, 2)]);

  const prompt = [
    'Decide whether the following user question likely needs the private knowledge base documents to answer well.',
    'Return JSON only: {"useKnowledgeBase":true|false,"reason":"short-string"}',
    '',
    `Question: ${query}`,
    `Document hints: ${candidatesHint.join(', ') || 'none'}`,
  ].join('\n');

  try {
    const parsed = await invokeStructured(model, prompt, gateSchema);
    return {
      useKnowledgeBase: Boolean(parsed.useKnowledgeBase),
      reason: parsed.reason?.trim() || 'llm-gate',
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

async function rewriteKnowledgeQuery(state: MemberChatState): Promise<QueryRewriteResult> {
  const kbDigests = state.input.kbDigests ?? [];
  const target = modelRegistry.resolve('kbQueryRewrite');
  const model = createChatModel(target, { temperature: 0.1 });

  const contextBlock = (state.input.contextMessages ?? [])
    .slice(-8)
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n');

  const digestHints = kbDigests
    .slice(0, 6)
    .map((digest) => {
      const topics = digest.topics.slice(0, 3).join(', ');
      const entities = digest.entities.slice(0, 4).join(', ');
      return `${digest.displayName} | topics: ${topics || 'n/a'} | entities: ${entities || 'n/a'}`;
    })
    .join('\n');

  const prompt = [
    'Rewrite the user question into a standalone retrieval query for File Search.',
    'Resolve pronouns/ellipsis from conversation context.',
    'Keep query concise and specific.',
    'Return JSON only:',
    '{"standaloneQuery":"...","alternates":["..."],"intent":"...","confidence":0.0}',
    '',
    `Original user question: ${state.input.query}`,
    '',
    'Recent conversation:',
    contextBlock || '(none)',
    '',
    'Chamber memory hint:',
    state.input.memoryHint?.slice(0, 500) || '(none)',
    '',
    'KB digest hints:',
    digestHints || '(none)',
  ].join('\n');

  try {
    const parsed = await invokeStructured(model, prompt, rewriteSchema);
    return {
      standaloneQuery: parsed.standaloneQuery?.trim() || state.input.query,
      alternates: normalizeKeywordList(parsed.alternates ?? [], 2),
    };
  } catch {
    const historyTail = (state.input.contextMessages ?? []).filter((m) => m.role === 'user').slice(-2).map((m) => m.content.trim());
    return {
      standaloneQuery: historyTail.join(' ').trim() || state.input.query,
      alternates: [],
    };
  }
}

async function resolveKnowledgeGate(state: MemberChatState, standaloneQuery: string): Promise<GateDecision> {
  if (!state.docs.length) {
    return { useKnowledgeBase: false, reason: 'no-docs', mode: 'heuristic', matchedDigestSignals: [] };
  }

  const kbDigests = state.input.kbDigests ?? [];
  const explicitKb = ['document', 'pdf', 'according to', 'knowledge base', 'from the file', 'in your files'];
  const queryLower = `${state.input.query} ${standaloneQuery}`.toLowerCase();
  if (explicitKb.some((term) => queryLower.includes(term))) {
    return { useKnowledgeBase: true, reason: 'explicit-kb-request', mode: 'heuristic', matchedDigestSignals: [] };
  }

  const digestMatches = collectDigestSignals(standaloneQuery, kbDigests);
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
  const hasHistory = (state.input.contextMessages ?? []).length > 0;
  if (looksFollowup && hasHistory) {
    return {
      useKnowledgeBase: true,
      reason: 'follow-up-anaphora',
      mode: 'heuristic',
      matchedDigestSignals: [],
    };
  }

  const llmGate = await llmKnowledgeGate(state, standaloneQuery);
  return {
    useKnowledgeBase: llmGate.useKnowledgeBase,
    reason: llmGate.reason,
    mode: llmGate.mode,
    matchedDigestSignals: [],
  };
}

function routeAfterProbe(state: MemberChatState): string {
  if (!state.input.storeName || !state.docs.length || state.input.useKnowledgeBase === false) {
    return 'generatePromptOnlyAnswer';
  }
  return 'rewriteQuery';
}

function routeAfterGate(state: MemberChatState): string {
  if (!state.gate?.useKnowledgeBase) {
    return 'generatePromptOnlyAnswer';
  }
  return 'retrievePrimaryEvidence';
}

function routeAfterPrimary(state: MemberChatState): string {
  const primary = state.primaryPass;
  if (!primary) return 'generateAnswer';
  const alternate = state.rewrite?.alternates?.[0]?.trim();
  if (!primary.grounded && alternate && alternate.toLowerCase() !== primary.query.trim().toLowerCase()) {
    return 'retrieveAlternateEvidence';
  }
  return 'generateAnswer';
}

export async function runMemberChatGraph(input: MemberChatInput): Promise<MemberChatOutput> {
  const responseModelTarget = modelRegistry.resolve('chatResponse', input.responseModel);
  const retrievalModelTarget = modelRegistry.resolve('retrieval', input.retrievalModel);

  const graph = new StateGraph(MemberChatStateAnnotation)
    .addNode('probeStoreDocs', async (state) => {
      const storeProbe = await safeListDocuments(state);
      return {
        docs: storeProbe.docs,
        listError: storeProbe.error,
      };
    })
    .addNode('rewriteQuery', async (state) => {
      const rewrite = await rewriteKnowledgeQuery(state);
      return { rewrite };
    })
    .addNode('gateKnowledge', async (state) => {
      const gate = await resolveKnowledgeGate(state, state.rewrite?.standaloneQuery ?? state.input.query);
      const queryPlan: QueryPlanDebug = {
        originalQuery: state.input.query,
        standaloneQuery: state.rewrite?.standaloneQuery ?? state.input.query,
        queryAlternates: state.rewrite?.alternates ?? [],
        gateUsed: gate.useKnowledgeBase,
        gateReason: gate.reason,
        matchedDigestSignals: gate.matchedDigestSignals,
      };
      return { gate, queryPlan };
    })
    .addNode('retrievePrimaryEvidence', async (state) => {
      const primaryPass = await retrieveEvidencePass(state, state.rewrite?.standaloneQuery ?? state.input.query);
      maybeLogDebug(process.env.GEMINI_DEBUG_LOGS === '1', 'file-search:response', {
        traceId: state.traceId,
        grounded: primaryPass.grounded,
        citationsCount: primaryPass.evidence.citations.length,
        snippetsCount: primaryPass.evidence.snippets.length,
      });
      return { primaryPass, finalPass: primaryPass };
    })
    .addNode('retrieveAlternateEvidence', async (state) => {
      const alternateQuery = state.rewrite?.alternates?.[0]?.trim();
      if (!alternateQuery) return {};
      const alternatePass = await retrieveEvidencePass(state, alternateQuery);
      return { finalPass: alternatePass, alternateQuery };
    })
    .addNode('generateAnswer', async (state) => {
      const evidencePass = state.finalPass ?? state.primaryPass;
      const evidencePack = buildEvidencePack(evidencePass?.evidence ?? { citations: [], snippets: [] });
      const evidenceSection = evidencePack.length ? evidencePack.join('\n\n') : 'No grounded snippets found for this turn.';
      const personaPrompt =
        state.input.personaPrompt ??
        [
          'You are a focused knowledge-base assistant.',
          'Use the evidence pack as context when it is relevant.',
          'Keep response style aligned to your persona instructions.',
        ].join(' ');

      const answerPrompt = [
        personaPrompt,
        '',
        'Conversation so far:',
        formatContextMessages(state.input.contextMessages ?? [], 10) || '(none)',
        '',
        `Current user question: ${state.input.query}`,
        '',
        'Evidence Pack (verbatim snippets + citations):',
        evidenceSection,
        '',
        'Now provide the final answer.',
      ].join('\n');

      const model = createChatModel(responseModelTarget, { temperature: state.input.temperature ?? 0.35 });
      const answer = (await invokeText(model, answerPrompt)) || 'I could not generate a response.';

      return {
        mode: 'with-kb' as const,
        answerPrompt,
        answer,
        citations: evidencePass?.evidence.citations ?? [],
        grounded: Boolean(evidencePass?.grounded),
      };
    })
    .addNode('generatePromptOnlyAnswer', async (state) => {
      const personaPrompt =
        state.input.personaPrompt ??
        'You are a strategic advisor. Give concise, practical recommendations and be explicit about tradeoffs.';

      const answerPrompt = [
        personaPrompt,
        '',
        'Conversation so far:',
        formatContextMessages(state.input.contextMessages ?? [], 10) || '(none)',
        '',
        `User question: ${state.input.query}`,
      ].join('\n');

      const model = createChatModel(responseModelTarget, { temperature: state.input.temperature ?? 0.4 });
      const answer = (await invokeText(model, answerPrompt)) || 'I could not generate a response.';

      let reason = 'no-store-provided';
      if (state.input.useKnowledgeBase === false) {
        reason = 'kb-explicitly-disabled';
      } else if (state.input.storeName && !state.docs.length) {
        reason = 'no-documents-in-store';
      }
      if (state.gate?.reason) {
        reason = state.gate.reason;
      }

      return {
        mode: 'prompt-only' as const,
        answerPrompt,
        answer,
        citations: [] as Citation[],
        grounded: false,
        reason,
      };
    })
    .addNode('finalizeDebug', async (state) => state)
    .addEdge(START, 'probeStoreDocs')
    .addConditionalEdges('probeStoreDocs', routeAfterProbe, {
      rewriteQuery: 'rewriteQuery',
      generatePromptOnlyAnswer: 'generatePromptOnlyAnswer',
    })
    .addEdge('rewriteQuery', 'gateKnowledge')
    .addConditionalEdges('gateKnowledge', routeAfterGate, {
      retrievePrimaryEvidence: 'retrievePrimaryEvidence',
      generatePromptOnlyAnswer: 'generatePromptOnlyAnswer',
    })
    .addConditionalEdges('retrievePrimaryEvidence', routeAfterPrimary, {
      retrieveAlternateEvidence: 'retrieveAlternateEvidence',
      generateAnswer: 'generateAnswer',
    })
    .addEdge('retrieveAlternateEvidence', 'generateAnswer')
    .addEdge('generateAnswer', 'finalizeDebug')
    .addEdge('generatePromptOnlyAnswer', 'finalizeDebug')
    .addEdge('finalizeDebug', END)
    .compile();

  const traceId = makeTraceId();
  const result = (await graph.invoke({
    input,
    traceId,
    responseModelId: responseModelTarget.model,
    retrievalModelId: retrievalModelTarget.model,
    docs: [],
  })) as unknown as MemberChatState;

  const fileSearchPass = result.finalPass ?? result.primaryPass;
  const usedAlternateQuery = Boolean(result.alternateQuery && fileSearchPass?.query === result.alternateQuery);

  return {
    answer: result.answer ?? 'I could not generate a response.',
    citations: result.citations ?? [],
    model: responseModelTarget.model,
    retrievalModel: retrievalModelTarget.model,
    grounded: Boolean(result.grounded),
    usedKnowledgeBase: result.mode === 'with-kb',
    debug: {
      traceId,
      mode: result.mode ?? 'prompt-only',
      reason: result.reason,
      kbCheck: {
        requestedStoreName: input.storeName ?? null,
        docsCount: result.docs.length,
        listError: result.listError,
        fileSearchInvoked: result.mode === 'with-kb',
        gateDecision: result.gate
          ? {
              mode: result.gate.mode,
              useKnowledgeBase: result.gate.useKnowledgeBase,
              reason: result.gate.reason,
            }
          : {
              mode: 'heuristic',
              useKnowledgeBase: false,
              reason: result.reason ?? 'no-store-provided',
            },
      },
      queryPlan: result.queryPlan ?? {
        originalQuery: input.query,
        standaloneQuery: input.query,
        queryAlternates: [],
        gateUsed: false,
        gateReason: result.reason ?? 'no-store-provided',
        matchedDigestSignals: [],
      },
      fileSearchStart:
        result.mode === 'with-kb' && input.storeName
          ? {
              storeName: input.storeName,
              retrievalModel: retrievalModelTarget.model,
              query: result.rewrite?.standaloneQuery ?? input.query,
              metadataFilter: input.metadataFilter,
              alternateQuery: result.alternateQuery,
            }
          : undefined,
      fileSearchResponse:
        result.mode === 'with-kb' && fileSearchPass
          ? {
              grounded: fileSearchPass.grounded,
              citationsCount: fileSearchPass.evidence.citations.length,
              snippetsCount: fileSearchPass.evidence.snippets.length,
              retrievalText: fileSearchPass.retrievalText,
              citations: fileSearchPass.evidence.citations,
              snippets: fileSearchPass.evidence.snippets.map((item) => item.text),
              queryUsed: fileSearchPass.query,
              usedAlternateQuery,
            }
          : undefined,
      answerPrompt: result.answerPrompt ?? '',
    },
  };
}
