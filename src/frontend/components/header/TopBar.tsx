import { Menu, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '../ui/badge';
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

interface TopBarProps {
  conversation?: Conversation;
  title: string;
  subtitle: string;
  showParticipants: boolean;
  onToggleSidebar: () => void;
}

export function TopBar({ conversation, title, subtitle, showParticipants, onToggleSidebar }: TopBarProps) {
  const addMemberToConversation = useAppStore((state) => state.addMemberToConversation);
  const members = useAppStore((state) => state.members);
  const participantIds = conversation?.memberIds ?? [];
  const participants = participantIds
    .map((id) => members.find((member) => member.id === id && member.status === 'active'))
    .filter(Boolean);
  const inactiveMembers = members.filter((member) => member.status === 'active' && !participantIds.includes(member.id));
  const activeCount = participants.length;
  const canManageHall = conversation?.type === 'hall';

  return (
    <header className="flex h-[74px] items-center justify-between border-b border-border/80 bg-background/80 px-4 backdrop-blur md:h-16 md:px-6">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <p className="font-display text-lg leading-none tracking-tight">{title}</p>
          {subtitle || (showParticipants && activeCount > 0) ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground md:mt-1">
              {subtitle ? <span>{subtitle}</span> : null}
              {subtitle && showParticipants && activeCount > 0 ? (
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
              ) : null}
              {showParticipants && activeCount > 0 ? (
                <CouncilMembersMenu
                  trigger={
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-2 py-0.5 text-[10px] font-medium sm:hidden">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {activeCount} active
                    </span>
                  }
                  activeMembers={participants}
                  inactiveMembers={inactiveMembers}
                  canManageHall={canManageHall}
                  onAdd={(memberId) => conversation && void addMemberToConversation(conversation.id, memberId)}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showParticipants && activeCount > 0 ? (
          <CouncilMembersMenu
            trigger={
              <div className="hidden items-center gap-1 rounded-full border border-border/80 bg-card px-2 py-1 sm:flex">
                {participants.slice(0, 4).map((member) => (
                  <Avatar key={member.id} className="h-7 w-7 border border-border">
                    <AvatarFallback>{member.emoji}</AvatarFallback>
                  </Avatar>
                ))}
                <Badge variant="secondary">{activeCount} active</Badge>
              </div>
            }
            activeMembers={participants}
            inactiveMembers={inactiveMembers}
            canManageHall={canManageHall}
            onAdd={(memberId) => conversation && void addMemberToConversation(conversation.id, memberId)}
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
}: {
  trigger: ReactNode;
  activeMembers: Array<ReturnType<typeof useAppStore.getState>['members'][number]>;
  inactiveMembers: Array<ReturnType<typeof useAppStore.getState>['members'][number]>;
  canManageHall: boolean;
  onAdd: (memberId: string) => void;
}) {
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
                <span className="grid h-7 w-7 place-items-center rounded-full border border-border bg-background text-xs">{member.emoji}</span>
                <div>
                  <p className="text-sm font-medium leading-none">{member.name}</p>
                  <p className="text-[11px] text-muted-foreground">{member.role}</p>
                </div>
              </div>
              <span className="text-[11px] text-emerald-500">Active</span>
            </div>
          ))}
        </div>

        <DropdownMenuLabel>Available members</DropdownMenuLabel>
        <div className="space-y-1">
          {inactiveMembers.map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-md px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-border bg-background text-xs">{member.emoji}</span>
                <div>
                  <p className="text-sm font-medium leading-none">{member.name}</p>
                  <p className="text-[11px] text-muted-foreground">{member.role}</p>
                </div>
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
