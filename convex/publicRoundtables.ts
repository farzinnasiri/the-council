import { getAuthUserId } from '@convex-dev/auth/server';
import { internalQuery, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const PUBLICATION_SLUG_LENGTH = 24;

const participantSnapshotValidator = v.object({
  memberId: v.id('members'),
  name: v.string(),
  avatarStorageId: v.optional(v.id('_storage')),
});

const publicationStatusValidator = v.union(
  v.object({
    publicationId: v.id('publishedRoundtables'),
    slug: v.string(),
    publishedAt: v.number(),
  }),
  v.null()
);

const publicPayloadValidator = v.union(
  v.object({
    title: v.string(),
    hallMode: v.literal('roundtable'),
    closedAt: v.number(),
    publishedAt: v.number(),
    participants: v.array(
      v.object({
        name: v.string(),
        avatarUrl: v.union(v.string(), v.null()),
      })
    ),
    entries: v.array(
      v.object({
        sequence: v.number(),
        role: v.union(v.literal('user'), v.literal('member'), v.literal('system')),
        speakerName: v.optional(v.string()),
        speakerAvatarUrl: v.union(v.string(), v.null()),
        content: v.string(),
        roundNumber: v.optional(v.number()),
        createdAt: v.number(),
        isFinalSynthesis: v.boolean(),
      })
    ),
  }),
  v.null()
);

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId as Id<'users'>;
}

async function getOwnedConversation(ctx: any, userId: Id<'users'>, conversationId: Id<'conversations'>) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.userId !== userId || conversation.deletedAt) {
    throw new Error('Conversation not found');
  }
  return conversation;
}

async function getOwnedMemberIfPresent(
  ctx: any,
  userId: Id<'users'>,
  memberId: Id<'members'> | undefined
) {
  if (!memberId) return null;
  const member = await ctx.db.get(memberId);
  if (!member || member.userId !== userId) return null;
  return member;
}

function isVisiblePublishedMessage(message: any) {
  if (message.deletedAt || message.supersededAt) return false;
  if (message.status !== 'sent') return false;
  if (message.role === 'user' || message.role === 'member') return true;
  return message.role === 'system' && message.systemKind === 'hall_closure';
}

async function getLatestActivePublicationByConversation(
  ctx: any,
  conversationId: Id<'conversations'>
) {
  const rows = await ctx.db
    .query('publishedRoundtables')
    .withIndex('by_conversation', (q: any) => q.eq('conversationId', conversationId))
    .collect();

  return (
    rows
      .filter((row: any) => !row.unpublishedAt)
      .sort((left: any, right: any) => right.publishedAt - left.publishedAt)[0] ?? null
  );
}

function generateSlug() {
  const bytes = new Uint8Array(PUBLICATION_SLUG_LENGTH);
  crypto.getRandomValues(bytes);
  let slug = '';
  for (const byte of bytes) {
    slug += BASE62_ALPHABET[byte % BASE62_ALPHABET.length];
  }
  return slug;
}

async function generateUniqueSlug(ctx: any) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug = generateSlug();
    const existing = await ctx.db
      .query('publishedRoundtables')
      .withIndex('by_slug', (q: any) => q.eq('slug', slug))
      .take(1);
    if (existing.length === 0) {
      return slug;
    }
  }
  throw new Error('Could not generate a unique public link');
}

async function buildParticipantSnapshot(ctx: any, userId: Id<'users'>, conversationId: Id<'conversations'>) {
  const participantRows = await ctx.db
    .query('conversationParticipants')
    .withIndex('by_conversation_status', (q: any) =>
      q.eq('conversationId', conversationId).eq('status', 'active')
    )
    .collect();

  const members = await Promise.all(
    participantRows.map((row: any) => getOwnedMemberIfPresent(ctx, userId, row.memberId))
  );

  return members
    .filter((member): member is NonNullable<typeof member> => Boolean(member))
    .map((member) => ({
      memberId: member._id,
      name: member.name,
      avatarStorageId: member.avatarId,
    }));
}

async function buildPublicationEntries(ctx: any, userId: Id<'users'>, conversationId: Id<'conversations'>) {
  const messages = await ctx.db
    .query('messages')
    .withIndex('by_conversation', (q: any) => q.eq('conversationId', conversationId))
    .order('asc')
    .collect();

  const visibleMessages = messages.filter(isVisiblePublishedMessage);
  const memberIds = Array.from(
    new Set(
      visibleMessages
        .filter((message: any) => message.role === 'member' && message.authorMemberId)
        .map((message: any) => message.authorMemberId as Id<'members'>)
    )
  ) as Id<'members'>[];
  const memberRows = await Promise.all(
    memberIds.map((memberId) => getOwnedMemberIfPresent(ctx, userId, memberId))
  );
  const membersById = new Map(
    memberRows
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => [String(row._id), row])
  );

  return visibleMessages.map((message: any, index: number) => {
    if (message.role === 'member') {
      const member = message.authorMemberId
        ? membersById.get(String(message.authorMemberId))
        : null;
      return {
        sequence: index,
        role: 'member' as const,
        speakerName: member?.name ?? 'Council Member',
        speakerAvatarStorageId: member?.avatarId,
        content: message.content,
        roundNumber: message.roundNumber,
        createdAt: message._creationTime,
        isFinalSynthesis: false,
      };
    }

    if (message.role === 'system') {
      return {
        sequence: index,
        role: 'system' as const,
        speakerName: 'The Council',
        speakerAvatarStorageId: undefined,
        content: message.content,
        roundNumber: message.roundNumber,
        createdAt: message._creationTime,
        isFinalSynthesis: true,
      };
    }

    return {
      sequence: index,
      role: 'user' as const,
      speakerName: 'Prompt',
      speakerAvatarStorageId: undefined,
      content: message.content,
      roundNumber: message.roundNumber,
      createdAt: message._creationTime,
      isFinalSynthesis: false,
    };
  });
}

export const getPublicationStatus = query({
  args: { conversationId: v.id('conversations') },
  returns: publicationStatusValidator,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'hall' || conversation.hallMode !== 'roundtable') {
      return null;
    }

    const publication = await getLatestActivePublicationByConversation(ctx, args.conversationId);
    if (!publication) return null;

    return {
      publicationId: publication._id,
      slug: publication.slug,
      publishedAt: publication.publishedAt,
    };
  },
});

export const publishClosedRoundtable = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.object({
    publicationId: v.id('publishedRoundtables'),
    slug: v.string(),
    publishedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'hall') {
      throw new Error('Only hall conversations can be published');
    }
    if (conversation.hallMode !== 'roundtable' || !conversation.closedAt) {
      throw new Error('Only closed roundtables can be published');
    }

    const activePublication = await getLatestActivePublicationByConversation(ctx, args.conversationId);
    if (activePublication) {
      return {
        publicationId: activePublication._id,
        slug: activePublication.slug,
        publishedAt: activePublication.publishedAt,
      };
    }

    const slug = await generateUniqueSlug(ctx);
    const publishedAt = Date.now();
    const [participants, entries] = await Promise.all([
      buildParticipantSnapshot(ctx, userId, args.conversationId),
      buildPublicationEntries(ctx, userId, args.conversationId),
    ]);

    const publicationId = await ctx.db.insert('publishedRoundtables', {
      userId,
      conversationId: args.conversationId,
      slug,
      title: conversation.title,
      hallMode: 'roundtable',
      closedAt: conversation.closedAt,
      publishedAt,
      participants,
    });

    await Promise.all(
      entries.map((entry: {
        sequence: number;
        role: 'user' | 'member' | 'system';
        speakerName?: string;
        speakerAvatarStorageId?: Id<'_storage'>;
        content: string;
        roundNumber?: number;
        createdAt: number;
        isFinalSynthesis: boolean;
      }) =>
        ctx.db.insert('publishedRoundtableEntries', {
          publicationId,
          sequence: entry.sequence,
          role: entry.role,
          speakerName: entry.speakerName,
          speakerAvatarStorageId: entry.speakerAvatarStorageId,
          content: entry.content,
          roundNumber: entry.roundNumber,
          createdAt: entry.createdAt,
          isFinalSynthesis: entry.isFinalSynthesis,
        })
      )
    );

    return {
      publicationId,
      slug,
      publishedAt,
    };
  },
});

export const unpublishClosedRoundtable = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await getOwnedConversation(ctx, userId, args.conversationId);
    if (conversation.kind !== 'hall' || conversation.hallMode !== 'roundtable') {
      throw new Error('Roundtable publication not found');
    }

    const publication = await getLatestActivePublicationByConversation(ctx, args.conversationId);
    if (!publication) {
      return null;
    }

    await ctx.db.patch(publication._id, { unpublishedAt: Date.now() });
    return null;
  },
});

export const getPublicationPayloadBySlug = internalQuery({
  args: { slug: v.string() },
  returns: publicPayloadValidator,
  handler: async (ctx, args) => {
    const publicationRows = await ctx.db
      .query('publishedRoundtables')
      .withIndex('by_slug', (q: any) => q.eq('slug', args.slug))
      .collect();
    const publication =
      publicationRows
        .filter((row: any) => !row.unpublishedAt)
        .sort((left: any, right: any) => right.publishedAt - left.publishedAt)[0] ?? null;
    if (!publication) {
      return null;
    }

    const entries = await ctx.db
      .query('publishedRoundtableEntries')
      .withIndex('by_publication_sequence', (q: any) => q.eq('publicationId', publication._id))
      .collect();

    return {
      title: publication.title,
      hallMode: publication.hallMode,
      closedAt: publication.closedAt,
      publishedAt: publication.publishedAt,
      participants: await Promise.all(
        publication.participants.map(async (participant: any) => ({
          name: participant.name,
          avatarUrl: participant.avatarStorageId
            ? await ctx.storage.getUrl(participant.avatarStorageId)
            : null,
        }))
      ),
      entries: await Promise.all(
        entries
          .sort((left: any, right: any) => left.sequence - right.sequence)
          .map(async (entry: any) => ({
            sequence: entry.sequence,
            role: entry.role,
            speakerName: entry.speakerName,
            speakerAvatarUrl: entry.speakerAvatarStorageId
              ? await ctx.storage.getUrl(entry.speakerAvatarStorageId)
              : null,
            content: entry.content,
            roundNumber: entry.roundNumber,
            createdAt: entry.createdAt,
            isFinalSynthesis: entry.isFinalSynthesis,
          }))
      ),
    };
  },
});
