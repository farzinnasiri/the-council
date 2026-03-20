'use node';

import { createChatModel } from '../runtime/modelFactory';
import { modelRegistry } from '../runtime/modelRegistry';
import { invokeText } from '../runtime/structured';

export async function runMemberVoicePersonaGraph(input: {
  memberName: string;
  systemPrompt: string;
  specialties?: string[];
  selectedVoiceName: 'Kore' | 'Zephyr' | 'Fenrir' | 'Puck' | 'Charon';
  existingTtsPersonaPrompt?: string;
  model?: string;
}) {
  const target = modelRegistry.resolve('voicePersona', input.model);
  const model = createChatModel(target, { temperature: 0.2 });
  const prompt = [
    `Convert the visible member system prompt for ${input.memberName} into a private single-speaker TTS persona prompt.`,
    'This prompt steers delivery only. It must never change the wording of the spoken text.',
    'Focus on:',
    '- cadence and pacing',
    '- warmth vs authority',
    '- emphasis and sentence endings',
    '- how explanatory, reflective, urgent, or decisive passages should sound',
    '- how much emotional color is appropriate',
    'Do not tell the model to describe punctuation, markdown, citations, or formatting.',
    'Write a compact plain-text instruction prompt with short labeled sections.',
    '',
    `Member name: ${input.memberName}`,
    `Selected base voice: ${input.selectedVoiceName}`,
    `Specialties: ${input.specialties?.join(', ') || '(none)'}`,
    '',
    '[Visible System Prompt]',
    input.systemPrompt.trim(),
    '',
    input.existingTtsPersonaPrompt?.trim()
      ? ['[Current Voice Persona]', input.existingTtsPersonaPrompt.trim(), 'Refresh it while preserving useful phrasing.'].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const ttsPersonaPrompt = await invokeText(model, prompt);
  return {
    ttsPersonaPrompt,
    model: target.model,
  };
}
