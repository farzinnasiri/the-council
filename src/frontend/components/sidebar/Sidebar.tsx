import { ChevronRight, MessageCirclePlus, MessagesSquare, Plus, Users2, Settings, UserCircle2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { Separator } from '../ui/separator';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { ThemeQuickCycle } from '../theme/ThemeSwitcher';
import { formatSessionTime } from '../../lib/time';

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const [hallOpen, setHallOpen] = useState(true);
  const [chambersOpen, setChambersOpen] = useState(true);
  const navigate = useNavigate();
  const conversations = useAppStore((state) => state.conversations);
  const members = useAppStore((state) => state.members);
  const createConversation = useAppStore((state) => state.createConversation);

  const halls = conversations.filter((item) => item.type === 'hall');
  const chambers = conversations.filter((item) => item.type === 'chamber');
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const handleNewSession = async () => {
    const created = await createConversation('hall');
    navigate(`/hall/${created.id}`);
    onNavigate?.();
  };

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
            void handleNewSession();
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
          sessions={halls}
          membersById={membersById}
          open={hallOpen}
          onToggle={() => setHallOpen((current) => !current)}
          onNavigate={onNavigate}
        />
        <SessionGroup
          title="Chambers"
          icon={<MessageCirclePlus className="h-3.5 w-3.5" />}
          sessions={chambers}
          membersById={membersById}
          open={chambersOpen}
          onToggle={() => setChambersOpen((current) => !current)}
          onNavigate={onNavigate}
        />
      </div>

      <Separator className="shrink-0" />

      <div className="shrink-0 p-3">
        <nav className="grid gap-1">
          <NavItem to="/members" icon={<Users2 className="h-4 w-4" />} label="Members" onNavigate={onNavigate} />
          <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" onNavigate={onNavigate} />
          <NavItem to="/profile" icon={<UserCircle2 className="h-4 w-4" />} label="Profile" onNavigate={onNavigate} />
          <ThemeQuickCycle />
        </nav>
      </div>
    </aside>
  );
}

function SessionGroup({
  title,
  icon,
  sessions,
  membersById,
  open,
  onToggle,
  onNavigate,
}: {
  title: string;
  icon: ReactNode;
  sessions: ReturnType<typeof useAppStore.getState>['conversations'];
  membersById: Map<string, ReturnType<typeof useAppStore.getState>['members'][number]>;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
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

      {open ? (
        <div className="grid gap-1">
          {sessions.map((session) => {
            const href = session.type === 'hall' ? `/hall/${session.id}` : `/chamber/${session.id}`;
            const primaryMemberId = session.memberId ?? session.memberIds[0];
            const primaryMember = primaryMemberId ? membersById.get(primaryMemberId) : undefined;
            const chamberTitle = session.title.replace(/^chamber\s*[·-]\s*/i, '').trim();
            return (
              <NavLink
                key={session.id}
                to={href}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group rounded-xl border border-transparent bg-transparent px-3 py-2 transition hover:border-border hover:bg-background/80',
                    isActive && 'border-border bg-background'
                  )
                }
              >
                <div className="flex items-center gap-2">
                  {session.type === 'chamber' && primaryMember ? (
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border bg-background text-[10px]">
                      {primaryMember.emoji}
                    </span>
                  ) : null}
                  <p className="truncate text-sm font-medium">{session.type === 'chamber' ? chamberTitle : session.title}</p>
                </div>
                <p className="truncate text-xs text-muted-foreground">{formatSessionTime(session.updatedAt)}</p>
                {session.type === 'hall' ? (
                  <div className="mt-2 flex items-center -space-x-1.5">
                    {session.memberIds.slice(0, 4).map((memberId) => (
                      <span
                        key={memberId}
                        className="grid h-5 w-5 place-items-center rounded-full border border-border bg-background text-[10px]"
                        title={membersById.get(memberId)?.name}
                      >
                        {membersById.get(memberId)?.emoji ?? '•'}
                      </span>
                    ))}
                  </div>
                ) : null}
              </NavLink>
            );
          })}
        </div>
      ) : null}
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
