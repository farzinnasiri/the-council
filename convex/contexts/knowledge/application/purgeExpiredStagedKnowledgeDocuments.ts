'use node';

import { requireAuthUser } from '../../shared/auth';
import type { PurgeExpiredStagedKnowledgeDocumentsInput } from '../contracts';
import { purgeExpiredKnowledgeDocuments } from '../infrastructure/knowledgeRepo';

export async function purgeExpiredStagedKnowledgeDocumentsUseCase(
  ctx: any,
  args: PurgeExpiredStagedKnowledgeDocumentsInput
) {
  await requireAuthUser(ctx);
  return await purgeExpiredKnowledgeDocuments(ctx, args.memberId);
}
