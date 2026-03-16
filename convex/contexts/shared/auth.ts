'use node';

import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from '../../_generated/dataModel';
import { api } from '../../_generated/api';
import { setMainSpanAttributes } from '../../observability/wideEvents';
import { wideEventError } from '../../observability/errors';

export interface OwnedMember {
  _id: Id<'members'>;
  name: string;
  specialties: string[];
  systemPrompt: string;
  guidanceProfilePrompt?: string;
  guidanceProfileGeneratedAt?: number;
  guidanceProfileUpdatedAt?: number;
  kbStoreName?: string;
  personalArchiveAccess?: {
    reflection: boolean;
    cookieJar: boolean;
    accountability: boolean;
    worldModel: boolean;
  };
  deletedAt?: number;
}

export interface OwnedConversation {
  _id: Id<'conversations'>;
  kind: 'hall' | 'chamber';
  hallMode?: 'advisory' | 'roundtable';
  title: string;
  chamberMemberId?: Id<'members'>;
  guidanceLastReflectedUserTurnCount?: number;
  deletedAt?: number;
}

export async function requireAuthUser(ctx: any): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw wideEventError('auth-user-not-authenticated', 'Not authenticated', { statusCode: 401 });
  }
  setMainSpanAttributes({ 'user.id': String(userId) });
  return userId;
}

export async function requireOwnedMember(
  ctx: any,
  memberId: Id<'members'>,
  options?: { includeArchived?: boolean }
): Promise<OwnedMember> {
  await requireAuthUser(ctx);
  const member = await ctx.runQuery(api.members.getById, {
    memberId,
    includeArchived: options?.includeArchived ?? false,
  });
  if (!member) {
    throw wideEventError('member-not-found', 'Member not found', { statusCode: 404 });
  }
  setMainSpanAttributes({ 'member.id': String(member._id) });
  return member as OwnedMember;
}

export async function requireOwnedConversation(
  ctx: any,
  conversationId: Id<'conversations'>
): Promise<OwnedConversation> {
  await requireAuthUser(ctx);
  const conversation = await ctx.runQuery(api.conversations.getById, { conversationId });
  if (!conversation) {
    throw wideEventError('conversation-not-found', 'Conversation not found', { statusCode: 404 });
  }
  setMainSpanAttributes({
    'conversation.id': String(conversation._id),
    'conversation.kind': conversation.kind,
  });
  return conversation as OwnedConversation;
}
