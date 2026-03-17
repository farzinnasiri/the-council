'use node';

import { createHash } from 'node:crypto';
import { v } from 'convex/values';
import { GoogleGenAI } from '@google/genai';
import { action } from '../_generated/server';
import { api } from '../_generated/api';
import { requireAuthUser } from '../contexts/shared/auth';
import { resolveModelTarget } from './modelConfig';
import { measureMainStage, observeAction, setMainSpanAttributes } from '../observability/wideEvents';
import { wideEventError } from '../observability/errors';

const DEFAULT_AUDIO_MIME = 'audio/webm';
const TTS_AUDIO_MIME = 'audio/mpeg';
const TTS_CACHE_VERSION = 'v1';
const TTS_MAX_SEGMENT_BYTES = 4500;
const ENGLISH_MALE_VOICES = [
  'en-US-Neural2-A',
  'en-US-Neural2-D',
  'en-US-Neural2-I',
  'en-US-Neural2-J',
] as const;
const ENGLISH_MALE_VOICE_FALLBACK = 'en-US-Standard-D';

const speechSegmentValidator = v.object({
  index: v.number(),
  audioBase64: v.string(),
});

function resolveGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw wideEventError('runtime-gemini-key-missing', 'GEMINI_API_KEY is not set in Convex runtime env');
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

function resolveGcpTtsKey(): string {
  const key = process.env.GCP_TTS_API_KEY?.trim();
  if (!key) {
    throw wideEventError('runtime-gcp-tts-key-missing', 'GCP_TTS_API_KEY is not set in Convex runtime env');
  }
  return key;
}

function toSpeechErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes('429') ||
    normalized.includes('quota') ||
    normalized.includes('rate limit') ||
    normalized.includes('resource exhausted')
  ) {
    return 'Speech generation is busy right now. Please try again in a moment.';
  }
  if (
    normalized.includes('fetch') ||
    normalized.includes('network') ||
    normalized.includes('timeout') ||
    normalized.includes('unavailable')
  ) {
    return 'Network issue while generating speech. Please try again.';
  }
  if (
    normalized.includes('voice') ||
    normalized.includes('audioencoding') ||
    normalized.includes('languagecode') ||
    normalized.includes('invalid argument')
  ) {
    return 'Speech generation settings were rejected. Please try again.';
  }
  return 'Could not generate speech right now. Please try again.';
}

function normalizeMessageForSpeech(content: string): string {
  let text = content;

  text = text.replace(/```[\s\S]*?```/g, ' Code block omitted. ');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/https?:\/\/\S+/gi, ' ');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '- ');
  text = text.replace(/^\s*\d+\.\s+/gm, '- ');
  text = text.replace(/\|/g, ' ');
  text = text.replace(/[*_~]/g, '');
  text = text.replace(/\[\^?\d+\]/g, ' ');
  text = text.replace(/\s+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
    )
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return paragraphs.join('\n\n').trim();
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function splitParagraphIntoSentences(paragraph: string): string[] {
  const normalized = paragraph.trim();
  if (!normalized) return [];
  const parts = normalized.split(/(?<=[.!?])\s+/g).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [normalized];
}

function splitOversizedSentence(sentence: string, maxBytes: number): string[] {
  const words = sentence.split(/\s+/g).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (utf8ByteLength(candidate) <= maxBytes) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (utf8ByteLength(word) <= maxBytes) {
      current = word;
      continue;
    }

    let partial = '';
    for (const char of word) {
      const charCandidate = `${partial}${char}`;
      if (utf8ByteLength(charCandidate) <= maxBytes) {
        partial = charCandidate;
        continue;
      }
      if (partial) {
        chunks.push(partial);
      }
      partial = char;
    }
    current = partial;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function segmentSpeechText(text: string, maxBytes = TTS_MAX_SEGMENT_BYTES): string[] {
  if (!text.trim()) return [];

  const segments: string[] = [];
  let current = '';
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  const pushCurrent = () => {
    const normalized = current.trim();
    if (normalized) {
      segments.push(normalized);
    }
    current = '';
  };

  const appendPiece = (piece: string) => {
    const normalizedPiece = piece.trim();
    if (!normalizedPiece) return;

    const candidate = current ? `${current}\n\n${normalizedPiece}` : normalizedPiece;
    if (utf8ByteLength(candidate) <= maxBytes) {
      current = candidate;
      return;
    }

    if (current) {
      pushCurrent();
    }

    if (utf8ByteLength(normalizedPiece) <= maxBytes) {
      current = normalizedPiece;
      return;
    }

    const sentences = splitParagraphIntoSentences(normalizedPiece);
    for (const sentence of sentences) {
      if (utf8ByteLength(sentence) <= maxBytes) {
        const sentenceCandidate = current ? `${current} ${sentence}` : sentence;
        if (utf8ByteLength(sentenceCandidate) <= maxBytes) {
          current = sentenceCandidate;
        } else {
          pushCurrent();
          current = sentence;
        }
        continue;
      }

      const fragments = splitOversizedSentence(sentence, maxBytes);
      for (const fragment of fragments) {
        const fragmentCandidate = current ? `${current} ${fragment}` : fragment;
        if (utf8ByteLength(fragmentCandidate) <= maxBytes) {
          current = fragmentCandidate;
        } else {
          pushCurrent();
          current = fragment;
        }
      }
    }
  };

  for (const paragraph of paragraphs) {
    appendPiece(paragraph);
  }

  pushCurrent();
  return segments;
}

function resolveMaleEnglishVoice(seed: string): string {
  if (!seed) {
    return ENGLISH_MALE_VOICE_FALLBACK;
  }

  const hash = createHash('sha256').update(seed).digest();
  const index = hash[0] % ENGLISH_MALE_VOICES.length;
  return ENGLISH_MALE_VOICES[index] ?? ENGLISH_MALE_VOICE_FALLBACK;
}

function buildSpeechCacheKey(messageId: string, normalizedText: string, voiceName: string): string {
  const digest = createHash('sha256')
    .update(`${TTS_CACHE_VERSION}:${messageId}:${voiceName}:${normalizedText}`)
    .digest('hex')
    .slice(0, 24);
  return `message-tts:${TTS_CACHE_VERSION}:${messageId}:${voiceName}:${digest}`;
}

async function synthesizeGoogleSpeechSegment(input: {
  apiKey: string;
  text: string;
  voiceName: string;
}): Promise<string> {
  const response = await measureMainStage('external_tts.google.segment', async () =>
    await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(input.apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          text: input.text,
        },
        voice: {
          languageCode: 'en-US',
          name: input.voiceName,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.0,
        },
      }),
    })
  );

  if (!response.ok) {
    let detail = '';
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      detail = payload.error?.message?.trim() || '';
    } catch {
      detail = '';
    }
    throw new Error(`${response.status}${detail ? ` ${detail}` : ''}`.trim());
  }

  const payload = (await response.json()) as { audioContent?: string };
  if (!payload.audioContent) {
    throw new Error('No audio content received from Google Cloud TTS');
  }
  return payload.audioContent;
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
  handler: observeAction('ai.voice.transcribeAudioFromStorage', async (ctx, args) => {
    setMainSpanAttributes({
      'storage.id': String(args.storageId),
      'transcription.mime_type': args.mimeType?.trim() || DEFAULT_AUDIO_MIME,
    });
    await requireAuthUser(ctx);
    const modelTarget = resolveModelTarget('transcription');
    if (modelTarget.provider !== 'google') {
      throw wideEventError(
        'transcription-provider-invalid',
        'AI_MODEL_TRANSCRIPTION must use the google provider'
      );
    }

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) {
      throw wideEventError('transcription-storage-missing', 'Recorded audio was not found. Please record again.', {
        statusCode: 404,
      });
    }

    try {
      const bytes = Buffer.from(await blob.arrayBuffer());
      const base64Audio = bytes.toString('base64');
      const mimeType = args.mimeType?.trim() || (blob.type?.trim() || DEFAULT_AUDIO_MIME);
      setMainSpanAttributes({
        'transcription.mime_type': mimeType,
        'ai.response.model': modelTarget.model,
      });

      const ai = new GoogleGenAI({ apiKey: resolveGeminiKey() });
      const response = await measureMainStage('external_ai.transcription', async () => await ai.models.generateContent({
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
      }));

      const transcript = response.text?.trim();
      if (!transcript) {
        throw wideEventError('transcription-empty-response', 'No transcription returned');
      }

      return {
        transcript,
        model: modelTarget.model,
      };
    } catch (error) {
      throw wideEventError('transcription-request-failed', toErrorMessage(error), {
        cause: error,
      });
    } finally {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
    }
  }),
});

export const synthesizeMessageSpeech = action({
  args: {
    conversationId: v.id('conversations'),
    messageId: v.id('messages'),
  },
  returns: v.object({
    mimeType: v.literal(TTS_AUDIO_MIME),
    segments: v.array(speechSegmentValidator),
    voiceName: v.string(),
    cacheKey: v.string(),
  }),
  handler: observeAction('ai.voice.synthesizeMessageSpeech', async (ctx, args) => {
    await requireAuthUser(ctx);
    const conversation = await ctx.runQuery(api.conversations.getById, {
      conversationId: args.conversationId,
    });
    if (!conversation) {
      throw wideEventError('speech-conversation-not-found', 'Conversation not found', { statusCode: 404 });
    }

    const message = await ctx.runQuery(api.messages.getById, {
      conversationId: args.conversationId,
      messageId: args.messageId,
    });
    if (!message) {
      throw wideEventError('speech-message-not-found', 'Message not found', { statusCode: 404 });
    }

    if (message.role !== 'member' || message.systemKind) {
      throw wideEventError('speech-message-role-invalid', 'Only member replies can be spoken aloud', {
        statusCode: 400,
      });
    }
    if (message.status !== 'sent' || message.deletedAt || message.supersededAt || message.compacted) {
      throw wideEventError('speech-message-inactive', 'Message is no longer available for speech', {
        statusCode: 409,
      });
    }

    const normalizedText = normalizeMessageForSpeech(message.content);
    if (!normalizedText) {
      throw wideEventError('speech-message-empty', 'Message does not contain speakable content', {
        statusCode: 400,
      });
    }

    const segmentsText = segmentSpeechText(normalizedText);
    if (segmentsText.length === 0) {
      throw wideEventError('speech-message-segmentation-empty', 'Message does not contain speakable content', {
        statusCode: 400,
      });
    }

    const seed = `${message.authorMemberId ?? ''}:${conversation._id}:${message._id}`;
    const voiceName = resolveMaleEnglishVoice(seed);
    const cacheKey = buildSpeechCacheKey(String(message._id), normalizedText, voiceName);
    const apiKey = resolveGcpTtsKey();

    setMainSpanAttributes({
      'conversation.id': String(args.conversationId),
      'message.id': String(args.messageId),
      'tts.voice_name': voiceName,
      'tts.segment_count': segmentsText.length,
      'tts.cache_key': cacheKey,
    });

    try {
      const segments = [];
      for (const [index, segmentText] of segmentsText.entries()) {
        const audioBase64 = await synthesizeGoogleSpeechSegment({
          apiKey,
          text: segmentText,
          voiceName,
        });
        segments.push({ index, audioBase64 });
      }

      return {
        mimeType: TTS_AUDIO_MIME as typeof TTS_AUDIO_MIME,
        segments,
        voiceName,
        cacheKey,
      };
    } catch (error) {
      throw wideEventError('speech-request-failed', toSpeechErrorMessage(error), {
        cause: error,
      });
    }
  }),
});
