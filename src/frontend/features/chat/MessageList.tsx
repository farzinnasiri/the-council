import { useEffect, useRef } from 'react';
import type { Message } from '../../types/domain';
import { MessageBubble } from './MessageBubble';

export function MessageList({ messages, isThinking }: { messages: Message[]; isThinking: boolean }) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isThinking ? (
          <div className="ml-2 flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-muted">🏛</span>
            Thinking...
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
