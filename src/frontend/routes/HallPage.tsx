import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAppStore } from "../store/appStore";
import { ChatScreen } from "../features/chat/ChatScreen";
import { RoundtablePanel } from "../features/chat/RoundtablePanel";

export function HallPage() {
  const { conversationId } = useParams();
  const conversation = useAppStore((state) =>
    state.conversations.find(
      (item) => item.kind === "hall" && item.id === conversationId,
    ),
  );
  const selectConversation = useAppStore((state) => state.selectConversation);
  const sendUserMessage = useAppStore((state) => state.sendUserMessage);
  const deleteLatestUserTurn = useAppStore(
    (state) => state.deleteLatestUserTurn,
  );
  const editLatestUserTurn = useAppStore((state) => state.editLatestUserTurn);
  const generateReplies = useAppStore(
    (state) => state.generateDeterministicReplies,
  );
  const loadOlderMessages = useAppStore((state) => state.loadOlderMessages);
  const isRouting = useAppStore((state) => state.isRouting);
  const routingConversationId = useAppStore(
    (state) => state.routingConversationId,
  );
  const closingConversationId = useAppStore(
    (state) => state.closingConversationId,
  );
  const pendingReplyMemberIds = useAppStore(
    (state) => state.pendingReplyMemberIds,
  );
  const pendingReplyCount = useAppStore((state) => state.pendingReplyCount);
  const members = useAppStore((state) => state.members);
  const allMessages = useAppStore((state) => state.messages);
  const hallParticipantsByConversation = useAppStore(
    (state) => state.hallParticipantsByConversation,
  );
  const roundtableStateByConversation = useAppStore(
    (state) => state.roundtableStateByConversation,
  );
  const roundtablePreparingByConversation = useAppStore(
    (state) => state.roundtablePreparingByConversation,
  );
  const continueRoundtableRound = useAppStore(
    (state) => state.continueRoundtableRound,
  );
  const speakNextRoundtableMember = useAppStore(
    (state) => state.speakNextRoundtableMember,
  );
  const finishRoundtableRound = useAppStore(
    (state) => state.finishRoundtableRound,
  );
  const pagination = useAppStore((state) =>
    conversationId
      ? state.messagePaginationByConversation[conversationId]
      : undefined,
  );
  const [mentionError, setMentionError] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (conversation) {
      selectConversation(conversation.id);
    }
  }, [conversation, selectConversation]);

  if (!conversation) {
    return (
      <Placeholder
        title="Hall conversation not found"
        description="Choose an existing hall from the sidebar."
      />
    );
  }

  const messages = allMessages.filter(
    (message) =>
      message.conversationId === conversation.id &&
      !message.deletedAt &&
      !message.supersededAt,
  );
  const typingMembers = Array.from(new Set(pendingReplyMemberIds[conversation.id] ?? []))
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
  const isClosing = closingConversationId === conversation.id;
  const isClosed = Boolean(conversation.closedAt);

  const participantIds = hallParticipantsByConversation[conversation.id] ?? [];
  const selectedSpeakerSet = new Set(
    (roundtableStateByConversation[conversation.id]?.round.status ===
    "awaiting_user"
      ? roundtableStateByConversation[conversation.id]?.candidates
          .filter(
            (candidate) =>
              candidate.status === "shortlisted" ||
              candidate.status === "speaking",
          )
          .map((candidate) => candidate.memberId)
      : []) ?? [],
  );
  const mentionOptions = participantIds
    .map((id) =>
      members.find((member) => member.id === id && !member.deletedAt),
    )
    .filter((member): member is NonNullable<typeof member> => Boolean(member))
    .map((member) => ({ id: member.id, name: member.name }))
    .filter((member) => !selectedSpeakerSet.has(member.id));
  const composerMentionOptions =
    conversation.hallMode === "roundtable" ? [] : mentionOptions;

  const roundtableState =
    roundtableStateByConversation[conversation.id] ?? null;
  const isPreRoundPreparing =
    roundtablePreparingByConversation[conversation.id] ?? false;
  const pendingRoundNumber =
    conversation.hallMode === "roundtable" &&
    roundtableState &&
    (roundtableState.round.status === "awaiting_user" ||
      roundtableState.round.status === "in_progress")
      ? roundtableState.round.roundNumber
      : undefined;
  const roundtablePanel =
    conversation.hallMode === "roundtable" && !isClosed ? (
      <RoundtablePanel
        state={roundtableState}
        members={members.filter((member) => !member.deletedAt)}
        isRunning={isSending}
        isPreparing={isPreRoundPreparing}
        onSpeakNext={(memberId) =>
          void speakNextRoundtableMember(conversation.id, memberId)
        }
        onFinishRound={() => void finishRoundtableRound(conversation.id)}
        onContinueRound={() => void continueRoundtableRound(conversation.id)}
      />
    ) : conversation.hallMode === "roundtable" && isClosed ? (
      <div className="mx-auto w-full max-w-3xl px-4 md:px-6">
        <div className="rounded-2xl border border-border/80 bg-card px-4 py-3 text-sm text-muted-foreground">
          This table is closed. The final council synthesis is now the last hall
          message.
        </div>
      </div>
    ) : null;

  const validateMentions = (mentionedMemberIds: string[]) => {
    if (conversation.hallMode === "roundtable") {
      return [] as string[];
    }

    const activeSet = new Set(participantIds);
    const invalidMentions = mentionedMemberIds.filter(
      (memberId) => !activeSet.has(memberId),
    );
    if (invalidMentions.length > 0) {
      throw new Error("Mentions must target active Hall participants.");
    }
    return mentionedMemberIds;
  };

  return (
    <ChatScreen
      messages={messages}
      conversationKind="hall"
      hallMode={conversation.hallMode ?? "advisory"}
      pendingRoundNumber={pendingRoundNumber}
      isRouting={isRouting && routingConversationId === conversation.id}
      typingMembers={typingMembers}
      isSending={isSending}
      sendDisabled={isClosed || isClosing}
      hasOlderMessages={pagination?.hasOlder ?? false}
      loadingOlderMessages={pagination?.isLoadingOlder ?? false}
      placeholder={
        isClosing
          ? "Closing table..."
          : isClosed
            ? "This table is closed."
            : "Ask the Hall..."
      }
      mentionOptions={composerMentionOptions}
      mentionError={mentionError}
      beforeComposer={roundtablePanel}
      onLoadOlder={() => loadOlderMessages(conversation.id)}
      onDeleteLatestTurn={(message) =>
        deleteLatestUserTurn(conversation.id, message.id)
      }
      onEditLatestTurn={async (message, { text, mentionedMemberIds = [] }) => {
        setMentionError(undefined);
        let normalizedMentions: string[];
        try {
          normalizedMentions = validateMentions(mentionedMemberIds);
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Mentions must target active Hall participants.";
          setMentionError(errorMessage);
          throw new Error(errorMessage);
        }
        await editLatestUserTurn(
          conversation.id,
          message.id,
          text,
          normalizedMentions,
        );
      }}
      onSend={async ({ text, mentionedMemberIds = [] }) => {
        setMentionError(undefined);
        let normalizedMentions: string[];
        try {
          normalizedMentions = validateMentions(mentionedMemberIds);
        } catch (error) {
          setMentionError(
            error instanceof Error
              ? error.message
              : "Mentions must target active Hall participants.",
          );
          return;
        }
        if (isClosed || isClosing) {
          return;
        }
        const sendResult = await sendUserMessage(
          conversation.id,
          text,
          normalizedMentions,
        );
        void generateReplies(
          conversation.id,
          text,
          normalizedMentions,
          sendResult?.previousActiveMessageAt,
        );
      }}
    />
  );
}

function Placeholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid h-full place-items-center px-4 text-center">
      <div>
        <h2 className="font-display text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
