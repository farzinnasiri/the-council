import type { Member, RoundtableState } from '../../types/domain';

export interface RoundtableChoice {
  memberId: string;
  name: string;
  volunteered: boolean;
}

export interface RoundtableViewModel {
  isOpeningRound: boolean;
  spokenCount: number;
  remainingCount: number;
  volunteeredChoices: RoundtableChoice[];
  fallbackChoices: RoundtableChoice[];
  spokenNames: string[];
}

export function deriveRoundtableViewModel(state: RoundtableState, members: Member[]): RoundtableViewModel {
  const membersById = new Map(members.map((member) => [member.id, member]));
  const spokenSet = new Set(state.spokenMemberIds);

  const remainingChoices = state.intents
    .filter((intent) => !spokenSet.has(intent.memberId))
    .map((intent) => ({
      memberId: intent.memberId,
      name: membersById.get(intent.memberId)?.name ?? intent.memberId,
      volunteered: intent.selected,
    }))
    .sort((left, right) => {
      if (left.volunteered !== right.volunteered) {
        return left.volunteered ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

  const spokenNames = state.spokenMemberIds
    .map((memberId) => membersById.get(memberId)?.name ?? memberId);

  return {
    isOpeningRound: state.round.roundNumber === 1,
    spokenCount: state.spokenMemberIds.length,
    remainingCount: remainingChoices.length,
    volunteeredChoices: remainingChoices.filter((choice) => choice.volunteered),
    fallbackChoices: remainingChoices.filter((choice) => !choice.volunteered),
    spokenNames,
  };
}
