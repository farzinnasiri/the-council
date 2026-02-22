'use node';

import type { Id } from '../_generated/dataModel';
import { api } from '../_generated/api';
import { GeminiService, sanitizeLabel } from './geminiService';
import { requireOwnedMember } from './ownership';
import { extractTextFromStorage } from './ragExtraction';
import { deleteDocumentChunks, indexDocumentChunks, listMemberChunkDocuments } from './ragStore';

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

function resolveStoreName(memberId: Id<'members'>): string {
  return `convex-rag/member/${memberId}`;
}

function buildDocumentName(storeName: string, file: { displayName: string; storageId: Id<'_storage'> }): string {
  const display = sanitizeLabel(file.displayName || 'document');
  const suffix = `${file.storageId}`.slice(-12).replace(/[^a-z0-9]+/gi, '').toLowerCase();
  return `${storeName}/documents/${display}-${suffix || 'file'}`;
}

async function readStorageSampleText(
  ctx: any,
  storageId: Id<'_storage'>,
  mimeType?: string,
  displayName?: string
): Promise<string | undefined> {
  if (!displayName) return undefined;
  try {
    const extracted = await extractTextFromStorage(ctx, { storageId, displayName, mimeType });
    return extracted.slice(0, DIGEST_SAMPLE_CHAR_LIMIT);
  } catch {
    return undefined;
  }
}

async function upsertDigestFromDocument(
  ctx: any,
  service: GeminiService,
  input: {
    memberId: Id<'members'>;
    kbStoreName: string;
    kbDocumentName?: string;
    displayName: string;
    storageId?: Id<'_storage'>;
    mimeType?: string;
    memberSystemPrompt?: string;
    sampleText?: string;
  }
): Promise<void> {
  const sampleText =
    input.sampleText ??
    (input.storageId
      ? await readStorageSampleText(ctx, input.storageId, input.mimeType, input.displayName)
      : undefined);

  const digest = await service.summarizeDocumentDigest({
    displayName: input.displayName,
    sampleText,
    memberSystemPrompt: input.memberSystemPrompt,
  });

  await ctx.runMutation(api.kbDigests.upsertForDocument as any, {
    memberId: input.memberId,
    kbStoreName: input.kbStoreName,
    kbDocumentName: input.kbDocumentName,
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
    kbDocumentName?: string;
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
    kbStoreName: storeName,
    status,
    kbDocumentName: options?.kbDocumentName,
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
    kbDocumentName?: string;
    ingestError?: string;
    ingestedAt?: number;
    deletedAt?: number;
  }
): Promise<void> {
  await ctx.runMutation(api.kbStagedDocuments.updateRecord, {
    recordId,
    status: update.status,
    kbDocumentName: update.kbDocumentName,
    ingestError: update.ingestError,
    ingestedAt: update.ingestedAt,
    deletedAt: update.deletedAt,
  });
}

export async function ensureMemberStore(ctx: any, memberId: Id<'members'>) {
  const member = await requireOwnedMember(ctx, memberId);
  const deterministicStore = resolveStoreName(memberId);
  const storeName =
    member.kbStoreName && member.kbStoreName.startsWith('convex-rag/member/')
      ? member.kbStoreName
      : deterministicStore;
  const created = member.kbStoreName !== storeName;

  if (created) {
    await ctx.runMutation(api.members.setStoreName, {
      memberId,
      storeName,
    });
  }

  return {
    member,
    storeName,
    created,
  };
}

export async function listMemberDocuments(ctx: any, memberId: Id<'members'>) {
  const member = await requireOwnedMember(ctx, memberId);
  if (!member.kbStoreName) {
    return [] as Array<{ name?: string; displayName?: string }>;
  }

  return await listMemberChunkDocuments(ctx, { memberId });
}

export async function deleteMemberDocument(
  ctx: any,
  memberId: Id<'members'>,
  documentName: string
): Promise<Array<{ name?: string; displayName?: string }>> {
  const member = await requireOwnedMember(ctx, memberId);
  if (!member.kbStoreName) {
    return [];
  }

  await deleteDocumentChunks(ctx, {
    memberId,
    documentName,
  });
  await ctx.runMutation(api.kbDigests.markDeletedByDocument as any, {
    memberId,
    kbDocumentName: documentName,
  });
  return await listMemberChunkDocuments(ctx, { memberId });
}

export async function uploadStagedDocuments(
  ctx: any,
  service: GeminiService,
  memberId: Id<'members'>,
  stagedFiles: StagedUploadInput[]
): Promise<{ storeName: string; documents: Array<{ name?: string; displayName?: string }> }> {
  const { storeName, member } = await ensureMemberStore(ctx, memberId);
  const existing = await listMemberChunkDocuments(ctx, { memberId });
  const existingByDisplay = new Map(
    existing
      .filter((doc) => doc.displayName)
      .map((doc) => [doc.displayName!.trim().toLowerCase(), doc.name])
  );
  const existingNames = new Set(existingByDisplay.keys());

  const digestCandidates: Array<{
    file: StagedUploadInput;
    documentName: string;
    sampleText?: string;
  }> = [];

  for (const file of stagedFiles) {
    const normalizedName = file.displayName.trim().toLowerCase();
    const documentName = buildDocumentName(storeName, file);
    const recordId = await createIngestRecord(ctx, memberId, storeName, file, 'staged', {
      kbDocumentName: documentName,
    });

    if (normalizedName && existingNames.has(normalizedName)) {
      await patchIngestRecord(ctx, recordId, {
        status: 'skipped_duplicate',
        kbDocumentName: existingByDisplay.get(normalizedName) ?? documentName,
        ingestedAt: Date.now(),
      });
      continue;
    }

    try {
      const extractedText = await extractTextFromStorage(ctx, {
        storageId: file.storageId,
        displayName: file.displayName,
        mimeType: file.mimeType,
      });
      await indexDocumentChunks(ctx, {
        memberId,
        storeName,
        documentName,
        displayName: file.displayName,
        text: extractedText,
      });

      existingNames.add(normalizedName);
      existingByDisplay.set(normalizedName, documentName);
      await patchIngestRecord(ctx, recordId, {
        status: 'ingested',
        kbDocumentName: documentName,
        ingestedAt: Date.now(),
      });
      digestCandidates.push({
        file,
        documentName,
        sampleText: extractedText.slice(0, DIGEST_SAMPLE_CHAR_LIMIT),
      });
    } catch (error) {
      await patchIngestRecord(ctx, recordId, {
        status: 'failed',
        kbDocumentName: documentName,
        ingestError: error instanceof Error ? error.message : 'Upload failed',
      });
      throw error;
    }
  }

  for (const item of digestCandidates) {
    await upsertDigestFromDocument(ctx, service, {
      memberId,
      kbStoreName: storeName,
      kbDocumentName: item.documentName,
      displayName: item.file.displayName,
      storageId: item.file.storageId,
      mimeType: item.file.mimeType,
      memberSystemPrompt: member.systemPrompt,
      sampleText: item.sampleText,
    });
  }

  const documents = await listMemberChunkDocuments(ctx, { memberId });
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
  const { storeName, member } = await ensureMemberStore(ctx, memberId);
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

  const existing = await listMemberChunkDocuments(ctx, { memberId });
  const existingNames = new Set(
    existing.map((doc) => (doc.displayName ?? '').trim().toLowerCase()).filter(Boolean)
  );

  let rehydratedCount = 0;
  let skippedCount = 0;
  const digestCandidates: Array<{
    file: StagedUploadInput;
    documentName: string;
    sampleText?: string;
  }> = [];

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
    const documentName = row.kbDocumentName ?? buildDocumentName(storeName, stagedFile);

    const extractedText = await extractTextFromStorage(ctx, {
      storageId: stagedFile.storageId,
      displayName: stagedFile.displayName,
      mimeType: stagedFile.mimeType,
    });
    await indexDocumentChunks(ctx, {
      memberId,
      storeName,
      documentName,
      displayName: stagedFile.displayName,
      text: extractedText,
    });

    await createIngestRecord(ctx, memberId, storeName, stagedFile, 'rehydrated', {
      kbDocumentName: documentName,
      ingestedAt: Date.now(),
    });
    rehydratedCount += 1;
    if (normalizedName) existingNames.add(normalizedName);
    digestCandidates.push({
      file: stagedFile,
      documentName,
      sampleText: extractedText.slice(0, DIGEST_SAMPLE_CHAR_LIMIT),
    });
  }

  for (const item of digestCandidates) {
    await upsertDigestFromDocument(ctx, service, {
      memberId,
      kbStoreName: storeName,
      kbDocumentName: item.documentName,
      displayName: item.file.displayName,
      storageId: item.file.storageId,
      mimeType: item.file.mimeType,
      memberSystemPrompt: member.systemPrompt,
      sampleText: item.sampleText,
    });
  }

  const documents = await listMemberChunkDocuments(ctx, { memberId });
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
  const { storeName, member } = await ensureMemberStore(ctx, memberId);
  const documents = await listMemberChunkDocuments(ctx, { memberId });
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
      kbStoreName: storeName,
      kbDocumentName: doc.name,
      displayName,
      storageId: staged?.storageId,
      mimeType: staged?.mimeType,
      memberSystemPrompt: member.systemPrompt,
    });
    rebuiltCount += 1;
  }

  return { rebuiltCount, skippedCount, storeName };
}
