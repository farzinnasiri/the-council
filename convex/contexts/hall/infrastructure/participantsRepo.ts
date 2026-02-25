'use node';

import { api } from '../../../_generated/api';
import type { Id } from '../../../_generated/dataModel';
import { runApiQuery } from '../../shared/convexGateway';
import type { ActionCtxLike, ParticipantRow } from '../../shared/types';

export async function listActiveParticipants(
  ctx: ActionCtxLike,
  conversationId: Id<'conversations'>
): Promise<ParticipantRow[]> {
  return await runApiQuery<ParticipantRow[]>(ctx, api.conversations.listParticipants, {
    conversationId,
    includeRemoved: false,
  });
}
