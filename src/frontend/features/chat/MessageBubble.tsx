import { MessageCircle, Reply } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type { Message } from '../../types/domain';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import { RoutePill } from './RoutePill';

export function MessageBubble({ message }: { message: Message }) {
  const members = useAppStore((state) => state.members);

  if (message.senderType === 'system') {
    return <RoutePill memberIds={message.routeMemberIds ?? []} />;
  }

  const isUser = message.senderType === 'user';
  const member = message.memberId ? members.find((item) => item.id === message.memberId) : null;
  const avatar = member?.emoji ?? '🧠';
  const label = member?.name ?? 'Council Member';

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
      {!isUser && member ? (
        <Avatar className="mt-1 border border-border">
          <AvatarFallback>{avatar}</AvatarFallback>
        </Avatar>
      ) : null}

      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isUser ? <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">{label}</p> : null}
        <div
          className={`rounded-3xl border px-4 py-3 text-sm leading-relaxed shadow-sm ${
            isUser ? 'rounded-br-md border-primary/20 bg-primary/15' : 'rounded-bl-md border-border bg-card'
          } ${message.status === 'error' ? 'border-destructive/50' : ''}`}
        >
          {message.content}

          {!isUser ? (
            <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <Reply className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-[11px] text-muted-foreground">{message.timestamp}</span>
            </div>
          ) : (
            <div className="mt-2 text-right text-[11px] text-muted-foreground">{message.timestamp}</div>
          )}
        </div>
      </div>
    </div>
  );
}
