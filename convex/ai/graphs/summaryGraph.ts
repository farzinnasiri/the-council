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
        'Write private working memory FOR YOURSELF so future replies stay coherent.',
        'Treat this as internal notes, not a user-facing response.',
        'Output plain markdown only using these exact section headers in this order:',
        '## Current objective',
        '## Established facts',
        '## Constraints and preferences',
        '## Open loops',
        '## Recent decisions / commitments',
        '## Interaction state',
        'Keep each section concise and factual.',
        'Preserve durable facts, user preferences, goals, constraints, decisions, and unresolved threads.',
        '',
        `${previousBlock}Recent messages:\n${historyBlock}`,
        '',
        'Write the updated thread working memory now:',
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

export async function runHallRoundSummaryGraph(input: {
  roundNumber: number;
  messages: Array<{ author: string; content: string }>;
  model?: string;
}): Promise<string> {
  const target = modelRegistry.resolve('hallMemory', input.model);
  const model = createChatModel(target, { temperature: 0.1 });
  const roundTranscript = input.messages
    .map((item) => `${item.author}: ${item.content}`)
    .join('\n')
    .slice(0, 12000);

  const prompt = [
    'You summarize one completed council hall round.',
    'Output plain text only (no JSON, no markdown fences).',
    'Keep it concise and factual.',
    'Use this exact shape:',
    `Round ${input.roundNumber}:`,
    'Member Name: one-line summary of what they argued or changed',
    'Include disagreement/support signals when present.',
    'Do not flatten distinct positions into a group consensus if they remained different.',
    'Do not include members who did not speak.',
    '',
    'Round transcript:',
    roundTranscript || '(no transcript)',
    '',
    'Write the final round summary now.',
  ].join('\n');

  const output = await invokeText(model, prompt);
  const fallback = `Round ${input.roundNumber}:\nMember: (summary unavailable)`;
  return (output || '').trim() || fallback;
}

export async function runHallFollowUpSeedGraph(input: {
  memberName: string;
  hallMode: 'advisory' | 'roundtable';
  participants: string[];
  roundSummaries: string[];
  transcript: Array<{ author: string; content: string }>;
  pairedUserMessage?: string;
  anchorMemberMessage: string;
  model?: string;
}): Promise<string> {
  const target = modelRegistry.resolve('hallThreadSeed', input.model);
  const model = createChatModel(target, { temperature: 0.1 });
  const transcriptBlock = input.transcript
    .map((item) => `${item.author}: ${item.content}`)
    .join('\n')
    .slice(0, 18000);
  const roundSummaryBlock = input.roundSummaries.join('\n\n').slice(0, 8000);
  const prompt = [
    `You are preparing a private follow-up thread with ${input.memberName} after a council hall conversation.`,
    'Write a compact, high-signal context brief for the private thread.',
    'This must help the member continue the conversation privately without re-reading the full hall.',
    'Output plain text only.',
    'Write in third person, factual, dense, and easy for another model to use as context.',
    'Keep enough detail to preserve positions, tensions, and unresolved questions. Do not over-compress.',
    '',
    '[Required coverage]',
    '- What the user has been trying to accomplish in the hall',
    '- What each participating member argued, suggested, or objected to',
    `- Extra emphasis on ${input.memberName}'s position, reasoning, and tone`,
    '- Agreement, disagreement, and unresolved questions',
    '- Why a private follow-up with this member makes sense now',
    '',
    `[Hall Mode]\n${input.hallMode}`,
    '',
    `[Participants]\n${input.participants.join(', ') || input.memberName}`,
    '',
    '[Completed Round Summaries]',
    roundSummaryBlock || '(none)',
    '',
    '[Recent Hall Transcript]',
    transcriptBlock || '(none)',
    '',
    `[User Message Immediately Before ${input.memberName}'s Selected Reply]`,
    input.pairedUserMessage?.trim() || '(none found)',
    '',
    `[Selected Reply From ${input.memberName}]`,
    input.anchorMemberMessage.trim(),
    '',
    'Write the private-thread context brief now:',
  ].join('\n');

  const output = await invokeText(model, prompt);
  return (output || '').trim();
}
