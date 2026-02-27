import {
  ArrowLeft,
  ChevronRight,
  MessageCirclePlus,
  MessagesSquare,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCircle2,
  Users2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode, type UIEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { api } from '../../../../convex/_generated/api';
import { useAppStore } from '../../store/appStore';
import { Separator } from '../ui/separator';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { ThemeQuickCycle } from '../theme/ThemeSwitcher';
import { formatSessionTime } from '../../lib/time';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const THREAD_PAGE_SIZE = 12;
  const user = useQuery(api.users.viewer);
  const [hallOpen, setHallOpen] = useState(true);
  const [chambersOpen, setChambersOpen] = useState(true);
  const [focusedMemberId, setFocusedMemberId] = useState<string | null>(null);
  const [dismissedFocusedMemberId, setDismissedFocusedMemberId] = useState<string | null>(null);
  const [threadVisibleCountByMember, setThreadVisibleCountByMember] = useState<Record<string, number>>({});
  const [newHallOpen, setNewHallOpen] = useState(false);
  const [newHallMode, setNewHallMode] = useState<'advisory' | 'roundtable'>('advisory');
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string; kind: 'hall' | 'thread' } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    kind: 'hall' | 'thread';
    memberId?: string;
    memberName?: string;
    isActive: boolean;
  } | null>(null);
  const [clearTarget, setClearTarget] = useState<{
    memberId: string;
    memberName: string;
    threadCount: number;
  } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const conversations = useAppStore((state) => state.conversations);
  const members = useAppStore((state) => state.members);
  const hallParticipantsByConversation = useAppStore((state) => state.hallParticipantsByConversation);
  const createChamberThread = useAppStore((state) => state.createChamberThread);
  const listChamberThreadsForMember = useAppStore((state) => state.listChamberThreadsForMember);
  const getLatestChamberThreadForMember = useAppStore((state) => state.getLatestChamberThreadForMember);
  const renameConversation = useAppStore((state) => state.renameConversation);
  const archiveConversation = useAppStore((state) => state.archiveConversation);
  const clearChamberByMember = useAppStore((state) => state.clearChamberByMember);
  const sessionItemBaseClass =
    'group relative rounded-md border border-transparent bg-transparent px-3 py-2 transition-colors duration-200 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border';
  const sessionItemActiveClass = 'bg-muted shadow-[inset_2px_0_0_hsl(var(--foreground))]';

  const halls = conversations.filter((item) => item.kind === 'hall' && !item.deletedAt);
  const activeMembers = members.filter((item) => !item.deletedAt);
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const conversationsById = useMemo(() => new Map(conversations.map((conversation) => [conversation.id, conversation])), [conversations]);
  const activeChamberConversationId =
    location.pathname.startsWith('/chamber/') && !location.pathname.startsWith('/chamber/member/')
      ? location.pathname.split('/')[2]
      : undefined;
  const activeChamberConversation = activeChamberConversationId
    ? conversationsById.get(activeChamberConversationId)
    : undefined;
  const activeChamberMemberId =
    location.pathname.startsWith('/chamber/member/')
      ? location.pathname.split('/')[3] ?? null
      : activeChamberConversation?.kind === 'chamber'
        ? activeChamberConversation.chamberMemberId
        : null;
  const selectedThreadPanelMemberId = focusedMemberId;
  const selectedThreadPanelMember = selectedThreadPanelMemberId
    ? membersById.get(selectedThreadPanelMemberId)
    : undefined;
  const selectedMemberThreads = selectedThreadPanelMemberId
    ? listChamberThreadsForMember(selectedThreadPanelMemberId)
    : [];
  const selectedVisibleCount = selectedThreadPanelMemberId
    ? (threadVisibleCountByMember[selectedThreadPanelMemberId] ?? THREAD_PAGE_SIZE)
    : THREAD_PAGE_SIZE;
  const selectedVisibleThreads = selectedMemberThreads.slice(0, selectedVisibleCount);
  const selectedHasMoreThreads = selectedVisibleThreads.length < selectedMemberThreads.length;

  useEffect(() => {
    if (!location.pathname.startsWith('/chamber/')) {
      setFocusedMemberId(null);
      setDismissedFocusedMemberId(null);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!activeChamberMemberId || dismissedFocusedMemberId === activeChamberMemberId) return;
    setFocusedMemberId(activeChamberMemberId);
    setThreadVisibleCountByMember((current) =>
      current[activeChamberMemberId]
        ? current
        : {
            ...current,
            [activeChamberMemberId]: THREAD_PAGE_SIZE,
          }
    );
  }, [THREAD_PAGE_SIZE, activeChamberMemberId, dismissedFocusedMemberId]);

  const openChamberMember = (memberId: string) => {
    setDismissedFocusedMemberId(null);
    setFocusedMemberId(memberId);
    setThreadVisibleCountByMember((current) =>
      current[memberId]
        ? current
        : {
            ...current,
            [memberId]: THREAD_PAGE_SIZE,
          }
    );
    navigate(`/chamber/member/${memberId}`);
    onNavigate?.();
  };

  const loadMoreThreadsForSelectedMember = () => {
    if (!selectedThreadPanelMemberId) return;
    setThreadVisibleCountByMember((current) => {
      const existing = current[selectedThreadPanelMemberId] ?? THREAD_PAGE_SIZE;
      return {
        ...current,
        [selectedThreadPanelMemberId]: existing + THREAD_PAGE_SIZE,
      };
    });
  };

  const openFocusedThreadsView = (memberId: string) => {
    setDismissedFocusedMemberId(null);
    setFocusedMemberId(memberId);
    setThreadVisibleCountByMember((current) =>
      current[memberId]
        ? current
        : {
            ...current,
            [memberId]: THREAD_PAGE_SIZE,
          }
    );
  };

  const closeFocusedThreadsView = () => {
    if (selectedThreadPanelMemberId) {
      setDismissedFocusedMemberId(selectedThreadPanelMemberId);
    }
    setFocusedMemberId(null);
  };

  const handleThreadsPanelScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!selectedHasMoreThreads) return;
    const node = event.currentTarget;
    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceToBottom <= 96) {
      loadMoreThreadsForSelectedMember();
    }
  };

  const isFocusedThreadsView = Boolean(selectedThreadPanelMemberId && selectedThreadPanelMember);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      {isFocusedThreadsView ? (
        <>
          <div className="shrink-0 px-4 pb-3 pt-5">
            <button
              type="button"
              onClick={closeFocusedThreadsView}
              className="mb-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="flex items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Threads with {selectedThreadPanelMember.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedMemberThreads.length} total thread{selectedMemberThreads.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label={`Create thread with ${selectedThreadPanelMember.name}`}
                  onClick={() => {
                    void createChamberThread(selectedThreadPanelMember.id).then((thread) => {
                      navigate(`/chamber/${thread.id}`);
                      onNavigate?.();
                    });
                  }}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'rounded-md p-1.5 text-muted-foreground opacity-70 transition-[background-color,color,opacity] hover:bg-muted/60 hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-50'
                      )}
                      aria-label="Chamber options"
                      disabled={selectedMemberThreads.length === 0}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        if (!selectedThreadPanelMember || selectedMemberThreads.length === 0) return;
                        setClearTarget({
                          memberId: selectedThreadPanelMember.id,
                          memberName: selectedThreadPanelMember.name,
                          threadCount: selectedMemberThreads.length,
                        });
                      }}
                      className="gap-2 text-destructive hover:bg-destructive/10"
                      disabled={selectedMemberThreads.length === 0}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear chamber
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 overscroll-contain" onScroll={handleThreadsPanelScroll}>
            {selectedMemberThreads.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/80 px-3 py-4 text-center text-xs text-muted-foreground">
                No threads yet
              </div>
            ) : (
              <div className="space-y-1">
                {selectedVisibleThreads.map((thread) => {
                  const isActive = location.pathname === `/chamber/${thread.id}`;
                  return (
                    <NavLink
                      key={thread.id}
                      to={`/chamber/${thread.id}`}
                      onClick={onNavigate}
                      className={cn(
                        'group relative block rounded-md border border-transparent px-2 py-1.5 transition hover:bg-muted',
                        isActive && sessionItemActiveClass
                      )}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-1">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium leading-5">{thread.title}</p>
                          <p className="truncate text-xs leading-5 text-muted-foreground">
                            {formatSessionTime(thread.updatedAt)}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted/60 hover:text-foreground group-hover:opacity-100"
                              aria-label="Thread options"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                setRenameTarget({ id: thread.id, title: thread.title, kind: 'thread' });
                                setRenameValue(thread.title);
                              }}
                              className="gap-2"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                setDeleteTarget({
                                  id: thread.id,
                                  kind: 'thread',
                                  memberId: selectedThreadPanelMember.id,
                                  memberName: selectedThreadPanelMember.name,
                                  isActive,
                                });
                              }}
                              className="gap-2 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </NavLink>
                  );
                })}
                {selectedHasMoreThreads ? (
                  <button
                    type="button"
                    onClick={loadMoreThreadsForSelectedMember}
                    className="w-full rounded-md border border-border/70 px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    Load more threads
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="shrink-0 px-4 pb-3 pt-5">
            <div className="mb-4 flex items-center gap-3">
              <div>
                <p className="font-semibold text-lg tracking-tight leading-none">The Council</p>
              </div>
            </div>

            <Button
              variant="ghost"
              className="h-10 w-full justify-start gap-2 rounded-lg px-2 text-sm text-foreground/90 hover:bg-background/60"
              onClick={() => {
                setNewHallMode('advisory');
                setNewHallOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New hall
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 overscroll-contain">
            <SessionGroup
              title="Hall"
              icon={<MessagesSquare className="h-3.5 w-3.5" />}
              open={hallOpen}
              onToggle={() => setHallOpen((current) => !current)}
            >
              {halls.map((session) => {
                const isActive = location.pathname === `/hall/${session.id}`;
                return (
                  <NavLink
                    key={session.id}
                    to={`/hall/${session.id}`}
                    onClick={onNavigate}
                    className={() => cn(sessionItemBaseClass, isActive && sessionItemActiveClass)}
                  >
                    <span
                      className={cn(
                        'pointer-events-none absolute inset-y-2 left-0 w-px rounded-sm transition-colors duration-200',
                        isActive ? 'bg-transparent' : 'group-hover:bg-foreground/20'
                      )}
                    />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium leading-5">{session.title}</p>
                        <p className="mt-1.5 truncate text-xs leading-5 text-muted-foreground">
                          {formatSessionTime(session.updatedAt)}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              'rounded-md p-1.5 text-muted-foreground opacity-70 transition-[background-color,color,opacity] hover:bg-muted/60 hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:opacity-100'
                            )}
                            aria-label="Hall options"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              setRenameTarget({ id: session.id, title: session.title, kind: 'hall' });
                              setRenameValue(session.title);
                            }}
                            className="gap-2"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              setDeleteTarget({ id: session.id, kind: 'hall', isActive });
                            }}
                            className="gap-2 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mt-3 flex items-center -space-x-1.5">
                      {(hallParticipantsByConversation[session.id] ?? []).slice(0, 4).map((memberId) => {
                        const member = membersById.get(memberId);
                        return (
                          <div
                            key={memberId}
                            className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-border bg-background"
                            title={member?.name}
                          >
                            {member?.avatarUrl ? (
                              <img src={member.avatarUrl} alt={member.name} className="h-full w-full object-cover" />
                            ) : (
                              <UserCircle2 className="h-3 w-3 text-muted-foreground/60" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </NavLink>
                );
              })}
            </SessionGroup>

            <SessionGroup
              title="Chambers"
              icon={<MessageCirclePlus className="h-3.5 w-3.5" />}
              open={chambersOpen}
              onToggle={() => setChambersOpen((current) => !current)}
            >
              {activeMembers.map((member) => {
                const threads = listChamberThreadsForMember(member.id);
                const latestThread = threads[0] ?? getLatestChamberThreadForMember(member.id);
                const isRouteActive = activeChamberMemberId === member.id;
                return (
                  <div key={member.id} className="flex min-w-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openChamberMember(member.id)}
                      className={cn(
                        'group relative flex min-w-0 flex-1 items-start gap-2 rounded-md border border-transparent px-2 py-2 text-left transition hover:bg-muted',
                        isRouteActive && sessionItemActiveClass
                      )}
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt={member.name} className="h-full w-full object-cover" />
                        ) : (
                          <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground/60" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium leading-5">{member.name}</p>
                        <p className="truncate text-xs leading-5 text-muted-foreground">
                          {latestThread?.updatedAt
                            ? `${threads.length} thread${threads.length === 1 ? '' : 's'} · ${formatSessionTime(latestThread.updatedAt)}`
                            : 'No threads yet'}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      aria-label={`Create thread with ${member.name}`}
                      onClick={() => {
                        openFocusedThreadsView(member.id);
                        void createChamberThread(member.id).then((thread) => {
                          navigate(`/chamber/${thread.id}`);
                          onNavigate?.();
                        });
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'shrink-0 rounded-md p-1.5 text-muted-foreground opacity-70 transition-[background-color,color,opacity] hover:bg-muted/60 hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-50'
                          )}
                          aria-label="Chamber options"
                          disabled={threads.length === 0}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            if (threads.length === 0) return;
                            setClearTarget({
                              memberId: member.id,
                              memberName: member.name,
                              threadCount: threads.length,
                            });
                          }}
                          className="gap-2 text-destructive hover:bg-destructive/10"
                          disabled={threads.length === 0}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Clear chamber
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </SessionGroup>
          </div>
        </>
      )}

      <Separator className="shrink-0" />

      <div className="shrink-0 p-3">
        <nav className="grid gap-1">
          <NavItem to="/members" icon={<Users2 className="h-4 w-4" />} label="Members" onNavigate={onNavigate} />
          <NavItem to="/kb-query" icon={<Search className="h-4 w-4" />} label="KB Query" onNavigate={onNavigate} />
          <NavItem
            to="/settings"
            icon={
              user?.image ? (
                <img src={user.image} alt={user.name || 'User'} className="h-4 w-4 rounded-full object-cover" />
              ) : (
                <UserCircle2 className="h-4 w-4" />
              )
            }
            label="Settings"
            onNavigate={onNavigate}
          />
          <ThemeQuickCycle />
        </nav>
      </div>

      <DialogPrimitive.Root open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl focus:outline-none">
            <DialogPrimitive.Title className="font-display text-lg">
              {renameTarget?.kind === 'thread' ? 'Rename thread' : 'Rename hall'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              {renameTarget?.kind === 'thread'
                ? 'Choose a clearer title for this thread.'
                : 'Choose a clearer title for this hall.'}
            </DialogPrimitive.Description>
            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!renameTarget) return;
                const nextTitle = renameValue.trim();
                if (!nextTitle || nextTitle === renameTarget.title) {
                  setRenameTarget(null);
                  return;
                }
                void renameConversation(renameTarget.id, nextTitle);
                setRenameTarget(null);
              }}
            >
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                autoFocus
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
                placeholder={renameTarget?.kind === 'thread' ? 'Thread title' : 'Hall title'}
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" type="button" className="h-9 px-3 text-sm">
                    Cancel
                  </Button>
                </DialogPrimitive.Close>
                <Button
                  type="submit"
                  className="h-9 px-3 text-sm"
                  disabled={!renameValue.trim() || (renameTarget ? renameValue.trim() === renameTarget.title : true)}
                >
                  Save
                </Button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={newHallOpen} onOpenChange={setNewHallOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl focus:outline-none">
            <DialogPrimitive.Title className="font-display text-lg">Choose Hall Mode</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              Pick how this Hall should run before you send the first message.
            </DialogPrimitive.Description>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                className={cn(
                  'rounded-xl border p-4 text-left transition',
                  newHallMode === 'advisory'
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border hover:border-foreground/30'
                )}
                onClick={() => setNewHallMode('advisory')}
              >
                <p className="text-sm font-semibold">Advisory</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fast mode. Active members answer each turn; mentions can focus who speaks.
                </p>
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-xl border p-4 text-left transition',
                  newHallMode === 'roundtable'
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border hover:border-foreground/30'
                )}
                onClick={() => setNewHallMode('roundtable')}
              >
                <p className="text-sm font-semibold">Roundtable</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Deliberation mode. Members signal intent each round and you approve who speaks.
                </p>
              </button>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" type="button" className="h-9 px-3 text-sm">
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button
                type="button"
                className="h-9 px-3 text-sm"
                onClick={() => {
                  setNewHallOpen(false);
                  navigate(`/hall/new?mode=${newHallMode}`);
                  onNavigate?.();
                }}
              >
                Continue
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl focus:outline-none">
            <DialogPrimitive.Title className="font-display text-lg">
              {deleteTarget?.kind === 'thread' ? 'Delete thread' : 'Delete hall'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              {deleteTarget?.kind === 'thread'
                ? 'This removes the thread from your active list. This action cannot be undone from the UI.'
                : 'This removes the hall from your active list. This action cannot be undone from the UI.'}
            </DialogPrimitive.Description>
            <div className="mt-5 flex items-center justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" type="button" className="h-9 px-3 text-sm">
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button
                type="button"
                className="h-9 border border-foreground/20 bg-foreground px-3 text-sm text-background hover:opacity-90"
                onClick={() => {
                  if (!deleteTarget) return;
                  void archiveConversation(deleteTarget.id);
                  if (deleteTarget.isActive) {
                    if (deleteTarget.kind === 'thread' && deleteTarget.memberId) {
                      navigate(`/chamber/member/${deleteTarget.memberId}`);
                    } else {
                      navigate('/hall/new');
                    }
                    onNavigate?.();
                  }
                  setDeleteTarget(null);
                }}
              >
                Yes, delete
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={Boolean(clearTarget)} onOpenChange={(open) => !open && setClearTarget(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl focus:outline-none">
            <DialogPrimitive.Title className="font-display text-lg">Clear chamber</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              {clearTarget
                ? `Delete all ${clearTarget.threadCount} threads and their history with ${clearTarget.memberName}?`
                : 'Delete all threads in this chamber?'}
            </DialogPrimitive.Description>
            <div className="mt-5 flex items-center justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" type="button" className="h-9 px-3 text-sm">
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button
                type="button"
                className="h-9 border border-foreground/20 bg-foreground px-3 text-sm text-background hover:opacity-90"
                onClick={() => {
                  if (!clearTarget) return;
                  void clearChamberByMember(clearTarget.memberId);
                  navigate(`/chamber/member/${clearTarget.memberId}`);
                  onNavigate?.();
                  setClearTarget(null);
                }}
              >
                Yes, clear
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </aside>
  );
}

function SessionGroup({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={onToggle}
        className="mb-2 flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:bg-background/60"
        aria-expanded={open}
      >
        <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
        {icon}
        {title}
      </button>

      {open ? <div className="grid gap-1.5">{children}</div> : null}
    </section>
  );
}

function NavItem({
  to,
  icon,
  label,
  onNavigate,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-background hover:text-foreground',
          isActive && 'bg-background text-foreground'
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
