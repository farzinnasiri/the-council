'use node';

import { requireAuthUser } from '../../shared/auth';
import type { RebuildMemberKnowledgeDigestsInput } from '../contracts';
import { createKnowledgeAiProvider } from '../infrastructure/knowledgeIngestGateway';
import { rebuildKnowledgeDigests } from '../infrastructure/knowledgeRepo';

export async function rebuildMemberKnowledgeDigestsUseCase(ctx: any, args: RebuildMemberKnowledgeDigestsInput) {
  await requireAuthUser(ctx);
  const service = createKnowledgeAiProvider();
  return await rebuildKnowledgeDigests(ctx, service, args.memberId);
}
