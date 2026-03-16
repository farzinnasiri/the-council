'use node';

import { z } from 'zod';
import { modelRegistry } from '../runtime/modelRegistry';
import { createChatModel } from '../runtime/modelFactory';
import { invokeStructured, invokeText } from '../runtime/structured';

const guidanceDirectiveSchema = z.object({
  note: z.string().min(1).max(240),
  ttlUserTurns: z.number().int().min(1).max(3),
});

const reflectionSchema = z.object({
  directives: z.array(guidanceDirectiveSchema).max(3).default([]),
});

function normalizeTtlUserTurns(value: number): 1 | 2 | 3 {
  if (value <= 1) return 1;
  if (value >= 3) return 3;
  return 2;
}

export async function runMemberGuidanceProfileGraph(input: {
  memberName: string;
  systemPrompt: string;
  specialties?: string[];
  existingGuidanceProfilePrompt?: string;
  model?: string;
}) {
  const target = modelRegistry.resolve('guidanceProfile', input.model);
  const model = createChatModel(target, { temperature: 0.2 });
  const prompt = [
    `Convert the visible member system prompt for ${input.memberName} into a private guidance profile.`,
    'This guidance profile is hidden and editable by the user.',
    'It should explain how the member adapts while preserving identity.',
    'Include:',
    '- identity invariants that must not drift',
    '- allowed adaptation range',
    '- how this member interprets stress, confusion, resistance, disengagement, and emotional intensity',
    '- what tone shifts are in-bounds',
    '- how first-person private notes should sound',
    'Do not write chain-of-thought. Write a compact instruction prompt.',
    'Use clear sections and plain text.',
    '',
    `Member name: ${input.memberName}`,
    `Specialties: ${input.specialties?.join(', ') || '(none)'}`,
    '',
    '[Visible System Prompt]',
    input.systemPrompt.trim(),
    '',
    input.existingGuidanceProfilePrompt?.trim()
      ? ['[Current Guidance Profile]', input.existingGuidanceProfilePrompt.trim(), 'Refresh it while keeping useful structure.'].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const guidanceProfilePrompt = await invokeText(model, prompt);
  return {
    guidanceProfilePrompt,
    model: target.model,
  };
}

export async function runChamberGuidanceReflectionGraph(input: {
  memberName: string;
  guidanceProfilePrompt: string;
  previousSummary?: string;
  trigger: 'interval' | 'feedback';
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  activeDirectiveNotes?: string[];
  feedbackKeys?: string[];
  model?: string;
}) {
  const target = modelRegistry.resolve('guidanceReflection', input.model);
  const model = createChatModel(target, { temperature: 0.15, thinkingBudget: 2048 });
  const transcript = input.recentMessages
    .slice(-12)
    .map((message) => `${message.role === 'user' ? 'User' : input.memberName}: ${message.content}`)
    .join('\n');
  const prompt = [
    `You are the private chamber guidance layer for ${input.memberName}.`,
    'Read the recent thread state and return up to 3 short-lived directives for future user turns.',
    'Return JSON only matching the schema.',
    'Directives must be:',
    '- first-person notes',
    '- short and concrete',
    '- identity-consistent with the member',
    '- focused on future steering, not retrospective explanation',
    'Use ttlUserTurns between 1 and 3 only.',
    'Prefer no directive over weak directives.',
    '',
    `Trigger: ${input.trigger}`,
    `Feedback: ${input.feedbackKeys?.join(', ') || '(none)'}`,
    '',
    '[Guidance Profile]',
    input.guidanceProfilePrompt.trim(),
    '',
    '[Conversation Memory]',
    input.previousSummary?.trim() || '(none)',
    '',
    '[Active Guidance Notes]',
    input.activeDirectiveNotes?.join('\n') || '(none)',
    '',
    '[Recent Transcript]',
    transcript || '(none)',
  ].join('\n');

  const parsed = await invokeStructured(model, prompt, reflectionSchema);
  return {
    directives: parsed.directives.map((directive) => ({
      ...directive,
      ttlUserTurns: normalizeTtlUserTurns(directive.ttlUserTurns),
    })),
    model: target.model,
  };
}
