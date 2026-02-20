import { Check, Copy, MessageCircle, Reply, UserCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import type { Message } from '../../types/domain';
import { Button } from '../../components/ui/button';
import { RoutePill } from './RoutePill';
import { MarkdownMessage } from './MarkdownMessage';

/** Format epoch ms → "HH:MM" */
function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MemberAvatar({ avatarUrl, name }: { avatarUrl?: string | null; name: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="mt-1 h-8 w-8 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }
  return (
    <UserCircle2
      className="mt-1 h-8 w-8 shrink-0 text-muted-foreground/60"
      aria-label={name}
    />
  );
}

export function MessageBubble({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);
  const members = useAppStore((state) => state.members);
  const conversations = useAppStore((state) => state.conversations);

  if (message.role === 'system') {
    return <RoutePill memberIds={message.routing?.memberIds ?? []} />;
  }

  const isUser = message.role === 'user';
  const member = message.authorMemberId
    ? members.find((item) => item.id === message.authorMemberId)
    : null;
  const label = member?.name ?? 'Council Member';
  const conversation = conversations.find((item) => item.id === message.conversationId);
  const isChamber = conversation?.kind === 'chamber';
  const timeLabel = formatClock(message.createdAt);

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
      {!isUser && member ? (
        <MemberAvatar avatarUrl={member.avatarUrl} name={label} />
      ) : null}

      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isUser ? <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">{label}</p> : null}
        <div
          className={`rounded-3xl border px-4 py-3 text-sm leading-relaxed shadow-sm ${isUser ? 'rounded-br-md border-primary/20 bg-primary/15' : 'rounded-bl-md border-border bg-card'
            } ${message.status === 'error' ? 'border-destructive/50' : ''}`}
        >
          <MarkdownMessage content={message.content} />

          {!isUser ? (
            <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2">
              {isChamber ? (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => void copyContent()} title={copied ? 'Copied' : 'Copy'} aria-label={copied ? 'Copied' : 'Copy message'}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><Reply className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><MessageCircle className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => void copyContent()} title={copied ? 'Copied' : 'Copy'} aria-label={copied ? 'Copied' : 'Copy message'}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              )}
              <span className="text-[11px] text-muted-foreground">{timeLabel}</span>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => void copyContent()} title={copied ? 'Copied' : 'Copy'} aria-label={copied ? 'Copied' : 'Copy message'}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <span className="text-[11px] text-muted-foreground">{timeLabel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
