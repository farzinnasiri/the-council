'use node';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { createChatModel } from '../runtime/modelFactory';
import { modelRegistry } from '../runtime/modelRegistry';
import { invokeStructured } from '../runtime/structured';
import type { RoundBidMoveType, RoundBidProposal } from '../provider/types';

interface RoundBidState {
  member: { id: string; name: string; specialties?: string[]; systemPrompt: string };
  conversationContext: string;
  memberIds: string[];
  recentSpeakerIds?: string[];
  mentionedMemberIds?: string[];
  model?: string;
  proposal?: RoundBidProposal;
}

const RoundBidStateAnnotation = Annotation.Root({
  member: Annotation<{ id: string; name: string; specialties?: string[]; systemPrompt: string }>(),
  conversationContext: Annotation<string>(),
  memberIds: Annotation<string[]>(),
  recentSpeakerIds: Annotation<string[] | undefined>(),
  mentionedMemberIds: Annotation<string[] | undefined>(),
  model: Annotation<string | undefined>(),
  proposal: Annotation<RoundBidProposal | undefined>(),
});

const proposalSchema = z.object({
  wantsToSpeak: z.boolean().default(false),
  moveType: z.enum([
    'rebuttal',
    'caveat',
    'synthesis',
    'evidence',
    'reframing',
    'clarification',
    'agreement',
    'pass',
  ]),
  targetMemberId: z.string().optional().default(''),
  noveltyClaim: z.string().default('No material delta.'),
  confidence: z.number().min(0).max(1).default(0.2),
  estimatedValue: z.number().min(0).max(1).default(0.2),
});

function clamp01(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value as number));
}

function normalizeMoveType(raw: RoundBidMoveType, wantsToSpeak: boolean): RoundBidMoveType {
  if (!wantsToSpeak) return 'pass';
  return raw === 'pass' ? 'clarification' : raw;
}

function fallbackRoundBid(): RoundBidProposal {
  return {
    wantsToSpeak: false,
    moveType: 'pass',
    targetMemberId: undefined,
    noveltyClaim: 'No reliable bid available.',
    confidence: 0.15,
    estimatedValue: 0.1,
  };
}

export async function runRoundBidGraph(input: {
  member: { id: string; name: string; specialties?: string[]; systemPrompt: string };
  conversationContext: string;
  memberIds: string[];
  recentSpeakerIds?: string[];
  mentionedMemberIds?: string[];
  model?: string;
}): Promise<RoundBidProposal> {
  const graph = new StateGraph(RoundBidStateAnnotation)
    .addNode('propose', async (state) => {
      const target = modelRegistry.resolve('roundtableBid', state.model);
      const model = createChatModel(target, { temperature: 0.2 });
      const candidateTargets = state.memberIds.filter((id) => id !== state.member.id);
      const wasRecentSpeaker = state.recentSpeakerIds?.includes(state.member.id) ?? false;
      const wasMentioned = state.mentionedMemberIds?.includes(state.member.id) ?? false;

      const prompt = [
        'You are privately bidding for whether you should be surfaced as a suggested speaker in the next council round.',
        'This is not the final selection. Your job is to estimate whether you have a meaningful marginal contribution now.',
        'Return JSON only with keys: wantsToSpeak, moveType, targetMemberId, noveltyClaim, confidence, estimatedValue.',
        'wantsToSpeak must be true only if you add a materially useful next move.',
        'moveType must be one of: rebuttal, caveat, synthesis, evidence, reframing, clarification, agreement, pass.',
        'If wantsToSpeak is false, set moveType to pass and leave targetMemberId empty.',
        'targetMemberId must be empty unless reacting to one specific peer.',
        'confidence is your confidence that you actually have the move you claim.',
        'estimatedValue is the expected usefulness of hearing from you now.',
        'Both confidence and estimatedValue must be in [0,1].',
        'Prefer pass when you would mostly repeat the table.',
        'Prefer speaking when you can sharpen, rebut, qualify, add evidence, reframe, or resolve confusion.',
        'Do not volunteer just because you were mentioned; mention is a signal, not a command.',
        'If you spoke very recently, be more conservative unless you clearly still have the best next move.',
        'Keep noveltyClaim short and concrete.',
        '',
        `Member: ${state.member.name}`,
        `Specialties: ${state.member.specialties?.join(', ') || 'general'}`,
        `Member prompt: ${state.member.systemPrompt.slice(0, 500)}`,
        `Recent speaker: ${wasRecentSpeaker ? 'yes' : 'no'}`,
        `Mentioned this turn: ${wasMentioned ? 'yes' : 'no'}`,
        '',
        'Round context:',
        state.conversationContext.slice(0, 3000),
        '',
        `Candidate target ids: ${candidateTargets.join(', ') || '(none)'}`,
      ].join('\n');

      try {
        const parsed = await invokeStructured(model, prompt, proposalSchema);
        const wantsToSpeak = Boolean(parsed.wantsToSpeak) && parsed.moveType !== 'pass';
        const moveType = normalizeMoveType(parsed.moveType, wantsToSpeak);
        const targetMemberId = (parsed.targetMemberId ?? '').trim();
        const normalizedTarget =
          targetMemberId && candidateTargets.includes(targetMemberId) ? targetMemberId : undefined;

        return {
          proposal: {
            wantsToSpeak,
            moveType,
            targetMemberId: wantsToSpeak ? normalizedTarget : undefined,
            noveltyClaim:
              (parsed.noveltyClaim ?? 'No material delta.').trim().slice(0, 200) || 'No material delta.',
            confidence: clamp01(parsed.confidence),
            estimatedValue: clamp01(parsed.estimatedValue),
          },
        };
      } catch {
        return {
          proposal: fallbackRoundBid(),
        };
      }
    })
    .addEdge(START, 'propose')
    .addEdge('propose', END)
    .compile();

  const result = (await graph.invoke(input)) as unknown as RoundBidState;
  return result.proposal ?? fallbackRoundBid();
}
