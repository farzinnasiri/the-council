'use node';

import type { Id } from '../../_generated/dataModel';
import type { RoundtableSpeakerResult, RoundtableState } from '../shared/types';

export interface RouteHallMembersInput {
  conversationId: Id<'conversations'>;
  message: string;
  maxSelections?: number;
}

export interface RouteHallMembersResult {
  chosenMemberIds: string[];
  model: string;
  source: 'llm' | 'fallback';
}

export interface SuggestHallTitleInput {
  message: string;
  model?: string;
}

export interface SuggestMemberSpecialtiesInput {
  name: string;
  systemPrompt: string;
  model?: string;
}

export interface PrepareRoundtableRoundInput {
  conversationId: Id<'conversations'>;
  trigger: 'user_message' | 'continue';
  triggerMessageId?: Id<'messages'>;
  mentionedMemberIds?: Id<'members'>[];
}

export interface ChatRoundtableSpeakersInput {
  conversationId: Id<'conversations'>;
  roundNumber: number;
  retrievalModel?: string;
  chatModel?: string;
}

export interface ChatRoundtableSpeakerInput {
  conversationId: Id<'conversations'>;
  roundNumber: number;
  memberId: Id<'members'>;
  retrievalModel?: string;
  chatModel?: string;
}

export type NormalizedRouteCandidate = {
  id: string;
  name: string;
  specialties: string[];
  systemPrompt: string;
};

export type RoundtableSingleSpeakerResponse = {
  answer: string;
  grounded: boolean;
  citations: Array<{ title: string; uri?: string }>;
  model: string;
  retrievalModel: string;
  usedKnowledgeBase: boolean;
  debug?: unknown;
  intent: 'speak' | 'challenge' | 'support';
  targetMemberId?: Id<'members'>;
};

export interface HallApplicationService {
  routeHallMembers(input: RouteHallMembersInput): Promise<RouteHallMembersResult>;
  suggestHallTitle(input: SuggestHallTitleInput): Promise<{ title: string; model: string }>;
  suggestMemberSpecialties(input: SuggestMemberSpecialtiesInput): Promise<{ specialties: string[]; model: string }>;
  prepareRoundtableRound(input: PrepareRoundtableRoundInput): Promise<RoundtableState>;
  chatRoundtableSpeakers(input: ChatRoundtableSpeakersInput): Promise<{ results: RoundtableSpeakerResult[] }>;
  chatRoundtableSpeaker(input: ChatRoundtableSpeakerInput): Promise<RoundtableSingleSpeakerResponse>;
}
