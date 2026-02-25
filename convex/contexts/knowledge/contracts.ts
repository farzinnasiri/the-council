'use node';

import type { Id } from '../../_generated/dataModel';

export interface EnsureMemberKnowledgeStoreInput {
  memberId: Id<'members'>;
}

export interface UploadMemberDocumentsInput {
  memberId: Id<'members'>;
  stagedFiles: Array<{
    storageId: Id<'_storage'>;
    displayName: string;
    mimeType?: string;
    sizeBytes?: number;
  }>;
}

export interface ListMemberKnowledgeDocumentsInput {
  memberId: Id<'members'>;
}

export interface DeleteMemberKnowledgeDocumentInput {
  memberId: Id<'members'>;
  documentName: string;
}

export interface RehydrateMemberKnowledgeStoreInput {
  memberId: Id<'members'>;
  mode?: 'missing-only' | 'all';
}

export interface PurgeExpiredStagedKnowledgeDocumentsInput {
  memberId?: Id<'members'>;
}

export interface RebuildMemberKnowledgeDigestsInput {
  memberId: Id<'members'>;
}

export interface KnowledgeApplicationService {
  ensureMemberKnowledgeStore(input: EnsureMemberKnowledgeStoreInput): Promise<{ storeName: string; created: boolean }>;
  uploadMemberDocuments(input: UploadMemberDocumentsInput): Promise<{ storeName: string; documents: Array<{ name?: string; displayName?: string }> }>;
  listMemberKnowledgeDocuments(input: ListMemberKnowledgeDocumentsInput): Promise<Array<{ name?: string; displayName?: string }>>;
  deleteMemberKnowledgeDocument(input: DeleteMemberKnowledgeDocumentInput): Promise<{ ok: boolean; documents?: Array<{ name?: string; displayName?: string }> }>;
  rehydrateMemberKnowledgeStore(input: RehydrateMemberKnowledgeStoreInput): Promise<{
    storeName: string;
    rehydratedCount: number;
    skippedCount: number;
    documents: Array<{ name?: string; displayName?: string }>;
  }>;
  purgeExpiredStagedKnowledgeDocuments(input: PurgeExpiredStagedKnowledgeDocumentsInput): Promise<{ purgedCount: number }>;
  rebuildMemberKnowledgeDigests(input: RebuildMemberKnowledgeDigestsInput): Promise<{ rebuiltCount: number; skippedCount: number; storeName: string }>;
}
