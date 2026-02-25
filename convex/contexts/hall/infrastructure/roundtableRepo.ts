'use node';

import type { Id } from '../../../_generated/dataModel';
import { runNamedMutation, runNamedQuery } from '../../shared/convexGateway';
import type { ActionCtxLike, RoundtableState } from '../../shared/types';

export async function getRoundtableState(
  ctx: ActionCtxLike,
  conversationId: Id<'conversations'>
): Promise<RoundtableState | null> {
  return await runNamedQuery<RoundtableState | null>(ctx, 'hallRounds:getRoundtableState', {
    conversationId,
  });
}

export async function createRoundWithIntents(
  ctx: ActionCtxLike,
  args: {
    conversationId: Id<'conversations'>;
    trigger: 'user_message' | 'continue';
    triggerMessageId?: Id<'messages'>;
    maxSpeakers: number;
    intents: Array<{
      memberId: Id<'members'>;
      intent: 'speak' | 'challenge' | 'support' | 'pass';
      targetMemberId?: Id<'members'>;
      rationale: string;
      selected: boolean;
      source: 'mention' | 'intent_default' | 'user_manual';
    }>;
  }
): Promise<RoundtableState> {
  return await runNamedMutation<RoundtableState>(ctx, 'hallRounds:createRoundWithIntents', args);
}
