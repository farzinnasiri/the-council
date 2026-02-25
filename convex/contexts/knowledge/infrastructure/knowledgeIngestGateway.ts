'use node';

import type { Id } from '../../../_generated/dataModel';
import { createAiProvider, createKnowledgeRetriever, toKBDigestHints } from '../../shared/convexGateway';

export function createKnowledgeAiProvider() {
  return createAiProvider();
}

export { createKnowledgeRetriever, toKBDigestHints };

export function memberKnowledgeStoreName(memberId: Id<'members'>): string {
  return `convex-rag/member/${memberId}`;
}
