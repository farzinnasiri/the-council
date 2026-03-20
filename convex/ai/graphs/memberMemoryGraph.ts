'use node';

import { z } from 'zod';
import { modelRegistry } from '../runtime/modelRegistry';
import { createChatModel } from '../runtime/modelFactory';
import { invokeStructured, invokeText } from '../runtime/structured';

const episodeSchema = z.object({
  episodes: z.array(z.object({
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(800),
  })).max(3).default([]),
});

function buildTranscriptBlock(
  transcript: Array<{ role: 'user' | 'assistant'; content: string; createdAt: number }>,
  maxItems = 80
) {
  return transcript
    .slice(-maxItems)
    .map((item) => `${item.role === 'user' ? 'User' : 'Member'}: ${item.content}`)
    .join('\n');
}

function buildSignalsBlock(input: {
  feedbackKeys: string[];
  transcript: Array<{ revisionKind?: string; generationProfile?: string }>;
}) {
  const revisions = input.transcript
    .map((item) => item.revisionKind)
    .filter(Boolean)
    .join(', ');
  const modes = input.transcript
    .map((item) => item.generationProfile)
    .filter(Boolean)
    .join(', ');
  return [
    `Feedback keys: ${input.feedbackKeys.join(', ') || '(none)'}`,
    `Refinements: ${revisions || '(none)'}`,
    `Generation profiles: ${modes || '(none)'}`,
  ].join('\n');
}

export async function runInteractionPolicyGraph(input: {
  memberName: string;
  systemPrompt: string;
  guidanceProfilePrompt?: string;
  transcript: Array<{ role: 'user' | 'assistant'; content: string; createdAt: number; revisionKind?: string; generationProfile?: string }>;
  feedbackKeys: string[];
  existingBody?: string;
}): Promise<string> {
  const target = modelRegistry.resolve('chamberMemory');
  const model = createChatModel(target, { temperature: 0.15 });
  const prompt = [
    `You are writing the private interaction policy for ${input.memberName}.`,
    'This should help the member answer this user better in future chamber threads.',
    'Output plain text only.',
    'Write concise, member-specific private notes.',
    'Prefer actionable rules over biography.',
    'Use clear sections when helpful.',
    'Do not mention confidence.',
    '',
    '[Member System Prompt]',
    input.systemPrompt.trim(),
    '',
    '[Guidance Profile]',
    input.guidanceProfilePrompt?.trim() || '(none)',
    '',
    '[Existing Interaction Policy]',
    input.existingBody?.trim() || '(none)',
    '',
    '[Signals]',
    buildSignalsBlock({ feedbackKeys: input.feedbackKeys, transcript: input.transcript }),
    '',
    '[Recent Cross-Thread Transcript]',
    buildTranscriptBlock(input.transcript),
    '',
    'Write the updated interaction policy now:',
  ].join('\n');
  return await invokeText(model, prompt);
}

export async function runMentalModelGraph(input: {
  memberName: string;
  systemPrompt: string;
  guidanceProfilePrompt?: string;
  transcript: Array<{ role: 'user' | 'assistant'; content: string; createdAt: number; revisionKind?: string; generationProfile?: string }>;
  feedbackKeys: string[];
  existingBody?: string;
}): Promise<string> {
  const target = modelRegistry.resolve('chamberMemory');
  const model = createChatModel(target, { temperature: 0.15 });
  const prompt = [
    `You are writing the private mental model ${input.memberName} has of this user.`,
    'This is not a biography dump. Capture how the member currently understands the user in a way that improves future chamber replies.',
    'Output plain text only.',
    'Keep it freeform, dense, and tailored to the member voice.',
    'Cover patterns, motivations, recurring confusions, what seems to click, and stable preferences when supported by the conversations.',
    'Do not mention confidence.',
    '',
    '[Member System Prompt]',
    input.systemPrompt.trim(),
    '',
    '[Guidance Profile]',
    input.guidanceProfilePrompt?.trim() || '(none)',
    '',
    '[Existing Mental Model]',
    input.existingBody?.trim() || '(none)',
    '',
    '[Signals]',
    buildSignalsBlock({ feedbackKeys: input.feedbackKeys, transcript: input.transcript }),
    '',
    '[Recent Cross-Thread Transcript]',
    buildTranscriptBlock(input.transcript),
    '',
    'Write the updated mental model now:',
  ].join('\n');
  return await invokeText(model, prompt);
}

export async function runEpisodeExtractionGraph(input: {
  memberName: string;
  systemPrompt: string;
  guidanceProfilePrompt?: string;
  transcript: Array<{ role: 'user' | 'assistant'; content: string; createdAt: number; revisionKind?: string; generationProfile?: string }>;
  feedbackKeys: string[];
  existingEpisodes: Array<{ title?: string; body: string }>;
}): Promise<Array<{ title: string; body: string }>> {
  const target = modelRegistry.resolve('guidanceReflection');
  const model = createChatModel(target, { temperature: 0.1, thinkingBudget: 2048 });
  const prompt = [
    `Extract up to 3 episodic memories for ${input.memberName}.`,
    'Episodes should be selective and useful examples of what worked, failed, or clicked with this user.',
    'Return JSON only matching the schema.',
    'Prefer no episode over weak episodes.',
    'Avoid duplicates of existing episodes.',
    'Do not mention confidence.',
    '',
    '[Member System Prompt]',
    input.systemPrompt.trim(),
    '',
    '[Guidance Profile]',
    input.guidanceProfilePrompt?.trim() || '(none)',
    '',
    '[Existing Episodes]',
    input.existingEpisodes
      .map((episode) => `${episode.title ?? 'Untitled'}: ${episode.body}`)
      .join('\n\n') || '(none)',
    '',
    '[Signals]',
    buildSignalsBlock({ feedbackKeys: input.feedbackKeys, transcript: input.transcript }),
    '',
    '[Recent Cross-Thread Transcript]',
    buildTranscriptBlock(input.transcript),
  ].join('\n');

  const parsed = await invokeStructured(model, prompt, episodeSchema);
  return parsed.episodes.map((episode) => ({
    title: episode.title.trim(),
    body: episode.body.trim(),
  })).filter((episode) => episode.title && episode.body);
}
