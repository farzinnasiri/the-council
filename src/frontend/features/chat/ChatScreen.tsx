import { useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import type { Conversation } from '../../types/domain';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

export function ChatScreen({ conversation }: { conversation: Conversation }) {
  const selectConversation = useAppStore((state) => state.selectConversation);
  const sendUserMessage = useAppStore((state) => state.sendUserMessage);
  const generateReplies = useAppStore((state) => state.generateDeterministicReplies);
  const pendingCount = useAppStore((state) => state.pendingReplyCount[conversation.id] ?? 0);
  const isRouting = useAppStore((state) => state.isRouting);
  const allMessages = useAppStore((state) => state.messages);
  const messages = allMessages.filter((message) => message.conversationId === conversation.id);

  useEffect(() => {
    selectConversation(conversation.id);
  }, [conversation.id, selectConversation]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageList messages={messages} isThinking={pendingCount > 0 || isRouting} />
      <Composer
        placeholder={conversation.type === 'hall' ? 'Ask the Hall...' : 'Ask your chamber member...'}
        onSend={(text) => {
          void sendUserMessage(conversation.id, text);
          void generateReplies(conversation.id, text);
        }}
      />
    </div>
  );
}
