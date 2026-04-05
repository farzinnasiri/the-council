'use node';

import type { ChamberChatProfile, RetrievalStrategy } from '../../../ai/provider/types';

const OPENING_HALL_CHAT_PROFILE: ChamberChatProfile = 'brainstorm';
const OPENING_HALL_RETRIEVAL_STRATEGY: RetrievalStrategy = 'brainstorm';

export function resolveOpeningHallDefaults(options: {
  isOpeningRound: boolean;
  chatProfile?: ChamberChatProfile;
  retrievalStrategy?: RetrievalStrategy;
}): {
  chatProfile?: ChamberChatProfile;
  retrievalStrategy?: RetrievalStrategy;
} {
  if (!options.isOpeningRound) {
    return {
      chatProfile: options.chatProfile,
      retrievalStrategy: options.retrievalStrategy,
    };
  }

  return {
    chatProfile: options.chatProfile ?? OPENING_HALL_CHAT_PROFILE,
    retrievalStrategy: options.retrievalStrategy ?? OPENING_HALL_RETRIEVAL_STRATEGY,
  };
}
