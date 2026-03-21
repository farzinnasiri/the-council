import type { Member, RoundtableState } from '../../types/domain';

export interface RoundtableChoice {
  memberId: string;
  name: string;
  rationaleTag: 'pushback' | 'new angle' | 'evidence' | 'synthesis' | 'clarify';
  score: number;
}

export interface RoundtableViewModel {
  isOpeningRound: boolean;
  spokenCount: number;
  remainingCount: number;
  shortlistedChoices: RoundtableChoice[];
  fallbackChoices: RoundtableChoice[];
  spokenNames: string[];
}

export function deriveRoundtableViewModel(state: RoundtableState, members: Member[]): RoundtableViewModel {
  const membersById = new Map(members.map((member) => [member.id, member]));
  const spokenSet = new Set(state.spokenMemberIds);

  const remainingChoices = state.candidates
    .filter((candidate) => !spokenSet.has(candidate.memberId))
    .map((candidate) => ({
      memberId: candidate.memberId,
      name: membersById.get(candidate.memberId)?.name ?? candidate.memberId,
      rationaleTag: candidate.rationaleTag,
      score: candidate.score,
      rank: candidate.rank,
      shortlisted: candidate.status === 'shortlisted' || candidate.status === 'speaking',
    }))
    .sort((left, right) => {
      if (left.shortlisted !== right.shortlisted) {
        return left.shortlisted ? -1 : 1;
      }
      if (left.rank !== right.rank) return left.rank - right.rank;
      return left.name.localeCompare(right.name);
    });

  const spokenNames = state.spokenMemberIds
    .map((memberId) => membersById.get(memberId)?.name ?? memberId);

  return {
    isOpeningRound: state.round.roundNumber === 1,
    spokenCount: state.spokenMemberIds.length,
    remainingCount: remainingChoices.length,
    shortlistedChoices: remainingChoices
      .filter((choice) => choice.shortlisted)
      .map(({ rank: _rank, shortlisted: _shortlisted, ...choice }) => choice),
    fallbackChoices: remainingChoices
      .filter((choice) => !choice.shortlisted)
      .map(({ rank: _rank, shortlisted: _shortlisted, ...choice }) => choice),
    spokenNames,
  };
}
