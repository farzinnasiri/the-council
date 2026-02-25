'use node';

import { api } from '../../../_generated/api';
import type { Id } from '../../../_generated/dataModel';
import { runApiQuery } from '../../shared/convexGateway';
import type { ActionCtxLike, MessageRow } from '../../shared/types';

export async function listActiveMessages(
  ctx: ActionCtxLike,
  conversationId: Id<'conversations'>
): Promise<MessageRow[]> {
  return await runApiQuery<MessageRow[]>(ctx, api.messages.listActive, { conversationId });
}

export async function listAllMessages(
  ctx: ActionCtxLike,
  conversationId: Id<'conversations'>
): Promise<MessageRow[]> {
  return await runApiQuery<MessageRow[]>(ctx, api.messages.listAll, { conversationId });
}
