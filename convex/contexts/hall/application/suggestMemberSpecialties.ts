'use node';

import { requireAuthUser } from '../../shared/auth';
import { createAiProvider } from '../../shared/convexGateway';
import type { SuggestMemberSpecialtiesInput } from '../contracts';

export async function suggestMemberSpecialtiesUseCase(ctx: any, args: SuggestMemberSpecialtiesInput) {
  await requireAuthUser(ctx);
  const provider = createAiProvider();
  return await provider.suggestMemberSpecialties({
    name: args.name,
    systemPrompt: args.systemPrompt,
    model: args.model,
  });
}
