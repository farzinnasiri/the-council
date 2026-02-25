import { Menu, Plus, UserCircle2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
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

interface TopBarProps {
  conversation?: Conversation;
  title: string;
  subtitle: string;
  showParticipants: boolean;
  onToggleSidebar: () => void;
}

export function TopBar({ conversation, title, subtitle, showParticipants, onToggleSidebar }: TopBarProps) {
  const addMemberToConversation = useAppStore((state) => state.addMemberToConversation);
  const removeMemberFromConversation = useAppStore((state) => state.removeMemberFromConversation);
  const members = useAppStore((state) => state.members);
  const messages = useAppStore((state) => state.messages);
  const pendingReplyMemberIds = useAppStore((state) => state.pendingReplyMemberIds);
  const hallParticipantsByConversation = useAppStore((state) => state.hallParticipantsByConversation);
  const participantIds = conversation ? hallParticipantsByConversation[conversation.id] ?? [] : [];
  const participants = participantIds
    .map((id) => members.find((member) => member.id === id && !member.deletedAt))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const inactiveMembers = members.filter((member) => !member.deletedAt && !participantIds.includes(member.id));
  const activeCount = participants.length;
  const isChamber = conversation?.kind === 'chamber';
  const showHallParticipants = showParticipants && !isChamber;
  const canManageHall = conversation?.kind === 'hall';
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const [isChamberTypingVisible, setIsChamberTypingVisible] = useState(false);
  const typingVisibilityTimerRef = useRef<number | null>(null);

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

  const isChamberOnline =
    isChamber &&
    (
      isChamberTypingVisible ||
      (
        typeof chamberLastMemberActivityAt === 'number' &&
        presenceNow - chamberLastMemberActivityAt <= CHAMBER_INACTIVITY_TIMEOUT_MS
      )
    );

  return (
    <header className="flex h-[74px] items-center justify-between border-b border-border bg-background px-4 md:h-16 md:px-6">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <p className="font-mono text-sm font-semibold tracking-tight">{title}</p>
          {subtitle || showHallParticipants ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground md:mt-1">
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

      <div className="flex items-center gap-2">
        {isChamber ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1 text-xs text-foreground">
            <span
              className={`h-2 w-2 rounded-full ${
                isChamberOnline ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            {isChamberOnline ? 'Online' : 'Offline'}
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
