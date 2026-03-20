'use node';

import { createHash } from 'node:crypto';
import { GoogleGenAI, Modality } from '@google/genai';
import { v } from 'convex/values';
import { api } from '../_generated/api';
import { action } from '../_generated/server';
import { requireAuthUser, requireOwnedMember } from '../contexts/shared/auth';
import { createAiProvider } from '../contexts/shared/convexGateway';
import { wideEventError } from '../observability/errors';
import { measureMainStage, observeAction, setMainSpanAttributes } from '../observability/wideEvents';
import { resolveModelTarget } from './modelConfig';

const DEFAULT_AUDIO_MIME = 'audio/webm';
const TTS_AUDIO_MIME = 'audio/wav';
const TTS_CACHE_VERSION = 'v2';
const TTS_MAX_SEGMENT_BYTES = 4500;
const TTS_SAMPLE_RATE = 24000;
const TTS_CHANNEL_COUNT = 1;
const TTS_BITS_PER_SAMPLE = 16;
const TTS_VOICE_NAMES = ['Kore', 'Zephyr', 'Fenrir', 'Puck', 'Charon'] as const;
const DEFAULT_TTS_VOICE_NAME = 'Puck';
const DEFAULT_TTS_PERSONA_PROMPT = [
  'Task: Read the text aloud exactly as written.',
  'Style: Clear, natural, explanatory, and steady.',
  'Tone: Warm, composed, and easy to follow.',
  'Constraint: Do not describe punctuation, markdown, links, or formatting. Do not add or remove content.',
].join('\n');

type TtsVoiceName = (typeof TTS_VOICE_NAMES)[number];

const ttsVoiceNameValidator = v.union(
  v.literal('Kore'),
  v.literal('Zephyr'),
  v.literal('Fenrir'),
  v.literal('Puck'),
  v.literal('Charon')
);

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

function resolveTtsVoiceName(value?: string | null): TtsVoiceName {
  if (value && TTS_VOICE_NAMES.includes(value as TtsVoiceName)) {
    return value as TtsVoiceName;
  }
  return DEFAULT_TTS_VOICE_NAME;
}

function resolveTtsModel(override?: string) {
  const target = resolveModelTarget('tts', override);
  if (target.provider !== 'google') {
    throw wideEventError('tts-provider-invalid', 'AI_MODEL_TTS must use the google provider');
  }
  return target;
}

function buildSpeechPrompt(text: string, personaPrompt: string): string {
  return [
    personaPrompt.trim() || DEFAULT_TTS_PERSONA_PROMPT,
    '',
    'Read the following text aloud exactly as written.',
    'Do not mention punctuation, markdown, links, citations, or formatting.',
    'Keep the wording unchanged.',
    '',
    'Text to read:',
    text,
  ].join('\n');
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

function buildSpeechCacheKey(
  messageId: string,
  normalizedText: string,
  voiceName: string,
  personaPrompt: string,
  model: string
): string {
  const digest = createHash('sha256')
    .update(`${TTS_CACHE_VERSION}:${messageId}:${voiceName}:${model}:${personaPrompt}:${normalizedText}`)
    .digest('hex')
    .slice(0, 24);
  return `message-tts:${TTS_CACHE_VERSION}:${messageId}:${voiceName}:${digest}`;
}

function createWavBase64FromPcm(base64Data: string): string {
  const pcm = Buffer.from(base64Data, 'base64');
  const header = Buffer.alloc(44);
  const byteRate = (TTS_SAMPLE_RATE * TTS_CHANNEL_COUNT * TTS_BITS_PER_SAMPLE) / 8;
  const blockAlign = (TTS_CHANNEL_COUNT * TTS_BITS_PER_SAMPLE) / 8;

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(TTS_CHANNEL_COUNT, 22);
  header.writeUInt32LE(TTS_SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(TTS_BITS_PER_SAMPLE, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]).toString('base64');
}

async function synthesizeGeminiSpeechSegment(input: {
  model: string;
  text: string;
  voiceName: TtsVoiceName;
  personaPrompt: string;
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: resolveGeminiKey() });
  const response = await measureMainStage('external_tts.gemini.segment', async () =>
    await ai.models.generateContent({
      model: input.model,
      contents: [{ parts: [{ text: buildSpeechPrompt(input.text, input.personaPrompt) }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: input.voiceName,
            },
          },
        },
      },
    })
  );

  const audioPart = response.candidates?.[0]?.content?.parts?.find((part) => Boolean(part.inlineData?.data));
  const pcmBase64 = audioPart?.inlineData?.data;
  if (!pcmBase64) {
    throw new Error('No audio content received from Gemini TTS');
  }

  return createWavBase64FromPcm(pcmBase64);
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
      const response = await measureMainStage('external_ai.transcription', async () =>
        await ai.models.generateContent({
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
        })
      );

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

export const generateMemberVoicePersona = action({
  args: {
    memberId: v.id('members'),
    systemPrompt: v.string(),
    specialties: v.optional(v.array(v.string())),
    ttsVoiceName: v.optional(ttsVoiceNameValidator),
    force: v.optional(v.boolean()),
    model: v.optional(v.string()),
  },
  returns: v.object({
    ttsPersonaPrompt: v.string(),
    model: v.string(),
  }),
  handler: observeAction('ai.voice.generateMemberVoicePersona', async (ctx, args) => {
    setMainSpanAttributes({
      'member.id': String(args.memberId),
      'tts.voice_name': resolveTtsVoiceName(args.ttsVoiceName),
      'tts.force': Boolean(args.force),
      'member.specialty_count': args.specialties?.length ?? 0,
    });
    await requireAuthUser(ctx);
    const member = await requireOwnedMember(ctx, args.memberId, { includeArchived: true });
    if (member.ttsPersonaPrompt?.trim() && !args.force) {
      return {
        ttsPersonaPrompt: member.ttsPersonaPrompt,
        model: 'existing',
      };
    }

    const provider = createAiProvider();
    const result = await provider.generateMemberVoicePersona({
      memberName: member.name,
      systemPrompt: args.systemPrompt,
      specialties: args.specialties,
      selectedVoiceName: resolveTtsVoiceName(args.ttsVoiceName ?? member.ttsVoiceName),
      existingTtsPersonaPrompt: member.ttsPersonaPrompt,
      model: args.model,
    });

    await ctx.runMutation(api.members.update, {
      memberId: args.memberId,
      ttsPersonaPrompt: result.ttsPersonaPrompt,
      ttsPersonaGeneratedAt: Date.now(),
    });

    return result;
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

    const member = message.authorMemberId
      ? await ctx.runQuery(api.members.getById, {
          memberId: message.authorMemberId,
          includeArchived: true,
        })
      : null;
    const voiceName = resolveTtsVoiceName(member?.ttsVoiceName);
    const personaPrompt = member?.ttsPersonaPrompt?.trim() || DEFAULT_TTS_PERSONA_PROMPT;
    const ttsModel = resolveTtsModel();
    const cacheKey = buildSpeechCacheKey(String(message._id), normalizedText, voiceName, personaPrompt, ttsModel.model);

    setMainSpanAttributes({
      'conversation.id': String(args.conversationId),
      'message.id': String(args.messageId),
      'ai.response.model': ttsModel.model,
      'tts.voice_name': voiceName,
      'tts.segment_count': segmentsText.length,
      'tts.cache_key': cacheKey,
    });

    try {
      const segments = [];
      for (const [index, segmentText] of segmentsText.entries()) {
        const audioBase64 = await synthesizeGeminiSpeechSegment({
          model: ttsModel.model,
          text: segmentText,
          voiceName,
          personaPrompt,
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
