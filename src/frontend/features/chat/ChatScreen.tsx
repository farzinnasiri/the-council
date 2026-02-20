import { Composer } from './Composer';
import { MessageList } from './MessageList';
import type { Message } from '../../types/domain';

interface TypingMember {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface ChatScreenProps {
  messages: Message[];
  isRouting?: boolean;
  typingMembers?: TypingMember[];
  placeholder: string;
  onSend: (text: string) => void | Promise<void>;
  emptyState?: {
    title: string;
    description: string;
  };
}

export function ChatScreen({
  messages,
  isRouting = false,
  typingMembers = [],
  placeholder,
  onSend,
  emptyState,
}: ChatScreenProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageList
        messages={messages}
        isRouting={isRouting}
        typingMembers={typingMembers}
        emptyState={emptyState}
      />
      <Composer
        placeholder={placeholder}
        onSend={(text) => {
          void onSend(text);
        }}
      />
    </div>
  );
}
