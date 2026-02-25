'use node';

import { requireAuthUser } from '../../shared/auth';
import type { EnsureMemberKnowledgeStoreInput } from '../contracts';
import { ensureMemberKnowledgeStore } from '../infrastructure/knowledgeRepo';

export async function ensureMemberKnowledgeStoreUseCase(ctx: any, args: EnsureMemberKnowledgeStoreInput) {
  await requireAuthUser(ctx);
  const ensured = await ensureMemberKnowledgeStore(ctx, args.memberId);
  return {
    storeName: ensured.storeName,
    created: ensured.created,
  };
}
