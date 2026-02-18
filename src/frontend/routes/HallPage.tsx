import { useParams } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { ChatScreen } from '../features/chat/ChatScreen';

export function HallPage() {
  const { conversationId } = useParams();
  const conversation = useAppStore((state) =>
    state.conversations.find((item) => item.type === 'hall' && item.id === conversationId)
  );

  if (!conversation) {
    return <EmptyState label="Hall conversation not found" />;
  }

  return <ChatScreen conversation={conversation} />;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center px-4 text-center">
      <div>
        <h2 className="font-display text-2xl">{label}</h2>
        <p className="mt-2 text-sm text-muted-foreground">Choose a session from the sidebar or create a new one.</p>
      </div>
    </div>
  );
}
