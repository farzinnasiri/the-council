'use node';

import type { Id } from '../../../_generated/dataModel';
import { runNamedQuery } from '../../shared/convexGateway';
import type { ActionCtxLike } from '../../shared/types';

export interface PersonalArchiveProfileRow {
  _id: Id<'personalArchiveProfiles'>;
  userId: Id<'users'>;
  identity: string;
  updatedAt: number;
}

export async function getPersonalArchiveProfile(
  ctx: ActionCtxLike,
): Promise<PersonalArchiveProfileRow | null> {
  return await runNamedQuery<PersonalArchiveProfileRow | null>(ctx, 'personalArchive:getProfile', {});
}
