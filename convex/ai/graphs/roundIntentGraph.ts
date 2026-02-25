'use node';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { createChatModel } from '../runtime/modelFactory';
import { modelRegistry } from '../runtime/modelRegistry';
import { invokeStructured } from '../runtime/structured';

export interface RoundIntentProposal {
  intent: 'speak' | 'challenge' | 'support' | 'pass';
  targetMemberId?: string;
  rationale: string;
}

interface RoundIntentState {
  member: { id: string; name: string; specialties?: string[]; systemPrompt: string };
  conversationContext: string;
  memberIds: string[];
  model?: string;
  proposal?: RoundIntentProposal;
}

const RoundIntentStateAnnotation = Annotation.Root({
  member: Annotation<{ id: string; name: string; specialties?: string[]; systemPrompt: string }>(),
  conversationContext: Annotation<string>(),
  memberIds: Annotation<string[]>(),
  model: Annotation<string | undefined>(),
  proposal: Annotation<RoundIntentProposal | undefined>(),
});

const proposalSchema = z.object({
  intent: z.enum(['speak', 'challenge', 'support', 'pass']),
  targetMemberId: z.string().optional().default(''),
  rationale: z.string().default('No additional signal.'),
});

function fallbackRoundIntent(memberId: string, candidateTargets: string[]): RoundIntentProposal {
  if (candidateTargets.length === 0) {
    return {
      intent: 'speak',
      rationale: `No peer target available; ${memberId} can add a new point.`,
    };
  }

  return {
    intent: 'speak',
    targetMemberId: undefined,
    rationale: 'I have at least one incremental point to add.',
  };
}

export async function runRoundIntentGraph(input: {
  member: { id: string; name: string; specialties?: string[]; systemPrompt: string };
  conversationContext: string;
  memberIds: string[];
  model?: string;
}): Promise<RoundIntentProposal> {
  const graph = new StateGraph(RoundIntentStateAnnotation)
    .addNode('propose', async (state) => {
      const target = modelRegistry.resolve('router', state.model);
      const model = createChatModel(target, { temperature: 0.2 });
      const candidateTargets = state.memberIds.filter((id) => id !== state.member.id);

      const prompt = [
        'You are choosing whether to speak in the next round of a council discussion.',
        'Return JSON only with keys: intent, targetMemberId, rationale.',
        'intent must be one of: speak, challenge, support, pass.',
        'targetMemberId must be either one valid member id from the candidate list or an empty string.',
        'If intent is challenge or support, prefer setting a targetMemberId.',
        'If intent is pass, targetMemberId must be empty.',
        'Keep rationale short and concrete (<= 140 chars).',
        '',
        `Member: ${state.member.name}`,
        `Specialties: ${state.member.specialties?.join(', ') || 'general'}`,
        `Member prompt: ${state.member.systemPrompt.slice(0, 500)}`,
        '',
        'Round context:',
        state.conversationContext.slice(0, 3000),
        '',
        `Candidate target ids: ${candidateTargets.join(', ') || '(none)'}`,
      ].join('\n');

      try {
        const parsed = await invokeStructured(model, prompt, proposalSchema);
        const intent = parsed.intent;
        const targetMemberId = (parsed.targetMemberId ?? '').trim();
        const normalizedTarget = targetMemberId && candidateTargets.includes(targetMemberId) ? targetMemberId : undefined;

        return {
          proposal: {
            intent,
            targetMemberId: intent === 'challenge' || intent === 'support' ? normalizedTarget : undefined,
            rationale: (parsed.rationale ?? 'No additional signal.').trim().slice(0, 200) || 'No additional signal.',
          },
        };
      } catch {
        return {
          proposal: fallbackRoundIntent(state.member.id, candidateTargets),
        };
      }
    })
    .addEdge(START, 'propose')
    .addEdge('propose', END)
    .compile();

  const result = (await graph.invoke(input)) as unknown as RoundIntentState;
  return result.proposal ?? fallbackRoundIntent(input.member.id, input.memberIds.filter((id) => id !== input.member.id));
}
