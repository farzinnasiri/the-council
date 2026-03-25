import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { listConfiguredChatResponseSlots } from './ai/modelConfig';

const ttsVoiceNameValidator = v.union(
  v.literal('Kore'),
  v.literal('Zephyr'),
  v.literal('Fenrir'),
  v.literal('Puck'),
  v.literal('Charon')
);

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

function normalizeChatResponseModelSlot(slot?: number): number | undefined {
  if (slot === undefined) return undefined;
  if (!Number.isFinite(slot)) {
    throw new Error('Response model slot must be a number');
  }
  const normalized = Math.max(1, Math.trunc(slot));
  const available = new Set(listConfiguredChatResponseSlots().map((item) => item.slot));
  if (!available.has(normalized)) {
    throw new Error('Response model slot is not configured');
  }
  return normalized === 1 ? undefined : normalized;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const docs = await ctx.db
      .query('members')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .collect();

    const filtered = args.includeArchived ? docs : docs.filter((doc: any) => !doc.deletedAt);

    return await Promise.all(
      filtered.map(async (doc: any) => ({
        ...doc,
        avatarUrl: doc.avatarId ? await ctx.storage.getUrl(doc.avatarId) : null,
      }))
    );
  },
});

export const getById = query({
  args: {
    memberId: v.id('members'),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(args.memberId);
    if (!doc || doc.userId !== userId) {
      return null;
    }
    if (!args.includeArchived && doc.deletedAt) {
      return null;
    }
    return {
      ...doc,
      avatarUrl: doc.avatarId ? await ctx.storage.getUrl(doc.avatarId) : null,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    specialties: v.optional(v.array(v.string())),
    systemPrompt: v.string(),
    chatResponseModelSlot: v.optional(v.number()),
    guidanceProfilePrompt: v.optional(v.string()),
    ttsVoiceName: v.optional(ttsVoiceNameValidator),
    ttsPersonaPrompt: v.optional(v.string()),
    personalSourcesPermissionEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const id = await ctx.db.insert('members', {
      userId,
      name: args.name,
      specialties: args.specialties ?? [],
      systemPrompt: args.systemPrompt,
      chatResponseModelSlot: normalizeChatResponseModelSlot(args.chatResponseModelSlot),
      guidanceProfilePrompt: args.guidanceProfilePrompt,
      guidanceProfileGeneratedAt: args.guidanceProfilePrompt ? Date.now() : undefined,
      guidanceProfileUpdatedAt: args.guidanceProfilePrompt ? Date.now() : undefined,
      ttsVoiceName: args.ttsVoiceName,
      ttsPersonaPrompt: args.ttsPersonaPrompt,
      ttsPersonaGeneratedAt: args.ttsPersonaPrompt ? Date.now() : undefined,
      ttsPersonaUpdatedAt: args.ttsPersonaPrompt ? Date.now() : undefined,
      personalSourcesPermissionEnabled: args.personalSourcesPermissionEnabled ?? false,
      updatedAt: Date.now(),
    });
    const doc = (await ctx.db.get(id))!;
    return { ...doc, avatarUrl: null as string | null };
  },
});

export const update = mutation({
  args: {
    memberId: v.id('members'),
    name: v.optional(v.string()),
    specialties: v.optional(v.array(v.string())),
    systemPrompt: v.optional(v.string()),
    chatResponseModelSlot: v.optional(v.number()),
    guidanceProfilePrompt: v.optional(v.string()),
    guidanceProfileGeneratedAt: v.optional(v.number()),
    ttsVoiceName: v.optional(ttsVoiceNameValidator),
    ttsPersonaPrompt: v.optional(v.string()),
    ttsPersonaGeneratedAt: v.optional(v.number()),
    avatarId: v.optional(v.id('_storage')),
    kbStoreName: v.optional(v.string()),
    personalSourcesPermissionEnabled: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get(args.memberId);
    if (!current || current.userId !== userId) throw new Error('Member not found');
    const { memberId, ...patch } = args;
    const filteredPatch = Object.fromEntries(
      Object.entries({
        ...patch,
        ...(args.chatResponseModelSlot !== undefined
          ? { chatResponseModelSlot: normalizeChatResponseModelSlot(args.chatResponseModelSlot) }
          : {}),
      }).filter(([, value]) => value !== undefined)
    );
    await ctx.db.patch(memberId, {
      ...filteredPatch,
      ...(args.guidanceProfilePrompt !== undefined
        ? { guidanceProfileUpdatedAt: Date.now() }
        : {}),
      ...(args.ttsPersonaPrompt !== undefined
        ? { ttsPersonaUpdatedAt: Date.now() }
        : {}),
      updatedAt: Date.now(),
    });
    const updated = (await ctx.db.get(memberId))!;
    return {
      ...updated,
      avatarUrl: updated.avatarId ? await ctx.storage.getUrl(updated.avatarId) : null as string | null,
    };
  },
});

export const archive = mutation({
  args: { memberId: v.id('members') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get(args.memberId);
    if (!current || current.userId !== userId) throw new Error('Member not found');
    await ctx.db.patch(args.memberId, { deletedAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

export const setStoreName = mutation({
  args: { memberId: v.id('members'), storeName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get(args.memberId);
    if (!current || current.userId !== userId) throw new Error('Member not found');
    await ctx.db.patch(args.memberId, { kbStoreName: args.storeName, updatedAt: Date.now() });
    return null;
  },
});

export const clearStoreName = mutation({
  args: { memberId: v.id('members') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get(args.memberId);
    if (!current || current.userId !== userId) throw new Error('Member not found');
    await ctx.db.patch(args.memberId, { kbStoreName: undefined, updatedAt: Date.now() });
    return null;
  },
});
