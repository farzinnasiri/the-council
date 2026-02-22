import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChatScreen } from '../features/chat/ChatScreen';
import { useAppStore } from '../store/appStore';

export function ChamberMemberPage() {
  const { memberId } = useParams();
  const navigate = useNavigate();

  const member = useAppStore((state) =>
    memberId ? state.members.find((item) => item.id === memberId && !item.deletedAt) : undefined
  );
  const chamberByMemberId = useAppStore((state) => state.chamberByMemberId);
  const selectConversation = useAppStore((state) => state.selectConversation);
  const sendMessageToChamberMember = useAppStore((state) => state.sendMessageToChamberMember);
  const loadOlderMessages = useAppStore((state) => state.loadOlderMessages);
  const pendingReplyMemberIds = useAppStore((state) => state.pendingReplyMemberIds);
  const pendingReplyCount = useAppStore((state) => state.pendingReplyCount);
  const allMessages = useAppStore((state) => state.messages);
  const chamber = memberId ? chamberByMemberId[memberId] : undefined;
  const pagination = useAppStore((state) =>
    chamber ? state.messagePaginationByConversation[chamber.id] : undefined
  );

  const messages = useMemo(() => {
    if (!chamber) return [];
    return allMessages.filter((message) => message.conversationId === chamber.id);
  }, [allMessages, chamber]);
  const hasMessages = Boolean(chamber?.lastMessageAt) || messages.length > 0;

  useEffect(() => {
    if (chamber) {
      selectConversation(chamber.id);
    }
  }, [chamber, selectConversation]);

  if (!member || !memberId) {
    return <Placeholder title="Member not found" description="Choose an active member from the chambers list." />;
  }

  const typingMembers = chamber
    ? (pendingReplyMemberIds[chamber.id] ?? [])
        .map((pendingMemberId) =>
          pendingMemberId === member.id
            ? { id: member.id, name: member.name, avatarUrl: member.avatarUrl }
            : null
        )
        .filter((entry): entry is { id: string; name: string; avatarUrl: string | null | undefined } =>
          entry !== null
        )
    : [];

  const isSending = chamber ? (pendingReplyCount[chamber.id] ?? 0) > 0 : false;

  return (
    <ChatScreen
      messages={messages}
      isRouting={false}
      typingMembers={typingMembers}
      isSending={isSending}
      hasOlderMessages={pagination?.hasOlder ?? false}
      loadingOlderMessages={pagination?.isLoadingOlder ?? false}
      placeholder="Ask your chamber member..."
      onLoadOlder={() => (chamber ? loadOlderMessages(chamber.id) : undefined)}
      emptyState={
        hasMessages
          ? undefined
          : {
            title: 'No messages yet',
            description: `Start a conversation with ${member.name}.`,
          }
      }
      onSend={async ({ text }) => {
        await sendMessageToChamberMember(member.id, text);
        if (!chamber) {
          navigate(`/chamber/member/${member.id}`, { replace: true });
        }
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
