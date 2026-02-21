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
  isSending?: boolean;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  placeholder: string;
  onSend: (text: string) => void | Promise<void>;
  onLoadOlder?: () => void | Promise<void>;
  emptyState?: {
    title: string;
    description: string;
  };
}

export function ChatScreen({
  messages,
  isRouting = false,
  typingMembers = [],
  isSending = false,
  hasOlderMessages = false,
  loadingOlderMessages = false,
  placeholder,
  onSend,
  onLoadOlder,
  emptyState,
}: ChatScreenProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageList
        messages={messages}
        isRouting={isRouting}
        typingMembers={typingMembers}
        hasOlderMessages={hasOlderMessages}
        loadingOlderMessages={loadingOlderMessages}
        onLoadOlder={onLoadOlder}
        emptyState={emptyState}
      />
      <Composer
        placeholder={placeholder}
        sendDisabled={isSending}
        onSend={(text) => {
          void onSend(text);
        }}
      />
    </div>
  );
}
