'use node';

import type { Id } from '../../../_generated/dataModel';
import { runNamedQuery } from '../../shared/convexGateway';
import type { ActionCtxLike } from '../../shared/types';

export interface HallRoundSummaryRow {
  roundNumber?: number;
  memory?: string;
}

export async function listHallRoundSummaries(
  ctx: ActionCtxLike,
  conversationId: Id<'conversations'>
): Promise<HallRoundSummaryRow[]> {
  return await runNamedQuery<HallRoundSummaryRow[]>(ctx, 'memoryLogs:listByConversationScope', {
    conversationId,
    scope: 'hall',
  });
}
