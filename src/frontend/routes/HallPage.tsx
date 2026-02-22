import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { ChatScreen } from '../features/chat/ChatScreen';
import { RoundtablePanel } from '../features/chat/RoundtablePanel';

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
  const hallParticipantsByConversation = useAppStore((state) => state.hallParticipantsByConversation);
  const roundtableStateByConversation = useAppStore((state) => state.roundtableStateByConversation);
  const roundtablePreparingByConversation = useAppStore((state) => state.roundtablePreparingByConversation);
  const setRoundtableSelectedSpeakers = useAppStore((state) => state.setRoundtableSelectedSpeakers);
  const startRoundtableRound = useAppStore((state) => state.startRoundtableRound);
  const continueRoundtableRound = useAppStore((state) => state.continueRoundtableRound);
  const pagination = useAppStore((state) =>
    conversationId ? state.messagePaginationByConversation[conversationId] : undefined
  );
  const [mentionError, setMentionError] = useState<string | undefined>(undefined);

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

  const participantIds = hallParticipantsByConversation[conversation.id] ?? [];
  const selectedSpeakerSet = new Set(
    (roundtableStateByConversation[conversation.id]?.round.status === 'awaiting_user'
      ? roundtableStateByConversation[conversation.id]?.intents
          .filter((intent) => intent.selected)
          .map((intent) => intent.memberId)
      : []) ?? []
  );
  const mentionOptions = participantIds
    .map((id) => members.find((member) => member.id === id && !member.deletedAt))
    .filter((member): member is NonNullable<typeof member> => Boolean(member))
    .map((member) => ({ id: member.id, name: member.name }))
    .filter((member) => !selectedSpeakerSet.has(member.id));

  const roundtableState = roundtableStateByConversation[conversation.id] ?? null;
  const isPreRoundPreparing = roundtablePreparingByConversation[conversation.id] ?? false;
  const roundtablePanel =
    conversation.hallMode === 'roundtable' ? (
      <RoundtablePanel
        state={roundtableState}
        members={members.filter((member) => !member.deletedAt)}
        isRunning={isSending}
        isPreparing={isPreRoundPreparing}
        onSelectionChange={(roundNumber, selectedMemberIds) =>
          void setRoundtableSelectedSpeakers(conversation.id, roundNumber, selectedMemberIds)
        }
        onStartRound={() => void startRoundtableRound(conversation.id)}
        onContinueRound={() => void continueRoundtableRound(conversation.id)}
      />
    ) : null;

  return (
    <ChatScreen
      messages={messages}
      isRouting={isRouting && routingConversationId === conversation.id}
      typingMembers={typingMembers}
      isSending={isSending}
      hasOlderMessages={pagination?.hasOlder ?? false}
      loadingOlderMessages={pagination?.isLoadingOlder ?? false}
      placeholder="Ask the Hall..."
      mentionOptions={mentionOptions}
      mentionError={mentionError}
      beforeComposer={roundtablePanel}
      onLoadOlder={() => loadOlderMessages(conversation.id)}
      onSend={async ({ text, mentionedMemberIds = [] }) => {
        setMentionError(undefined);
        const activeSet = new Set(participantIds);
        const invalidMentions = mentionedMemberIds.filter((memberId) => !activeSet.has(memberId));

        if (invalidMentions.length > 0) {
          setMentionError('Mentions must target active Hall participants.');
          return;
        }

        await sendUserMessage(conversation.id, text, mentionedMemberIds);
        await generateReplies(conversation.id, text, mentionedMemberIds);
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
