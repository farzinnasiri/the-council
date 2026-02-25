import { Composer } from './Composer';
import { MessageList } from './MessageList';
import type { Message } from '../../types/domain';
import type { ReactNode } from 'react';

export interface ComposerSendInput {
  text: string;
  mentionedMemberIds?: string[];
}

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
  sendDisabled?: boolean;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  placeholder: string;
  mentionOptions?: Array<{ id: string; name: string }>;
  mentionError?: string;
  onSend: (payload: ComposerSendInput) => void | Promise<void>;
  onLoadOlder?: () => void | Promise<void>;
  beforeComposer?: ReactNode;
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
  sendDisabled = false,
  hasOlderMessages = false,
  loadingOlderMessages = false,
  placeholder,
  mentionOptions = [],
  mentionError,
  onSend,
  onLoadOlder,
  beforeComposer,
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
      {beforeComposer ? <div className="pb-3 md:pb-4">{beforeComposer}</div> : null}
      <Composer
        placeholder={placeholder}
        sendDisabled={isSending || sendDisabled}
        mentionOptions={mentionOptions}
        mentionError={mentionError}
        onSend={(payload) => {
          void onSend(payload);
        }}
      />
    </div>
  );
}
