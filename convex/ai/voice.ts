'use node';

import { v } from 'convex/values';
import { GoogleGenAI } from '@google/genai';
import { action } from '../_generated/server';
import { requireAuthUser } from '../contexts/shared/auth';
import { resolveModelTarget } from './modelConfig';

const DEFAULT_AUDIO_MIME = 'audio/webm';

function resolveGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set in Convex runtime env');
  }
  return key;
}

function toErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('unsupported') || normalized.includes('mime')) {
    return 'This audio format is not supported for transcription. Please try again.';
  }
  if (normalized.includes('rate') || normalized.includes('quota') || normalized.includes('429')) {
    return 'Transcription is busy right now. Please try again in a moment.';
  }
  if (normalized.includes('network') || normalized.includes('fetch') || normalized.includes('timeout')) {
    return 'Network issue while transcribing audio. Please try again.';
  }
  return 'Could not transcribe audio right now. Please try again.';
}

export const transcribeAudioFromStorage = action({
  args: {
    storageId: v.id('_storage'),
    mimeType: v.optional(v.string()),
  },
  returns: v.object({
    transcript: v.string(),
    model: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const modelTarget = resolveModelTarget('transcription');
    if (modelTarget.provider !== 'google') {
      throw new Error('AI_MODEL_TRANSCRIPTION must use the google provider');
    }

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) {
      throw new Error('Recorded audio was not found. Please record again.');
    }

    try {
      const bytes = Buffer.from(await blob.arrayBuffer());
      const base64Audio = bytes.toString('base64');
      const mimeType = args.mimeType?.trim() || (blob.type?.trim() || DEFAULT_AUDIO_MIME);

      const ai = new GoogleGenAI({ apiKey: resolveGeminiKey() });
      const response = await ai.models.generateContent({
        model: modelTarget.model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
            {
              text: [
                'Transcribe the spoken audio.',
                'Perform light cleanup only:',
                '- Remove obvious filler words and repeated stutters.',
                '- Keep the original language exactly as spoken.',
                '- Do not translate.',
                '- Do not change meaning or add content.',
                '- Return only the transcript text.',
              ].join('\n'),
            },
          ],
        },
      });

      const transcript = response.text?.trim();
      if (!transcript) {
        throw new Error('No transcription returned');
      }

      return {
        transcript,
        model: modelTarget.model,
      };
    } catch (error) {
      throw new Error(toErrorMessage(error));
    } finally {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
    }
  },
});
