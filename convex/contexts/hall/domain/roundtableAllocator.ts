'use node';

import type { Id } from '../../../_generated/dataModel';
import type { RoundBidMoveType } from '../../../ai/provider/types';
import type {
  MessageRow,
  RoundCandidateRow,
  RoundtableCandidateSelectedBy,
  RoundtableCandidateStatus,
  RoundtableRationaleTag,
} from '../../shared/types';

export interface RoundBidDraft {
  memberId: Id<'members'>;
  wantsToSpeak: boolean;
  moveType: RoundBidMoveType;
  targetMemberId?: Id<'members'>;
  noveltyClaim: string;
  confidence: number;
  estimatedValue: number;
}

export interface RoundBidSnapshot extends RoundBidDraft {
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
}

export interface RoundCandidateSnapshot {
  memberId: Id<'members'>;
  rank: number;
  status: RoundtableCandidateStatus;
  moveType: RoundBidMoveType;
  targetMemberId?: Id<'members'>;
  rationaleTag: RoundtableRationaleTag;
  allocatorReason: string;
  score: number;
  selectedBy: RoundtableCandidateSelectedBy;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function jaccardSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeText(left));
  const rightTokens = new Set(normalizeText(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : overlap / union;
}

function rationaleTagForMoveType(moveType: RoundBidMoveType): RoundtableRationaleTag {
  switch (moveType) {
    case 'rebuttal':
    case 'caveat':
      return 'pushback';
    case 'evidence':
      return 'evidence';
    case 'synthesis':
    case 'agreement':
      return 'synthesis';
    case 'clarification':
      return 'clarify';
    default:
      return 'new angle';
  }
}

function recentRoundNumbers(messages: MessageRow[], currentRound: number): number[] {
  return Array.from(
    new Set(
      messages
        .filter(
          (message) =>
            message.role === 'member' &&
            message.status !== 'error' &&
            typeof message.roundNumber === 'number' &&
            message.roundNumber < currentRound
        )
        .map((message) => message.roundNumber as number)
        .sort((left, right) => right - left)
    )
  ).slice(0, 3);
}

function spokeInRound(messages: MessageRow[], roundNumber: number, memberId: Id<'members'>): boolean {
  return messages.some(
    (message) =>
      message.role === 'member' &&
      message.status !== 'error' &&
      message.authorMemberId === memberId &&
      message.roundNumber === roundNumber
  );
}

function overlapPenalty(candidate: RoundBidSnapshot, picked: RoundCandidateSnapshot[]): number {
  for (const existing of picked) {
    if (existing.moveType === candidate.moveType && existing.targetMemberId === candidate.targetMemberId) {
      return 0.18;
    }
    if (jaccardSimilarity(existing.allocatorReason, candidate.noveltyClaim) >= 0.55) {
      return 0.14;
    }
  }
  return 0;
}

function sortSnapshots(left: RoundBidSnapshot, right: RoundBidSnapshot): number {
  if (right.allocatorScore !== left.allocatorScore) return right.allocatorScore - left.allocatorScore;
  if (right.estimatedValue !== left.estimatedValue) return right.estimatedValue - left.estimatedValue;
  if (right.confidence !== left.confidence) return right.confidence - left.confidence;
  return String(left.memberId).localeCompare(String(right.memberId));
}

export function moveTypeToRoundIntent(moveType: RoundBidMoveType): 'speak' | 'challenge' | 'support' {
  switch (moveType) {
    case 'rebuttal':
      return 'challenge';
    case 'agreement':
    case 'synthesis':
      return 'support';
    default:
      return 'speak';
  }
}

export function allocateRoundCandidates(options: {
  bids: RoundBidDraft[];
  activeMemberIds: Id<'members'>[];
  currentRound: number;
  maxSpeakers: number;
  mentionedMemberIds?: Id<'members'>[];
  recentMessages: MessageRow[];
  spokenMemberIds?: Id<'members'>[];
  existingCandidatesByMemberId?: Map<string, Pick<RoundCandidateRow, 'selectedBy'>>;
}): { bids: RoundBidSnapshot[]; candidates: RoundCandidateSnapshot[] } {
  const recentRounds = recentRoundNumbers(options.recentMessages, options.currentRound);
  const mentionedSet = new Set((options.mentionedMemberIds ?? []).map((id) => String(id)));
  const spokenSet = new Set((options.spokenMemberIds ?? []).map((id) => String(id)));

  const snapshots = options.bids.map((bid) => {
    const recentRoundCount = recentRounds.filter((roundNumber) =>
      spokeInRound(options.recentMessages, roundNumber, bid.memberId)
    ).length;
    const spokeLastRound =
      recentRounds.length > 0 && spokeInRound(options.recentMessages, recentRounds[0], bid.memberId);
    const mentionBoost = mentionedSet.has(String(bid.memberId))
      ? bid.wantsToSpeak
        ? 0.22
        : 0.12
      : 0;
    const relevanceScore = bid.wantsToSpeak ? clamp01(0.25 + bid.estimatedValue * 0.55) : 0;
    const noveltyScore = bid.wantsToSpeak
      ? clamp01(0.12 + bid.confidence * 0.18 + Math.min(0.12, normalizeText(bid.noveltyClaim).length * 0.01))
      : 0;
    const tensionScore =
      bid.moveType === 'rebuttal'
        ? 0.28
        : bid.moveType === 'caveat'
          ? 0.18
          : bid.moveType === 'reframing'
            ? 0.14
            : bid.moveType === 'clarification'
              ? 0.12
              : bid.moveType === 'evidence'
                ? 0.16
                : bid.moveType === 'synthesis'
                  ? 0.1
                  : bid.moveType === 'agreement'
                    ? 0.06
                    : 0;
    const coverageScore = recentRoundCount === 0 ? 0.22 : recentRoundCount === 1 ? 0.08 : 0.02;
    const recencyPenalty = spokeLastRound ? 0.4 : recentRoundCount > 0 ? recentRoundCount * 0.08 : 0;
    const dominancePenalty = recentRoundCount >= 2 ? 0.18 + (recentRoundCount - 2) * 0.08 : 0;
    const allocatorScore =
      relevanceScore +
      noveltyScore +
      tensionScore +
      coverageScore +
      mentionBoost -
      recencyPenalty -
      dominancePenalty;

    return {
      ...bid,
      relevanceScore,
      noveltyScore,
      tensionScore,
      coverageScore,
      recencyPenalty,
      dominancePenalty,
      mentionBoost,
      overlapPenalty: 0,
      allocatorScore,
      allocatorReason: bid.noveltyClaim || 'No material delta.',
    } satisfies RoundBidSnapshot;
  });

  snapshots.sort(sortSnapshots);

  const candidates: RoundCandidateSnapshot[] = [];
  const picked: RoundCandidateSnapshot[] = [];
  let shortlistRank = 1;

  for (const snapshot of snapshots) {
    if (spokenSet.has(String(snapshot.memberId))) {
      candidates.push({
        memberId: snapshot.memberId,
        rank: 0,
        status: 'spoken',
        moveType: snapshot.moveType,
        targetMemberId: snapshot.targetMemberId,
        rationaleTag: rationaleTagForMoveType(snapshot.moveType),
        allocatorReason: snapshot.allocatorReason,
        score: snapshot.allocatorScore,
        selectedBy:
          options.existingCandidatesByMemberId?.get(String(snapshot.memberId))?.selectedBy ?? 'allocator',
      });
      continue;
    }

    const duplicatePenalty = overlapPenalty(snapshot, picked);
    snapshot.overlapPenalty = duplicatePenalty;
    snapshot.allocatorScore = snapshot.allocatorScore - duplicatePenalty;
    snapshot.allocatorReason = snapshot.noveltyClaim || 'No material delta.';

    const shortlisted =
      snapshot.wantsToSpeak &&
      snapshot.allocatorScore > 0 &&
      picked.length < options.maxSpeakers &&
      duplicatePenalty < 0.18;
    const selectedBy: RoundtableCandidateSelectedBy =
      snapshot.mentionBoost > 0 && shortlisted ? 'mention_boost' : 'allocator';

    const candidate: RoundCandidateSnapshot = {
      memberId: snapshot.memberId,
      rank: shortlisted ? shortlistRank : 0,
      status: shortlisted ? 'shortlisted' : 'dismissed',
      moveType: snapshot.moveType,
      targetMemberId: snapshot.targetMemberId,
      rationaleTag: rationaleTagForMoveType(snapshot.moveType),
      allocatorReason:
        shortlisted
          ? snapshot.allocatorReason
          : duplicatePenalty >= 0.18
            ? 'Overlaps with a stronger suggested speaker.'
            : snapshot.wantsToSpeak
              ? 'Useful, but not among the best next moves.'
              : 'No strong marginal contribution right now.',
      score: snapshot.allocatorScore,
      selectedBy,
    };
    candidates.push(candidate);
    if (shortlisted) {
      shortlistRank += 1;
      picked.push(candidate);
    }
  }

  if (picked.length === 0 && snapshots.length > 0) {
    const fallback = [...snapshots].sort((left, right) => {
      const leftCoverage = left.coverageScore - left.recencyPenalty - left.dominancePenalty;
      const rightCoverage = right.coverageScore - right.recencyPenalty - right.dominancePenalty;
      if (rightCoverage !== leftCoverage) return rightCoverage - leftCoverage;
      return sortSnapshots(left, right);
    })[0];
    const fallbackCandidate = candidates.find((candidate) => candidate.memberId === fallback.memberId);
    if (fallbackCandidate) {
      fallbackCandidate.rank = 1;
      fallbackCandidate.status = 'shortlisted';
      fallbackCandidate.score = Math.max(fallbackCandidate.score, fallback.coverageScore - fallback.recencyPenalty);
      fallbackCandidate.allocatorReason = 'Fallback coverage candidate to keep the round moving.';
      fallbackCandidate.selectedBy = mentionedSet.has(String(fallback.memberId)) ? 'mention_boost' : 'allocator';
    }
  }

  const candidateByMember = new Map(candidates.map((candidate) => [String(candidate.memberId), candidate]));
  for (const memberId of options.activeMemberIds) {
    if (candidateByMember.has(String(memberId))) continue;
    candidates.push({
      memberId,
      rank: 0,
      status: spokenSet.has(String(memberId)) ? 'spoken' : 'dismissed',
      moveType: 'pass',
      targetMemberId: undefined,
      rationaleTag: 'clarify',
      allocatorReason: 'No bid available.',
      score: 0,
      selectedBy: 'allocator',
    });
  }

  candidates.sort((left, right) => {
    const leftPriority = left.status === 'shortlisted' ? 0 : left.status === 'speaking' ? 1 : left.status === 'spoken' ? 2 : 3;
    const rightPriority = right.status === 'shortlisted' ? 0 : right.status === 'speaking' ? 1 : right.status === 'spoken' ? 2 : 3;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    if (left.rank !== right.rank) return left.rank - right.rank;
    return String(left.memberId).localeCompare(String(right.memberId));
  });

  return {
    bids: snapshots,
    candidates,
  };
}
