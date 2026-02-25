'use node';

import type { Id } from '../../../_generated/dataModel';
import {
  deleteMemberDocument,
  ensureMemberStore,
  listMemberDocuments,
  purgeExpiredStagedDocuments,
  rebuildMemberDigests,
  rehydrateMemberStore,
  uploadStagedDocuments,
} from '../../../ai/kbIngest';
import type { CouncilAiProvider } from '../../../ai/provider/types';

export async function ensureMemberKnowledgeStore(ctx: any, memberId: Id<'members'>) {
  return await ensureMemberStore(ctx, memberId);
}

export async function uploadKnowledgeDocuments(
  ctx: any,
  service: Pick<CouncilAiProvider, 'summarizeDocumentDigest'>,
  memberId: Id<'members'>,
  stagedFiles: Array<{
    storageId: Id<'_storage'>;
    displayName: string;
    mimeType?: string;
    sizeBytes?: number;
  }>
) {
  return await uploadStagedDocuments(ctx, service, memberId, stagedFiles);
}

export async function listKnowledgeDocuments(ctx: any, memberId: Id<'members'>) {
  return await listMemberDocuments(ctx, memberId);
}

export async function deleteKnowledgeDocument(ctx: any, memberId: Id<'members'>, documentName: string) {
  return await deleteMemberDocument(ctx, memberId, documentName);
}

export async function rehydrateKnowledgeStore(
  ctx: any,
  service: Pick<CouncilAiProvider, 'summarizeDocumentDigest'>,
  memberId: Id<'members'>,
  mode: 'missing-only' | 'all' = 'missing-only'
) {
  return await rehydrateMemberStore(ctx, service, memberId, mode);
}

export async function purgeExpiredKnowledgeDocuments(ctx: any, memberId?: Id<'members'>) {
  return await purgeExpiredStagedDocuments(ctx, memberId);
}

export async function rebuildKnowledgeDigests(
  ctx: any,
  service: Pick<CouncilAiProvider, 'summarizeDocumentDigest'>,
  memberId: Id<'members'>
) {
  return await rebuildMemberDigests(ctx, service, memberId);
}
