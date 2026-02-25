'use node';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { createChatModel } from '../runtime/modelFactory';
import { invokeStructured } from '../runtime/structured';
import { modelRegistry } from '../runtime/modelRegistry';

export interface RouteMemberCandidate {
  id: string;
  name: string;
  specialties?: string[];
  systemPrompt?: string;
}

interface RouteState {
  message: string;
  candidates: RouteMemberCandidate[];
  maxSelections: number;
  model?: string;
  chosenMemberIds?: string[];
  usedModel?: string;
}

const RouteStateAnnotation = Annotation.Root({
  message: Annotation<string>(),
  candidates: Annotation<RouteMemberCandidate[]>(),
  maxSelections: Annotation<number>(),
  model: Annotation<string | undefined>(),
  chosenMemberIds: Annotation<string[] | undefined>(),
  usedModel: Annotation<string | undefined>(),
});

const routeSchema = z.object({
  chosenMemberIds: z.array(z.string()).default([]),
});

export async function runRouteMembersGraph(input: {
  message: string;
  candidates: RouteMemberCandidate[];
  maxSelections?: number;
  model?: string;
}): Promise<{ chosenMemberIds: string[]; model: string }> {
  const maxSelections = Math.max(1, Math.min(input.maxSelections ?? 3, input.candidates.length || 1));

  const graph = new StateGraph(RouteStateAnnotation)
    .addNode('route', async (state) => {
      const target = modelRegistry.resolve('router', state.model);
      const model = createChatModel(target, { temperature: Number(process.env.GEMINI_ROUTER_TEMPERATURE ?? 0) });

      const candidateLines = state.candidates
        .map((candidate, index) => {
          const specialties = candidate.specialties?.length ? candidate.specialties.join(', ') : 'general';
          const profile = (candidate.systemPrompt ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
          return `${index + 1}. id=${candidate.id}; name=${candidate.name}; specialties=${specialties}; profile=${profile || 'n/a'}`;
        })
        .join('\n');

      const prompt = [
        'Choose the most relevant council members for the user message.',
        'Return JSON only: {"chosenMemberIds":["id1","id2"]}.',
        `Rules: choose between 1 and ${state.maxSelections} IDs.`,
        'Select all and only members who are materially relevant to the request.',
        'Do not include members with weak or generic relevance.',
        'IDs must come from the candidate list only. No extra keys, no markdown.',
        '',
        `User message: ${state.message}`,
        '',
        'Candidates:',
        candidateLines,
      ].join('\n');

      const parsed = await invokeStructured(model, prompt, routeSchema);
      const candidateIds = new Set(state.candidates.map((candidate) => candidate.id));
      const chosenMemberIds = (parsed.chosenMemberIds ?? []).filter(
        (id, index, list) => candidateIds.has(id) && list.indexOf(id) === index
      );

      return {
        chosenMemberIds: chosenMemberIds.slice(0, state.maxSelections),
        usedModel: target.model,
      };
    })
    .addEdge(START, 'route')
    .addEdge('route', END)
    .compile();

  const result = (await graph.invoke({
    message: input.message,
    candidates: input.candidates,
    maxSelections,
    model: input.model,
  })) as unknown as RouteState;

  return {
    chosenMemberIds: result.chosenMemberIds ?? [],
    model: result.usedModel ?? modelRegistry.resolve('router', input.model).model,
  };
}
