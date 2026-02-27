'use node';

import type { Id } from '../../_generated/dataModel';
import type { RoundIntent } from '../../ai/provider/types';

export interface ActionCtxLike {
  runQuery: (...args: any[]) => Promise<unknown>;
  runMutation: (...args: any[]) => Promise<unknown>;
}

export type RoundStatus = 'awaiting_user' | 'in_progress' | 'completed' | 'superseded';
export type RoundTrigger = 'user_message' | 'continue';
export type RoundIntentSource = 'mention' | 'intent_default' | 'user_manual';
export type RoundtableSpeakIntent = Exclude<RoundIntent, 'pass'>;

export interface ContextMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

export interface MemberListRow {
  _id: Id<'members'>;
  name: string;
  specialties?: string[];
  systemPrompt: string;
  kbStoreName?: string;
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
  authorMemberId?: Id<'members'>;
  content: string;
  status: 'sent' | 'error';
  compacted: boolean;
  roundNumber?: number;
  deletedAt?: number;
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

export interface RoundtableState {
  round: RoundRow;
  intents: RoundIntentRow[];
}

export interface RoundtableSpeakerResult {
  memberId: Id<'members'>;
  status: 'sent' | 'error';
  answer: string;
  intent: RoundtableSpeakIntent;
  targetMemberId?: Id<'members'>;
  error?: string;
}

export interface PreparedRoundIntent {
  memberId: string;
  intent: RoundIntent;
  targetMemberId?: string;
  rationale: string;
  selected: boolean;
  source: RoundIntentSource;
}
