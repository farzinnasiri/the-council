import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { ChatScreen } from '../features/chat/ChatScreen';

export function HallPage() {
  const { conversationId } = useParams();
  const conversation = useAppStore((state) =>
    state.conversations.find((item) => item.kind === 'hall' && item.id === conversationId)
  );
  const selectConversation = useAppStore((state) => state.selectConversation);
  const sendUserMessage = useAppStore((state) => state.sendUserMessage);
  const generateReplies = useAppStore((state) => state.generateDeterministicReplies);
  const loadOlderMessages = useAppStore((state) => state.loadOlderMessages);
  const isRouting = useAppStore((state) => state.isRouting);
  const routingConversationId = useAppStore((state) => state.routingConversationId);
  const pendingReplyMemberIds = useAppStore((state) => state.pendingReplyMemberIds);
  const pendingReplyCount = useAppStore((state) => state.pendingReplyCount);
  const members = useAppStore((state) => state.members);
  const allMessages = useAppStore((state) => state.messages);
  const pagination = useAppStore((state) =>
    conversationId ? state.messagePaginationByConversation[conversationId] : undefined
  );

  useEffect(() => {
    if (conversation) {
      selectConversation(conversation.id);
    }
  }, [conversation, selectConversation]);

  if (!conversation) {
    return <Placeholder title="Hall conversation not found" description="Choose an existing hall from the sidebar." />;
  }

  const messages = allMessages.filter((message) => message.conversationId === conversation.id);
  const typingMembers = (pendingReplyMemberIds[conversation.id] ?? [])
    .map((memberId) => members.find((member) => member.id === memberId))
    .filter((member): member is NonNullable<typeof member> => Boolean(member))
    .map((member) => ({
      id: member.id,
      name: member.name,
      avatarUrl: member.avatarUrl,
    }));

  const isSending =
    (isRouting && routingConversationId === conversation.id) ||
    (pendingReplyCount[conversation.id] ?? 0) > 0;

  return (
    <ChatScreen
      messages={messages}
      isRouting={isRouting && routingConversationId === conversation.id}
      typingMembers={typingMembers}
      isSending={isSending}
      hasOlderMessages={pagination?.hasOlder ?? false}
      loadingOlderMessages={pagination?.isLoadingOlder ?? false}
      placeholder="Ask the Hall..."
      onLoadOlder={() => loadOlderMessages(conversation.id)}
      onSend={async (text) => {
        await sendUserMessage(conversation.id, text);
        await generateReplies(conversation.id, text);
      }}
    />
  );
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid h-full place-items-center px-4 text-center">
      <div>
        <h2 className="font-display text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
