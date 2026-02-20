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
  const pendingReplyMemberIds = useAppStore((state) => state.pendingReplyMemberIds);
  const allMessages = useAppStore((state) => state.messages);

  const chamber = memberId ? chamberByMemberId[memberId] : undefined;

  const messages = useMemo(() => {
    if (!chamber) return [];
    return allMessages.filter((message) => message.conversationId === chamber.id);
  }, [allMessages, chamber]);

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
        .filter((entry): entry is { id: string; name: string; avatarUrl?: string | null } => Boolean(entry))
    : [];

  return (
    <ChatScreen
      messages={messages}
      isRouting={false}
      typingMembers={typingMembers}
      placeholder="Ask your chamber member..."
      emptyState={
        chamber
          ? undefined
          : {
            title: 'No messages yet',
            description: `Start a conversation with ${member.name}.`,
          }
      }
      onSend={async (text) => {
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
