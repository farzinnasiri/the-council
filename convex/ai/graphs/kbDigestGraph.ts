'use node';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { createChatModel } from '../runtime/modelFactory';
import { modelRegistry } from '../runtime/modelRegistry';
import { invokeStructured } from '../runtime/structured';
import { normalizeKeywordList } from './utils';

interface DigestState {
  displayName: string;
  sampleText?: string;
  memberSystemPrompt?: string;
  model?: string;
  digestResult?: {
    topics: string[];
    entities: string[];
    lexicalAnchors: string[];
    styleAnchors: string[];
    digestSummary: string;
    model: string;
  };
}

const DigestStateAnnotation = Annotation.Root({
  displayName: Annotation<string>(),
  sampleText: Annotation<string | undefined>(),
  memberSystemPrompt: Annotation<string | undefined>(),
  model: Annotation<string | undefined>(),
  digestResult: Annotation<
    | {
        topics: string[];
        entities: string[];
        lexicalAnchors: string[];
        styleAnchors: string[];
        digestSummary: string;
        model: string;
      }
    | undefined
  >(),
});

const digestSchema = z.object({
  topics: z.array(z.string()).default([]),
  entities: z.array(z.string()).default([]),
  lexicalAnchors: z.array(z.string()).default([]),
  styleAnchors: z.array(z.string()).default([]),
  digestSummary: z.string().default(''),
});

function fallbackDocumentDigest(displayName: string, memberSystemPrompt?: string) {
  const nameParts = displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((part) => part.length >= 3)
    .slice(0, 8);
  const personaHints = memberSystemPrompt
    ? normalizeKeywordList(
        memberSystemPrompt
          .toLowerCase()
          .split(/[^a-z0-9]+/g)
          .filter((word) => word.length >= 5),
        8
      )
    : [];
  const topics = normalizeKeywordList([...nameParts.slice(0, 4), ...personaHints.slice(0, 3)], 8);
  const lexicalAnchors = normalizeKeywordList([...nameParts, ...personaHints], 12);
  return {
    topics: topics.length ? topics : ['general', 'reference', 'notes'],
    entities: nameParts.slice(0, 6),
    lexicalAnchors: lexicalAnchors.length ? lexicalAnchors : ['knowledge', 'document', 'reference'],
    styleAnchors: normalizeKeywordList(personaHints.slice(0, 4), 8),
    digestSummary: `Lightweight digest for ${displayName}.`,
  };
}

export async function runKBDigestGraph(input: {
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
  const DIGEST_NODE = 'generateDigest';
  const graph = new StateGraph(DigestStateAnnotation)
    .addNode(DIGEST_NODE, async (state) => {
      const target = modelRegistry.resolve('kbDigest', state.model);
      const model = createChatModel(target, { temperature: 0.1 });
      const fallback = fallbackDocumentDigest(state.displayName, state.memberSystemPrompt);
      const sampleBlock = state.sampleText?.trim()
        ? `Document sample:\n${state.sampleText.trim().slice(0, 6000)}`
        : 'Document sample:\n(unavailable)';

      const prompt = [
        'Generate a lightweight retrieval digest for one document.',
        'Keep it short, practical, and retrieval-oriented.',
        'Output JSON only with keys:',
        'topics (3-8), entities (3-12), lexicalAnchors (3-12), styleAnchors (3-8), digestSummary (<=240 chars).',
        '',
        `Document name: ${state.displayName}`,
        state.memberSystemPrompt ? `Member style prompt hint: ${state.memberSystemPrompt.slice(0, 500)}` : '',
        sampleBlock,
      ]
        .filter(Boolean)
        .join('\n');

      try {
        const parsed = await invokeStructured(model, prompt, digestSchema);
        const topics = normalizeKeywordList(parsed.topics ?? [], 8);
        const entities = normalizeKeywordList(parsed.entities ?? [], 12);
        const lexicalAnchors = normalizeKeywordList(parsed.lexicalAnchors ?? [], 12);
        const styleAnchors = normalizeKeywordList(parsed.styleAnchors ?? [], 8);
        const digestSummary = (parsed.digestSummary ?? '').trim().slice(0, 300);

        if (!topics.length || !lexicalAnchors.length || !digestSummary) {
          return {
            digestResult: { ...fallback, model: target.model },
          };
        }

        return {
          digestResult: {
            topics,
            entities: entities.length ? entities : fallback.entities,
            lexicalAnchors,
            styleAnchors: styleAnchors.length ? styleAnchors : fallback.styleAnchors,
            digestSummary,
            model: target.model,
          },
        };
      } catch {
        return {
          digestResult: { ...fallback, model: target.model },
        };
      }
    })
    .addEdge(START, DIGEST_NODE)
    .addEdge(DIGEST_NODE, END)
    .compile();

  const result = (await graph.invoke(input)) as unknown as DigestState;
  return result.digestResult ?? {
    ...fallbackDocumentDigest(input.displayName, input.memberSystemPrompt),
    model: modelRegistry.resolve('kbDigest', input.model).model,
  };
}
