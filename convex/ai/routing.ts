'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { routeHallMembersUseCase } from '../contexts/hall/application/routeHallMembers';
import { suggestHallTitleUseCase } from '../contexts/hall/application/suggestHallTitle';
import { suggestMemberSpecialtiesUseCase } from '../contexts/hall/application/suggestMemberSpecialties';

export const routeHallMembers = action({
  args: {
    conversationId: v.id('conversations'),
    message: v.string(),
    maxSelections: v.optional(v.number()),
  },
  handler: async (ctx, args) => await routeHallMembersUseCase(ctx, args),
});

export const suggestHallTitle = action({
  args: {
    message: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => await suggestHallTitleUseCase(ctx, args),
});

export const suggestMemberSpecialties = action({
  args: {
    name: v.string(),
    systemPrompt: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => await suggestMemberSpecialtiesUseCase(ctx, args),
});
