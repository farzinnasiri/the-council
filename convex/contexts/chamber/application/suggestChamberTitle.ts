'use node';

import { requireAuthUser } from '../../shared/auth';
import { createAiProvider } from '../../shared/convexGateway';

export async function suggestChamberTitleUseCase(ctx: any, args: { message: string; model?: string }) {
  await requireAuthUser(ctx);
  const provider = createAiProvider();
  return await provider.suggestChamberTitle({ message: args.message, model: args.model });
}
