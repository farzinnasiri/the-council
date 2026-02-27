import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { ChatScreen } from '../features/chat/ChatScreen';
import { useAppStore } from '../store/appStore';
import { TurnRoutingPanel } from '../features/chat/TurnRoutingPanel';

export function HallDraftPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sendHallDraftMessage = useAppStore((state) => state.sendHallDraftMessage);
  const members = useAppStore((state) => state.members);
  const hallMode = searchParams.get('mode') === 'roundtable' ? 'roundtable' : 'advisory';
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [turnRoutingMode, setTurnRoutingMode] = useState<'auto' | 'manual'>('auto');
  const [manualMemberIds, setManualMemberIds] = useState<string[]>([]);
  const memberOptions = members
    .filter((member) => !member.deletedAt)
    .map((member) => ({ id: member.id, name: member.name }));
  const manualSelectionInvalid = turnRoutingMode === 'manual' && manualMemberIds.length === 0;

  return (
    <ChatScreen
      messages={[]}
      conversationKind="hall"
      hallMode={hallMode}
      isRouting={false}
      typingMembers={[]}
      placeholder="Ask the Hall..."
      mentionError={
        submitError ?? (manualSelectionInvalid ? 'Pick at least one member to send in Manual mode.' : undefined)
      }
      sendDisabled={manualSelectionInvalid}
      beforeComposer={
        <TurnRoutingPanel
          mode={turnRoutingMode}
          onModeChange={(mode) => {
            setTurnRoutingMode(mode);
            setSubmitError(undefined);
          }}
          memberOptions={memberOptions}
          selectedMemberIds={manualMemberIds}
          onToggleMember={(memberId) => {
            setManualMemberIds((current) =>
              current.includes(memberId)
                ? current.filter((id) => id !== memberId)
                : [...current, memberId]
            );
          }}
          onClearSelection={() => setManualMemberIds([])}
          title="Who should answer first?"
        />
      }
      emptyState={{
        title: 'Start a new hall',
        description:
          hallMode === 'roundtable'
            ? 'Roundtable mode selected. Send your first message to create this hall.'
            : 'Advisory mode selected. Send your first message to create this hall.',
      }}
      onSend={async ({ text }) => {
        setSubmitError(undefined);
        if (manualSelectionInvalid) {
          setSubmitError('Pick at least one member to send in Manual mode.');
          return;
        }
        try {
          const created = await sendHallDraftMessage(text, hallMode, turnRoutingMode, manualMemberIds);
          navigate(`/hall/${created.id}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not create hall right now.';
          setSubmitError(message);
        }
      }}
    />
  );
}
