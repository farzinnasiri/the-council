'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { routeHallMembersUseCase } from '../contexts/hall/application/routeHallMembers';
import { suggestHallTitleUseCase } from '../contexts/hall/application/suggestHallTitle';
import { suggestMemberSpecialtiesUseCase } from '../contexts/hall/application/suggestMemberSpecialties';
import { suggestChamberTitleUseCase } from '../contexts/chamber/application/suggestChamberTitle';
import { observeAction, setMainSpanAttributes } from '../observability/wideEvents';

export const routeHallMembers = action({
  args: {
    conversationId: v.id('conversations'),
    message: v.string(),
    maxSelections: v.optional(v.number()),
  },
  handler: observeAction('ai.routing.routeHallMembers', async (ctx, args) => {
    setMainSpanAttributes({
      'conversation.id': String(args.conversationId),
      'routing.max_selections': args.maxSelections ?? 3,
      'routing.message.length': args.message.trim().length,
    });
    return await routeHallMembersUseCase(ctx, args);
  }),
});

export const suggestHallTitle = action({
  args: {
    message: v.string(),
    model: v.optional(v.string()),
  },
  handler: observeAction('ai.routing.suggestHallTitle', async (ctx, args) => {
    setMainSpanAttributes({ 'routing.message.length': args.message.trim().length });
    return await suggestHallTitleUseCase(ctx, args);
  }),
});

export const suggestChamberTitle = action({
  args: {
    message: v.string(),
    model: v.optional(v.string()),
  },
  handler: observeAction('ai.routing.suggestChamberTitle', async (ctx, args) => {
    setMainSpanAttributes({ 'routing.message.length': args.message.trim().length });
    return await suggestChamberTitleUseCase(ctx, args);
  }),
});

export const suggestMemberSpecialties = action({
  args: {
    name: v.string(),
    systemPrompt: v.string(),
    model: v.optional(v.string()),
  },
  handler: observeAction('ai.routing.suggestMemberSpecialties', async (ctx, args) => {
    setMainSpanAttributes({
      'member.name.length': args.name.trim().length,
      'member.system_prompt.length': args.systemPrompt.trim().length,
    });
    return await suggestMemberSpecialtiesUseCase(ctx, args);
  }),
});
