import { useEffect, useMemo, useRef, useState } from 'react';
import { UserCircle2 } from 'lucide-react';
import type { Message } from '../../types/domain';
import { MessageBubble } from './MessageBubble';
import {
  TYPING_INDICATOR_INITIAL_DELAY_MS,
  TYPING_INDICATOR_STAGGER_MS,
} from '../../constants/presence';

interface EmptyState {
  title: string;
  description: string;
}

interface TypingMember {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export function MessageList({
  messages,
  conversationKind,
  pendingRoundNumber,
  isRouting,
  typingMembers,
  hasOlderMessages,
  loadingOlderMessages,
  onLoadOlder,
  emptyState,
}: {
  messages: Message[];
  conversationKind?: 'hall' | 'chamber';
  pendingRoundNumber?: number;
  isRouting: boolean;
  typingMembers: TypingMember[];
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  onLoadOlder?: () => void | Promise<void>;
  emptyState?: EmptyState;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const prevFirstMessageIdRef = useRef<string | undefined>(undefined);
  const prevLastMessageIdRef = useRef<string | undefined>(undefined);
  const pendingRestoreHeightRef = useRef<number | null>(null);
  const typingRevealTimersRef = useRef<number[]>([]);
  const [visibleTypingMemberIds, setVisibleTypingMemberIds] = useState<string[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const firstId = messages[0]?.id;
    const lastId = messages[messages.length - 1]?.id;
    const prevFirst = prevFirstMessageIdRef.current;
    const prevLast = prevLastMessageIdRef.current;

    if (pendingRestoreHeightRef.current !== null) {
      const previousHeight = pendingRestoreHeightRef.current;
      pendingRestoreHeightRef.current = null;
      const delta = container.scrollHeight - previousHeight;
      container.scrollTop = Math.max(0, container.scrollTop + delta);
    } else if (prevLast && lastId && prevLast !== lastId) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (!prevFirst && !prevLast) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }

    prevFirstMessageIdRef.current = firstId;
    prevLastMessageIdRef.current = lastId;
  }, [messages]);

  useEffect(() => {
    typingRevealTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    typingRevealTimersRef.current = [];

    const typingIds = typingMembers.map((member) => member.id);
    if (typingIds.length === 0) {
      setVisibleTypingMemberIds([]);
      return;
    }

    setVisibleTypingMemberIds((current) => current.filter((memberId) => typingIds.includes(memberId)));

    typingIds.forEach((memberId, index) => {
      const timerId = window.setTimeout(() => {
        setVisibleTypingMemberIds((current) => {
          if (current.includes(memberId)) return current;
          return [...current, memberId];
        });
      }, TYPING_INDICATOR_INITIAL_DELAY_MS + index * TYPING_INDICATOR_STAGGER_MS);
      typingRevealTimersRef.current.push(timerId);
    });

    return () => {
      typingRevealTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      typingRevealTimersRef.current = [];
    };
  }, [typingMembers]);

  const visibleTypingMembers = useMemo(() => {
    const visible = new Set(visibleTypingMemberIds);
    return typingMembers.filter((member) => visible.has(member.id));
  }, [typingMembers, visibleTypingMemberIds]);

  useEffect(() => {
    if (isRouting || visibleTypingMembers.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isRouting, visibleTypingMembers]);

  const tryLoadOlder = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!hasOlderMessages || loadingOlderMessages || !onLoadOlder) return;
    if (container.scrollTop > 96) return;

    pendingRestoreHeightRef.current = container.scrollHeight;
    void onLoadOlder();
  };

  const renderedItems = useMemo(() => {
    if (conversationKind !== 'hall') {
      return messages.map((message) => ({ kind: 'message' as const, message }));
    }

    const items: Array<
      | { kind: 'message'; message: Message }
      | { kind: 'round'; roundNumber: number }
    > = [];
    let lastSeenRound = 0;
    let renderedRound: number | null = null;

    for (const message of messages) {
      let roundNumber: number | null = null;
      if (typeof message.roundNumber === 'number') {
        roundNumber = message.roundNumber;
        lastSeenRound = Math.max(lastSeenRound, message.roundNumber);
      } else if (message.role === 'user') {
        roundNumber = lastSeenRound + 1;
        lastSeenRound = roundNumber;
      } else if (message.role === 'member') {
        roundNumber = lastSeenRound > 0 ? lastSeenRound : (pendingRoundNumber && pendingRoundNumber > 0 ? pendingRoundNumber : 1);
      }

      if (roundNumber && roundNumber !== renderedRound) {
        items.push({ kind: 'round', roundNumber });
        renderedRound = roundNumber;
      }

      items.push({ kind: 'message', message });
    }

    if (
      typeof pendingRoundNumber === 'number' &&
      pendingRoundNumber > 0 &&
      pendingRoundNumber !== renderedRound
    ) {
      items.push({ kind: 'round', roundNumber: pendingRoundNumber });
    }

    return items;
  }, [conversationKind, messages, pendingRoundNumber]);

  return (
    <div
      ref={containerRef}
      onScroll={tryLoadOlder}
      className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {loadingOlderMessages ? (
          <div className="mx-auto rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            Loading older messages...
          </div>
        ) : null}

        {messages.length === 0 && emptyState ? (
          <div className="grid min-h-[38vh] place-items-center px-4 text-center">
            <div>
              <h2 className="font-display text-2xl">{emptyState.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{emptyState.description}</p>
            </div>
          </div>
        ) : null}

        {renderedItems.map((item, index) => {
          if (item.kind === 'round') {
            return <RoundSeparator key={`round-${item.roundNumber}-${index}`} roundNumber={item.roundNumber} />;
          }
          return <MessageBubble key={item.message.id} message={item.message} />;
        })}

        {isRouting ? (
          <div className="mx-auto flex max-w-[88%] items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground animate-fade-in-up">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>Routing members...</span>
          </div>
        ) : null}

        {!isRouting && visibleTypingMembers.length > 0
          ? visibleTypingMembers.map((member) => (
              <div key={member.id} className="flex items-start gap-3 animate-fade-in-up">
                {member.avatarUrl ? (
                  <img
                    src={member.avatarUrl}
                    alt={member.name}
                    className="mt-1 h-8 w-8 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <UserCircle2
                    className="mt-1 h-8 w-8 shrink-0 text-muted-foreground/60"
                    aria-label={member.name}
                  />
                )}
                <div className="max-w-[85%]">
                  <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">
                    {member.name}
                  </p>
                  <div className="inline-flex w-fit items-center gap-1 rounded-3xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-sm">
                    <TypingDot delayMs={0} />
                    <TypingDot delayMs={120} />
                    <TypingDot delayMs={240} />
                  </div>
                </div>
              </div>
            ))
          : null}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function RoundSeparator({ roundNumber }: { roundNumber: number }) {
  return (
    <div className="mx-auto flex max-w-[88%] items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground animate-fade-in-up">
      <span className="h-2 w-2 rounded-full bg-primary" />
      <span>Round {roundNumber}</span>
    </div>
  );
}

function TypingDot({ delayMs }: { delayMs: number }) {
  return (
    <span
      className="h-2 w-2 rounded-full bg-muted-foreground/65"
      style={{
        animation: 'typing-bounce 1.1s infinite ease-in-out',
        animationDelay: `${delayMs}ms`,
      }}
    />
  );
}
