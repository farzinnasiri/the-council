import {
  ChevronRight,
  MessageCirclePlus,
  MessagesSquare,
  MoreVertical,
  Pencil,
  Plus,
  Settings,
  Trash2,
  UserCircle2,
  Users2,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
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
  const user = useQuery(api.users.viewer);
  const [hallOpen, setHallOpen] = useState(true);
  const [chambersOpen, setChambersOpen] = useState(true);
  const [newHallOpen, setNewHallOpen] = useState(false);
  const [newHallMode, setNewHallMode] = useState<'advisory' | 'roundtable'>('advisory');
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteHallTarget, setDeleteHallTarget] = useState<{ id: string; isActive: boolean } | null>(null);
  const [clearTarget, setClearTarget] = useState<{
    conversationId: string;
    memberId: string;
    memberName: string;
    isActive: boolean;
  } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const conversations = useAppStore((state) => state.conversations);
  const members = useAppStore((state) => state.members);
  const chamberByMemberId = useAppStore((state) => state.chamberByMemberId);
  const hallParticipantsByConversation = useAppStore((state) => state.hallParticipantsByConversation);
  const renameHallConversation = useAppStore((state) => state.renameHallConversation);
  const archiveHallConversation = useAppStore((state) => state.archiveHallConversation);
  const clearChamberHistory = useAppStore((state) => state.clearChamberHistory);
  const sessionItemBaseClass =
    'group relative rounded-md border border-transparent bg-transparent px-3 py-2 transition-colors duration-200 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border';
  const sessionItemActiveClass = 'bg-muted shadow-[inset_2px_0_0_hsl(var(--foreground))]';

  const halls = conversations.filter((item) => item.kind === 'hall' && !item.deletedAt);
  const activeMembers = members.filter((item) => !item.deletedAt);
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
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
                className={() =>
                  cn(
                    sessionItemBaseClass,
                    isActive && sessionItemActiveClass
                  )
                }
              >
                <span
                  className={cn(
                    'pointer-events-none absolute inset-y-2 left-0 w-px rounded-sm transition-colors duration-200',
                    isActive ? 'bg-foreground' : 'group-hover:bg-foreground/20'
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
                          setRenameTarget({ id: session.id, title: session.title });
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
                          setDeleteHallTarget({ id: session.id, isActive });
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
            const chamber = chamberByMemberId[member.id];
            const isChamberActive = location.pathname === `/chamber/member/${member.id}`;
            return (
              <NavLink
                key={member.id}
                to={`/chamber/member/${member.id}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    sessionItemBaseClass,
                    isActive && sessionItemActiveClass
                  )
                }
              >
                <span
                  className={cn(
                    'pointer-events-none absolute inset-y-3 left-0.5 w-px rounded-full bg-transparent transition-colors duration-200',
                    isChamberActive ? 'bg-foreground/35' : 'group-hover:bg-foreground/15'
                  )}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt={member.name} className="h-full w-full object-cover" />
                        ) : (
                          <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground/60" />
                        )}
                      </div>
                      <p className="truncate text-sm font-medium leading-5">{member.name}</p>
                    </div>
                    <p className="mt-1.5 truncate text-xs leading-5 text-muted-foreground">
                      {chamber?.lastMessageAt ? formatSessionTime(chamber.lastMessageAt) : 'No conversation yet'}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          'rounded-md p-1.5 text-muted-foreground opacity-70 transition-[background-color,color,opacity] hover:bg-muted/60 hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-50'
                        )}
                        aria-label="Chamber options"
                        disabled={!chamber}
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
                          if (!chamber) return;
                          setClearTarget({
                            conversationId: chamber.id,
                            memberId: member.id,
                            memberName: member.name,
                            isActive: isChamberActive,
                          });
                        }}
                        className="gap-2 text-destructive hover:bg-destructive/10"
                        disabled={!chamber}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear history
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </NavLink>
            );
          })}
        </SessionGroup>
      </div>

      <Separator className="shrink-0" />

      <div className="shrink-0 p-3">
        <nav className="grid gap-1">
          <NavItem to="/members" icon={<Users2 className="h-4 w-4" />} label="Members" onNavigate={onNavigate} />
          <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" onNavigate={onNavigate} />
          <NavItem
            to="/profile"
            icon={
              user?.image ? (
                <img src={user.image} alt={user.name || 'User'} className="h-4 w-4 rounded-full object-cover" />
              ) : (
                <UserCircle2 className="h-4 w-4" />
              )
            }
            label="Profile"
            onNavigate={onNavigate}
          />
          <ThemeQuickCycle />
        </nav>
      </div>

      <DialogPrimitive.Root open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl focus:outline-none">
            <DialogPrimitive.Title className="font-display text-lg">Rename hall</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              Choose a clearer title for this hall.
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
                void renameHallConversation(renameTarget.id, nextTitle);
                setRenameTarget(null);
              }}
            >
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                autoFocus
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
                placeholder="Hall title"
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

      <DialogPrimitive.Root open={Boolean(deleteHallTarget)} onOpenChange={(open) => !open && setDeleteHallTarget(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl focus:outline-none">
            <DialogPrimitive.Title className="font-display text-lg">Delete hall</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              This removes the hall from your active list. This action cannot be undone from the UI.
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
                  if (!deleteHallTarget) return;
                  void archiveHallConversation(deleteHallTarget.id);
                  if (deleteHallTarget.isActive) {
                    navigate('/hall/new');
                    onNavigate?.();
                  }
                  setDeleteHallTarget(null);
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
            <DialogPrimitive.Title className="font-display text-lg">Clear chamber history</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              {clearTarget ? `Remove all messages with ${clearTarget.memberName}?` : 'Remove all messages in this chamber?'}
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
                  void clearChamberHistory(clearTarget.conversationId);
                  if (!clearTarget.isActive) {
                    navigate(`/chamber/member/${clearTarget.memberId}`);
                    onNavigate?.();
                  }
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
