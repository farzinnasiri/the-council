'use node';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { createChatModel } from '../runtime/modelFactory';
import { invokeStructured } from '../runtime/structured';
import { modelRegistry } from '../runtime/modelRegistry';

interface SpecialtiesState {
  name: string;
  systemPrompt: string;
  model?: string;
  specialties?: string[];
  usedModel?: string;
}

const SpecialtiesStateAnnotation = Annotation.Root({
  name: Annotation<string>(),
  systemPrompt: Annotation<string>(),
  model: Annotation<string | undefined>(),
  specialties: Annotation<string[] | undefined>(),
  usedModel: Annotation<string | undefined>(),
});

const specialtiesSchema = z.object({
  specialties: z.array(z.string()).default([]),
});

function fallbackSpecialties(systemPrompt: string): string[] {
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

export async function runSpecialtiesGraph(input: {
  name: string;
  systemPrompt: string;
  model?: string;
}): Promise<{ specialties: string[]; model: string }> {
  const graph = new StateGraph(SpecialtiesStateAnnotation)
    .addNode('infer', async (state) => {
      const fallback = fallbackSpecialties(state.systemPrompt);
      const target = modelRegistry.resolve('specialties', state.model);
      const model = createChatModel(target, { temperature: 0.15 });

      const prompt = [
        'Infer routing specialties from the member profile.',
        'Return broad umbrella domains, not micro-skills.',
        'Prefer distinct, non-overlapping specialties.',
        'Avoid near-duplicates, synonyms, and narrow variations of the same idea.',
        'Use concise labels (1-4 words each).',
        'Return 5 to 7 specialties.',
        '',
        `Member name: ${state.name}`,
        `Member profile: ${state.systemPrompt}`,
        '',
        'Output JSON only: {"specialties":["item1","item2"]}',
      ].join('\n');

      try {
        const parsed = await invokeStructured(model, prompt, specialtiesSchema);
        const cleaned = (parsed.specialties ?? [])
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
          .map((item) => item.slice(0, 42))
          .filter((item, index, list) => list.indexOf(item) === index)
          .slice(0, 8);

        return {
          specialties: cleaned.length > 0 ? cleaned : fallback,
          usedModel: target.model,
        };
      } catch {
        return {
          specialties: fallback,
          usedModel: target.model,
        };
      }
    })
    .addEdge(START, 'infer')
    .addEdge('infer', END)
    .compile();

  const result = (await graph.invoke(input)) as unknown as SpecialtiesState;
  return {
    specialties: result.specialties ?? fallbackSpecialties(input.systemPrompt),
    model: result.usedModel ?? modelRegistry.resolve('specialties', input.model).model,
  };
}
