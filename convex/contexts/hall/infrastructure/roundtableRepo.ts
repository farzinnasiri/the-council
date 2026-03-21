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

export async function createRoundWithCandidates(
  ctx: ActionCtxLike,
  args: {
    conversationId: Id<'conversations'>;
    trigger: 'user_message' | 'continue';
    triggerMessageId?: Id<'messages'>;
    maxSpeakers: number;
    initialStatus?: 'awaiting_user' | 'completed';
    bids: Array<{
      memberId: Id<'members'>;
      wantsToSpeak: boolean;
      moveType: 'rebuttal' | 'caveat' | 'synthesis' | 'evidence' | 'reframing' | 'clarification' | 'agreement' | 'pass';
      targetMemberId?: Id<'members'>;
      noveltyClaim: string;
      confidence: number;
      estimatedValue: number;
      relevanceScore: number;
      noveltyScore: number;
      tensionScore: number;
      coverageScore: number;
      recencyPenalty: number;
      dominancePenalty: number;
      mentionBoost: number;
      overlapPenalty: number;
      allocatorScore: number;
      allocatorReason: string;
    }>;
    candidates: Array<{
      memberId: Id<'members'>;
      rank: number;
      status: 'shortlisted' | 'speaking' | 'spoken' | 'dismissed';
      moveType: 'rebuttal' | 'caveat' | 'synthesis' | 'evidence' | 'reframing' | 'clarification' | 'agreement' | 'pass';
      targetMemberId?: Id<'members'>;
      rationaleTag: 'pushback' | 'new angle' | 'evidence' | 'synthesis' | 'clarify';
      allocatorReason: string;
      score: number;
      selectedBy: 'allocator' | 'mention_boost' | 'user_manual_fallback';
    }>;
  }
): Promise<RoundtableState> {
  return await runNamedMutation<RoundtableState>(ctx, 'hallRounds:createRoundWithCandidates', args);
}

export async function updateRoundSnapshot(
  ctx: ActionCtxLike,
  args: {
    conversationId: Id<'conversations'>;
    roundNumber: number;
    nextStatus: 'awaiting_user' | 'completed';
    bids: Array<{
      memberId: Id<'members'>;
      wantsToSpeak: boolean;
      moveType: 'rebuttal' | 'caveat' | 'synthesis' | 'evidence' | 'reframing' | 'clarification' | 'agreement' | 'pass';
      targetMemberId?: Id<'members'>;
      noveltyClaim: string;
      confidence: number;
      estimatedValue: number;
      relevanceScore: number;
      noveltyScore: number;
      tensionScore: number;
      coverageScore: number;
      recencyPenalty: number;
      dominancePenalty: number;
      mentionBoost: number;
      overlapPenalty: number;
      allocatorScore: number;
      allocatorReason: string;
    }>;
    candidates: Array<{
      memberId: Id<'members'>;
      rank: number;
      status: 'shortlisted' | 'speaking' | 'spoken' | 'dismissed';
      moveType: 'rebuttal' | 'caveat' | 'synthesis' | 'evidence' | 'reframing' | 'clarification' | 'agreement' | 'pass';
      targetMemberId?: Id<'members'>;
      rationaleTag: 'pushback' | 'new angle' | 'evidence' | 'synthesis' | 'clarify';
      allocatorReason: string;
      score: number;
      selectedBy: 'allocator' | 'mention_boost' | 'user_manual_fallback';
    }>;
  }
): Promise<RoundtableState> {
  return await runNamedMutation<RoundtableState>(ctx, 'hallRounds:updateRoundSnapshot', args);
}

export async function markRoundInProgress(
  ctx: ActionCtxLike,
  args: {
    conversationId: Id<'conversations'>;
    roundNumber: number;
    speakingMemberId?: Id<'members'>;
    selectedBy?: 'allocator' | 'mention_boost' | 'user_manual_fallback';
  }
): Promise<RoundtableState> {
  return await runNamedMutation<RoundtableState>(ctx, 'hallRounds:markRoundInProgress', args);
}

export async function markRoundCompleted(
  ctx: ActionCtxLike,
  args: {
    conversationId: Id<'conversations'>;
    roundNumber: number;
  }
): Promise<RoundtableState> {
  return await runNamedMutation<RoundtableState>(ctx, 'hallRounds:markRoundCompleted', args);
}
