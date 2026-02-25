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

function fallbackHallTitle(message: string): string {
  const cleaned = message
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/g, '');

  if (!cleaned) return 'New Hall';

  const words = cleaned.split(' ').slice(0, 6);
  const title = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  return title.slice(0, 72);
}

export async function runHallTitleGraph(input: { message: string; model?: string }): Promise<{ title: string; model: string }> {
  const graph = new StateGraph(HallTitleStateAnnotation)
    .addNode('generate', async (state) => {
      const fallbackTitle = fallbackHallTitle(state.message);
      const candidateModels = hallTitleModelCandidates(state.model);

      const prompt = [
        'Generate a concise title for this conversation.',
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
        title: fallbackTitle,
        usedModel: candidateModels[0] ?? 'heuristic',
      };
    })
    .addEdge(START, 'generate')
    .addEdge('generate', END)
    .compile();

  const result = (await graph.invoke(input)) as unknown as HallTitleState;
  return {
    title: result.title ?? fallbackHallTitle(input.message),
    model: result.usedModel ?? 'heuristic',
  };
}
