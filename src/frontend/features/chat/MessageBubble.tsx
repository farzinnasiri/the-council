import { AlignJustify, Brain, Check, Copy, Expand, MessageCircle, NotebookPen, Reply, Search, SlidersHorizontal, UserCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import type { Message } from '../../types/domain';
import { Button } from '../../components/ui/button';
import { RoutePill } from './RoutePill';
import { MarkdownMessage } from './MarkdownMessage';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { cn } from '../../lib/utils';

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
  const messages = useAppStore((state) => state.messages);
  const appendMessageToNotebook = useAppStore((state) => state.appendMessageToNotebook);
  const refiningActionByMessageId = useAppStore((state) => state.refiningActionByMessageId);
  const refineLatestChamberResponse = useAppStore((state) => state.refineLatestChamberResponse);

  if (message.role === 'system') {
    const isManual = message.content.toLowerCase().startsWith('manually routed');
    return <RoutePill memberIds={message.routing?.memberIds ?? []} label={isManual ? 'Manually routed to' : 'Routed to'} />;
  }

  const isUser = message.role === 'user';
  const member = message.authorMemberId
    ? members.find((item) => item.id === message.authorMemberId)
    : null;
  const label = member?.name ?? 'Council Member';
  const conversation = conversations.find((item) => item.id === message.conversationId);
  const isChamber = conversation?.kind === 'chamber';
  const latestChamberMemberMessageId = isChamber
    ? messages
        .filter(
          (item) =>
            item.conversationId === message.conversationId &&
            item.role === 'member' &&
            item.status === 'sent' &&
            !item.deletedAt &&
            !item.supersededAt &&
            !item.compacted
        )
        .sort((a, b) => b.createdAt - a.createdAt)[0]?.id
    : undefined;
  const canRefine =
    Boolean(
      isChamber &&
      !isUser &&
      message.status === 'sent' &&
      !message.deletedAt &&
      !message.supersededAt &&
      !message.compacted &&
      latestChamberMemberMessageId === message.id
    );
  const activeRefinement = refiningActionByMessageId[message.id];
  const isReplacementRefining = activeRefinement && activeRefinement !== 'elaborate';
  const timeLabel = formatClock(message.createdAt);

  if (isReplacementRefining) {
    return null;
  }

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const addToNotebook = async () => {
    await appendMessageToNotebook(
      message.conversationId,
      message.content,
      isUser ? undefined : label
    );
  };

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
      {!isUser && member ? (
        <MemberAvatar avatarUrl={member.avatarUrl} name={label} />
      ) : null}

      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isUser ? <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">{label}</p> : null}
        <div
          className={`px-4 py-3 text-sm leading-relaxed ${isUser
            ? 'rounded-2xl bg-foreground text-background'
            : 'rounded-lg border border-border/50 bg-muted/30 text-foreground'
            } ${message.status === 'error' ? 'border-destructive/50 border' : ''}`}
        >
          <MarkdownMessage content={message.content} />

          {!isUser ? (
            <div className="mt-3 flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
              {isChamber ? (
                <div className="flex flex-wrap items-center gap-1">
                  {canRefine ? (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 rounded-md px-2 text-[11px] text-muted-foreground"
                            disabled={Boolean(activeRefinement)}
                          >
                            <SlidersHorizontal className="h-3 w-3" />
                            Refine
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44">
                          <DropdownMenuLabel>Refine Reply</DropdownMenuLabel>
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              void refineLatestChamberResponse(message.conversationId, 'think_harder');
                            }}
                            className="gap-2"
                          >
                            <Brain className="h-3.5 w-3.5" />
                            Think harder
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              void refineLatestChamberResponse(message.conversationId, 'deep_dive');
                            }}
                            className="gap-2"
                          >
                            <Search className="h-3.5 w-3.5" />
                            Deep dive
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              void refineLatestChamberResponse(message.conversationId, 'shorter');
                            }}
                            className="gap-2"
                          >
                            <AlignJustify className="h-3.5 w-3.5" />
                            Shorter
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 rounded-md px-2 text-[11px] text-muted-foreground"
                        onClick={() => void refineLatestChamberResponse(message.conversationId, 'elaborate')}
                        disabled={Boolean(activeRefinement)}
                      >
                        <Expand className="h-3 w-3" />
                        Elaborate
                      </Button>
                    </>
                  ) : null}
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => void addToNotebook()} title="Add to Notebook" aria-label="Add to Notebook">
                    <NotebookPen className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => void copyContent()} title={copied ? 'Copied' : 'Copy'} aria-label={copied ? 'Copied' : 'Copy message'}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground"><Reply className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground"><MessageCircle className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => void addToNotebook()} title="Add to Notebook" aria-label="Add to Notebook">
                    <NotebookPen className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => void copyContent()} title={copied ? 'Copied' : 'Copy'} aria-label={copied ? 'Copied' : 'Copy message'}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              )}
              <span className={cn('text-[10px] text-muted-foreground', isChamber && canRefine ? 'ml-auto' : '')}>{timeLabel}</span>
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-end gap-2 opacity-50 hover:opacity-100 transition-opacity">
              <span className="text-[10px] text-background/70">{timeLabel}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-background/70 hover:text-background hover:bg-background/20" onClick={() => void addToNotebook()} title="Add to Notebook" aria-label="Add to Notebook">
                <NotebookPen className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-background/70 hover:text-background hover:bg-background/20" onClick={() => void copyContent()} title={copied ? 'Copied' : 'Copy'} aria-label={copied ? 'Copied' : 'Copy message'}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
