'use node';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Id } from '../_generated/dataModel';
import { api } from '../_generated/api';
import { GeminiService, sanitizeLabel } from './geminiService';
import { requireOwnedMember } from './ownership';

export const KB_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const DIGEST_SAMPLE_CHAR_LIMIT = 6000;

export interface StagedUploadInput {
  storageId: Id<'_storage'>;
  displayName: string;
  mimeType?: string;
  sizeBytes?: number;
}

function normalizeDigestItems(items: string[], min: number, max: number): string[] {
  return items
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => item.slice(0, 80))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, max)
    .slice(0, Math.max(min, Math.min(max, items.length || min)));
}

async function writeStorageBlobToTemp(ctx: any, storageId: Id<'_storage'>, displayName: string): Promise<string> {
  const blob = await ctx.storage.get(storageId);
  if (!blob) {
    throw new Error(`Staged file not found in storage: ${storageId}`);
  }

  const ext = path.extname(displayName) || '.bin';
  const tempPath = path.join(os.tmpdir(), `council-kb-${crypto.randomUUID()}${ext}`);
  const bytes = Buffer.from(await blob.arrayBuffer());
  await fs.writeFile(tempPath, bytes);
  return tempPath;
}

async function readStorageSampleText(
  ctx: any,
  storageId: Id<'_storage'>,
  mimeType?: string,
  displayName?: string
): Promise<string | undefined> {
  const blob = await ctx.storage.get(storageId);
  if (!blob) return undefined;
  const bytes = Buffer.from(await blob.arrayBuffer());
  const ext = (displayName ? path.extname(displayName).toLowerCase() : '') || '';
  const isTextLike =
    Boolean(mimeType?.startsWith('text/')) ||
    ['.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.rtf'].includes(ext);

  if (!isTextLike && bytes.length > 200_000) {
    return undefined;
  }

  const raw = bytes.toString('utf8');
  const cleaned = raw
    .replace(/\0/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return undefined;
  return cleaned.slice(0, DIGEST_SAMPLE_CHAR_LIMIT);
}

async function upsertDigestFromDocument(
  ctx: any,
  service: GeminiService,
  input: {
    memberId: Id<'members'>;
    geminiStoreName: string;
    geminiDocumentName?: string;
    displayName: string;
    storageId?: Id<'_storage'>;
    mimeType?: string;
    memberSystemPrompt?: string;
  }
): Promise<void> {
  const sampleText = input.storageId
    ? await readStorageSampleText(ctx, input.storageId, input.mimeType, input.displayName)
    : undefined;

  const digest = await service.summarizeDocumentDigest({
    displayName: input.displayName,
    sampleText,
    memberSystemPrompt: input.memberSystemPrompt,
  });

  await ctx.runMutation(api.kbDigests.upsertForDocument as any, {
    memberId: input.memberId,
    geminiStoreName: input.geminiStoreName,
    geminiDocumentName: input.geminiDocumentName,
    displayName: input.displayName,
    storageId: input.storageId,
    topics: normalizeDigestItems(digest.topics, 3, 8),
    entities: normalizeDigestItems(digest.entities, 3, 12),
    lexicalAnchors: normalizeDigestItems(digest.lexicalAnchors, 3, 12),
    styleAnchors: normalizeDigestItems(digest.styleAnchors, 3, 8),
    digestSummary: digest.digestSummary.slice(0, 300),
    status: 'active',
    updatedAt: Date.now(),
    deletedAt: undefined,
  });
}

async function createIngestRecord(
  ctx: any,
  memberId: Id<'members'>,
  storeName: string,
  file: StagedUploadInput,
  status: 'staged' | 'ingested' | 'skipped_duplicate' | 'failed' | 'rehydrated',
  options?: {
    geminiDocumentName?: string;
    ingestError?: string;
    ingestedAt?: number;
    createdAt?: number;
    expiresAt?: number;
  }
): Promise<Id<'kbStagedDocuments'>> {
  const createdAt = options?.createdAt ?? Date.now();
  const expiresAt = options?.expiresAt ?? createdAt + KB_RETENTION_MS;
  return await ctx.runMutation(api.kbStagedDocuments.createRecord, {
    memberId,
    storageId: file.storageId,
    displayName: file.displayName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    geminiStoreName: storeName,
    status,
    geminiDocumentName: options?.geminiDocumentName,
    ingestError: options?.ingestError,
    createdAt,
    ingestedAt: options?.ingestedAt,
    expiresAt,
  });
}

async function patchIngestRecord(
  ctx: any,
  recordId: Id<'kbStagedDocuments'>,
  update: {
    status: 'staged' | 'ingested' | 'skipped_duplicate' | 'failed' | 'rehydrated' | 'purged';
    geminiDocumentName?: string;
    ingestError?: string;
    ingestedAt?: number;
    deletedAt?: number;
  }
): Promise<void> {
  await ctx.runMutation(api.kbStagedDocuments.updateRecord, {
    recordId,
    status: update.status,
    geminiDocumentName: update.geminiDocumentName,
    ingestError: update.ingestError,
    ingestedAt: update.ingestedAt,
    deletedAt: update.deletedAt,
  });
}

export async function ensureMemberStore(ctx: any, service: GeminiService, memberId: Id<'members'>) {
  const member = await requireOwnedMember(ctx, memberId);
  const ensured = await service.ensureKnowledgeBase({
    storeName: member.kbStoreName ?? null,
    displayName: `council-${sanitizeLabel(member.name)}-${member._id.slice(0, 6)}`,
  });

  if (member.kbStoreName !== ensured.storeName) {
    await ctx.runMutation(api.members.setStoreName, {
      memberId,
      storeName: ensured.storeName,
    });
  }

  return {
    member,
    storeName: ensured.storeName,
    created: ensured.created,
  };
}

export async function listMemberDocuments(ctx: any, service: GeminiService, memberId: Id<'members'>) {
  const member = await requireOwnedMember(ctx, memberId);
  if (!member.kbStoreName) {
    return [] as Array<{ name?: string; displayName?: string }>;
  }

  return await service.listDocumentsFromStore(member.kbStoreName);
}

export async function deleteMemberDocument(
  ctx: any,
  service: GeminiService,
  memberId: Id<'members'>,
  documentName: string
): Promise<Array<{ name?: string; displayName?: string }>> {
  const member = await requireOwnedMember(ctx, memberId);
  if (!member.kbStoreName) {
    return [];
  }

  await service.deleteDocumentByName(documentName, true);
  await ctx.runMutation(api.kbDigests.markDeletedByDocument as any, {
    memberId,
    geminiDocumentName: documentName,
    deletedAt: Date.now(),
  });
  return await service.listDocumentsFromStore(member.kbStoreName);
}

export async function uploadStagedDocuments(
  ctx: any,
  service: GeminiService,
  memberId: Id<'members'>,
  stagedFiles: StagedUploadInput[]
): Promise<{ storeName: string; documents: Array<{ name?: string; displayName?: string }> }> {
  const { storeName, member } = await ensureMemberStore(ctx, service, memberId);
  const existing = await service.listDocumentsFromStore(storeName);
  const existingNames = new Set(
    existing.map((doc) => (doc.displayName ?? '').trim().toLowerCase()).filter(Boolean)
  );
  const digestCandidates: StagedUploadInput[] = [];

  for (const file of stagedFiles) {
    const normalizedName = file.displayName.trim().toLowerCase();
    const recordId = await createIngestRecord(ctx, memberId, storeName, file, 'staged');

    if (normalizedName && existingNames.has(normalizedName)) {
      await patchIngestRecord(ctx, recordId, {
        status: 'skipped_duplicate',
        ingestedAt: Date.now(),
      });
      continue;
    }

    let tempPath: string | null = null;
    try {
      tempPath = await writeStorageBlobToTemp(ctx, file.storageId, file.displayName);
      await service.uploadDocumentToStore(storeName, tempPath, {
        displayName: file.displayName,
        mimeType: file.mimeType,
        maxTokensPerChunk: 500,
        maxOverlapTokens: 50,
      });

      existingNames.add(normalizedName);
      await patchIngestRecord(ctx, recordId, {
        status: 'ingested',
        ingestedAt: Date.now(),
      });
      digestCandidates.push(file);
    } catch (error) {
      await patchIngestRecord(ctx, recordId, {
        status: 'failed',
        ingestError: error instanceof Error ? error.message : 'Upload failed',
      });
      throw error;
    } finally {
      if (tempPath) {
        await fs.unlink(tempPath).catch(() => undefined);
      }
    }
  }

  const documents = await service.listDocumentsFromStore(storeName);
  const docsByDisplayName = new Map(
    documents
      .filter((doc) => doc.displayName)
      .map((doc) => [doc.displayName!.trim().toLowerCase(), doc.name])
  );

  const recentRows = await ctx.runQuery(api.kbStagedDocuments.listByMember, {
    memberId,
    includeDeleted: false,
  });

  const now = Date.now();
  for (const row of recentRows as Array<any>) {
    if (row.status !== 'ingested' || row.geminiDocumentName) continue;
    const docName = docsByDisplayName.get((row.displayName ?? '').trim().toLowerCase());
    if (!docName) continue;
    await patchIngestRecord(ctx, row._id, {
      status: 'ingested',
      geminiDocumentName: docName,
      ingestedAt: row.ingestedAt ?? now,
    });
  }

  for (const file of digestCandidates) {
    const docName = docsByDisplayName.get(file.displayName.trim().toLowerCase());
    if (!docName) continue;
    await upsertDigestFromDocument(ctx, service, {
      memberId,
      geminiStoreName: storeName,
      geminiDocumentName: docName,
      displayName: file.displayName,
      storageId: file.storageId,
      mimeType: file.mimeType,
      memberSystemPrompt: member.systemPrompt,
    });
  }

  return { storeName, documents };
}

export async function rehydrateMemberStore(
  ctx: any,
  service: GeminiService,
  memberId: Id<'members'>,
  mode: 'missing-only' | 'all' = 'missing-only'
): Promise<{
  storeName: string;
  rehydratedCount: number;
  skippedCount: number;
  documents: Array<{ name?: string; displayName?: string }>;
}> {
  const { storeName, member } = await ensureMemberStore(ctx, service, memberId);
  const stagedRows = (await ctx.runQuery(api.kbStagedDocuments.listRehydratableByMember, {
    memberId,
  })) as Array<any>;

  const latestByStorageAndName = new Map<string, any>();
  for (const row of stagedRows) {
    const key = `${row.storageId}:${(row.displayName ?? '').trim().toLowerCase()}`;
    const previous = latestByStorageAndName.get(key);
    if (!previous || row.createdAt > previous.createdAt) {
      latestByStorageAndName.set(key, row);
    }
  }

  const deduped = Array.from(latestByStorageAndName.values()).sort((a, b) => a.createdAt - b.createdAt);

  const existing = await service.listDocumentsFromStore(storeName);
  const existingNames = new Set(
    existing.map((doc) => (doc.displayName ?? '').trim().toLowerCase()).filter(Boolean)
  );

  let rehydratedCount = 0;
  let skippedCount = 0;
  const digestCandidates: StagedUploadInput[] = [];

  for (const row of deduped) {
    const normalizedName = (row.displayName ?? '').trim().toLowerCase();
    if (mode === 'missing-only' && normalizedName && existingNames.has(normalizedName)) {
      skippedCount += 1;
      continue;
    }

    const stagedFile: StagedUploadInput = {
      storageId: row.storageId,
      displayName: row.displayName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    };

    let tempPath: string | null = null;
    try {
      tempPath = await writeStorageBlobToTemp(ctx, stagedFile.storageId, stagedFile.displayName);
      await service.uploadDocumentToStore(storeName, tempPath, {
        displayName: stagedFile.displayName,
        mimeType: stagedFile.mimeType,
        maxTokensPerChunk: 500,
        maxOverlapTokens: 50,
      });

      await createIngestRecord(ctx, memberId, storeName, stagedFile, 'rehydrated', {
        ingestedAt: Date.now(),
      });
      rehydratedCount += 1;
      if (normalizedName) existingNames.add(normalizedName);
      digestCandidates.push(stagedFile);
    } finally {
      if (tempPath) {
        await fs.unlink(tempPath).catch(() => undefined);
      }
    }
  }

  const documents = await service.listDocumentsFromStore(storeName);
  const docsByDisplayName = new Map(
    documents
      .filter((doc) => doc.displayName)
      .map((doc) => [doc.displayName!.trim().toLowerCase(), doc.name])
  );
  for (const file of digestCandidates) {
    const docName = docsByDisplayName.get((file.displayName ?? '').trim().toLowerCase());
    if (!docName) continue;
    await upsertDigestFromDocument(ctx, service, {
      memberId,
      geminiStoreName: storeName,
      geminiDocumentName: docName,
      displayName: file.displayName,
      storageId: file.storageId,
      mimeType: file.mimeType,
      memberSystemPrompt: member.systemPrompt,
    });
  }
  return {
    storeName,
    rehydratedCount,
    skippedCount,
    documents,
  };
}

export async function purgeExpiredStagedDocuments(
  ctx: any,
  memberId?: Id<'members'>
): Promise<{ purgedCount: number }> {
  const now = Date.now();
  const rows = (await ctx.runQuery(api.kbStagedDocuments.listExpired, {
    memberId,
    now,
  })) as Array<any>;

  for (const row of rows) {
    await ctx.storage.delete(row.storageId).catch(() => undefined);
  }

  const purgedCount = await ctx.runMutation(api.kbStagedDocuments.markPurged, {
    recordIds: rows.map((row) => row._id),
    purgedAt: now,
  });

  return { purgedCount };
}

export async function rebuildMemberDigests(
  ctx: any,
  service: GeminiService,
  memberId: Id<'members'>
): Promise<{ rebuiltCount: number; skippedCount: number; storeName: string }> {
  const { storeName, member } = await ensureMemberStore(ctx, service, memberId);
  const documents = await service.listDocumentsFromStore(storeName);
  const stagedRows = (await ctx.runQuery(api.kbStagedDocuments.listByMember, {
    memberId,
    includeDeleted: false,
  })) as Array<any>;

  const latestByDisplay = new Map<string, any>();
  for (const row of stagedRows) {
    const key = (row.displayName ?? '').trim().toLowerCase();
    if (!key) continue;
    const current = latestByDisplay.get(key);
    if (!current || row.createdAt > current.createdAt) {
      latestByDisplay.set(key, row);
    }
  }

  let rebuiltCount = 0;
  let skippedCount = 0;

  for (const doc of documents) {
    const displayName = doc.displayName ?? doc.name;
    if (!displayName) {
      skippedCount += 1;
      continue;
    }
    const staged = latestByDisplay.get(displayName.trim().toLowerCase());
    await upsertDigestFromDocument(ctx, service, {
      memberId,
      geminiStoreName: storeName,
      geminiDocumentName: doc.name,
      displayName,
      storageId: staged?.storageId,
      mimeType: staged?.mimeType,
      memberSystemPrompt: member.systemPrompt,
    });
    rebuiltCount += 1;
  }

  return { rebuiltCount, skippedCount, storeName };
}
