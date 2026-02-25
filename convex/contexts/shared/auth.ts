'use node';

import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from '../../_generated/dataModel';
import { api } from '../../_generated/api';

export interface OwnedMember {
  _id: Id<'members'>;
  name: string;
  specialties: string[];
  systemPrompt: string;
  kbStoreName?: string;
  deletedAt?: number;
}

export interface OwnedConversation {
  _id: Id<'conversations'>;
  kind: 'hall' | 'chamber';
  hallMode?: 'advisory' | 'roundtable';
  title: string;
  chamberMemberId?: Id<'members'>;
  deletedAt?: number;
}

export async function requireAuthUser(ctx: any): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('Not authenticated');
  }
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
    throw new Error('Member not found');
  }
  return member as OwnedMember;
}

export async function requireOwnedConversation(
  ctx: any,
  conversationId: Id<'conversations'>
): Promise<OwnedConversation> {
  await requireAuthUser(ctx);
  const conversation = await ctx.runQuery(api.conversations.getById, { conversationId });
  if (!conversation) {
    throw new Error('Conversation not found');
  }
  return conversation as OwnedConversation;
}
