import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ChatScreen } from '../features/chat/ChatScreen';
import { useAppStore } from '../store/appStore';

export function ChamberPage() {
  const { conversationId } = useParams();
  const conversation = useAppStore((state) =>
    state.conversations.find((item) => item.kind === 'chamber' && item.id === conversationId)
  );
  const members = useAppStore((state) => state.members);
  const allMessages = useAppStore((state) => state.messages);
  const selectConversation = useAppStore((state) => state.selectConversation);
  const sendUserMessage = useAppStore((state) => state.sendUserMessage);
  const generateReplies = useAppStore((state) => state.generateDeterministicReplies);
  const loadOlderMessages = useAppStore((state) => state.loadOlderMessages);
  const pendingReplyMemberIds = useAppStore((state) => state.pendingReplyMemberIds);
  const pendingReplyCount = useAppStore((state) => state.pendingReplyCount);
  const pagination = useAppStore((state) =>
    conversationId ? state.messagePaginationByConversation[conversationId] : undefined
  );

  useEffect(() => {
    if (conversation) {
      selectConversation(conversation.id);
    }
  }, [conversation, selectConversation]);

  const member = useMemo(() => {
    if (!conversation?.chamberMemberId) return undefined;
    return members.find((item) => item.id === conversation.chamberMemberId && !item.deletedAt);
  }, [conversation, members]);

  if (!conversation) {
    return <Placeholder title="Thread not found" description="Choose a chamber thread from the sidebar." />;
  }

  const messages = allMessages.filter((message) => message.conversationId === conversation.id);
  const typingMembers = member
    ? (pendingReplyMemberIds[conversation.id] ?? [])
        .filter((pendingMemberId) => pendingMemberId === member.id)
        .map(() => ({ id: member.id, name: member.name, avatarUrl: member.avatarUrl }))
    : [];

  const isSending = (pendingReplyCount[conversation.id] ?? 0) > 0;

  return (
    <ChatScreen
      messages={messages}
      conversationKind="chamber"
      isRouting={false}
      typingMembers={typingMembers}
      isSending={isSending}
      hasOlderMessages={pagination?.hasOlder ?? false}
      loadingOlderMessages={pagination?.isLoadingOlder ?? false}
      placeholder={member ? `Ask ${member.name}...` : 'Ask your chamber member...'}
      onLoadOlder={() => loadOlderMessages(conversation.id)}
      emptyState={{
        title: 'No messages yet',
        description: member ? `Start a thread with ${member.name}.` : 'Start this chamber thread.',
      }}
      onSend={async ({ text }) => {
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
