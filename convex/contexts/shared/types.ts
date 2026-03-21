'use node';

import type { Id } from '../../_generated/dataModel';
import type { RoundBidMoveType, RoundIntent } from '../../ai/provider/types';

export interface ActionCtxLike {
  runQuery: (...args: any[]) => Promise<unknown>;
  runMutation: (...args: any[]) => Promise<unknown>;
}

export type RoundStatus = 'awaiting_user' | 'in_progress' | 'completed' | 'superseded';
export type RoundTrigger = 'user_message' | 'continue';
export type RoundIntentSource = 'mention' | 'intent_default' | 'user_manual';
export type RoundtableSpeakIntent = Exclude<RoundIntent, 'pass'>;
export type RoundtableRationaleTag = 'pushback' | 'new angle' | 'evidence' | 'synthesis' | 'clarify';
export type RoundtableCandidateStatus = 'shortlisted' | 'speaking' | 'spoken' | 'dismissed';
export type RoundtableCandidateSelectedBy = 'allocator' | 'mention_boost' | 'user_manual_fallback';

export interface ContextMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

export interface MemberListRow {
  _id: Id<'members'>;
  name: string;
  specialties?: string[];
  systemPrompt: string;
  ttsVoiceName?: 'Kore' | 'Zephyr' | 'Fenrir' | 'Puck' | 'Charon';
  ttsPersonaPrompt?: string;
  kbStoreName?: string;
  personalArchiveAccess?: {
    reflection: boolean;
    cookieJar: boolean;
    accountability: boolean;
    worldModel: boolean;
  };
  deletedAt?: number;
  avatarUrl?: string | null;
}

export interface ParticipantRow {
  _id: Id<'conversationParticipants'>;
  _creationTime: number;
  conversationId: Id<'conversations'>;
  userId: Id<'users'>;
  memberId: Id<'members'>;
  status: 'active' | 'removed';
  joinedAt: number;
  leftAt?: number;
}

export interface MessageRow {
  _id: Id<'messages'>;
  _creationTime: number;
  userId: Id<'users'>;
  conversationId: Id<'conversations'>;
  role: 'user' | 'member' | 'system';
  systemKind?: 'routing' | 'hall_followup_context' | 'hall_closure';
  authorMemberId?: Id<'members'>;
  content: string;
  status: 'sent' | 'error';
  compacted: boolean;
  roundNumber?: number;
  deletedAt?: number;
  originConversationId?: Id<'conversations'>;
  originMessageId?: Id<'messages'>;
}

export interface KBDigestRow {
  _id: Id<'kbDocumentDigests'>;
  _creationTime: number;
  userId: Id<'users'>;
  memberId: Id<'members'>;
  kbStoreName: string;
  kbDocumentName?: string;
  displayName: string;
  storageId?: Id<'_storage'>;
  topics: string[];
  entities: string[];
  lexicalAnchors: string[];
  styleAnchors: string[];
  digestSummary: string;
  status: 'active' | 'deleted';
  updatedAt: number;
  deletedAt?: number;
}

export interface RoundRow {
  _id: Id<'hallRounds'>;
  _creationTime: number;
  userId: Id<'users'>;
  conversationId: Id<'conversations'>;
  roundNumber: number;
  status: RoundStatus;
  trigger: RoundTrigger;
  triggerMessageId?: Id<'messages'>;
  maxSpeakers: number;
  updatedAt: number;
}

export interface RoundIntentRow {
  _id: Id<'hallRoundIntents'>;
  _creationTime: number;
  userId: Id<'users'>;
  conversationId: Id<'conversations'>;
  roundNumber: number;
  memberId: Id<'members'>;
  intent: RoundIntent;
  targetMemberId?: Id<'members'>;
  rationale: string;
  selected: boolean;
  source: RoundIntentSource;
  updatedAt: number;
}

export interface RoundBidRow {
  _id: Id<'hallRoundBids'>;
  _creationTime: number;
  userId: Id<'users'>;
  conversationId: Id<'conversations'>;
  roundNumber: number;
  memberId: Id<'members'>;
  wantsToSpeak: boolean;
  moveType: RoundBidMoveType;
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
  updatedAt: number;
}

export interface RoundCandidateRow {
  _id: Id<'hallRoundCandidates'>;
  _creationTime: number;
  userId: Id<'users'>;
  conversationId: Id<'conversations'>;
  roundNumber: number;
  memberId: Id<'members'>;
  rank: number;
  status: RoundtableCandidateStatus;
  moveType: RoundBidMoveType;
  targetMemberId?: Id<'members'>;
  rationaleTag: RoundtableRationaleTag;
  allocatorReason: string;
  score: number;
  selectedBy: RoundtableCandidateSelectedBy;
  updatedAt: number;
}

export interface RoundtableState {
  round: RoundRow;
  candidates: RoundCandidateRow[];
  spokenMemberIds: Id<'members'>[];
}

export interface RoundtableSpeakerResult {
  memberId: Id<'members'>;
  status: 'sent' | 'error';
  answer: string;
  intent: RoundtableSpeakIntent;
  targetMemberId?: Id<'members'>;
  error?: string;
}

export interface ConversationRow {
  _id: Id<'conversations'>;
  kind: 'hall' | 'chamber';
  hallMode?: 'advisory' | 'roundtable';
  title: string;
  chamberMemberId?: Id<'members'>;
  guidanceLastReflectedUserTurnCount?: number;
  deletedAt?: number;
  closedAt?: number;
  closedReason?: 'user_closed';
}
