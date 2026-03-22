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
    documentCard: {
      docType: string;
      about: string;
      bestFor: string[];
      evidenceKinds: string[];
      notFor: string[];
    };
    queryHints: string[];
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
        documentCard: {
          docType: string;
          about: string;
          bestFor: string[];
          evidenceKinds: string[];
          notFor: string[];
        };
        queryHints: string[];
        model: string;
      }
    | undefined
  >(),
});

const digestSchema = z.object({
  documentCard: z.object({
    docType: z.string().default('other'),
    about: z.string().default(''),
    bestFor: z.array(z.string()).default([]),
    evidenceKinds: z.array(z.string()).default([]),
    notFor: z.array(z.string()).default([]),
  }),
  queryHints: z.array(z.string()).default([]),
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
  const queryHints = normalizeKeywordList([...nameParts, ...personaHints], 16);
  return {
    documentCard: {
      docType: 'other',
      about: `Document titled ${displayName}.`,
      bestFor: ['general reference'],
      evidenceKinds: ['reference'],
      notFor: [],
    },
    queryHints: queryHints.length ? queryHints : ['knowledge', 'document', 'reference'],
  };
}

export async function runKBDigestGraph(input: {
  displayName: string;
  sampleText?: string;
  memberSystemPrompt?: string;
  model?: string;
}): Promise<{
  documentCard: {
    docType: string;
    about: string;
    bestFor: string[];
    evidenceKinds: string[];
    notFor: string[];
  };
  queryHints: string[];
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
        'Generate retrieval metadata for one document.',
        'This metadata will be used as a bookshelf card and query-planning hint for document routing.',
        'The input may be a book, transcript, report, essay, article, notes, or mixed material. Identify the kind of document and adapt accordingly.',
        'Output JSON only with keys:',
        'documentCard and queryHints.',
        'documentCard.docType: short label for the document kind.',
        'documentCard.about: 1-3 sentence retrieval-oriented description of what the document is and what it covers.',
        'documentCard.bestFor: 3-6 short prompts describing the kinds of user questions this document is best for.',
        'documentCard.evidenceKinds: 1-4 short labels such as story, advice, framework, argument, reference, quotes, case_study, biographical.',
        'documentCard.notFor: 0-4 short prompts describing what this document is not well-suited to answer.',
        'queryHints: 8-20 short retrieval anchors including names, aliases, recurring phrases, uncommon terms, chapter/program names, and important concepts.',
        'Keep everything retrieval-oriented rather than literary or descriptive.',
        '',
        `Document name: ${state.displayName}`,
        state.memberSystemPrompt ? `Member style prompt hint: ${state.memberSystemPrompt.slice(0, 500)}` : '',
        sampleBlock,
      ]
        .filter(Boolean)
        .join('\n');

      try {
        const parsed = await invokeStructured(model, prompt, digestSchema);
        const documentCard = {
          docType: (parsed.documentCard.docType ?? '').trim().toLowerCase().slice(0, 40) || fallback.documentCard.docType,
          about: (parsed.documentCard.about ?? '').trim().slice(0, 800) || fallback.documentCard.about,
          bestFor: normalizeKeywordList(parsed.documentCard.bestFor ?? [], 6),
          evidenceKinds: normalizeKeywordList(parsed.documentCard.evidenceKinds ?? [], 4),
          notFor: normalizeKeywordList(parsed.documentCard.notFor ?? [], 4),
        };
        const queryHints = normalizeKeywordList(parsed.queryHints ?? [], 20);

        if (!documentCard.about || !queryHints.length) {
          return {
            digestResult: { ...fallback, model: target.model },
          };
        }

        return {
          digestResult: {
            documentCard: {
              docType: documentCard.docType,
              about: documentCard.about,
              bestFor: documentCard.bestFor.length ? documentCard.bestFor : fallback.documentCard.bestFor,
              evidenceKinds: documentCard.evidenceKinds.length ? documentCard.evidenceKinds : fallback.documentCard.evidenceKinds,
              notFor: documentCard.notFor,
            },
            queryHints,
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
