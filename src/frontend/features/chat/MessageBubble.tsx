import { AlignJustify, Brain, Check, Copy, Expand, MessageCircle, NotebookPen, Reply, Search, SlidersHorizontal, UserCircle2 } from 'lucide-react';
import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
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
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [startingFollowUp, setStartingFollowUp] = useState(false);
  const navigate = useNavigate();
  const members = useAppStore((state) => state.members);
  const conversations = useAppStore((state) => state.conversations);
  const messages = useAppStore((state) => state.messages);
  const appendMessageToNotebook = useAppStore((state) => state.appendMessageToNotebook);
  const refiningActionByMessageId = useAppStore((state) => state.refiningActionByMessageId);
  const refineLatestChamberResponse = useAppStore((state) => state.refineLatestChamberResponse);
  const startHallFollowUpThread = useAppStore((state) => state.startHallFollowUpThread);
  const showToast = useAppStore((state) => state.showToast);

  if (message.role === 'system') {
    const systemKind = message.systemKind ?? (message.routing ? 'routing' : undefined);
    if (systemKind === 'routing') {
      const isManual = message.content.toLowerCase().startsWith('manually routed');
      return <RoutePill memberIds={message.routing?.memberIds ?? []} label={isManual ? 'Manually routed to' : 'Routed to'} />;
    }

    return (
      <div className="mx-auto flex max-w-[88%] animate-fade-in-up">
        <div className="w-full rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Hall Context
          </p>
          <div className="mt-2 text-sm leading-relaxed text-foreground">
            <MarkdownMessage content={message.content} />
          </div>
        </div>
      </div>
    );
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
  const canStartHallFollowUp = Boolean(
    conversation?.kind === 'hall' &&
    member &&
    !isUser &&
    message.status === 'sent' &&
    !message.deletedAt &&
    !message.supersededAt &&
    !message.compacted
  );

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

  const launchHallFollowUp = async () => {
    if (!canStartHallFollowUp || startingFollowUp) return;
    setStartingFollowUp(true);
    try {
      const thread = await startHallFollowUpThread(message.conversationId, message.id);
      setFollowUpDialogOpen(false);
      navigate(`/chamber/${thread.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not start a private follow-up thread.');
    } finally {
      setStartingFollowUp(false);
    }
  };

  return (
    <>
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
            {message.status === 'error' && message.error ? (
              <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive/90">
                {message.error}
              </div>
            ) : null}

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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground"
                      onClick={() => setFollowUpDialogOpen(true)}
                      title="Start private follow-up"
                      aria-label="Start private follow-up"
                      disabled={!canStartHallFollowUp || startingFollowUp}
                    >
                      <MessageCircle className="h-3 w-3" />
                    </Button>
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

      <DialogPrimitive.Root open={followUpDialogOpen} onOpenChange={setFollowUpDialogOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl focus:outline-none">
            <DialogPrimitive.Title className="font-display text-lg">
              Start private follow-up?
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              Create a new private thread with {label}. The thread will include a compact hall context and this selected reply so the conversation can continue privately.
            </DialogPrimitive.Description>
            <div className="mt-5 flex justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="outline" className="h-9 px-4" disabled={startingFollowUp}>
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button type="button" className="h-9 px-4" onClick={() => void launchHallFollowUp()} disabled={startingFollowUp}>
                {startingFollowUp ? 'Starting...' : 'Open thread'}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
