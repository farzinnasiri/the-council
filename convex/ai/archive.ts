'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { z } from 'zod';
import { requireAuthUser } from '../contexts/shared/auth';
import {
  personalArchiveBucketValidator,
  personalArchiveProposedEntryValidator,
  personalArchiveSourceTypeValidator,
} from '../personalArchiveShared';
import { extractTextFromStorage } from './ragExtraction';
import { createChatModel } from './runtime/modelFactory';
import { modelRegistry } from './runtime/modelRegistry';
import { invokeStructured } from './runtime/structured';
import { indexPersonalArchiveEntry, deletePersonalArchiveEntryIndex } from './personalArchiveStore';
import type { PersonalArchiveBucket } from '../personalArchiveShared';

const previewResultValidator = v.object({
  captureId: v.id('personalArchiveCaptures'),
  parseStatus: v.union(v.literal('ready'), v.literal('failed')),
  parseError: v.optional(v.string()),
  proposedEntries: v.array(personalArchiveProposedEntryValidator),
  rawText: v.string(),
});

const proposalSchema = z.object({
  entries: z.array(z.object({
    bucket: z.enum(['reflection', 'cookie_jar', 'accountability', 'world_model']),
    title: z.string().trim().max(120).optional(),
    content: z.string().trim().min(1).max(2400),
  })).min(1).max(8),
});

function normalizeArchiveText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fallbackBucket(rawText: string): PersonalArchiveBucket {
  const lower = rawText.toLowerCase();
  if (/(won|survived|overcame|endured|proof|resilience|achievement|victory)/.test(lower)) return 'cookie_jar';
  if (/(accountable|mirror|discipline|standard|must|non-negotiable|promise)/.test(lower)) return 'accountability';
  if (/(belief|theory|framework|world|people|system|model)/.test(lower)) return 'world_model';
  return 'reflection';
}

function bucketInstructionLines(forcedBucket?: PersonalArchiveBucket): string[] {
  if (forcedBucket) {
    return [
      `Route every entry into exactly one bucket: ${forcedBucket}.`,
      `The bucket is fixed for this capture. Every returned entry must use "${forcedBucket}".`,
    ];
  }
  return [
    'Each entry must use exactly one bucket from this set:',
    '- reflection: insight, lesson, pattern, realization',
    '- cookie_jar: proof of resilience, wins, survived hard things, earned confidence',
    '- accountability: standards, hard truths, commitments, mirror statements',
    '- world_model: theories, beliefs, frameworks about life, work, people, or systems',
  ];
}

async function proposeEntries(rawText: string, forcedBucket?: PersonalArchiveBucket) {
  const target = modelRegistry.resolve('archiveParse');
  const model = createChatModel(target, { temperature: 0.1, thinkingBudget: 2048 });
  const prompt = [
    'Split the user-authored text into high-signal Personal Archive items.',
    'Return JSON only with an "entries" array.',
    ...bucketInstructionLines(forcedBucket),
    'Create as many entries as needed to capture all the distinct(non mutually exclusive) ideas in the source..',
    'Keep each entry close to the source phrasing. Do not rewrite into generic advice.',
    'be truthful to the source text, in terms of how it is written. do not add or remove or change any meaning.',
    '',
    'User text:',
    rawText.slice(0, 16000),
  ].join('\n');

  const parsed = await invokeStructured(model, prompt, proposalSchema);
  return parsed.entries.map((entry) => ({
    bucket: entry.bucket,
    title: entry.title?.trim() || undefined,
    content: entry.content.trim(),
  }));
}

export const previewCapture = action({
  args: {
    sourceType: personalArchiveSourceTypeValidator,
    rawText: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    originalLabel: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    forcedBucket: v.optional(personalArchiveBucketValidator),
  },
  returns: previewResultValidator,
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const captureId = await (ctx.runMutation as any)('personalArchive:createCapture', {
      sourceType: args.sourceType,
      rawText: args.rawText,
      storageId: args.storageId,
      originalLabel: args.originalLabel,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
    });

    try {
      const extracted = args.storageId
        ? await extractTextFromStorage(ctx, {
          storageId: args.storageId,
          displayName: args.originalLabel || 'archive-file',
          mimeType: args.mimeType,
        })
        : normalizeArchiveText(args.rawText ?? '');

      if (!extracted) {
        throw new Error('No text could be extracted from this capture.');
      }

      let proposedEntries;
      try {
        proposedEntries = await proposeEntries(extracted, args.forcedBucket);
      } catch {
        proposedEntries = [
          {
            bucket: args.forcedBucket ?? fallbackBucket(extracted),
            title: args.originalLabel?.trim() || undefined,
            content: extracted.slice(0, 2400),
          },
        ];
      }
      if (args.forcedBucket) {
        proposedEntries = proposedEntries.map((entry) => ({
          ...entry,
          bucket: args.forcedBucket!,
        }));
      }

      const capture = await (ctx.runMutation as any)('personalArchive:patchCapture', {
        captureId,
        rawText: extracted,
        parseStatus: 'ready',
        parseError: '',
        proposedEntries,
      });

      return {
        captureId: capture._id,
        parseStatus: 'ready' as const,
        parseError: undefined,
        proposedEntries: capture.proposedEntries,
        rawText: capture.rawText ?? extracted,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not process capture';
      const capture = await (ctx.runMutation as any)('personalArchive:patchCapture', {
        captureId,
        parseStatus: 'failed',
        parseError: message,
        proposedEntries: [],
      });
      return {
        captureId: capture._id,
        parseStatus: 'failed' as const,
        parseError: message,
        proposedEntries: [],
        rawText: capture.rawText ?? '',
      };
    }
  },
});

export const commitCaptureEntries = action({
  args: {
    captureId: v.id('personalArchiveCaptures'),
    entries: v.array(personalArchiveProposedEntryValidator),
  },
  returns: v.array(v.id('personalArchiveEntries')),
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const capture = await (ctx.runQuery as any)('personalArchive:getCapture', {
      captureId: args.captureId,
    });
    if (!capture) {
      throw new Error('Capture not found');
    }
    if (capture.parseStatus === 'committed') {
      throw new Error('Capture already committed');
    }

    const entryIds: Array<any> = [];
    for (const item of args.entries) {
      const entry = await (ctx.runMutation as any)('personalArchive:createEntry', {
        captureId: args.captureId,
        bucket: item.bucket,
        title: item.title,
        content: item.content,
      });
      entryIds.push(entry._id);
      await indexPersonalArchiveEntry(ctx, {
        entryId: entry._id,
        bucket: item.bucket,
        title: item.title,
        text: item.content,
      });
    }

    await (ctx.runMutation as any)('personalArchive:patchCapture', {
      captureId: args.captureId,
      parseStatus: 'committed',
      committedAt: Date.now(),
      proposedEntries: args.entries,
    });
    return entryIds;
  },
});

export const updateEntry = action({
  args: {
    entryId: v.id('personalArchiveEntries'),
    bucket: personalArchiveBucketValidator,
    title: v.optional(v.string()),
    content: v.string(),
  },
  returns: v.object({
    entryId: v.id('personalArchiveEntries'),
    chunkCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const updated = await (ctx.runMutation as any)('personalArchive:updateEntry', {
      entryId: args.entryId,
      bucket: args.bucket,
      title: args.title,
      content: args.content,
    });
    const indexed = await indexPersonalArchiveEntry(ctx, {
      entryId: updated._id,
      bucket: updated.bucket,
      title: updated.title,
      text: updated.content,
    });
    return {
      entryId: updated._id,
      chunkCount: indexed.chunkCount,
    };
  },
});

export const archiveEntry = action({
  args: {
    entryId: v.id('personalArchiveEntries'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    await (ctx.runMutation as any)('personalArchive:updateEntry', {
      entryId: args.entryId,
      archivedAt: Date.now(),
    });
    await deletePersonalArchiveEntryIndex(ctx, { entryId: args.entryId });
    return null;
  },
});

export const deleteEntry = action({
  args: {
    entryId: v.id('personalArchiveEntries'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    await (ctx.runMutation as any)('personalArchive:updateEntry', {
      entryId: args.entryId,
      deletedAt: Date.now(),
    });
    await deletePersonalArchiveEntryIndex(ctx, { entryId: args.entryId });
    return null;
  },
});
