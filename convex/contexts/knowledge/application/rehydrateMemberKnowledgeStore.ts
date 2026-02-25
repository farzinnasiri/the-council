'use node';

import { requireAuthUser } from '../../shared/auth';
import type { RehydrateMemberKnowledgeStoreInput } from '../contracts';
import { createKnowledgeAiProvider } from '../infrastructure/knowledgeIngestGateway';
import { rehydrateKnowledgeStore } from '../infrastructure/knowledgeRepo';

export async function rehydrateMemberKnowledgeStoreUseCase(ctx: any, args: RehydrateMemberKnowledgeStoreInput) {
  await requireAuthUser(ctx);
  const service = createKnowledgeAiProvider();
  return await rehydrateKnowledgeStore(ctx, service, args.memberId, args.mode ?? 'missing-only');
}
