'use node';

import { requireAuthUser } from '../../shared/auth';
import type { ListMemberKnowledgeDocumentsInput } from '../contracts';
import { listKnowledgeDocuments } from '../infrastructure/knowledgeRepo';

export async function listMemberKnowledgeDocumentsUseCase(ctx: any, args: ListMemberKnowledgeDocumentsInput) {
  await requireAuthUser(ctx);
  return await listKnowledgeDocuments(ctx, args.memberId);
}
