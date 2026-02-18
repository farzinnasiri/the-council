import { useParams } from 'react-router-dom';
import { ChatScreen } from '../features/chat/ChatScreen';
import { useAppStore } from '../store/appStore';

export function ChamberPage() {
  const { conversationId } = useParams();
  const conversation = useAppStore((state) =>
    state.conversations.find((item) => item.type === 'chamber' && item.id === conversationId)
  );

  if (!conversation) {
    return <Placeholder title="Chamber not found" />;
  }

  return <ChatScreen conversation={conversation} />;
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="grid h-full place-items-center px-4 text-center">
      <div>
        <h2 className="font-display text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">Choose a chamber thread in the sidebar.</p>
      </div>
    </div>
  );
}
