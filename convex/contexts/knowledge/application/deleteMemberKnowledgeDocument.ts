'use node';

import { requireAuthUser } from '../../shared/auth';
import type { DeleteMemberKnowledgeDocumentInput } from '../contracts';
import { deleteKnowledgeDocument } from '../infrastructure/knowledgeRepo';

export async function deleteMemberKnowledgeDocumentUseCase(ctx: any, args: DeleteMemberKnowledgeDocumentInput) {
  await requireAuthUser(ctx);
  const documents = await deleteKnowledgeDocument(ctx, args.memberId, args.documentName);
  return { ok: true, documents };
}
