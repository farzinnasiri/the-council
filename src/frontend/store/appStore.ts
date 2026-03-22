import { create } from 'zustand';
import type {
  ChamberResponseMode,
  Conversation,
  ConversationMemoryLog,
  ConversationNotebook,
  ConversationType,
  Member,
  MemberVoiceName,
  Message,
  MessageFeedbackKey,
  MessageRouting,
  PersonalArchiveAccess,
  RoundtableState,
  RetrievalStrategy,
  TimeAwareReentryGapBucket,
  ThemeMode,
} from '../types/domain';
import {
  COMPACTION_POLICY_DEFAULTS,
  type CompactionPolicy,
} from '../constants/compactionPolicy';
import { DEFAULT_MEMBER_VOICE } from '../constants/memberVoice';
import { convexRepository as councilRepository } from '../repository/ConvexCouncilRepository';
import {
  chatWithMember,
  chatRoundtableSpeaker,
  createKbDocumentRecord,
  deleteKbDocument,
  refreshRoundtableRound,
  getRoundtableState,
  listKbDocuments,
  markRoundtableCompleted,
  markRoundtableInProgress,
  prepareRoundtableRound,
  retryKbDocumentIndexing,
  retryKbDocumentMetadata,
  routeHallMembers,
  suggestChamberTitle,
  startKbDocumentProcessing,
  suggestHallTitle,
  uploadFileToConvexStorage,
} from '../lib/aiClient';
import { routeToMembers } from '../lib/mockRouting';
import type { KbDocumentLifecycle } from '../repository/CouncilRepository';

interface CreateMemberPayload {
  name: string;
  systemPrompt: string;
  guidanceProfilePrompt?: string;
  ttsVoiceName?: MemberVoiceName;
  ttsPersonaPrompt?: string;
  specialties?: string[];
  personalArchiveAccess?: PersonalArchiveAccess;
}

type NotebookSaveState = 'idle' | 'saving' | 'saved' | 'error';

interface AppToast {
  id: string;
  message: string;
}

let initializeAppPromise: Promise<void> | null = null;
let hydrateMemberDocumentsPromise: Promise<void> | null = null;

interface AppState {
  hydrated: boolean;
  isRouting: boolean;
  routingConversationId?: string;
  closingConversationId?: string;
  themeMode: ThemeMode;
  members: Member[];
  conversations: Conversation[];
  messages: Message[];
  selectedConversationId: string;
  pendingReplyCount: Record<string, number>;
  pendingReplyMemberIds: Record<string, string[]>;
  compactionCheckInFlightByConversation: Record<string, boolean>;
  memberDocuments: Record<string, Array<{ name?: string; displayName?: string }>>;
  kbDocumentsByMember: Record<string, KbDocumentLifecycle[]>;
  kbUploadProgressByMember: Record<string, Array<{ localId: string; fileName: string; loaded: number; total: number; progress: number }>>;
  kbDeletingDocumentIds: Record<string, boolean>;
  kbRetryingIndexDocumentIds: Record<string, boolean>;
  kbRetryingMetadataDocumentIds: Record<string, boolean>;
  chamberMemoryByConversation: Record<string, string>;
  hallParticipantsByConversation: Record<string, string[]>;
  roundtableStateByConversation: Record<string, RoundtableState | null>;
  roundtablePreparingByConversation: Record<string, boolean>;
  hallSummaryFailureCountByConversation: Record<string, number>;
  messageFeedbackByMessageId: Record<string, MessageFeedbackKey[]>;
  conversationNotebooksByConversation: Record<string, ConversationNotebook>;
  notebookDraftByConversation: Record<string, string>;
  notebookSaveStateByConversation: Record<string, NotebookSaveState>;
  notebookErrorByConversation: Record<string, string | undefined>;
  notebookLoadedByConversation: Record<string, boolean>;
  notebookListLoaded: boolean;
  notebookOpen: boolean;
  notebookMobileSnap: 0.3 | 0.5 | 1;
  timeAwareReentryNoticePendingByConversation: Record<string, boolean>;
  toasts: AppToast[];
  messagePaginationByConversation: Record<
    string,
    {
      continueCursor: string | null;
      hasOlder: boolean;
      isLoadingOlder: boolean;
    }
  >;
  compactionPolicy: CompactionPolicy;
  refiningActionByMessageId: Record<string, 'think_harder' | 'deep_dive' | 'shorter' | 'elaborate' | undefined>;
  retryingMessageIds: Record<string, boolean>;

  initializeApp: () => Promise<void>;
  refreshCompactionPolicy: () => Promise<CompactionPolicy>;
  selectConversation: (conversationId: string) => void;
  loadMessages: (conversationId: string) => Promise<void>;
  loadOlderMessages: (conversationId: string) => Promise<void>;
  refreshHallParticipants: (conversationId: string) => Promise<void>;
  syncHallRoundSummaries: (conversationId: string) => Promise<void>;
  evaluateChamberCompactionOnLoad: (conversationId: string) => Promise<void>;
  createConversation: (type: ConversationType) => Promise<Conversation>;
  setChamberResponseMode: (conversationId: string, mode: ChamberResponseMode) => Promise<void>;
  setChamberTimeAwareReentryEnabled: (conversationId: string, enabled: boolean) => Promise<void>;
  markChamberTimeAwareReentryNoticeSeen: (conversationId: string) => Promise<void>;
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  archiveConversation: (conversationId: string) => Promise<void>;
  closeHall: (conversationId: string) => Promise<void>;
  createChamberThread: (memberId: string) => Promise<Conversation>;
  startHallFollowUpThread: (
    hallConversationId: string,
    hallMessageId: string
  ) => Promise<Conversation>;
  listChamberThreadsForMember: (memberId: string) => Conversation[];
  getLatestChamberThreadForMember: (memberId: string) => Conversation | undefined;
  sendHallDraftMessage: (
    text: string,
    hallMode?: 'advisory' | 'roundtable',
    routingMode?: 'auto' | 'manual',
    manualMemberIds?: string[]
  ) => Promise<Conversation>;
  sendMessageToChamberMember: (memberId: string, text: string) => Promise<Conversation>;
  sendUserMessage: (
    conversationId: string,
    text: string,
    mentionedMemberIds?: string[]
  ) => Promise<{ messageId: string; previousActiveMessageAt?: number } | undefined>;
  generateDeterministicReplies: (
    conversationId: string,
    text: string,
    mentionedMemberIds?: string[],
    previousActiveMessageAt?: number,
    routingOverride?: {
      mode: 'auto' | 'manual';
      memberIds?: string[];
    }
  ) => Promise<void>;
  refreshRoundtableState: (conversationId: string) => Promise<void>;
  continueRoundtableRound: (conversationId: string) => Promise<void>;
  speakNextRoundtableMember: (conversationId: string, memberId: string) => Promise<void>;
  finishRoundtableRound: (conversationId: string) => Promise<void>;
  addMemberToConversation: (conversationId: string, memberId: string) => Promise<void>;
  removeMemberFromConversation: (conversationId: string, memberId: string) => Promise<void>;
  clearChamberByMember: (memberId: string) => Promise<void>;
  refineLatestChamberResponse: (
    conversationId: string,
    action: 'think_harder' | 'deep_dive' | 'shorter' | 'elaborate'
  ) => Promise<void>;
  setNotebookOpen: (open: boolean) => void;
  toggleNotebookOpen: () => void;
  setNotebookMobileSnap: (snap: 0.3 | 0.5 | 1) => void;
  ensureNotebookLoaded: (conversationId: string, force?: boolean) => Promise<void>;
  loadActiveNotebooks: (force?: boolean) => Promise<void>;
  setNotebookDraft: (conversationId: string, content: string) => void;
  saveNotebook: (conversationId: string) => Promise<void>;
  appendMessageToNotebook: (conversationId: string, text: string, authorName?: string) => Promise<void>;
  dismissChamberTimeAwareReentryNotice: (conversationId: string) => void;
  showToast: (message: string) => void;
  dismissToast: (toastId: string) => void;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  createMember: (payload: CreateMemberPayload) => Promise<Member>;
  updateMember: (memberId: string, patch: Partial<CreateMemberPayload>) => Promise<Member>;
  generateMemberGuidanceProfile: (memberId: string, force?: boolean) => Promise<{ guidanceProfilePrompt: string; model: string }>;
  generateMemberVoicePersona: (memberId: string, force?: boolean) => Promise<{ ttsPersonaPrompt: string; model: string }>;
  setMessageFeedback: (messageId: string, key: MessageFeedbackKey, active: boolean) => Promise<void>;
  setMessagePinned: (messageId: string, active: boolean) => Promise<void>;
  retryFailedMessage: (messageId: string) => Promise<void>;
  archiveMember: (memberId: string) => Promise<void>;
  uploadDocsForMember: (memberId: string, files: File[]) => Promise<void>;
  fetchDocsForMember: (memberId: string) => Promise<void>;
  hydrateMemberDocuments: () => Promise<void>;
  deleteDocForMember: (memberId: string, kbDocumentId: string) => Promise<{ ok: boolean; error?: string }>;
  retryKbDocumentIndexForMember: (memberId: string, kbDocumentId: string) => Promise<{ ok: boolean; error?: string }>;
  retryKbDocumentMetadataForMember: (memberId: string, kbDocumentId: string) => Promise<{ ok: boolean; error?: string }>;
}

type BuildMessageInput = Omit<Message, 'id' | 'createdAt' | 'compacted'>;
type ConversationPatch = Partial<Conversation> | ((conversation: Conversation) => Conversation);
type ConversationStateSlice = Pick<AppState, 'conversations'>;

function mapNotebooksByConversation(notebooks: ConversationNotebook[]) {
  return Object.fromEntries(notebooks.map((notebook) => [notebook.conversationId, notebook])) as Record<
    string,
    ConversationNotebook
  >;
}

function removeKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

function isVisibleMessage(message: Message) {
  return !message.deletedAt && !message.supersededAt && !message.compacted;
}

function isClosedHallConversation(conversation: Conversation | undefined) {
  return conversation?.kind === 'hall' && Boolean(conversation.closedAt);
}

function getBaseGenerationProfile(mode: ChamberResponseMode | undefined): {
  chatProfile: ChamberResponseMode;
  retrievalStrategy: RetrievalStrategy;
} {
  switch (mode) {
    case 'short':
      return { chatProfile: 'short', retrievalStrategy: 'instant' };
    case 'think':
      return { chatProfile: 'think', retrievalStrategy: 'instant' };
    case 'brainstorm':
      return { chatProfile: 'instant', retrievalStrategy: 'brainstorm' };
    case 'deep_dive':
      return { chatProfile: 'think', retrievalStrategy: 'deep_dive' };
    default:
      return { chatProfile: 'instant', retrievalStrategy: 'instant' };
  }
}

function resolveRefinementProfiles(action: 'think_harder' | 'deep_dive' | 'shorter' | 'elaborate') {
  if (action === 'think_harder') {
    return { chatProfile: 'think' as const, retrievalStrategy: 'instant' as const, turnDirective: undefined };
  }
  if (action === 'deep_dive') {
    return { chatProfile: 'think' as const, retrievalStrategy: 'deep_dive' as const, turnDirective: undefined };
  }
  if (action === 'shorter') {
    return { chatProfile: 'instant' as const, retrievalStrategy: 'instant' as const, turnDirective: 'shorter' as const };
  }
  return { chatProfile: 'instant' as const, retrievalStrategy: 'instant' as const, turnDirective: 'elaborate' as const };
}

function getRefinementGenerationProfile(
  action: 'think_harder' | 'deep_dive' | 'shorter' | 'elaborate'
): ChamberResponseMode {
  switch (action) {
    case 'think_harder':
      return 'think';
    case 'deep_dive':
      return 'deep_dive';
    case 'shorter':
      return 'short';
    default:
      return 'instant';
  }
}

function getLatestVisibleChamberMemberMessage(messages: Message[], conversationId: string): Message | undefined {
  return messages
    .filter(
      (message) =>
        message.conversationId === conversationId &&
        message.role === 'member' &&
        message.status === 'sent' &&
        isVisibleMessage(message)
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

const TIME_AWARE_REENTRY_MIN_GAP_MS = 60 * 60 * 1000;
const TIME_AWARE_REENTRY_MEDIUM_GAP_MS = 6 * 60 * 60 * 1000;
const TIME_AWARE_REENTRY_STRONG_GAP_MS = 24 * 60 * 60 * 1000;
const TIME_AWARE_REENTRY_VERY_STRONG_GAP_MS = 3 * 24 * 60 * 60 * 1000;

const EXPLICIT_CONTINUATION_PATTERNS = [
  /\bcontinue\b/i,
  /\bpick(?:ing)? up\b/i,
  /\bwhere we left off\b/i,
  /\bfollowing up\b/i,
  /\bas we were saying\b/i,
  /\babout that\b/i,
];

const FEEDBACK_LABELS: Record<MessageFeedbackKey, string> = {
  like: 'Liked',
  dislike: 'Not helpful',
  helpful: 'Helpful',
  not_helpful: 'Not helpful',
  shorter: 'Shorter replies',
  longer: 'Longer replies',
  clearer: 'Clearer replies',
  more_direct: 'More direct replies',
  softer: 'Softer replies',
  harder: 'Harder replies',
};

function feedbackToastMessage(key: MessageFeedbackKey, active: boolean) {
  const label = FEEDBACK_LABELS[key];
  return active ? `${label} activated` : `${label} removed`;
}

function mapFeedbackRows(rows: Array<{ messageId: string; key: MessageFeedbackKey }>) {
  const grouped: Record<string, MessageFeedbackKey[]> = {};
  for (const row of rows) {
    grouped[row.messageId] = [...(grouped[row.messageId] ?? []), row.key];
  }
  return grouped;
}

function findRetrySourceUserMessage(messages: Message[], failedMessage: Message): Message | undefined {
  return messages
    .filter((message) =>
      message.conversationId === failedMessage.conversationId &&
      message.role === 'user' &&
      message.status === 'sent' &&
      isVisibleMessage(message) &&
      message.createdAt <= failedMessage.createdAt
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

function getLatestActiveNonSystemMessageAt(messages: Message[], conversationId: string): number | undefined {
  let latest = 0;
  for (const message of messages) {
    if (message.conversationId !== conversationId) continue;
    if (message.role === 'system') continue;
    if (message.status === 'error') continue;
    if (!isVisibleMessage(message)) continue;
    latest = Math.max(latest, message.createdAt);
  }
  return latest > 0 ? latest : undefined;
}

function classifyTimeAwareReentryGap(gapMs: number): TimeAwareReentryGapBucket | undefined {
  if (gapMs < TIME_AWARE_REENTRY_MIN_GAP_MS) return undefined;
  if (gapMs < TIME_AWARE_REENTRY_MEDIUM_GAP_MS) return 'mild';
  if (gapMs < TIME_AWARE_REENTRY_STRONG_GAP_MS) return 'medium';
  if (gapMs < TIME_AWARE_REENTRY_VERY_STRONG_GAP_MS) return 'strong';
  return 'very_strong';
}

function demoteTimeAwareReentryGap(
  bucket: TimeAwareReentryGapBucket
): TimeAwareReentryGapBucket | undefined {
  switch (bucket) {
    case 'very_strong':
      return 'strong';
    case 'strong':
      return 'medium';
    case 'medium':
      return 'mild';
    default:
      return undefined;
  }
}

function isExplicitContinuation(text: string): boolean {
  return EXPLICIT_CONTINUATION_PATTERNS.some((pattern) => pattern.test(text));
}

function buildMessage(input: BuildMessageInput): Message {
  const renderId = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  return {
    ...input,
    id: renderId,
    renderId,
    compacted: false,
    createdAt: Date.now(),
  };
}

function replaceOptimisticMessages(
  messages: Message[],
  optimisticMessages: Message[],
  persistedMessages: Message[]
): Message[] {
  const replacements = new Map<string, Message>();
  optimisticMessages.forEach((message, index) => {
    const persisted = persistedMessages[index];
    if (persisted) {
      replacements.set(message.id, {
        ...persisted,
        renderId: message.renderId ?? message.id,
      });
    }
  });
  if (replacements.size === 0) {
    return messages;
  }
  return messages.map((message) => replacements.get(message.id) ?? message);
}

function patchConversationEverywhere(
  state: ConversationStateSlice,
  conversationId: string,
  patch: ConversationPatch
): ConversationStateSlice {
  const conversations = state.conversations.map((item) => {
    if (item.id !== conversationId) return item;
    return typeof patch === 'function' ? patch(item) : { ...item, ...patch };
  });
  return { conversations };
}

function updateConversationStamp(
  state: ConversationStateSlice,
  conversationId: string,
  includeMessageActivity = false
): ConversationStateSlice {
  const now = Date.now();
  return patchConversationEverywhere(state, conversationId, {
    updatedAt: now,
    ...(includeMessageActivity ? { lastMessageAt: now } : {}),
  });
}

function listChamberThreadsForMember(
  conversations: Conversation[],
  memberId: string
): Conversation[] {
  return conversations
    .filter(
      (conversation) =>
        conversation.kind === 'chamber' &&
        conversation.chamberMemberId === memberId &&
        !conversation.deletedAt
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function getLatestChamberThreadForMember(
  conversations: Conversation[],
  memberId: string
): Conversation | undefined {
  return listChamberThreadsForMember(conversations, memberId)[0];
}

function buildMemberContextWindow(
  messages: Message[],
  conversationId: string,
  memberId: string,
  conversationKind: Conversation['kind'],
  membersById: Map<string, Member>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const filtered = messages
    .filter((msg) => {
      if (msg.conversationId !== conversationId) return false;
      if (!isVisibleMessage(msg)) return false;
      if (msg.role === 'system') return false;
      if (msg.status === 'error') return false;
      if (msg.role === 'user') return true;
      if (msg.role === 'member') {
        return true;
      }
      return false;
    });

  const scoped = conversationKind === 'hall' ? filtered : filtered.slice(-12);

  return scoped
    .map((msg) => {
      if (msg.role === 'user') {
        return {
          role: 'user' as const,
          content: msg.content,
        };
      }
      if (conversationKind === 'hall') {
        const authorName = msg.authorMemberId
          ? (membersById.get(msg.authorMemberId)?.name ?? 'Member')
          : 'Member';
        const selfTag = msg.authorMemberId === memberId ? ' (you)' : '';
        return {
          role: 'assistant' as const,
          content: `${authorName}${selfTag}: ${msg.content}`,
        };
      }
      return {
        role: 'assistant' as const,
        content: msg.content,
      };
    });
}

function buildHallSystemContext(
  member: Member,
  activeParticipants: Member[],
  rawMessages: Message[],
  roundSummaries: string[],
  hallMode: 'advisory' | 'roundtable',
  conversationId: string,
): string {
  const presentMemberNames = activeParticipants.map((m) => m.name);
  const otherNames = activeParticipants.filter((m) => m.id !== member.id).map((m) => m.name);

  const latestInteractions = rawMessages
    .filter(
      (msg) =>
        msg.conversationId === conversationId &&
        isVisibleMessage(msg) &&
        msg.role !== 'system' &&
        msg.status !== 'error'
    )
    .slice(-10)
    .map((msg) => {
      const author =
        msg.role === 'user'
          ? 'User'
          : (activeParticipants.find((m) => m.id === msg.authorMemberId)?.name ?? 'Member');
      return `${author}: ${msg.content}`;
    });

  const modeLine =
    hallMode === 'roundtable'
      ? 'Mode: roundtable (selected speakers contribute each round).'
      : 'Mode: advisory (multiple members respond to the same user turn).';

  return [
    '[Hall Deliberation Context]',
    'You are participating in a live council discussion.',
    modeLine,
    `Participants: ${presentMemberNames.join(', ') || member.name}.`,
    `Other members currently present: ${otherNames.join(', ') || 'none'}.`,
    '',
    '[Completed Round Summaries]',
    roundSummaries.length > 0 ? roundSummaries.join('\n\n') : '(none yet)',
    '',
    '[Latest Interactions]',
    latestInteractions.length > 0 ? latestInteractions.join('\n') : '(none yet)',
    '',
    '[Response Rules]',
    'Use the context above to stay grounded in the ongoing discussion without collapsing into consensus.',
    "Do not prefix your reply with your name or any speaker label (for example, do not write 'Name:').",
    'Give one concise contribution for this turn unless the user explicitly asks for detailed elaboration.',
    'You may genuinely agree, disagree, partially agree, or change your mind when the discussion earns it.',
    'Do not smooth over differences just to sound collaborative.',
    'If another member already covered your exact point, add only what is materially different.',
  ].join('\n');
}

function stripLeadingSpeakerLabel(text: string, memberName: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const first = (lines[0] ?? '').trim();
  const normalized = memberName.trim().toLowerCase();
  const firstLower = first.toLowerCase();
  if (
    normalized &&
    (firstLower === `${normalized}:` ||
      firstLower === `${normalized} -` ||
      firstLower === `${normalized} —`)
  ) {
    const rest = lines.slice(1).join('\n').trim();
    return rest || text;
  }
  return text;
}

function selectOpeningRoundMembers(candidates: RoundtableState['candidates']): string[] {
  const shortlisted = candidates
    .filter((candidate) => candidate.status === 'shortlisted' || candidate.status === 'speaking')
    .sort((left, right) => left.rank - right.rank)
    .map((candidate) => candidate.memberId);
  if (shortlisted.length > 0) return shortlisted;
  return candidates.map((candidate) => candidate.memberId);
}

function buildHallRoundAssignments(
  messages: Message[],
  conversationId: string,
  hallMode?: 'advisory' | 'roundtable'
): Map<string, number> {
  const ordered = messages
    .filter((msg) => msg.conversationId === conversationId && isVisibleMessage(msg) && msg.status !== 'error')
    .sort((a, b) => a.createdAt - b.createdAt);

  if (hallMode === 'roundtable') {
    const assignments = new Map<string, number>();
    let fallbackRound = 0;

    for (const msg of ordered) {
      if (msg.role === 'system') continue;
      if (typeof msg.roundNumber === 'number') {
        assignments.set(msg.id, msg.roundNumber);
        fallbackRound = Math.max(fallbackRound, msg.roundNumber);
        continue;
      }
      if (msg.role === 'user') {
        fallbackRound += 1;
        assignments.set(msg.id, Math.max(1, fallbackRound));
        continue;
      }
      assignments.set(msg.id, Math.max(1, fallbackRound || 1));
    }

    return assignments;
  }

  const assignments = new Map<string, number>();
  let currentUserRound = 0;
  for (const msg of ordered) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user') {
      currentUserRound += 1;
      assignments.set(msg.id, currentUserRound);
      continue;
    }

    const explicitRound = typeof msg.roundNumber === 'number' ? msg.roundNumber : undefined;
    const fallbackRound = currentUserRound > 0 ? currentUserRound : 1;
    assignments.set(msg.id, explicitRound ?? fallbackRound);
  }

  return assignments;
}

function buildHallRoundAwareContext(options: {
  messages: Message[];
  conversationId: string;
  hallMemoryLogs: ConversationMemoryLog[];
  rawRoundTail: number;
  hallMode?: 'advisory' | 'roundtable';
}) {
  const assignments = buildHallRoundAssignments(options.messages, options.conversationId, options.hallMode);
  const maxRound = Math.max(0, ...Array.from(assignments.values()));
  const firstRawRound = Math.max(1, maxRound - Math.max(1, options.rawRoundTail) + 1);

  const rawMessages = options.messages.filter((msg) => {
    if (msg.conversationId !== options.conversationId) return false;
    if (!isVisibleMessage(msg) || msg.status === 'error' || msg.role === 'system') return false;
    const round = assignments.get(msg.id);
    if (typeof round !== 'number') return true;
    return round >= firstRawRound;
  });

  const roundSummaries = options.hallMemoryLogs
    .filter((row) => row.scope === 'hall' && typeof row.roundNumber === 'number' && row.roundNumber < firstRawRound)
    .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0))
    .map((row) => row.memory?.trim())
    .filter((row): row is string => Boolean(row));

  return {
    roundAssignments: assignments,
    maxRound,
    firstRawRound,
    rawMessages,
    roundSummaries,
  };
}

async function maybeCompact(
  conversationId: string,
  conversation: Conversation,
  compactionPolicy: CompactionPolicy,
  previousMemory?: string,
  memoryContext?: {
    memberName: string;
    memberSpecialties: string[];
  }
): Promise<{ summary: string; activeMessages: Message[] } | null> {
  if (conversation.kind !== 'chamber') {
    return null;
  }
  void compactionPolicy;
  void previousMemory;
  void memoryContext;
  const [latestLog, activeMessages] = await Promise.all([
    councilRepository.getLatestChamberMemoryLog(conversationId),
    councilRepository.listMessages(conversationId),
  ]);
  return {
    summary: latestLog?.memory ?? '',
    activeMessages,
  };
}

function lifecycleToMemberDocuments(rows: KbDocumentLifecycle[]): Array<{ name?: string; displayName?: string }> {
  return rows
    .filter((row) => row.indexingStatus === 'completed')
    .map((row) => ({
      name: row.kbDocumentName,
      displayName: row.displayName,
    }));
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  isRouting: false,
  routingConversationId: undefined,
  closingConversationId: undefined,
  themeMode: 'system',
  members: [],
  conversations: [],
  messages: [],
  selectedConversationId: '',
  pendingReplyCount: {},
  pendingReplyMemberIds: {},
  compactionCheckInFlightByConversation: {},
  memberDocuments: {},
  kbDocumentsByMember: {},
  kbUploadProgressByMember: {},
  kbDeletingDocumentIds: {},
  kbRetryingIndexDocumentIds: {},
  kbRetryingMetadataDocumentIds: {},
  chamberMemoryByConversation: {},
  hallParticipantsByConversation: {},
  roundtableStateByConversation: {},
  roundtablePreparingByConversation: {},
  hallSummaryFailureCountByConversation: {},
  messageFeedbackByMessageId: {},
  conversationNotebooksByConversation: {},
  notebookDraftByConversation: {},
  notebookSaveStateByConversation: {},
  notebookErrorByConversation: {},
  notebookLoadedByConversation: {},
  notebookListLoaded: false,
  notebookOpen: false,
  notebookMobileSnap: 0.5,
  timeAwareReentryNoticePendingByConversation: {},
  toasts: [],
  messagePaginationByConversation: {},
  compactionPolicy: COMPACTION_POLICY_DEFAULTS,
  refiningActionByMessageId: {},
  retryingMessageIds: {},

  refreshCompactionPolicy: async () => {
    const policy = await councilRepository.getCompactionPolicy();
    set({ compactionPolicy: policy });
    return policy;
  },

  setNotebookOpen: (open) => {
    set({ notebookOpen: open });
  },

  toggleNotebookOpen: () => {
    set((state) => ({ notebookOpen: !state.notebookOpen }));
  },

  setNotebookMobileSnap: (snap) => {
    set({ notebookMobileSnap: snap });
  },

  ensureNotebookLoaded: async (conversationId, force = false) => {
    if (!force && get().notebookLoadedByConversation[conversationId]) {
      return;
    }

    const notebook = await councilRepository.getConversationNotebook(conversationId);
    set((state) => ({
      conversationNotebooksByConversation: notebook
        ? {
            ...state.conversationNotebooksByConversation,
            [conversationId]: notebook,
          }
        : removeKey(state.conversationNotebooksByConversation, conversationId),
      notebookDraftByConversation:
        force || !(conversationId in state.notebookDraftByConversation)
          ? {
              ...state.notebookDraftByConversation,
              [conversationId]: notebook?.content ?? '',
            }
          : state.notebookDraftByConversation,
      notebookSaveStateByConversation: {
        ...state.notebookSaveStateByConversation,
        [conversationId]: 'idle',
      },
      notebookErrorByConversation: {
        ...state.notebookErrorByConversation,
        [conversationId]: undefined,
      },
      notebookLoadedByConversation: {
        ...state.notebookLoadedByConversation,
        [conversationId]: true,
      },
    }));
  },

  loadActiveNotebooks: async (force = false) => {
    if (!force && get().notebookListLoaded) {
      return;
    }

    const notebooks = await councilRepository.listActiveConversationNotebooks();
    const byConversation = mapNotebooksByConversation(notebooks);
    set((state) => ({
      conversationNotebooksByConversation: byConversation,
      notebookDraftByConversation: {
        ...state.notebookDraftByConversation,
        ...Object.fromEntries(
          Object.entries(byConversation).map(([conversationId, notebook]) => [
            conversationId,
            state.notebookDraftByConversation[conversationId] ?? notebook.content,
          ])
        ),
      },
      notebookLoadedByConversation: {
        ...state.notebookLoadedByConversation,
        ...Object.fromEntries(notebooks.map((notebook) => [notebook.conversationId, true])),
      },
      notebookListLoaded: true,
    }));
  },

  setNotebookDraft: (conversationId, content) => {
    set((state) => ({
      notebookDraftByConversation: {
        ...state.notebookDraftByConversation,
        [conversationId]: content,
      },
      notebookSaveStateByConversation: {
        ...state.notebookSaveStateByConversation,
        [conversationId]: 'idle',
      },
      notebookErrorByConversation: {
        ...state.notebookErrorByConversation,
        [conversationId]: undefined,
      },
    }));
  },

  saveNotebook: async (conversationId) => {
    const content = get().notebookDraftByConversation[conversationId] ?? '';
    set((state) => ({
      notebookSaveStateByConversation: {
        ...state.notebookSaveStateByConversation,
        [conversationId]: 'saving',
      },
      notebookErrorByConversation: {
        ...state.notebookErrorByConversation,
        [conversationId]: undefined,
      },
    }));

    try {
      const notebook = await councilRepository.saveConversationNotebook(conversationId, content);
      set((state) => ({
        conversationNotebooksByConversation: notebook
          ? {
              ...state.conversationNotebooksByConversation,
              [conversationId]: notebook,
            }
          : removeKey(state.conversationNotebooksByConversation, conversationId),
        notebookDraftByConversation: {
          ...state.notebookDraftByConversation,
          [conversationId]: notebook?.content ?? '',
        },
        notebookSaveStateByConversation: {
          ...state.notebookSaveStateByConversation,
          [conversationId]: 'saved',
        },
        notebookErrorByConversation: {
          ...state.notebookErrorByConversation,
          [conversationId]: undefined,
        },
        notebookLoadedByConversation: {
          ...state.notebookLoadedByConversation,
          [conversationId]: true,
        },
      }));
    } catch (error) {
      set((state) => ({
        notebookSaveStateByConversation: {
          ...state.notebookSaveStateByConversation,
          [conversationId]: 'error',
        },
        notebookErrorByConversation: {
          ...state.notebookErrorByConversation,
          [conversationId]: error instanceof Error ? error.message : 'Could not save notebook.',
        },
      }));
      throw error;
    }
  },

  appendMessageToNotebook: async (conversationId, text, authorName) => {
    await get().ensureNotebookLoaded(conversationId);
    const current = get().notebookDraftByConversation[conversationId] ?? '';
    const block = authorName ? `${authorName}\n${text}` : text;
    const appended = current.trim().length > 0 ? `${current}\n\n${block}` : block;
    get().setNotebookDraft(conversationId, appended);
    get().showToast('Added to Notebook');
    void get().saveNotebook(conversationId);
  },

  dismissChamberTimeAwareReentryNotice: (conversationId) => {
    set((state) => ({
      timeAwareReentryNoticePendingByConversation: removeKey(
        state.timeAwareReentryNoticePendingByConversation,
        conversationId
      ),
    }));
  },

  showToast: (message) => {
    const toastId = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { id: toastId, message }],
    }));
    window.setTimeout(() => {
      get().dismissToast(toastId);
    }, 1800);
  },

  dismissToast: (toastId) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== toastId),
    }));
  },

  initializeApp: async () => {
    if (get().hydrated) return;
    if (initializeAppPromise) {
      await initializeAppPromise;
      return;
    }

    initializeAppPromise = (async () => {
      await councilRepository.init();
      const [snapshot, policy] = await Promise.all([
        councilRepository.getSnapshot(),
        councilRepository.getCompactionPolicy(),
      ]);

      const conversations = snapshot.conversations
        .filter((item) => !item.deletedAt)
        .sort((a, b) => b.updatedAt - a.updatedAt);

      const firstHall = conversations.find((item) => item.kind === 'hall');

      set({
        hydrated: true,
        themeMode: snapshot.themeMode,
        members: snapshot.members,
        conversations,
        chamberMemoryByConversation: {},
        roundtableStateByConversation: {},
        roundtablePreparingByConversation: {},
        compactionPolicy: policy,
        selectedConversationId: firstHall?.id ?? '',
      });

      const hallIds = conversations.filter((item) => item.kind === 'hall').map((item) => item.id);
      await Promise.all(hallIds.map((conversationId) => get().refreshHallParticipants(conversationId)));
      await Promise.all(
        conversations
          .filter((item) => item.kind === 'hall' && item.hallMode === 'roundtable')
          .map((item) => get().refreshRoundtableState(item.id))
      );

      if (firstHall) {
        await get().loadMessages(firstHall.id);
      }
    })();

    try {
      await initializeAppPromise;
    } finally {
      initializeAppPromise = null;
    }
  },

  selectConversation: (conversationId) => {
    set({ selectedConversationId: conversationId });
    const already = get().messages.some((m) => m.conversationId === conversationId);
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (conversation?.kind === 'hall' && conversation.hallMode === 'roundtable') {
      void get().refreshRoundtableState(conversationId);
    }
    if (!already) {
      void get().loadMessages(conversationId);
    }
  },

  loadMessages: async (conversationId) => {
    const [page, feedbackRows] = await Promise.all([
      councilRepository.listMessagesPage(conversationId, { limit: 40 }),
      councilRepository.listMessageFeedback(conversationId),
    ]);
    const msgs = page.messages;
    set((state) => ({
      messages: [
        ...state.messages.filter((m) => m.conversationId !== conversationId),
        ...msgs.sort((a, b) => a.createdAt - b.createdAt),
      ],
      messagePaginationByConversation: {
        ...state.messagePaginationByConversation,
        [conversationId]: {
          continueCursor: page.continueCursor,
          hasOlder: page.hasMore,
          isLoadingOlder: false,
        },
      },
      messageFeedbackByMessageId: {
        ...state.messageFeedbackByMessageId,
        ...mapFeedbackRows(feedbackRows),
      },
    }));
    void get().evaluateChamberCompactionOnLoad(conversationId);
    void get().refreshRoundtableState(conversationId);
  },

  loadOlderMessages: async (conversationId) => {
    const pagination = get().messagePaginationByConversation[conversationId];
    if (!pagination || pagination.isLoadingOlder || !pagination.hasOlder || !pagination.continueCursor) {
      return;
    }

    set((state) => ({
      messagePaginationByConversation: {
        ...state.messagePaginationByConversation,
        [conversationId]: {
          ...pagination,
          isLoadingOlder: true,
        },
      },
    }));

    try {
      const [page, feedbackRows] = await Promise.all([
        councilRepository.listMessagesPage(conversationId, {
          cursor: pagination.continueCursor,
          limit: 30,
        }),
        councilRepository.listMessageFeedback(conversationId),
      ]);

      set((state) => {
        const existing = state.messages.filter((m) => m.conversationId === conversationId);
        const keepOther = state.messages.filter((m) => m.conversationId !== conversationId);
        const combined = [...page.messages, ...existing].sort((a, b) => a.createdAt - b.createdAt);
        const deduped = combined.filter((message, index, list) => list.findIndex((m) => m.id === message.id) === index);
        return {
          messages: [...keepOther, ...deduped],
          messagePaginationByConversation: {
            ...state.messagePaginationByConversation,
            [conversationId]: {
              continueCursor: page.continueCursor,
              hasOlder: page.hasMore,
              isLoadingOlder: false,
            },
          },
          messageFeedbackByMessageId: {
            ...state.messageFeedbackByMessageId,
            ...mapFeedbackRows(feedbackRows),
          },
        };
      });
    } catch {
      set((state) => ({
        messagePaginationByConversation: {
          ...state.messagePaginationByConversation,
          [conversationId]: {
            ...state.messagePaginationByConversation[conversationId],
            isLoadingOlder: false,
          },
        },
      }));
    }
  },

  evaluateChamberCompactionOnLoad: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'chamber') return;
    if (get().compactionCheckInFlightByConversation[conversationId]) return;

    set((state) => ({
      compactionCheckInFlightByConversation: {
        ...state.compactionCheckInFlightByConversation,
        [conversationId]: true,
      },
    }));

    try {
      const [policy, latestLog, activeMessages] = await Promise.all([
        councilRepository.getCompactionPolicy(),
        councilRepository.getLatestChamberMemoryLog(conversationId),
        councilRepository.listMessages(conversationId),
      ]);
      set({ compactionPolicy: policy });
      set((state) => ({
        ...patchConversationEverywhere(state, conversationId, { updatedAt: Date.now() }),
        chamberMemoryByConversation: {
          ...state.chamberMemoryByConversation,
          [conversationId]: latestLog?.memory ?? '',
        },
        messages: [
          ...state.messages.filter((item) => item.conversationId !== conversationId),
          ...activeMessages,
        ],
      }));
    } catch (error) {
      void error;
    } finally {
      set((state) => ({
        compactionCheckInFlightByConversation: {
          ...state.compactionCheckInFlightByConversation,
          [conversationId]: false,
        },
      }));
    }
  },

  refreshRoundtableState: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall' || conversation.hallMode !== 'roundtable' || conversation.closedAt) {
      return;
    }

    const state = await getRoundtableState(conversationId);
    set((current) => ({
      roundtableStateByConversation: {
        ...current.roundtableStateByConversation,
        [conversationId]: state,
      },
    }));
  },

  continueRoundtableRound: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall' || conversation.hallMode !== 'roundtable' || conversation.closedAt) {
      return;
    }
    const snapshot = get().roundtableStateByConversation[conversationId];
    if (snapshot && (snapshot.round.status === 'awaiting_user' || snapshot.round.status === 'in_progress')) {
      return;
    }

    set((state) => ({
      roundtablePreparingByConversation: {
        ...state.roundtablePreparingByConversation,
        [conversationId]: true,
      },
    }));

    try {
      const next = await prepareRoundtableRound({
        conversationId,
        trigger: 'continue',
      });

      set((state) => ({
        roundtableStateByConversation: {
          ...state.roundtableStateByConversation,
          [conversationId]: next,
        },
      }));
    } finally {
      set((state) => ({
        roundtablePreparingByConversation: {
          ...state.roundtablePreparingByConversation,
          [conversationId]: false,
        },
      }));
    }
  },

  speakNextRoundtableMember: async (conversationId, memberId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall' || conversation.hallMode !== 'roundtable' || conversation.closedAt) {
      return;
    }

    const snapshot = get().roundtableStateByConversation[conversationId];
    if (!snapshot || snapshot.round.status !== 'awaiting_user') {
      return;
    }

    const roundNumber = snapshot.round.roundNumber;
    if (snapshot.spokenMemberIds.includes(memberId)) {
      return;
    }
    const candidate = snapshot.candidates.find((item) => item.memberId === memberId);
    if (!candidate) {
      return;
    }
    const ready = candidate.status === 'shortlisted' || candidate.status === 'speaking';
    const force = !ready;

    const inProgress = await markRoundtableInProgress({
      conversationId,
      roundNumber,
      speakingMemberId: memberId,
      selectedBy: force ? 'user_manual_fallback' : candidate.selectedBy,
    });

    set((state) => ({
      roundtableStateByConversation: {
        ...state.roundtableStateByConversation,
        [conversationId]: inProgress,
      },
      pendingReplyCount: {
        ...state.pendingReplyCount,
        [conversationId]: 1,
      },
      pendingReplyMemberIds: {
        ...state.pendingReplyMemberIds,
        [conversationId]: [memberId],
      },
    }));

    try {
      const membersById = new Map(get().members.map((member) => [member.id, member]));
      const memberName = membersById.get(memberId)?.name ?? 'Member';
      let reply: Message;

      try {
        const result = await chatRoundtableSpeaker({
          conversationId,
          roundNumber,
          memberId,
          force,
        });
        reply = buildMessage({
          conversationId,
          role: 'member',
          authorMemberId: memberId,
          content: stripLeadingSpeakerLabel(result.answer, memberName),
          status: 'sent',
          roundNumber,
          roundIntent: result.intent,
          roundTargetMemberId: result.targetMemberId,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Request failed';
        reply = buildMessage({
          conversationId,
          role: 'member',
          authorMemberId: memberId,
          content: `${memberName} could not speak in this round.`,
          status: 'error',
          roundNumber,
          error: errorMessage,
        });
      }

      set((state) => ({
        messages: [...state.messages, reply],
        ...updateConversationStamp(state, conversationId, true),
      }));

      const persistedReplies = await councilRepository.appendMessages({
        conversationId,
        messages: [reply],
      });
      set((state) => ({
        messages: replaceOptimisticMessages(state.messages, [reply], persistedReplies),
      }));

      const refreshed = await refreshRoundtableRound({
        conversationId,
        roundNumber,
      });

      set((state) => ({
        roundtableStateByConversation: {
          ...state.roundtableStateByConversation,
          [conversationId]: refreshed,
        },
      }));

      if (refreshed.round.status === 'completed') {
        void get().syncHallRoundSummaries(conversationId);
      }
    } catch (error) {
      await get().refreshRoundtableState(conversationId);
    } finally {
      set((state) => ({
        pendingReplyCount: {
          ...state.pendingReplyCount,
          [conversationId]: 0,
        },
        pendingReplyMemberIds: {
          ...state.pendingReplyMemberIds,
          [conversationId]: [],
        },
      }));
    }
  },

  finishRoundtableRound: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall' || conversation.hallMode !== 'roundtable' || conversation.closedAt) {
      return;
    }

    const snapshot = get().roundtableStateByConversation[conversationId];
    if (!snapshot || (snapshot.round.status !== 'awaiting_user' && snapshot.round.status !== 'in_progress')) {
      return;
    }

    const completed = await markRoundtableCompleted({
      conversationId,
      roundNumber: snapshot.round.roundNumber,
    });

    set((state) => ({
      roundtableStateByConversation: {
        ...state.roundtableStateByConversation,
        [conversationId]: completed,
      },
    }));

    void get().syncHallRoundSummaries(conversationId);
  },

  refreshHallParticipants: async (conversationId) => {
    const participants = await councilRepository.listParticipants(conversationId);
    set((state) => ({
      hallParticipantsByConversation: {
        ...state.hallParticipantsByConversation,
        [conversationId]: participants.map((participant) => participant.memberId),
      },
    }));
  },

  syncHallRoundSummaries: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall') return;

    const state = get();
    const sourceMessages = state.messages
      .filter(
        (message) =>
          message.conversationId === conversationId &&
          isVisibleMessage(message) &&
          message.status !== 'error' &&
          message.role !== 'system'
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    if (sourceMessages.length === 0) return;

    const assignments = buildHallRoundAssignments(
      sourceMessages,
      conversationId,
      conversation.hallMode ?? 'advisory'
    );
    const maxRound = Math.max(0, ...Array.from(assignments.values()));
    const rawTail = Math.max(1, state.compactionPolicy.hallRawRoundTail);
    const summarizeUntilRound = maxRound - rawTail;
    if (summarizeUntilRound <= 0) return;

    const [existingLogs, counts] = await Promise.all([
      councilRepository.listMemoryLogsByScope(conversationId, 'hall'),
      councilRepository.getMessageCounts(conversationId),
    ]);

    const existingRounds = new Set(
      existingLogs
        .filter((row) => typeof row.roundNumber === 'number' && row.memory)
        .map((row) => row.roundNumber as number)
    );
    const membersById = new Map(get().members.map((member) => [member.id, member]));

    for (let roundNumber = 1; roundNumber <= summarizeUntilRound; roundNumber += 1) {
      if (existingRounds.has(roundNumber)) continue;

      const roundMessages = sourceMessages.filter((message) => assignments.get(message.id) === roundNumber);
      const speakerMessages = roundMessages.filter((message) => message.role === 'member');
      if (speakerMessages.length === 0) continue;

      const transcript = roundMessages.map((message) => ({
        author:
          message.role === 'user'
            ? 'User'
            : (membersById.get(message.authorMemberId ?? '')?.name ?? 'Member'),
        content: message.content,
      }));

      try {
        const summarized = await councilRepository.summarizeHallRound({
          conversationId,
          roundNumber,
          messages: transcript,
        });

        await councilRepository.upsertHallRoundSummary({
          conversationId,
          roundNumber,
          memory: summarized.summary,
          recentRawTail: rawTail,
          totalMessagesAtRun: counts.totalNonSystem,
          activeMessagesAtRun: counts.activeNonSystem,
          compactedMessageCount: roundMessages.length,
        });
      } catch {
        // Non-fatal: round context can fall back to raw tail when summary generation fails.
        set((current) => ({
          hallSummaryFailureCountByConversation: {
            ...current.hallSummaryFailureCountByConversation,
            [conversationId]: (current.hallSummaryFailureCountByConversation[conversationId] ?? 0) + 1,
          },
        }));
      }
    }
  },

  createConversation: async (type) => {
    if (type !== 'hall') {
      throw new Error('Use createChamberThread for chamber conversations');
    }

    const created = await councilRepository.createHall({
      title: 'New Hall',
      memberIds: [],
    });

    set((state) => ({
      conversations: [created, ...state.conversations],
      selectedConversationId: created.id,
      hallParticipantsByConversation: {
        ...state.hallParticipantsByConversation,
        [created.id]: [],
      },
    }));

    return created;
  },

  setChamberResponseMode: async (conversationId, mode) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'chamber') return;
    const updated = await councilRepository.setChamberResponseMode(conversationId, mode);
    set((state) => ({
      conversations: state.conversations.map((item) => (item.id === conversationId ? updated : item)),
    }));
  },

  setChamberTimeAwareReentryEnabled: async (conversationId, enabled) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'chamber') return;
    const updated = await councilRepository.setChamberTimeAwareReentryEnabled(conversationId, enabled);
    set((state) => ({
      conversations: state.conversations.map((item) => (item.id === conversationId ? updated : item)),
      timeAwareReentryNoticePendingByConversation: enabled
        ? state.timeAwareReentryNoticePendingByConversation
        : removeKey(state.timeAwareReentryNoticePendingByConversation, conversationId),
    }));
  },

  markChamberTimeAwareReentryNoticeSeen: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'chamber') return;
    const updated = await councilRepository.markChamberTimeAwareReentryNoticeSeen(conversationId);
    set((state) => ({
      conversations: state.conversations.map((item) => (item.id === conversationId ? updated : item)),
      timeAwareReentryNoticePendingByConversation: removeKey(
        state.timeAwareReentryNoticePendingByConversation,
        conversationId
      ),
    }));
  },

  renameConversation: async (conversationId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const updated = await councilRepository.renameConversation(conversationId, trimmed);
    set((state) => ({
      conversations: state.conversations.map((item) =>
        item.id === conversationId ? updated : item
      ),
    }));
  },

  archiveConversation: async (conversationId) => {
    await councilRepository.archiveConversation(conversationId);
    set((state) => {
      const conversationMessageIds = new Set(
        state.messages
          .filter((message) => message.conversationId === conversationId)
          .map((message) => message.id)
      );
      const nextConversations = state.conversations.filter((item) => item.id !== conversationId);
      const { [conversationId]: _removed, ...nextParticipants } = state.hallParticipantsByConversation;
      const { [conversationId]: _removedRoundtable, ...nextRoundtable } = state.roundtableStateByConversation;
      const { [conversationId]: _removedPreparing, ...nextPreparing } = state.roundtablePreparingByConversation;
      const nextFeedback = Object.fromEntries(
        Object.entries(state.messageFeedbackByMessageId).filter(([messageId]) => !conversationMessageIds.has(messageId))
      );
      return {
        conversations: nextConversations,
        hallParticipantsByConversation: nextParticipants,
        roundtableStateByConversation: nextRoundtable,
        roundtablePreparingByConversation: nextPreparing,
        conversationNotebooksByConversation: removeKey(state.conversationNotebooksByConversation, conversationId),
        notebookDraftByConversation: removeKey(state.notebookDraftByConversation, conversationId),
        notebookSaveStateByConversation: removeKey(state.notebookSaveStateByConversation, conversationId),
        notebookErrorByConversation: removeKey(state.notebookErrorByConversation, conversationId),
        notebookLoadedByConversation: removeKey(state.notebookLoadedByConversation, conversationId),
        messageFeedbackByMessageId: nextFeedback,
        selectedConversationId:
          state.selectedConversationId === conversationId
            ? (nextConversations[0]?.id ?? '')
            : state.selectedConversationId,
      };
    });
  },

  closeHall: async (conversationId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall' || conversation.closedAt) {
      return;
    }

    set({ closingConversationId: conversationId });
    try {
      const result = await councilRepository.closeHall(conversationId);
      set((state) => ({
        ...patchConversationEverywhere(state, conversationId, result.conversation),
        messages: [...state.messages, result.closingMessage],
        closingConversationId: undefined,
        isRouting:
          state.routingConversationId === conversationId ? false : state.isRouting,
        routingConversationId:
          state.routingConversationId === conversationId ? undefined : state.routingConversationId,
        pendingReplyCount: {
          ...state.pendingReplyCount,
          [conversationId]: 0,
        },
        pendingReplyMemberIds: {
          ...state.pendingReplyMemberIds,
          [conversationId]: [],
        },
        roundtableStateByConversation: {
          ...state.roundtableStateByConversation,
          [conversationId]: null,
        },
        roundtablePreparingByConversation: {
          ...state.roundtablePreparingByConversation,
          [conversationId]: false,
        },
      }));
    } catch (error) {
      set({ closingConversationId: undefined });
      get().showToast(error instanceof Error ? error.message : 'Could not close this table.');
      throw error;
    }
  },

  createChamberThread: async (memberId) => {
    const created = await councilRepository.createChamberThread(memberId);

    set((state) => {
      const exists = state.conversations.some((item) => item.id === created.id);
      return {
        conversations: exists
          ? state.conversations.map((item) => (item.id === created.id ? created : item))
          : [created, ...state.conversations],
        selectedConversationId: created.id,
      };
    });

    return created;
  },

  startHallFollowUpThread: async (hallConversationId, hallMessageId) => {
    const result = await councilRepository.startHallFollowUpThread({
      hallConversationId,
      hallMessageId,
    });

    set((state) => {
      const conversation = result.conversation;
      const exists = state.conversations.some((item) => item.id === conversation.id);
      return {
        conversations: exists
          ? state.conversations.map((item) => (item.id === conversation.id ? conversation : item))
          : [conversation, ...state.conversations],
        messages: [
          ...state.messages.filter((message) => message.conversationId !== conversation.id),
          ...result.messages,
        ],
        chamberMemoryByConversation: {
          ...state.chamberMemoryByConversation,
          [conversation.id]: result.memory,
        },
        selectedConversationId: conversation.id,
      };
    });

    return result.conversation;
  },

  listChamberThreadsForMember: (memberId) =>
    listChamberThreadsForMember(get().conversations, memberId),
  getLatestChamberThreadForMember: (memberId) =>
    getLatestChamberThreadForMember(get().conversations, memberId),

  sendHallDraftMessage: async (
    text,
    hallMode = 'advisory',
    routingMode: 'auto' | 'manual' = 'auto',
    manualMemberIds: string[] = []
  ) => {
    const created = await councilRepository.createHall({
      title: 'New Hall',
      memberIds: [],
      hallMode,
    });

    set((state) => ({
      conversations: [created, ...state.conversations],
      selectedConversationId: created.id,
      hallParticipantsByConversation: {
        ...state.hallParticipantsByConversation,
        [created.id]: [],
      },
    }));

    const sendResult = await get().sendUserMessage(created.id, text, []);
    // Generate member replies in background so navigation + first bubble feel immediate.
    void get().generateDeterministicReplies(created.id, text, [], sendResult?.previousActiveMessageAt, {
      mode: routingMode,
      memberIds: manualMemberIds,
    });
    // Generate a smarter hall title from the first user message without blocking UX.
    void suggestHallTitle({ message: text })
      .then((result) => {
        const nextTitle = result.title?.trim();
        if (!nextTitle || nextTitle.toLowerCase() === 'new hall') return;
        return get().renameConversation(created.id, nextTitle);
      })
      .catch(() => undefined);

    return created;
  },

  sendMessageToChamberMember: async (memberId, text) => {
    let conversation = getLatestChamberThreadForMember(get().conversations, memberId);
    if (!conversation) {
      conversation = await councilRepository.createChamberThread(memberId);
      set((state) => {
        const exists = state.conversations.some((item) => item.id === conversation!.id);
        return {
          conversations: exists
            ? state.conversations.map((item) => (item.id === conversation!.id ? conversation! : item))
            : [conversation!, ...state.conversations],
          selectedConversationId: conversation!.id,
        };
      });
    }

    const sendResult = await get().sendUserMessage(conversation.id, text);
    await get().generateDeterministicReplies(
      conversation.id,
      text,
      [],
      sendResult?.previousActiveMessageAt
    );

    return conversation;
  },

  sendUserMessage: async (conversationId, text, mentionedMemberIds = []) => {
    const state = get();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return undefined;
    if (isClosedHallConversation(conversation)) {
      get().showToast('This table is closed.');
      return undefined;
    }
    const previousActiveMessageAt =
      conversation.kind === 'chamber'
        ? getLatestActiveNonSystemMessageAt(state.messages, conversationId)
        : undefined;
    const hasUserMessages = state.messages.some(
      (message) =>
        message.conversationId === conversationId &&
        message.role === 'user' &&
        !message.deletedAt
    );
    const shouldAutoTitle =
      conversation.kind === 'chamber' &&
      conversation.title.trim().toLowerCase() === 'new thread' &&
      !hasUserMessages;
    const nextAdvisoryUserRound =
      state.messages.filter(
        (msg) =>
          msg.conversationId === conversationId &&
          msg.role === 'user' &&
          msg.status !== 'error' &&
          isVisibleMessage(msg)
      ).length + 1;
    const maxExplicitRound = Math.max(
      0,
      ...state.messages
        .filter(
          (msg) =>
            msg.conversationId === conversationId &&
            msg.status !== 'error' &&
            isVisibleMessage(msg) &&
            typeof msg.roundNumber === 'number'
        )
        .map((msg) => msg.roundNumber as number)
    );
    const snapshotRound = state.roundtableStateByConversation[conversationId]?.round.roundNumber ?? 0;
    const hallRoundNumber =
      conversation.kind === 'hall'
        ? conversation.hallMode === 'roundtable'
          ? Math.max(0, maxExplicitRound, snapshotRound) + 1
          : Math.max(1, nextAdvisoryUserRound)
        : undefined;
    const message = buildMessage({
      conversationId,
      role: 'user',
      content: text,
      status: 'sent',
      roundNumber: hallRoundNumber,
    });

    set((state) => ({
      messages: [...state.messages, message],
      ...updateConversationStamp(state, conversationId, true),
    }));

    const persistedMessages = await councilRepository.appendMessages({
      conversationId,
      messages: [message],
    });
    set((state) => ({
      messages: replaceOptimisticMessages(state.messages, [message], persistedMessages),
    }));

    if (shouldAutoTitle) {
      void suggestChamberTitle({ message: text })
        .then((result) => {
          const nextTitle = result.title?.trim();
          if (!nextTitle || nextTitle.toLowerCase() === 'new thread') return;
          const latest = get().conversations.find((item) => item.id === conversationId);
          if (!latest || latest.kind !== 'chamber' || latest.deletedAt) return;
          if (latest.title.trim().toLowerCase() !== 'new thread') return;
          return get().renameConversation(conversationId, nextTitle);
        })
        .catch(() => undefined);
    }

    return { messageId: persistedMessages[0]?.id ?? message.id, previousActiveMessageAt };
  },

  generateDeterministicReplies: async (
    conversationId,
    text,
    mentionedMemberIds = [],
    previousActiveMessageAt,
    routingOverride = { mode: 'auto' as const, memberIds: [] }
  ) => {
    const state = get();
    let conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    if (isClosedHallConversation(conversation)) {
      return;
    }
    let activeTimeAwareReentryState =
      conversation.kind === 'chamber' ? conversation.timeAwareReentryState : undefined;
    const currentHallRoundNumber =
      conversation.kind === 'hall'
        ? Math.max(
          1,
          state.messages.filter(
            (message) =>
              message.conversationId === conversationId &&
              message.role === 'user' &&
              message.status !== 'error' &&
              isVisibleMessage(message)
          ).length
        )
        : undefined;

    if (conversation.kind === 'hall' && conversation.hallMode === 'roundtable') {
      const membersMap = new Map(state.members.map((m) => [m.id, m]));
      const participantIds = state.hallParticipantsByConversation[conversationId] ?? [];
      let activeParticipantIds = participantIds.filter((memberId) => {
        const member = membersMap.get(memberId);
        return Boolean(member && !member.deletedAt);
      });
      const isOpeningRound = activeParticipantIds.length === 0;

      if (isOpeningRound) {
        const candidates = state.members.filter((member) => !member.deletedAt);
        let routedIds: string[] = [];
        let routingSource: MessageRouting['source'] = 'fallback';

        if (routingOverride.mode === 'manual') {
          const allowed = new Set(candidates.map((member) => member.id));
          routedIds = (routingOverride.memberIds ?? []).filter((memberId) => allowed.has(memberId));
        } else {
          set({ isRouting: true, routingConversationId: conversationId });
          try {
            const dynamicMaxSelections = Math.max(1, Math.min(8, Math.ceil(candidates.length * 0.5)));
            const routed = await routeHallMembers({
              message: text,
              conversationId,
              maxSelections: dynamicMaxSelections,
            });
            routedIds = routed.chosenMemberIds;
            routingSource = routed.source;
          } catch {
            routedIds = routeToMembers(text, candidates.map((c) => c.id), conversationId);
            routingSource = 'fallback';
          } finally {
            set({ isRouting: false, routingConversationId: undefined });
          }
        }

        if (routedIds.length === 0 && routingOverride.mode === 'manual') {
          set((current) => ({
            pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: 0 },
            pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: [] },
          }));
          return;
        }

        if (routedIds.length === 0) {
          routedIds = routeToMembers(
            text,
            state.members.filter((member) => !member.deletedAt).map((member) => member.id),
            conversationId
          );
          routingSource = 'fallback';
        }

        await Promise.all(routedIds.map((memberId) => councilRepository.addHallParticipant(conversationId, memberId)));

        activeParticipantIds = routedIds;
        set((current) => ({
          hallParticipantsByConversation: {
            ...current.hallParticipantsByConversation,
            [conversationId]: routedIds,
          },
        }));

        const routeMessage = buildMessage({
          conversationId,
          role: 'system',
          content:
            routingOverride.mode === 'manual'
              ? `Manually routed to ${routedIds.map((id) => membersMap.get(id)?.name ?? id).join(', ')}`
              : `Routed to ${routedIds.map((id) => membersMap.get(id)?.name ?? id).join(', ')}`,
          status: 'sent',
          routing: { memberIds: routedIds, source: routingSource },
        });

        set((current) => ({
          messages: [...current.messages, routeMessage],
          ...updateConversationStamp(current, conversationId, true),
        }));

        const persistedRouteMessages = await councilRepository.appendMessages({
          conversationId,
          messages: [routeMessage],
        });
        set((current) => ({
          messages: replaceOptimisticMessages(current.messages, [routeMessage], persistedRouteMessages),
        }));
      }

      if (activeParticipantIds.length === 0) {
        set((current) => ({
          pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: 0 },
          pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: [] },
        }));
        return;
      }

      set((current) => ({
        roundtablePreparingByConversation: {
          ...current.roundtablePreparingByConversation,
          [conversationId]: true,
        },
      }));

      try {
        const nextRound = await prepareRoundtableRound({
          conversationId,
          trigger: 'user_message',
          mentionedMemberIds: mentionedMemberIds.filter((memberId) => activeParticipantIds.includes(memberId)),
        });

        set((current) => ({
          roundtableStateByConversation: {
            ...current.roundtableStateByConversation,
            [conversationId]: nextRound,
          },
        }));

        if (isOpeningRound && nextRound.round.status === 'awaiting_user') {
          const openingSpeakerIds = selectOpeningRoundMembers(nextRound.candidates);
          if (openingSpeakerIds.length > 0) {
            const inProgress = await markRoundtableInProgress({
              conversationId,
              roundNumber: nextRound.round.roundNumber,
            });

            set((current) => ({
              roundtableStateByConversation: {
                ...current.roundtableStateByConversation,
                [conversationId]: inProgress,
              },
              pendingReplyCount: {
                ...current.pendingReplyCount,
                [conversationId]: openingSpeakerIds.length,
              },
              pendingReplyMemberIds: {
                ...current.pendingReplyMemberIds,
                [conversationId]: openingSpeakerIds,
              },
            }));

            const membersById = new Map(get().members.map((member) => [member.id, member]));
            const openingMessages = get().messages.filter(
              (message) =>
                message.conversationId === conversationId &&
                isVisibleMessage(message) &&
                message.status !== 'error'
            );
            const openingParticipants = activeParticipantIds
              .map((id) => membersById.get(id))
              .filter((member): member is Member => Boolean(member && !member.deletedAt));
            try {
              await Promise.all(
                openingSpeakerIds.map(async (memberId) => {
                  const member = membersById.get(memberId);
                  const memberName = member?.name ?? 'Member';
                  const openingSourceUserMessage = [...openingMessages]
                    .reverse()
                    .find((message) => message.role === 'user' && message.status !== 'error' && isVisibleMessage(message));
                  let reply: Message;

                  try {
                    const result = await chatWithMember({
                      message: text,
                      memberId,
                      conversationId,
                      contextMessages: buildMemberContextWindow(
                        openingMessages,
                        conversationId,
                        memberId,
                        'hall',
                        membersById
                      ),
                      hallContext: member
                        ? buildHallSystemContext(
                            member,
                            openingParticipants,
                            openingMessages,
                            [],
                            'roundtable',
                            conversationId,
                          )
                        : undefined,
                    });
                    reply = buildMessage({
                      conversationId,
                      role: 'member',
                      authorMemberId: memberId,
                      content: stripLeadingSpeakerLabel(result.answer, memberName),
                      status: 'sent',
                      roundNumber: nextRound.round.roundNumber,
                      inReplyToMessageId: openingSourceUserMessage?.id,
                    });
                  } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Request failed';
                    reply = buildMessage({
                      conversationId,
                      role: 'member',
                      authorMemberId: memberId,
                      content: `${memberName} could not speak in this round.`,
                      status: 'error',
                      roundNumber: nextRound.round.roundNumber,
                      error: errorMessage,
                      inReplyToMessageId: openingSourceUserMessage?.id,
                    });
                  }

                  set((current) => ({
                    messages: [...current.messages, reply],
                    ...updateConversationStamp(current, conversationId, true),
                    pendingReplyCount: {
                      ...current.pendingReplyCount,
                      [conversationId]: Math.max(0, (current.pendingReplyCount[conversationId] ?? 1) - 1),
                    },
                    pendingReplyMemberIds: {
                      ...current.pendingReplyMemberIds,
                      [conversationId]: (current.pendingReplyMemberIds[conversationId] ?? []).filter((id) => id !== memberId),
                    },
                  }));

                  const persistedReplies = await councilRepository.appendMessages({
                    conversationId,
                    messages: [reply],
                  });
                  set((current) => ({
                    messages: replaceOptimisticMessages(current.messages, [reply], persistedReplies),
                  }));
                })
              );

              const completed = await markRoundtableCompleted({
                conversationId,
                roundNumber: nextRound.round.roundNumber,
              });

              set((current) => ({
                roundtableStateByConversation: {
                  ...current.roundtableStateByConversation,
                  [conversationId]: completed,
                },
              }));
              void get().syncHallRoundSummaries(conversationId);
            } finally {
              set((current) => ({
                pendingReplyCount: {
                  ...current.pendingReplyCount,
                  [conversationId]: 0,
                },
                pendingReplyMemberIds: {
                  ...current.pendingReplyMemberIds,
                  [conversationId]: [],
                },
              }));
            }
          }
        }
      } finally {
        set((current) => ({
          roundtablePreparingByConversation: {
            ...current.roundtablePreparingByConversation,
            [conversationId]: false,
          },
        }));
      }
      return;
    }

    const compactionPolicy = await councilRepository.getCompactionPolicy();
    set({ compactionPolicy });

    const membersMap = new Map(state.members.map((m) => [m.id, m]));
    let chamberMemory =
      conversation.kind === 'chamber'
        ? state.chamberMemoryByConversation[conversationId]
        : undefined;
    if (conversation.kind === 'chamber' && !chamberMemory) {
      const latestLog = await councilRepository.getLatestChamberMemoryLog(conversationId);
      chamberMemory = latestLog?.memory;
      const latestMemory = latestLog?.memory;
      if (latestMemory) {
        set((current) => ({
          chamberMemoryByConversation: {
            ...current.chamberMemoryByConversation,
            [conversationId]: latestMemory,
          },
        }));
      }
    }

    let memberIds: string[] = [];
    let routingSource: MessageRouting['source'] = 'chamber-fixed';

    if (conversation.kind === 'chamber') {
      memberIds = conversation.chamberMemberId ? [conversation.chamberMemberId] : [];
    } else {
      const participantIds = state.hallParticipantsByConversation[conversationId] ?? [];
      const hasRoutedOnce = state.messages.some(
        (message) =>
          message.conversationId === conversationId &&
          message.role === 'system' &&
          Boolean(message.routing)
      );

      if (!hasRoutedOnce) {
        const candidates = state.members.filter((member) => !member.deletedAt);
        if (routingOverride.mode === 'manual') {
          const allowed = new Set(candidates.map((member) => member.id));
          memberIds = (routingOverride.memberIds ?? []).filter((memberId) => allowed.has(memberId));
        } else {
          set({ isRouting: true, routingConversationId: conversationId });
          try {
            const dynamicMaxSelections = Math.max(
              1,
              Math.min(8, Math.ceil(candidates.length * 0.5))
            );
            const routed = await routeHallMembers({
              message: text,
              conversationId,
              maxSelections: dynamicMaxSelections,
            });
            memberIds = routed.chosenMemberIds;
            routingSource = routed.source;
          } catch {
            memberIds = routeToMembers(text, candidates.map((c) => c.id), conversationId);
            routingSource = 'fallback';
          } finally {
            set({ isRouting: false, routingConversationId: undefined });
          }
        }

        if (memberIds.length === 0 && routingOverride.mode === 'manual') {
          set((current) => ({
            pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: 0 },
            pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: [] },
          }));
          return;
        }

        if (memberIds.length === 0) {
          memberIds = routeToMembers(text, state.members.filter((m) => !m.deletedAt).map((m) => m.id), conversationId);
          routingSource = 'fallback';
        }

        const chosenSet = new Set(memberIds);
        const toAdd = memberIds.filter((memberId) => !participantIds.includes(memberId));
        const toRemove = participantIds.filter((memberId) => !chosenSet.has(memberId));
        await Promise.all([
          ...toAdd.map((memberId) => councilRepository.addHallParticipant(conversationId, memberId)),
          ...toRemove.map((memberId) => councilRepository.removeHallParticipant(conversationId, memberId)),
        ]);

        set((current) => ({
          hallParticipantsByConversation: {
            ...current.hallParticipantsByConversation,
            [conversationId]: memberIds,
          },
        }));

        const routeMessage = buildMessage({
          conversationId,
          role: 'system',
          content:
            routingOverride.mode === 'manual'
              ? `Manually routed to ${memberIds.map((id) => membersMap.get(id)?.name ?? id).join(', ')}`
              : `Routed to ${memberIds.map((id) => membersMap.get(id)?.name ?? id).join(', ')}`,
          status: 'sent',
          routing: { memberIds, source: routingSource },
        });

        set((current) => ({
          messages: [...current.messages, routeMessage],
          ...updateConversationStamp(current, conversationId, true),
        }));
        const persistedRouteMessages = await councilRepository.appendMessages({
          conversationId,
          messages: [routeMessage],
        });
        set((current) => ({
          messages: replaceOptimisticMessages(current.messages, [routeMessage], persistedRouteMessages),
        }));
      } else if (routingOverride.mode === 'manual') {
        const allowed = new Set(
          state.members.filter((member) => !member.deletedAt).map((member) => member.id)
        );
        memberIds = (routingOverride.memberIds ?? []).filter((memberId) => allowed.has(memberId));
        const participantSet = new Set(participantIds);
        const toAdd = memberIds.filter((memberId) => !participantSet.has(memberId));
        if (toAdd.length > 0) {
          await Promise.all(
            toAdd.map((memberId) => councilRepository.addHallParticipant(conversationId, memberId))
          );
          set((current) => ({
            hallParticipantsByConversation: {
              ...current.hallParticipantsByConversation,
              [conversationId]: Array.from(
                new Set([...(current.hallParticipantsByConversation[conversationId] ?? []), ...toAdd])
              ),
            },
          }));
        }
      } else {
        memberIds = participantIds.filter((memberId) => {
          const member = membersMap.get(memberId);
          return Boolean(member && !member.deletedAt);
        });
      }

      if (conversation.hallMode !== 'roundtable' && mentionedMemberIds.length > 0) {
        const mentionedSet = new Set(mentionedMemberIds);
        memberIds = memberIds.filter((memberId) => mentionedSet.has(memberId));
      }
    }

    if (memberIds.length === 0) {
      set((current) => ({
        pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: 0 },
        pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: [] },
      }));
      return;
    }

    if (
      conversation.kind === 'chamber' &&
      (conversation.timeAwareReentryEnabled ?? true) &&
      !activeTimeAwareReentryState &&
      (state.pendingReplyCount[conversationId] ?? 0) === 0 &&
      typeof previousActiveMessageAt === 'number'
    ) {
      const bucket = classifyTimeAwareReentryGap(Date.now() - previousActiveMessageAt);
      if (bucket) {
        const explicitContinuation = isExplicitContinuation(text);
        const effectiveBucket = explicitContinuation ? demoteTimeAwareReentryGap(bucket) : bucket;
        if (effectiveBucket) {
          const updatedConversation = await councilRepository.setChamberTimeAwareReentryState({
            conversationId,
            state: {
              gapBucket: effectiveBucket,
              repliesRemaining: 2,
              explicitContinuation,
              activatedAt: Date.now(),
            },
          });
          conversation = updatedConversation;
          activeTimeAwareReentryState = updatedConversation.timeAwareReentryState;
          void councilRepository.upsertTimeAwareReentryGuidance({
            conversationId,
            gapBucket: effectiveBucket,
            explicitContinuation,
          }).catch(() => undefined);
          set((current) => ({
            conversations: current.conversations.map((item) =>
              item.id === conversationId ? updatedConversation : item
            ),
            timeAwareReentryNoticePendingByConversation:
              updatedConversation.timeAwareReentryNoticeSeenAt
                ? current.timeAwareReentryNoticePendingByConversation
                : {
                    ...current.timeAwareReentryNoticePendingByConversation,
                    [conversationId]: true,
                  },
          }));
        }
      }
    }

    set((current) => ({
      pendingReplyCount: { ...current.pendingReplyCount, [conversationId]: memberIds.length },
      pendingReplyMemberIds: { ...current.pendingReplyMemberIds, [conversationId]: memberIds },
    }));
    const hallParticipants = conversation.kind === 'hall'
      ? (state.hallParticipantsByConversation[conversationId] ?? [])
          .map((id) => membersMap.get(id))
          .filter((member): member is Member => Boolean(member && !member.deletedAt))
      : [];
    const hallContextBundle =
      conversation.kind === 'hall'
      ? buildHallRoundAwareContext({
          messages: get().messages,
          conversationId,
          hallMemoryLogs: await councilRepository.listMemoryLogsByScope(conversationId, 'hall'),
          rawRoundTail: get().compactionPolicy.hallRawRoundTail,
          hallMode: conversation.hallMode ?? 'advisory',
        })
        : null;
    const chamberGeneration =
      conversation.kind === 'chamber'
        ? getBaseGenerationProfile(conversation.chamberResponseMode)
        : { chatProfile: 'instant' as const, retrievalStrategy: 'instant' as const };
    const replyTasks = memberIds.map(async (memberId) => {
      const member = membersMap.get(memberId);
      const sourceUserMessage = [...get().messages]
        .reverse()
        .find((message) =>
          message.conversationId === conversationId &&
          message.role === 'user' &&
          message.status !== 'error' &&
          isVisibleMessage(message)
        );
      let reply: Message;

      if (!member) {
        reply = buildMessage({
          conversationId,
          role: 'member',
          authorMemberId: memberId,
          content: 'Member unavailable.',
          status: 'error',
          error: 'Member not found',
        });
      } else {
        try {
          const result = await chatWithMember({
            message: text,
            memberId: member.id,
            conversationId,
            previousSummary: conversation.kind === 'chamber' ? chamberMemory : undefined,
            contextMessages: buildMemberContextWindow(
              conversation.kind === 'hall' ? (hallContextBundle?.rawMessages ?? get().messages) : get().messages,
              conversationId,
              member.id,
              conversation.kind,
              membersMap
            ),
            hallContext:
              conversation.kind === 'hall'
                ? buildHallSystemContext(
                  member,
                  hallParticipants,
                  hallContextBundle?.rawMessages ?? [],
                  hallContextBundle?.roundSummaries ?? [],
                  conversation.hallMode ?? 'advisory',
                  conversationId,
                )
                : undefined,
            chatProfile: conversation.kind === 'chamber' ? chamberGeneration.chatProfile : undefined,
            retrievalStrategy: conversation.kind === 'chamber' ? chamberGeneration.retrievalStrategy : undefined,
          });

          reply = buildMessage({
            conversationId,
            role: 'member',
            authorMemberId: memberId,
            content: conversation.kind === 'hall'
              ? stripLeadingSpeakerLabel(result.answer, member.name)
              : result.answer,
            status: 'sent',
            roundNumber: currentHallRoundNumber,
            generationProfile:
              conversation.kind === 'chamber'
                ? conversation.chamberResponseMode ?? chamberGeneration.chatProfile
                : undefined,
            inReplyToMessageId: sourceUserMessage?.id,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Request failed';
          reply = buildMessage({
            conversationId,
            role: 'member',
            authorMemberId: memberId,
            content: 'Could not generate a response right now.',
            status: 'error',
            error: errorMessage,
            inReplyToMessageId: sourceUserMessage?.id,
          });
        }
      }

      set((current) => ({
        messages: [...current.messages, reply],
        ...updateConversationStamp(current, conversationId, true),
        pendingReplyCount: {
          ...current.pendingReplyCount,
          [conversationId]: Math.max(0, (current.pendingReplyCount[conversationId] ?? 1) - 1),
        },
        pendingReplyMemberIds: {
          ...current.pendingReplyMemberIds,
          [conversationId]: (current.pendingReplyMemberIds[conversationId] ?? []).filter((id) => id !== memberId),
        },
      }));

      const persistedReplies = await councilRepository.appendMessages({
        conversationId,
        messages: [reply],
      });
      set((current) => ({
        messages: replaceOptimisticMessages(current.messages, [reply], persistedReplies),
      }));

      if (conversation.kind === 'chamber' && reply.status === 'sent' && activeTimeAwareReentryState) {
        const nextGapBucket =
          activeTimeAwareReentryState.repliesRemaining === 2
            ? demoteTimeAwareReentryGap(activeTimeAwareReentryState.gapBucket)
            : undefined;
        const nextState =
          activeTimeAwareReentryState.repliesRemaining === 2 && nextGapBucket
            ? {
                ...activeTimeAwareReentryState,
                gapBucket: nextGapBucket,
                repliesRemaining: 1 as const,
              }
            : undefined;
        const updatedConversation = await councilRepository.setChamberTimeAwareReentryState({
          conversationId,
          state: nextState,
        });
        conversation = updatedConversation;
        activeTimeAwareReentryState = updatedConversation.timeAwareReentryState;
        set((current) => ({
          conversations: current.conversations.map((item) =>
            item.id === conversationId ? updatedConversation : item
          ),
        }));
      }
    });

    await Promise.all(replyTasks);
    if (conversation.kind === 'chamber') {
      void councilRepository.reflectChamberGuidance({
        conversationId,
        trigger: 'interval',
      }).catch(() => undefined);
    }
    if (conversation.kind === 'hall') {
      await get().syncHallRoundSummaries(conversationId);
    }

    try {
      const chamberMemoryContext = conversation.kind === 'chamber' && conversation.chamberMemberId
        ? {
          memberName: membersMap.get(conversation.chamberMemberId)?.name ?? 'Member',
          memberSpecialties: membersMap.get(conversation.chamberMemberId)?.specialties ?? [],
        }
        : undefined;
      const compacted = await maybeCompact(
        conversationId,
        conversation,
        compactionPolicy,
        chamberMemory,
        chamberMemoryContext
      );
      if (compacted) {
        set((current) => ({
          ...patchConversationEverywhere(current, conversationId, { updatedAt: Date.now() }),
          chamberMemoryByConversation: {
            ...current.chamberMemoryByConversation,
            [conversationId]: compacted.summary,
          },
          messages: [
            ...current.messages.filter((item) => item.conversationId !== conversationId),
            ...compacted.activeMessages,
          ],
        }));
      }
    } catch (error) {
      void error;
    }
  },

  addMemberToConversation: async (conversationId, memberId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall') return;

    await councilRepository.addHallParticipant(conversationId, memberId);
    await get().refreshHallParticipants(conversationId);

    set((state) => ({
      ...updateConversationStamp(state, conversationId),
    }));
  },

  removeMemberFromConversation: async (conversationId, memberId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'hall') return;
    const currentParticipants = get().hallParticipantsByConversation[conversationId] ?? [];
    if (currentParticipants.length <= 1) return;

    await councilRepository.removeHallParticipant(conversationId, memberId);
    await get().refreshHallParticipants(conversationId);

    set((state) => ({
      ...updateConversationStamp(state, conversationId),
    }));
  },

  clearChamberByMember: async (memberId) => {
    const targetIds = listChamberThreadsForMember(get().conversations, memberId).map((conversation) => conversation.id);
    if (targetIds.length === 0) return;

    await councilRepository.clearChamberByMember(memberId);
    const targetSet = new Set(targetIds);

    set((state) => {
      const nextConversations = state.conversations.filter((conversation) => !targetSet.has(conversation.id));
      const nextPendingReplyCount = { ...state.pendingReplyCount };
      const nextPendingReplyMemberIds = { ...state.pendingReplyMemberIds };
      const nextCompactionInFlight = { ...state.compactionCheckInFlightByConversation };
      const nextPagination = { ...state.messagePaginationByConversation };
      const nextNotebooks = { ...state.conversationNotebooksByConversation };
      const nextNotebookDrafts = { ...state.notebookDraftByConversation };
      const nextNotebookSaveStates = { ...state.notebookSaveStateByConversation };
      const nextNotebookErrors = { ...state.notebookErrorByConversation };
      const nextNotebookLoaded = { ...state.notebookLoadedByConversation };

      for (const id of targetIds) {
        delete nextPendingReplyCount[id];
        delete nextPendingReplyMemberIds[id];
        delete nextCompactionInFlight[id];
        delete nextPagination[id];
        delete nextNotebooks[id];
        delete nextNotebookDrafts[id];
        delete nextNotebookSaveStates[id];
        delete nextNotebookErrors[id];
        delete nextNotebookLoaded[id];
      }

      const targetMessageIds = new Set(
        state.messages.filter((message) => targetSet.has(message.conversationId)).map((message) => message.id)
      );

      return {
        conversations: nextConversations,
        messages: state.messages.filter((message) => !targetSet.has(message.conversationId)),
        pendingReplyCount: nextPendingReplyCount,
        pendingReplyMemberIds: nextPendingReplyMemberIds,
        compactionCheckInFlightByConversation: nextCompactionInFlight,
        chamberMemoryByConversation: Object.fromEntries(
          Object.entries(state.chamberMemoryByConversation).filter(([id]) => !targetSet.has(id))
        ),
        conversationNotebooksByConversation: nextNotebooks,
        notebookDraftByConversation: nextNotebookDrafts,
        notebookSaveStateByConversation: nextNotebookSaveStates,
        notebookErrorByConversation: nextNotebookErrors,
        notebookLoadedByConversation: nextNotebookLoaded,
        messagePaginationByConversation: nextPagination,
        messageFeedbackByMessageId: Object.fromEntries(
          Object.entries(state.messageFeedbackByMessageId).filter(([messageId]) => !targetMessageIds.has(messageId))
        ),
        selectedConversationId: targetSet.has(state.selectedConversationId)
          ? (nextConversations[0]?.id ?? '')
          : state.selectedConversationId,
      };
    });
  },

  refineLatestChamberResponse: async (conversationId, action) => {
    await get().loadMessages(conversationId);
    const state = get();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.kind !== 'chamber') return;

    const target = getLatestVisibleChamberMemberMessage(state.messages, conversationId);
    if (!target?.authorMemberId || state.refiningActionByMessageId[target.id]) return;

    const visibleMessages = state.messages
      .filter((message) => message.conversationId === conversationId && isVisibleMessage(message))
      .sort((a, b) => a.createdAt - b.createdAt);
    const targetIndex = visibleMessages.findIndex((message) => message.id === target.id);
    if (targetIndex <= 0) return;

    const promptMessage = [...visibleMessages.slice(0, targetIndex)]
      .reverse()
      .find((message) => message.role === 'user' && message.status !== 'error');
    if (!promptMessage) return;

    const membersMap = new Map(state.members.map((member) => [member.id, member]));
    const member = membersMap.get(target.authorMemberId);
    if (!member) return;

    const previousSummary = state.chamberMemoryByConversation[conversationId]
      ?? (await councilRepository.getLatestChamberMemoryLog(conversationId))?.memory;
    const refinementProfiles = resolveRefinementProfiles(action);
    const refinementGenerationProfile = getRefinementGenerationProfile(action);
    const contextMessages = buildMemberContextWindow(
      visibleMessages.filter((message) => message.id !== target.id),
      conversationId,
      member.id,
      'chamber',
      membersMap
    );

    set((current) => ({
      refiningActionByMessageId: {
        ...current.refiningActionByMessageId,
        [target.id]: action,
      },
      pendingReplyCount: {
        ...current.pendingReplyCount,
        [conversationId]: 1,
      },
      pendingReplyMemberIds: {
        ...current.pendingReplyMemberIds,
        [conversationId]: [member.id],
      },
    }));

    try {
      const result = await chatWithMember({
        message: promptMessage.content,
        memberId: member.id,
        conversationId,
        previousSummary,
        contextMessages,
        chatProfile: refinementProfiles.chatProfile,
        retrievalStrategy: refinementProfiles.retrievalStrategy,
        turnDirective: refinementProfiles.turnDirective,
      });

      if (action === 'elaborate') {
        const appended = await councilRepository.appendElaborationReply({
          targetMessageId: target.id,
          reply: {
            conversationId,
            role: 'member',
            authorMemberId: member.id,
            content: result.answer,
            status: 'sent',
            inReplyToMessageId: target.id,
            revisionKind: 'elaborate',
            generationProfile: refinementGenerationProfile,
          },
        });

        set((current) => ({
          messages: [...current.messages, appended],
          ...updateConversationStamp(current, conversationId, true),
          refiningActionByMessageId: removeKey(current.refiningActionByMessageId, target.id),
          pendingReplyCount: {
            ...current.pendingReplyCount,
            [conversationId]: 0,
          },
          pendingReplyMemberIds: {
            ...current.pendingReplyMemberIds,
            [conversationId]: [],
          },
        }));
        const [activeMessages, latestLog] = await Promise.all([
          councilRepository.listMessages(conversationId),
          councilRepository.getLatestChamberMemoryLog(conversationId),
        ]);
        set((current) => ({
          messages: [
            ...current.messages.filter((message) => message.conversationId !== conversationId),
            ...activeMessages,
          ],
          chamberMemoryByConversation: {
            ...current.chamberMemoryByConversation,
            [conversationId]: latestLog?.memory ?? current.chamberMemoryByConversation[conversationId],
          },
        }));
        return;
      }

      const replaced = await councilRepository.replaceWithRefinement({
        targetMessageId: target.id,
        replacement: {
          conversationId,
          role: 'member',
          authorMemberId: member.id,
          content: result.answer,
          status: 'sent',
          inReplyToMessageId: promptMessage.id,
          revisionKind: action,
          generationProfile: refinementGenerationProfile,
        },
      });

      set((current) => ({
        messages: current.messages
          .map((message) => (message.id === replaced.superseded.id ? replaced.superseded : message))
          .concat(replaced.replacement)
          .sort((a, b) => a.createdAt - b.createdAt),
        ...updateConversationStamp(current, conversationId, true),
        refiningActionByMessageId: removeKey(current.refiningActionByMessageId, target.id),
        pendingReplyCount: {
          ...current.pendingReplyCount,
          [conversationId]: 0,
        },
        pendingReplyMemberIds: {
          ...current.pendingReplyMemberIds,
          [conversationId]: [],
        },
      }));
      const [activeMessages, latestLog] = await Promise.all([
        councilRepository.listMessages(conversationId),
        councilRepository.getLatestChamberMemoryLog(conversationId),
      ]);
      set((current) => ({
        messages: [
          ...current.messages.filter((message) => message.conversationId !== conversationId),
          ...activeMessages,
        ],
        chamberMemoryByConversation: {
          ...current.chamberMemoryByConversation,
          [conversationId]: latestLog?.memory ?? current.chamberMemoryByConversation[conversationId],
        },
      }));
    } catch (error) {
      set((current) => ({
        refiningActionByMessageId: removeKey(current.refiningActionByMessageId, target.id),
        pendingReplyCount: {
          ...current.pendingReplyCount,
          [conversationId]: 0,
        },
        pendingReplyMemberIds: {
          ...current.pendingReplyMemberIds,
          [conversationId]: [],
        },
      }));
      get().showToast(error instanceof Error ? error.message : 'Could not refine the reply.');
    }
  },

  setThemeMode: async (mode) => {
    set({ themeMode: mode });
    await councilRepository.setThemeMode(mode);
  },

  createMember: async (payload) => {
    const created = await councilRepository.createMember(payload);
    let nextMember = created;
    const [guidanceResult, voiceResult] = await Promise.allSettled([
      !created.guidanceProfilePrompt?.trim()
        ? councilRepository.generateMemberGuidanceProfile({
            memberId: created.id,
            systemPrompt: created.systemPrompt,
            specialties: created.specialties,
          })
        : Promise.resolve(null),
      !created.ttsPersonaPrompt?.trim()
        ? councilRepository.generateMemberVoicePersona({
            memberId: created.id,
            systemPrompt: created.systemPrompt,
            specialties: created.specialties,
            ttsVoiceName: created.ttsVoiceName,
          })
        : Promise.resolve(null),
    ]);

    if (guidanceResult.status === 'fulfilled' && guidanceResult.value) {
      nextMember = {
        ...nextMember,
        guidanceProfilePrompt: guidanceResult.value.guidanceProfilePrompt,
        guidanceProfileGeneratedAt: Date.now(),
        guidanceProfileUpdatedAt: Date.now(),
      };
    }
    if (voiceResult.status === 'fulfilled' && voiceResult.value) {
      nextMember = {
        ...nextMember,
        ttsPersonaPrompt: voiceResult.value.ttsPersonaPrompt,
        ttsPersonaGeneratedAt: Date.now(),
        ttsPersonaUpdatedAt: Date.now(),
      };
    }
    set((state) => ({ members: [nextMember, ...state.members.filter((member) => member.id !== created.id)] }));
    return nextMember;
  },

  updateMember: async (memberId, patch) => {
    const updated = await councilRepository.updateMember(memberId, patch);
    let nextMember = updated;
    if (!updated.guidanceProfilePrompt?.trim()) {
      try {
        const generated = await councilRepository.generateMemberGuidanceProfile({
          memberId,
          systemPrompt: updated.systemPrompt,
          specialties: updated.specialties,
        });
        nextMember = {
          ...updated,
          guidanceProfilePrompt: generated.guidanceProfilePrompt,
          guidanceProfileGeneratedAt: Date.now(),
          guidanceProfileUpdatedAt: Date.now(),
        };
      } catch {
        nextMember = updated;
      }
    }
    set((state) => ({
      members: state.members.map((m) => (m.id === memberId ? nextMember : m)),
    }));
    return nextMember;
  },

  generateMemberGuidanceProfile: async (memberId, force = true) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member) {
      throw new Error('Member not found');
    }
    const generated = await councilRepository.generateMemberGuidanceProfile({
      memberId,
      systemPrompt: member.systemPrompt,
      specialties: member.specialties,
      force,
    });
    set((state) => ({
      members: state.members.map((item) =>
        item.id === memberId
          ? {
              ...item,
              guidanceProfilePrompt: generated.guidanceProfilePrompt,
              guidanceProfileGeneratedAt: Date.now(),
              guidanceProfileUpdatedAt: Date.now(),
            }
          : item
      ),
    }));
    return generated;
  },

  generateMemberVoicePersona: async (memberId, force = true) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member) {
      throw new Error('Member not found');
    }
    const generated = await councilRepository.generateMemberVoicePersona({
      memberId,
      systemPrompt: member.systemPrompt,
      specialties: member.specialties,
      ttsVoiceName: member.ttsVoiceName ?? DEFAULT_MEMBER_VOICE,
      force,
    });
    set((state) => ({
      members: state.members.map((item) =>
        item.id === memberId
          ? {
              ...item,
              ttsPersonaPrompt: generated.ttsPersonaPrompt,
              ttsPersonaGeneratedAt: Date.now(),
              ttsPersonaUpdatedAt: Date.now(),
            }
          : item
      ),
    }));
    return generated;
  },

  setMessageFeedback: async (messageId, key, active) => {
    const message = get().messages.find((item) => item.id === messageId);
    if (!message) return;
    const feedbackRows = await councilRepository.setMessageFeedback({ messageId, key, active });
    const feedbackByMessage = mapFeedbackRows(feedbackRows);
    set((state) => ({
      messageFeedbackByMessageId: {
        ...state.messageFeedbackByMessageId,
        ...feedbackByMessage,
      },
    }));
    await councilRepository.syncFeedbackGuidanceDirectives({ messageId });
    get().showToast(feedbackToastMessage(key, active));
  },

  setMessagePinned: async (messageId, active) => {
    const updated = await councilRepository.setMessagePinned({ messageId, active });
    if (!updated) return;
    set((state) => ({
      messages: state.messages.map((message) => (message.id === messageId ? { ...message, pinnedAt: updated.pinnedAt } : message)),
    }));
    get().showToast(active ? 'Pinned to thread context.' : 'Removed from pinned thread context.');
  },

  retryFailedMessage: async (messageId) => {
    const state = get();
    const failedMessage = state.messages.find((message) => message.id === messageId);
    if (!failedMessage) return;
    if (failedMessage.role !== 'member' || failedMessage.status !== 'error' || failedMessage.deletedAt || failedMessage.supersededAt) {
      throw new Error('Only active failed member replies can be retried.');
    }
    if (!failedMessage.authorMemberId) {
      throw new Error('Retry target is missing a member.');
    }

    const conversation = state.conversations.find((item) => item.id === failedMessage.conversationId);
    if (!conversation) {
      throw new Error('Conversation not found.');
    }

    set((current) => ({
      retryingMessageIds: {
        ...current.retryingMessageIds,
        [messageId]: true,
      },
    }));

    try {
      const discarded = await councilRepository.discardMessage(messageId);
      if (discarded) {
        set((current) => ({
          messages: current.messages.map((message) =>
            message.id === messageId ? { ...message, deletedAt: discarded.deletedAt } : message
          ),
        }));
      }

      let retriedReply: Message;

      if (conversation.kind === 'hall' && conversation.hallMode === 'roundtable') {
        const member = get().members.find((item) => item.id === failedMessage.authorMemberId);
        const memberName = member?.name ?? 'Member';
        try {
          const result = await chatRoundtableSpeaker({
            conversationId: failedMessage.conversationId,
            roundNumber: failedMessage.roundNumber ?? 1,
            memberId: failedMessage.authorMemberId,
            force: true,
          });
          retriedReply = buildMessage({
            conversationId: failedMessage.conversationId,
            role: 'member',
            authorMemberId: failedMessage.authorMemberId,
            content: stripLeadingSpeakerLabel(result.answer, memberName),
            status: 'sent',
            roundNumber: failedMessage.roundNumber,
            roundIntent: result.intent,
            roundTargetMemberId: result.targetMemberId,
            inReplyToMessageId: findRetrySourceUserMessage(get().messages, failedMessage)?.id,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Request failed';
          retriedReply = buildMessage({
            conversationId: failedMessage.conversationId,
            role: 'member',
            authorMemberId: failedMessage.authorMemberId,
            content: `${memberName} could not speak in this round.`,
            status: 'error',
            roundNumber: failedMessage.roundNumber,
            error: errorMessage,
            inReplyToMessageId: findRetrySourceUserMessage(get().messages, failedMessage)?.id,
          });
        }
      } else {
        const currentState = get();
        const member = currentState.members.find((item) => item.id === failedMessage.authorMemberId);
        if (!member) {
          throw new Error('Member not found.');
        }

        const sourceUserMessage = findRetrySourceUserMessage(currentState.messages, failedMessage);
        if (!sourceUserMessage) {
          throw new Error('Could not find the user message that this reply should retry.');
        }

        const membersMap = new Map(currentState.members.map((item) => [item.id, item]));
        const chamberMemory =
          conversation.kind === 'chamber'
            ? currentState.chamberMemoryByConversation[conversation.id] ?? (await councilRepository.getLatestChamberMemoryLog(conversation.id))?.memory
            : undefined;
        const hallParticipants = conversation.kind === 'hall'
          ? (currentState.hallParticipantsByConversation[conversation.id] ?? [])
              .map((id) => membersMap.get(id))
              .filter((item): item is Member => Boolean(item && !item.deletedAt))
          : [];
        const hallContextBundle = conversation.kind === 'hall'
          ? buildHallRoundAwareContext({
              messages: currentState.messages,
              conversationId: conversation.id,
              hallMemoryLogs: await councilRepository.listMemoryLogsByScope(conversation.id, 'hall'),
              rawRoundTail: currentState.compactionPolicy.hallRawRoundTail,
              hallMode: conversation.hallMode ?? 'advisory',
            })
          : null;
        const chamberGeneration =
          conversation.kind === 'chamber'
            ? getBaseGenerationProfile(conversation.chamberResponseMode)
            : { chatProfile: 'instant' as const, retrievalStrategy: 'instant' as const };

        try {
          const result = await chatWithMember({
            message: sourceUserMessage.content,
            memberId: member.id,
            conversationId: conversation.id,
            previousSummary: conversation.kind === 'chamber' ? chamberMemory : undefined,
            contextMessages: buildMemberContextWindow(
              conversation.kind === 'hall' ? (hallContextBundle?.rawMessages ?? currentState.messages) : currentState.messages,
              conversation.id,
              member.id,
              conversation.kind,
              membersMap
            ),
            hallContext:
              conversation.kind === 'hall'
                ? buildHallSystemContext(
                    member,
                    hallParticipants,
                    hallContextBundle?.rawMessages ?? [],
                    hallContextBundle?.roundSummaries ?? [],
                    conversation.hallMode ?? 'advisory',
                    conversation.id,
                  )
                : undefined,
            chatProfile: conversation.kind === 'chamber' ? chamberGeneration.chatProfile : undefined,
            retrievalStrategy: conversation.kind === 'chamber' ? chamberGeneration.retrievalStrategy : undefined,
          });

          retriedReply = buildMessage({
            conversationId: conversation.id,
            role: 'member',
            authorMemberId: member.id,
            content: conversation.kind === 'hall'
              ? stripLeadingSpeakerLabel(result.answer, member.name)
              : result.answer,
            status: 'sent',
            roundNumber: failedMessage.roundNumber,
            generationProfile:
              conversation.kind === 'chamber'
                ? conversation.chamberResponseMode ?? chamberGeneration.chatProfile
                : undefined,
            inReplyToMessageId: sourceUserMessage.id,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Request failed';
          retriedReply = buildMessage({
            conversationId: conversation.id,
            role: 'member',
            authorMemberId: member.id,
            content: 'Could not generate a response right now.',
            status: 'error',
            error: errorMessage,
            roundNumber: failedMessage.roundNumber,
            inReplyToMessageId: sourceUserMessage.id,
          });
        }
      }

      set((current) => ({
        messages: [...current.messages, retriedReply],
        ...updateConversationStamp(current, failedMessage.conversationId, true),
      }));

      const persistedReplies = await councilRepository.appendMessages({
        conversationId: failedMessage.conversationId,
        messages: [retriedReply],
      });
      set((current) => ({
        messages: replaceOptimisticMessages(current.messages, [retriedReply], persistedReplies),
      }));
    } finally {
      set((current) => ({
        retryingMessageIds: removeKey(current.retryingMessageIds, messageId),
      }));
    }
  },

  archiveMember: async (memberId) => {
    await councilRepository.archiveMember(memberId);
    set((state) => ({
      members: state.members.map((m) =>
        m.id === memberId ? { ...m, deletedAt: Date.now(), updatedAt: Date.now() } : m
      ),
    }));
  },

  uploadDocsForMember: async (memberId, files) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member || files.length === 0) return;

    for (const file of files) {
      const localId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      set((state) => ({
        kbUploadProgressByMember: {
          ...state.kbUploadProgressByMember,
          [memberId]: [
            ...(state.kbUploadProgressByMember[memberId] ?? []),
            { localId, fileName: file.name, loaded: 0, total: Math.max(file.size, 1), progress: 0 },
          ],
        },
      }));

      try {
        const staged = await uploadFileToConvexStorage(file, ({ loaded, total, progress }) => {
          set((state) => ({
            kbUploadProgressByMember: {
              ...state.kbUploadProgressByMember,
              [memberId]: (state.kbUploadProgressByMember[memberId] ?? []).map((entry) =>
                entry.localId === localId
                  ? {
                      ...entry,
                      loaded,
                      total: Math.max(total, 1),
                      progress,
                    }
                  : entry
              ),
            },
          }));
        });

        const created = await createKbDocumentRecord({
          memberId,
          stagedFile: staged,
        });

        set((state) => {
          const current = state.kbDocumentsByMember[memberId] ?? [];
          const deduped = current.filter((row) => row.id !== created.document.id);
          const nextRows = [created.document, ...deduped].sort((a, b) => b.updatedAt - a.updatedAt);
          return {
            members: state.members.map((item) =>
              item.id === memberId
                ? { ...item, kbStoreName: created.document.kbStoreName, updatedAt: Date.now() }
                : item
            ),
            kbDocumentsByMember: {
              ...state.kbDocumentsByMember,
              [memberId]: nextRows,
            },
            memberDocuments: {
              ...state.memberDocuments,
              [memberId]: lifecycleToMemberDocuments(nextRows),
            },
          };
        });

        void startKbDocumentProcessing({ kbDocumentId: created.kbDocumentId })
          .then(() => get().fetchDocsForMember(memberId))
          .catch(() => get().fetchDocsForMember(memberId));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        const failedRow: KbDocumentLifecycle = {
          id: `upload-failed-${localId}`,
          memberId,
          storageId: '',
          displayName: file.name,
          mimeType: file.type || undefined,
          sizeBytes: file.size,
          kbStoreName: member.kbStoreName ?? '',
          kbDocumentName: '',
          uploadStatus: 'failed',
          chunkingStatus: 'failed',
          indexingStatus: 'failed',
          metadataStatus: 'failed',
          ingestErrorChunking: message,
          ingestErrorIndexing: message,
          ingestErrorMetadata: message,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          kbDocumentsByMember: {
            ...state.kbDocumentsByMember,
            [memberId]: [failedRow, ...(state.kbDocumentsByMember[memberId] ?? [])],
          },
        }));
      } finally {
        set((state) => ({
          kbUploadProgressByMember: {
            ...state.kbUploadProgressByMember,
            [memberId]: (state.kbUploadProgressByMember[memberId] ?? []).filter((entry) => entry.localId !== localId),
          },
        }));
      }
    }
  },

  fetchDocsForMember: async (memberId) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member) return;
    const lifecycleRows = await listKbDocuments(member.id);
    set((state) => ({
      kbDocumentsByMember: {
        ...state.kbDocumentsByMember,
        [memberId]: lifecycleRows,
      },
      memberDocuments: {
        ...state.memberDocuments,
        [memberId]: lifecycleToMemberDocuments(lifecycleRows),
      },
    }));
  },

  hydrateMemberDocuments: async () => {
    if (hydrateMemberDocumentsPromise) {
      await hydrateMemberDocumentsPromise;
      return;
    }

    const missingMembers = get().members.filter(
      (member) => !member.deletedAt && get().kbDocumentsByMember[member.id] === undefined
    );
    if (missingMembers.length === 0) return;

    hydrateMemberDocumentsPromise = (async () => {
      const results = await Promise.all(
        missingMembers.map(async (member) => {
          try {
            const docs = await listKbDocuments(member.id);
            return { memberId: member.id, docs };
          } catch {
            return { memberId: member.id, docs: [] as KbDocumentLifecycle[] };
          }
        })
      );

      set((state) => ({
        kbDocumentsByMember: {
          ...state.kbDocumentsByMember,
          ...Object.fromEntries(results.map((result) => [result.memberId, result.docs])),
        },
        memberDocuments: {
          ...state.memberDocuments,
          ...Object.fromEntries(results.map((result) => [result.memberId, lifecycleToMemberDocuments(result.docs)])),
        },
      }));
    })();

    try {
      await hydrateMemberDocumentsPromise;
    } finally {
      hydrateMemberDocumentsPromise = null;
    }
  },

  deleteDocForMember: async (memberId, kbDocumentId) => {
    const member = get().members.find((item) => item.id === memberId);
    if (!member || !kbDocumentId) return { ok: false, error: 'Member or document not found' };

    set((state) => ({
      kbDeletingDocumentIds: {
        ...state.kbDeletingDocumentIds,
        [kbDocumentId]: true,
      },
    }));

    try {
      const result = await deleteKbDocument({ kbDocumentId });
      await get().fetchDocsForMember(memberId);
      if (!result.ok) {
        return { ok: false, error: result.error ?? 'Delete failed' };
      }
      if (result.clearedStoreName) {
        set((state) => ({
          members: state.members.map((item) =>
            item.id === memberId ? { ...item, kbStoreName: undefined, updatedAt: Date.now() } : item
          ),
        }));
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Delete failed' };
    } finally {
      set((state) => ({
        kbDeletingDocumentIds: {
          ...state.kbDeletingDocumentIds,
          [kbDocumentId]: false,
        },
      }));
    }
  },

  retryKbDocumentIndexForMember: async (memberId, kbDocumentId) => {
    set((state) => ({
      kbRetryingIndexDocumentIds: {
        ...state.kbRetryingIndexDocumentIds,
        [kbDocumentId]: true,
      },
    }));

    try {
      await retryKbDocumentIndexing({ kbDocumentId });
      await get().fetchDocsForMember(memberId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Retry indexing failed' };
    } finally {
      set((state) => ({
        kbRetryingIndexDocumentIds: {
          ...state.kbRetryingIndexDocumentIds,
          [kbDocumentId]: false,
        },
      }));
    }
  },

  retryKbDocumentMetadataForMember: async (memberId, kbDocumentId) => {
    set((state) => ({
      kbRetryingMetadataDocumentIds: {
        ...state.kbRetryingMetadataDocumentIds,
        [kbDocumentId]: true,
      },
    }));

    try {
      await retryKbDocumentMetadata({ kbDocumentId });
      await get().fetchDocsForMember(memberId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Retry metadata failed' };
    } finally {
      set((state) => ({
        kbRetryingMetadataDocumentIds: {
          ...state.kbRetryingMetadataDocumentIds,
          [kbDocumentId]: false,
        },
      }));
    }
  },
}));
