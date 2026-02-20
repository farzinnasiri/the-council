import {
  ChevronRight,
  MessageCirclePlus,
  MessagesSquare,
  MoreHorizontal,
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
  const navigate = useNavigate();
  const location = useLocation();
  const conversations = useAppStore((state) => state.conversations);
  const members = useAppStore((state) => state.members);
  const chamberByMemberId = useAppStore((state) => state.chamberByMemberId);
  const hallParticipantsByConversation = useAppStore((state) => state.hallParticipantsByConversation);
  const renameHallConversation = useAppStore((state) => state.renameHallConversation);
  const archiveHallConversation = useAppStore((state) => state.archiveHallConversation);

  const halls = conversations.filter((item) => item.kind === 'hall' && !item.deletedAt);
  const activeMembers = members.filter((item) => !item.deletedAt);
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card/65 backdrop-blur">
      <div className="shrink-0 px-4 pb-3 pt-5">
        <div className="mb-4 flex items-center gap-3">
          <div>
            <p className="font-display text-lg leading-none">The Council</p>
          </div>
        </div>

        <Button
          variant="ghost"
          className="h-10 w-full justify-start gap-2 rounded-lg px-2 text-sm text-foreground/90 hover:bg-background/60"
          onClick={() => {
            navigate('/hall/new');
            onNavigate?.();
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
                    'group rounded-xl border border-transparent bg-transparent px-3 py-2.5 transition hover:border-border hover:bg-background/80',
                    isActive && 'border-border bg-background'
                  )
                }
              >
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
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        aria-label="Hall options"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault();
                          const nextTitle = window.prompt('Rename hall', session.title);
                          if (!nextTitle || nextTitle.trim() === session.title) return;
                          void renameHallConversation(session.id, nextTitle);
                        }}
                        className="gap-2"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault();
                          const confirmed = window.confirm('Delete this hall? You can recover it from archived data only.');
                          if (!confirmed) return;
                          void archiveHallConversation(session.id);
                          if (isActive) {
                            navigate('/hall/new');
                            onNavigate?.();
                          }
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
            return (
              <NavLink
                key={member.id}
                to={`/chamber/member/${member.id}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group rounded-xl border border-transparent bg-transparent px-3 py-2.5 transition hover:border-border hover:bg-background/80',
                    isActive && 'border-border bg-background'
                  )
                }
              >
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
                  {chamber ? formatSessionTime(chamber.updatedAt) : 'No conversation yet'}
                </p>
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
