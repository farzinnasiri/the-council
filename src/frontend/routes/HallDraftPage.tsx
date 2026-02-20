import { useNavigate } from 'react-router-dom';
import { ChatScreen } from '../features/chat/ChatScreen';
import { useAppStore } from '../store/appStore';

export function HallDraftPage() {
  const navigate = useNavigate();
  const sendHallDraftMessage = useAppStore((state) => state.sendHallDraftMessage);

  return (
    <ChatScreen
      messages={[]}
      isRouting={false}
      typingMembers={[]}
      placeholder="Ask the Hall..."
      emptyState={{
        title: 'Start a new hall',
        description: 'Send your first message to create this hall session.',
      }}
      onSend={async (text) => {
        const created = await sendHallDraftMessage(text);
        navigate(`/hall/${created.id}`);
      }}
    />
  );
}
