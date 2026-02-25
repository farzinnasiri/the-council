'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { stagedUploadInputValidator } from '../contexts/shared/contracts';
import { ensureMemberKnowledgeStoreUseCase } from '../contexts/knowledge/application/ensureMemberKnowledgeStore';
import { uploadMemberDocumentsUseCase } from '../contexts/knowledge/application/uploadMemberDocuments';
import { listMemberKnowledgeDocumentsUseCase } from '../contexts/knowledge/application/listMemberKnowledgeDocuments';
import { deleteMemberKnowledgeDocumentUseCase } from '../contexts/knowledge/application/deleteMemberKnowledgeDocument';
import { rehydrateMemberKnowledgeStoreUseCase } from '../contexts/knowledge/application/rehydrateMemberKnowledgeStore';
import { purgeExpiredStagedKnowledgeDocumentsUseCase } from '../contexts/knowledge/application/purgeExpiredStagedKnowledgeDocuments';
import { rebuildMemberKnowledgeDigestsUseCase } from '../contexts/knowledge/application/rebuildMemberKnowledgeDigests';

export const ensureMemberKnowledgeStore = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => await ensureMemberKnowledgeStoreUseCase(ctx, args),
});

export const uploadMemberDocuments = action({
  args: {
    memberId: v.id('members'),
    stagedFiles: v.array(stagedUploadInputValidator),
  },
  handler: async (ctx, args) => await uploadMemberDocumentsUseCase(ctx, args),
});

export const listMemberKnowledgeDocuments = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => await listMemberKnowledgeDocumentsUseCase(ctx, args),
});

export const deleteMemberKnowledgeDocument = action({
  args: {
    memberId: v.id('members'),
    documentName: v.string(),
  },
  handler: async (ctx, args) => await deleteMemberKnowledgeDocumentUseCase(ctx, args),
});

export const rehydrateMemberKnowledgeStore = action({
  args: {
    memberId: v.id('members'),
    mode: v.optional(v.union(v.literal('missing-only'), v.literal('all'))),
  },
  handler: async (ctx, args) => await rehydrateMemberKnowledgeStoreUseCase(ctx, args),
});

export const purgeExpiredStagedKnowledgeDocuments = action({
  args: {
    memberId: v.optional(v.id('members')),
  },
  handler: async (ctx, args) => await purgeExpiredStagedKnowledgeDocumentsUseCase(ctx, args),
});

export const rebuildMemberKnowledgeDigests = action({
  args: {
    memberId: v.id('members'),
  },
  handler: async (ctx, args) => await rebuildMemberKnowledgeDigestsUseCase(ctx, args),
});
