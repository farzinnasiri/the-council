'use node';

import { requireAuthUser } from '../../shared/auth';
import { createAiProvider } from '../../shared/convexGateway';
import type { SuggestHallTitleInput } from '../contracts';

export async function suggestHallTitleUseCase(ctx: any, args: SuggestHallTitleInput) {
  await requireAuthUser(ctx);
  const provider = createAiProvider();
  return await provider.suggestHallTitle({ message: args.message, model: args.model });
}
