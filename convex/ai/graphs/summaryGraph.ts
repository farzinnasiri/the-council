'use node';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createChatModel } from '../runtime/modelFactory';
import { modelRegistry } from '../runtime/modelRegistry';
import { invokeText } from '../runtime/structured';

interface SummaryState {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  previousSummary?: string;
  memberName?: string;
  memberSpecialties?: string[];
  model?: string;
  output?: string;
  usedModel?: string;
}

const SummaryStateAnnotation = Annotation.Root({
  messages: Annotation<Array<{ role: 'user' | 'assistant'; content: string }>>(),
  previousSummary: Annotation<string | undefined>(),
  memberName: Annotation<string | undefined>(),
  memberSpecialties: Annotation<string[] | undefined>(),
  model: Annotation<string | undefined>(),
  output: Annotation<string | undefined>(),
  usedModel: Annotation<string | undefined>(),
});

export async function runSummaryGraph(input: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  previousSummary?: string;
  model?: string;
}): Promise<string> {
  const graph = new StateGraph(SummaryStateAnnotation)
    .addNode('summarize', async (state) => {
      const target = modelRegistry.resolve('summary', state.model);
      const model = createChatModel(target, { temperature: 0.1 });
      const historyBlock = state.messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
      const previousBlock = state.previousSummary ? `Previous summary:\n${state.previousSummary}\n\n` : '';

      const prompt = [
        'You are a conversation summariser. Your job is to produce a concise, dense summary of the conversation below.',
        'The summary will be passed as context to an AI on future turns - keep all key facts, decisions and conclusions.',
        'Write in third person. Be factual, not conversational.',
        '',
        previousBlock + `Recent messages:\n${historyBlock}`,
        '',
        'Write the updated summary now:',
      ].join('\n');

      const output = await invokeText(model, prompt);
      return { output: output || state.previousSummary || '', usedModel: target.model };
    })
    .addEdge(START, 'summarize')
    .addEdge('summarize', END)
    .compile();

  const result = (await graph.invoke(input)) as unknown as SummaryState;
  return result.output ?? input.previousSummary ?? '';
}

export async function runChamberSummaryGraph(input: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  previousSummary?: string;
  memberName: string;
  memberSpecialties?: string[];
  model?: string;
}): Promise<string> {
  const graph = new StateGraph(SummaryStateAnnotation)
    .addNode('summarize', async (state) => {
      const target = modelRegistry.resolve('chamberMemory', state.model);
      const model = createChatModel(target, { temperature: 0.1 });
      const historyBlock = state.messages
        .map((m) => `${m.role === 'user' ? 'User' : state.memberName}: ${m.content}`)
        .join('\n');
      const specialties = state.memberSpecialties?.filter(Boolean).join(', ') || 'none provided';
      const previousBlock = state.previousSummary
        ? `Previous session memory:\n${state.previousSummary}\n\n`
        : 'Previous session memory:\n(none)\n\n';

      const prompt = [
        `You are the internal subconscious memory system of ${state.memberName}.`,
        `Specialties of ${state.memberName}: ${specialties}.`,
        '',
        'Write private session notes FOR YOURSELF so future replies stay coherent.',
        '1) Write in first person as the member (use "I", "my", and "we" where natural).',
        '2) Treat this as internal notes, not a user-facing response.',
        '3) Preserve durable facts, user preferences, goals, constraints, decisions, and unresolved threads.',
        '4) Keep high signal density. Be factual, concise, and context-ready.',
        '',
        `${previousBlock}Recent messages:\n${historyBlock}`,
        '',
        'Write the updated internal session memory now:',
      ].join('\n');

      const output = await invokeText(model, prompt);
      return { output: output || state.previousSummary || '', usedModel: target.model };
    })
    .addEdge(START, 'summarize')
    .addEdge('summarize', END)
    .compile();

  const result = (await graph.invoke(input)) as unknown as SummaryState;
  return result.output ?? input.previousSummary ?? '';
}
