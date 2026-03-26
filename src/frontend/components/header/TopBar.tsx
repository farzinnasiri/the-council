import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Bug, LoaderCircle, Lock, Menu, NotebookPen, Pause, Pin, Play, Plus, SkipForward, UserCircle2, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { Conversation } from '../../types/domain';
import { useAppStore } from '../../store/appStore';
import {
  CHAMBER_INACTIVITY_TIMEOUT_MS,
  CHAMBER_PRESENCE_POLL_INTERVAL_MS,
  TYPING_INDICATOR_INITIAL_DELAY_MS,
} from '../../constants/presence';
import { useChatSpeech } from '../../features/chat/ChatSpeechProvider';
import { ENABLE_PROMPT_TRACE_DEBUG } from '../../../../shared/featureFlags';

interface TopBarProps {
  conversation?: Conversation;
  title: string;
  subtitle: string;
  showParticipants: boolean;
  onToggleSidebar: () => void;
  showNotebookToggle?: boolean;
  notebookOpen?: boolean;
  onToggleNotebook?: () => void;
}

export function TopBar({
  conversation,
  title,
  subtitle,
  showParticipants,
  onToggleSidebar,
  showNotebookToggle = false,
  notebookOpen = false,
  onToggleNotebook,
}: TopBarProps) {
  const addMemberToConversation = useAppStore((state) => state.addMemberToConversation);
  const removeMemberFromConversation = useAppStore((state) => state.removeMemberFromConversation);
  const closeHall = useAppStore((state) => state.closeHall);
  const closingConversationId = useAppStore((state) => state.closingConversationId);
  const members = useAppStore((state) => state.members);
  const messages = useAppStore((state) => state.messages);
  const setMessagePinned = useAppStore((state) => state.setMessagePinned);
  const pendingReplyMemberIds = useAppStore((state) => state.pendingReplyMemberIds);
  const hallParticipantsByConversation = useAppStore((state) => state.hallParticipantsByConversation);
  const promptDebugMode = useAppStore((state) => state.promptDebugMode);
  const setPromptDebugMode = useAppStore((state) => state.setPromptDebugMode);
  const participantIds = conversation ? hallParticipantsByConversation[conversation.id] ?? [] : [];
  const participants = participantIds
    .map((id) => members.find((member) => member.id === id && !member.deletedAt))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const inactiveMembers = members.filter((member) => !member.deletedAt && !participantIds.includes(member.id));
  const activeCount = participants.length;
  const isChamber = conversation?.kind === 'chamber';
  const showHallParticipants = showParticipants && !isChamber;
  const canManageHall = conversation?.kind === 'hall' && !conversation.closedAt;
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const [isChamberTypingVisible, setIsChamberTypingVisible] = useState(false);
  const [isPinnedManagerOpen, setIsPinnedManagerOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const typingVisibilityTimerRef = useRef<number | null>(null);
  const {
    hasPlayback,
    currentSpeakerName,
    currentConversationTitle,
    currentStatus,
    playbackRate,
    setPlaybackRate,
    togglePlayback,
    skipCurrent,
  } = useChatSpeech();

  useEffect(() => {
    if (!isChamber) return;
    const timer = window.setInterval(() => {
      setPresenceNow(Date.now());
    }, CHAMBER_PRESENCE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isChamber]);

  const isChamberTypingPending = useMemo(() => {
    if (!conversation || conversation.kind !== 'chamber' || !conversation.chamberMemberId) return false;
    const pendingIds = pendingReplyMemberIds[conversation.id] ?? [];
    return pendingIds.includes(conversation.chamberMemberId);
  }, [conversation, pendingReplyMemberIds]);

  useEffect(() => {
    if (!isChamber) {
      setIsChamberTypingVisible(false);
      return;
    }

    if (typingVisibilityTimerRef.current !== null) {
      window.clearTimeout(typingVisibilityTimerRef.current);
      typingVisibilityTimerRef.current = null;
    }

    if (!isChamberTypingPending) {
      setIsChamberTypingVisible(false);
      return;
    }

    typingVisibilityTimerRef.current = window.setTimeout(() => {
      setIsChamberTypingVisible(true);
      typingVisibilityTimerRef.current = null;
    }, TYPING_INDICATOR_INITIAL_DELAY_MS);

    return () => {
      if (typingVisibilityTimerRef.current !== null) {
        window.clearTimeout(typingVisibilityTimerRef.current);
        typingVisibilityTimerRef.current = null;
      }
    };
  }, [isChamber, isChamberTypingPending]);

  const chamberLastMemberActivityAt = useMemo(() => {
    if (!conversation || conversation.kind !== 'chamber') return undefined;
    let latest = 0;
    for (const message of messages) {
      if (message.conversationId !== conversation.id) continue;
      if (message.role !== 'member') continue;
      if (message.status === 'error') continue;
      latest = Math.max(latest, message.createdAt);
    }
    if (latest > 0) return latest;
    return undefined;
  }, [conversation, messages]);

  const pinnedMessages = useMemo(() => {
    if (!conversation || conversation.kind !== 'chamber') return [];
    return messages
      .filter((message) => {
        if (message.conversationId !== conversation.id) return false;
        if (message.role === 'system') return false;
        if (message.deletedAt || message.supersededAt || message.compacted) return false;
        return typeof message.pinnedAt === 'number';
      })
      .sort((a, b) => (b.pinnedAt ?? b.createdAt) - (a.pinnedAt ?? a.createdAt));
  }, [conversation, messages]);

  const isChamberOnline =
    isChamber &&
    (
      isChamberTypingVisible ||
      (
        typeof chamberLastMemberActivityAt === 'number' &&
        presenceNow - chamberLastMemberActivityAt <= CHAMBER_INACTIVITY_TIMEOUT_MS
      )
    );
  const isHall = conversation?.kind === 'hall';
  const isHallClosed = Boolean(conversation?.kind === 'hall' && conversation.closedAt);
  const isClosingHall = Boolean(conversation && closingConversationId === conversation.id);

  const playbackControls = (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={() => void togglePlayback()}
        aria-label={
          currentStatus === 'playing'
            ? 'Pause playback'
            : currentStatus === 'loading'
              ? 'Speech is loading'
              : 'Resume playback'
        }
        disabled={currentStatus === 'loading'}
      >
        {currentStatus === 'loading' ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : currentStatus === 'playing' ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={skipCurrent}
        aria-label="Skip current speech"
      >
        <SkipForward className="h-4 w-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-8 min-w-[3.5rem] rounded-full px-2.5 text-xs font-medium"
            aria-label="Playback speed"
          >
            {playbackRate}x
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-28">
          <DropdownMenuLabel>Speed</DropdownMenuLabel>
          {[1, 1.5, 2, 2.5].map((rate) => (
            <DropdownMenuItem
              key={rate}
              onSelect={(event) => {
                event.preventDefault();
                setPlaybackRate(rate);
              }}
              className="justify-between"
            >
              <span>{rate}x</span>
              {playbackRate === rate ? <span className="text-[10px] text-primary">Active</span> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const hasSecondaryRow = Boolean(subtitle || showHallParticipants);

  return (
    <header className="grid min-h-[74px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 border-b border-border bg-background px-4 py-3 md:min-h-16 md:items-center md:gap-y-2 md:px-6 md:py-2">
      <div className={hasSecondaryRow ? 'flex min-w-0 items-start gap-3 md:items-center' : 'flex min-w-0 items-center gap-3'}>
        <Button size="icon" variant="ghost" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="max-w-[16rem] break-words font-mono text-sm font-semibold tracking-tight text-foreground md:max-w-[34rem]">
            {title}
          </p>
          {subtitle || showHallParticipants ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground md:mt-1">
              {subtitle ? <span>{subtitle}</span> : null}
              {showHallParticipants ? (
                <CouncilMembersMenu
                  trigger={
                    activeCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-2 py-0.5 text-[10px] font-medium sm:hidden">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {activeCount} active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-2 py-0.5 text-[10px] font-medium sm:hidden">
                        <Plus className="h-3 w-3" />
                        Manage
                      </span>
                    )
                  }
                  activeMembers={participants}
                  inactiveMembers={inactiveMembers}
                  canManageHall={canManageHall}
                  onAdd={(memberId) => conversation && void addMemberToConversation(conversation.id, memberId)}
                  onRemove={(memberId) => conversation && void removeMemberFromConversation(conversation.id, memberId)}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 justify-self-end self-start md:flex-nowrap md:items-center md:self-center">
        {hasPlayback ? (
          <div className="hidden items-center gap-1 rounded-full border border-border/80 bg-card px-1.5 py-1 shadow-sm md:flex">
            <div className="hidden min-w-0 px-2 md:block">
              <div className="flex items-center gap-2">
                <Volume2 className="h-3.5 w-3.5 text-primary" />
                <div className="min-w-0 max-w-[8.5rem] xl:max-w-[11rem]">
                  <p className="truncate text-xs font-medium text-foreground">
                    {currentSpeakerName ?? 'Speech'}
                  </p>
                  <p className="hidden truncate text-[10px] text-muted-foreground xl:block">
                    {currentConversationTitle ?? 'The Council'}
                  </p>
                </div>
              </div>
            </div>
            {playbackControls}
          </div>
        ) : null}
        {showNotebookToggle && onToggleNotebook ? (
          <Button
            type="button"
            size="icon"
            variant={notebookOpen ? 'outline' : 'ghost'}
            className="h-9 w-9 shrink-0"
            onClick={onToggleNotebook}
            aria-label={notebookOpen ? 'Close notebook' : 'Open notebook'}
          >
            <NotebookPen className="h-4 w-4" />
          </Button>
        ) : null}
        {ENABLE_PROMPT_TRACE_DEBUG ? (
          <Button
            type="button"
            variant={promptDebugMode ? 'outline' : 'ghost'}
            className="h-9 shrink-0 gap-1.5 px-3 text-xs"
            onClick={() => setPromptDebugMode(!promptDebugMode)}
            aria-label={promptDebugMode ? 'Disable prompt debug mode' : 'Enable prompt debug mode'}
          >
            <Bug className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Prompt Debug</span>
          </Button>
        ) : null}
        {isChamber && pinnedMessages.length > 0 ? (
          <DialogPrimitive.Root open={isPinnedManagerOpen} onOpenChange={setIsPinnedManagerOpen}>
            <DialogPrimitive.Trigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-9 shrink-0 gap-1.5 px-0 text-xs text-muted-foreground hover:text-foreground"
                aria-label={`Open pinned thread messages (${pinnedMessages.length})`}
              >
                <Pin className="h-3.5 w-3.5" />
                <span className="font-medium tabular-nums">{pinnedMessages.length}</span>
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/80 backdrop-blur-sm" />
              <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[81] flex h-[min(82vh,720px)] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-background p-4 shadow-2xl focus:outline-none md:p-5">
                <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="font-mono text-sm font-semibold uppercase tracking-[0.22em] text-foreground">
                      Pinned Thread Messages
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
                      These messages stay in the chamber context until you unpin them.
                    </DialogPrimitive.Description>
                  </div>
                  <DialogPrimitive.Close asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Close pinned messages">
                      <X className="h-4 w-4" />
                    </Button>
                  </DialogPrimitive.Close>
                </div>

                <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
                  {pinnedMessages.map((message) => {
                    const author =
                      message.role === 'user'
                        ? 'You'
                        : members.find((member) => member.id === message.authorMemberId)?.name ?? title;

                    return (
                      <div
                        key={message.id}
                        className="rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{author}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(message.createdAt).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 text-xs"
                              onClick={() => {
                                setIsPinnedManagerOpen(false);
                                window.setTimeout(() => {
                                  document.getElementById(`message-${message.id}`)?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center',
                                  });
                                }, 120);
                              }}
                            >
                              Jump
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => void setMessagePinned(message.id, false)}
                            >
                              Unpin
                            </Button>
                          </div>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground line-clamp-4">
                          {message.content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        ) : null}
        {isChamber ? (
          <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1 text-xs text-foreground">
            <span
              className={`h-2 w-2 rounded-full ${
                isChamberOnline ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            {isChamberOnline ? 'Online' : 'Offline'}
          </span>
        ) : null}
        {isHall && !isHallClosed && conversation ? (
          <DialogPrimitive.Root open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
            <DialogPrimitive.Trigger asChild>
              <Button type="button" variant="outline" className="h-9 shrink-0 px-3 text-xs" disabled={isClosingHall}>
                {isClosingHall ? (
                  <>
                    <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Closing table...
                  </>
                ) : (
                  'Close table'
                )}
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/80 backdrop-blur-sm" />
              <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-5 shadow-2xl focus:outline-none">
                <DialogPrimitive.Title className="font-mono text-sm font-semibold uppercase tracking-[0.22em] text-foreground">
                  Close this table?
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-3 text-sm leading-6 text-muted-foreground">
                  This will generate a final council synthesis and lock the hall from further discussion. This cannot be undone.
                </DialogPrimitive.Description>
                <div className="mt-5 flex justify-end gap-2">
                  <DialogPrimitive.Close asChild>
                    <Button type="button" variant="ghost" className="h-9 px-3 text-sm" disabled={isClosingHall}>
                      Cancel
                    </Button>
                  </DialogPrimitive.Close>
                  <Button
                    type="button"
                    className="h-9 px-3 text-sm"
                    disabled={isClosingHall}
                    onClick={() => {
                      void closeHall(conversation.id)
                        .then(() => setIsCloseDialogOpen(false))
                        .catch(() => undefined);
                    }}
                  >
                    {isClosingHall ? (
                      <>
                        <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Closing table...
                      </>
                    ) : (
                      'Close table'
                    )}
                  </Button>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        ) : null}
        {isHallClosed ? (
          <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Closed
          </span>
        ) : null}
        {showHallParticipants ? (
          <CouncilMembersMenu
            trigger={
              activeCount > 0 ? (
                <div className="hidden items-center gap-2 rounded-full border border-border/80 bg-card px-2.5 py-1 sm:flex">
                  <div className="flex -space-x-1.5">
                    {participants.slice(0, 4).map((member) => (
                      <Avatar key={member.id} className="h-6 w-6 border border-background bg-muted">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt={member.name}
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          <AvatarFallback>
                            <UserCircle2 className="h-4 w-4 text-muted-foreground/60" />
                          </AvatarFallback>
                        )}
                      </Avatar>
                    ))}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {activeCount} active
                  </span>
                </div>
              ) : (
                <span className="hidden items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 font-mono text-xs text-muted-foreground hover:text-foreground sm:inline-flex">
                  <Plus className="h-3 w-3" />
                  Manage
                </span>
              )
            }
            activeMembers={participants}
            inactiveMembers={inactiveMembers}
            canManageHall={canManageHall}
            onAdd={(memberId) => conversation && void addMemberToConversation(conversation.id, memberId)}
            onRemove={(memberId) => conversation && void removeMemberFromConversation(conversation.id, memberId)}
          />
        ) : null}
      </div>
      {hasPlayback ? (
        <div className="col-span-2 md:hidden">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card px-3 py-2 shadow-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Volume2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                <p className="truncate text-xs font-medium text-foreground">
                  {currentSpeakerName ?? 'Speech'}
                </p>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {currentConversationTitle ?? 'The Council'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-background/60 px-1.5 py-1">
              {playbackControls}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function CouncilMembersMenu({
  trigger,
  activeMembers,
  inactiveMembers,
  canManageHall,
  onAdd,
  onRemove,
}: {
  trigger: ReactNode;
  activeMembers: Array<ReturnType<typeof useAppStore.getState>['members'][number]>;
  inactiveMembers: Array<ReturnType<typeof useAppStore.getState>['members'][number]>;
  canManageHall: boolean;
  onAdd: (memberId: string) => void;
  onRemove: (memberId: string) => void;
}) {
  const canRemoveMembers = canManageHall && activeMembers.length > 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="cursor-pointer" aria-label="Open council members panel">
          {trigger}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-2">
        <DropdownMenuLabel>Active in this chat</DropdownMenuLabel>
        <div className="mb-2 space-y-1">
          {activeMembers.map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-md px-2 py-1.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-xs">
                  {member.avatarUrl
                    ? <img src={member.avatarUrl} alt={member.name} className="h-full w-full object-cover" />
                    : <UserCircle2 className="h-5 w-5 text-muted-foreground/60" />
                  }
                </div>
                <p className="text-sm font-medium leading-none">{member.name}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-emerald-500">Active</span>
                {canManageHall ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => onRemove(member.id)}
                    disabled={!canRemoveMembers}
                    aria-label={`Remove ${member.name}`}
                    title={
                      canRemoveMembers
                        ? `Remove ${member.name}`
                        : 'At least one member must remain in the hall'
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {canManageHall && !canRemoveMembers ? (
          <p className="mb-2 px-2 text-[11px] text-muted-foreground">
            At least one active member must remain in the hall.
          </p>
        ) : null}

        <DropdownMenuLabel>Available members</DropdownMenuLabel>
        <div className="space-y-1">
          {inactiveMembers.map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-md px-2 py-1.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-xs">
                  {member.avatarUrl
                    ? <img src={member.avatarUrl} alt={member.name} className="h-full w-full object-cover" />
                    : <UserCircle2 className="h-5 w-5 text-muted-foreground/60" />
                  }
                </div>
                <p className="text-sm font-medium leading-none">{member.name}</p>
              </div>
              {canManageHall ? (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => onAdd(member.id)}>
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">Hall only</span>
              )}
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
