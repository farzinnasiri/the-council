'use node';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createChatModel } from '../runtime/modelFactory';
import { invokeText } from '../runtime/structured';
import { hallTitleModelCandidates } from '../modelConfig';

interface HallTitleState {
  message: string;
  model?: string;
  title?: string;
  usedModel?: string;
}

const HallTitleStateAnnotation = Annotation.Root({
  message: Annotation<string>(),
  model: Annotation<string | undefined>(),
  title: Annotation<string | undefined>(),
  usedModel: Annotation<string | undefined>(),
});

function fallbackTitle(message: string, emptyFallback: string): string {
  const cleaned = message
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/g, '');

  if (!cleaned) return emptyFallback;

  const words = cleaned.split(' ').slice(0, 6);
  const title = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  return title.slice(0, 72);
}

async function runConversationTitleGraph(input: {
  message: string;
  model?: string;
  promptLabel: string;
  emptyFallback: string;
}): Promise<{ title: string; model: string }> {
  const graph = new StateGraph(HallTitleStateAnnotation)
    .addNode('generate', async (state) => {
      const fallback = fallbackTitle(state.message, input.emptyFallback);
      const candidateModels = hallTitleModelCandidates(state.model);

      const prompt = [
        `Generate a concise title for this ${input.promptLabel}.`,
        'Requirements:',
        '- 2 to 6 words',
        '- Title Case',
        '- No quotes',
        '- No punctuation at the end',
        '- Reflect the user intent',
        '',
        `User message: ${state.message}`,
        '',
        'Return only the title text.',
      ].join('\n');

      for (const modelId of candidateModels) {
        try {
          const model = createChatModel({ provider: 'google', model: modelId }, { temperature: 0.2 });
          const raw = await invokeText(model, prompt);
          const cleaned = raw
            .replace(/^["'`]+|["'`]+$/g, '')
            .replace(/[.!?]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (cleaned.length >= 3) {
            return {
              title: cleaned.slice(0, 72),
              usedModel: modelId,
            };
          }
        } catch {
          // try next model
        }
      }

      return {
        title: fallback,
        usedModel: candidateModels[0] ?? 'heuristic',
      };
    })
    .addEdge(START, 'generate')
    .addEdge('generate', END)
    .compile();

  const result = (await graph.invoke({ message: input.message, model: input.model })) as unknown as HallTitleState;
  return {
    title: result.title ?? fallbackTitle(input.message, input.emptyFallback),
    model: result.usedModel ?? 'heuristic',
  };
}

export async function runHallTitleGraph(input: { message: string; model?: string }): Promise<{ title: string; model: string }> {
  return await runConversationTitleGraph({
    message: input.message,
    model: input.model,
    promptLabel: 'conversation',
    emptyFallback: 'New Hall',
  });
}

export async function runChamberTitleGraph(input: { message: string; model?: string }): Promise<{ title: string; model: string }> {
  return await runConversationTitleGraph({
    message: input.message,
    model: input.model,
    promptLabel: 'chamber thread',
    emptyFallback: 'New Thread',
  });
}
