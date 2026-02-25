'use node';

import { api } from '../../../_generated/api';
import { runApiQuery } from '../../shared/convexGateway';
import type { ActionCtxLike, KBDigestRow, MemberListRow } from '../../shared/types';

export async function listActiveMembers(ctx: ActionCtxLike): Promise<MemberListRow[]> {
  return await runApiQuery<MemberListRow[]>(ctx, api.members.list, {
    includeArchived: false,
  });
}

export async function loadActiveMembersMap(ctx: ActionCtxLike): Promise<Map<string, MemberListRow>> {
  const members = await listActiveMembers(ctx);
  return new Map(members.map((member) => [member._id as string, member]));
}

export async function listMemberKBDigests(
  ctx: ActionCtxLike,
  memberId: MemberListRow['_id']
): Promise<KBDigestRow[]> {
  return await runApiQuery<KBDigestRow[]>(ctx, api.kbDigests.listByMember, {
    memberId,
    includeDeleted: false,
  });
}
