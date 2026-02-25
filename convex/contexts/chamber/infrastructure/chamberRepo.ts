'use node';

import { api } from '../../../_generated/api';
import type { Id } from '../../../_generated/dataModel';
import { ensureMemberStore } from '../../../ai/kbIngest';
import { runApiQuery } from '../../shared/convexGateway';
import type { ActionCtxLike, KBDigestRow } from '../../shared/types';

export async function ensureChamberMemberStore(ctx: any, memberId: Id<'members'>) {
  return await ensureMemberStore(ctx, memberId);
}

export async function listMemberDigests(ctx: ActionCtxLike, memberId: Id<'members'>): Promise<KBDigestRow[]> {
  return await runApiQuery<KBDigestRow[]>(ctx, api.kbDigests.listByMember, {
    memberId,
    includeDeleted: false,
  });
}
