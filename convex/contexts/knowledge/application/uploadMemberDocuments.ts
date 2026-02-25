'use node';

import { requireAuthUser } from '../../shared/auth';
import type { UploadMemberDocumentsInput } from '../contracts';
import { createKnowledgeAiProvider } from '../infrastructure/knowledgeIngestGateway';
import { uploadKnowledgeDocuments } from '../infrastructure/knowledgeRepo';

export async function uploadMemberDocumentsUseCase(ctx: any, args: UploadMemberDocumentsInput) {
  await requireAuthUser(ctx);
  if (args.stagedFiles.length === 0) {
    throw new Error('No staged files provided');
  }

  const service = createKnowledgeAiProvider();
  return await uploadKnowledgeDocuments(ctx, service, args.memberId, args.stagedFiles);
}
