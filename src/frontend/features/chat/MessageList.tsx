import { useEffect, useRef } from 'react';
import { UserCircle2 } from 'lucide-react';
import type { Message } from '../../types/domain';
import { MessageBubble } from './MessageBubble';

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
  isRouting,
  typingMembers,
  emptyState,
}: {
  messages: Message[];
  isRouting: boolean;
  typingMembers: TypingMember[];
  emptyState?: EmptyState;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRouting, typingMembers]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {messages.length === 0 && emptyState ? (
          <div className="grid min-h-[38vh] place-items-center px-4 text-center">
            <div>
              <h2 className="font-display text-2xl">{emptyState.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{emptyState.description}</p>
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isRouting ? (
          <div className="mx-auto flex max-w-[88%] items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground animate-fade-in-up">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>Routing members...</span>
          </div>
        ) : null}

        {!isRouting && typingMembers.length > 0
          ? typingMembers.map((member) => (
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
                  <div className="flex items-center gap-1 rounded-3xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-sm">
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
