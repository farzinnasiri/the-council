import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { ChatScreen } from "../features/chat/ChatScreen";
import { useAppStore } from "../store/appStore";
import { Button } from "../components/ui/button";

export function ChamberPage() {
  const { conversationId } = useParams();
  const conversation = useAppStore((state) =>
    state.conversations.find(
      (item) => item.kind === "chamber" && item.id === conversationId,
    ),
  );
  const members = useAppStore((state) => state.members);
  const allMessages = useAppStore((state) => state.messages);
  const selectConversation = useAppStore((state) => state.selectConversation);
  const sendUserMessage = useAppStore((state) => state.sendUserMessage);
  const deleteLatestUserTurn = useAppStore(
    (state) => state.deleteLatestUserTurn,
  );
  const editLatestUserTurn = useAppStore((state) => state.editLatestUserTurn);
  const generateReplies = useAppStore(
    (state) => state.generateDeterministicReplies,
  );
  const setChamberResponseMode = useAppStore(
    (state) => state.setChamberResponseMode,
  );
  const setChamberTimeAwareReentryEnabled = useAppStore(
    (state) => state.setChamberTimeAwareReentryEnabled,
  );
  const markChamberTimeAwareReentryNoticeSeen = useAppStore(
    (state) => state.markChamberTimeAwareReentryNoticeSeen,
  );
  const dismissChamberTimeAwareReentryNotice = useAppStore(
    (state) => state.dismissChamberTimeAwareReentryNotice,
  );
  const loadOlderMessages = useAppStore((state) => state.loadOlderMessages);
  const pendingReplyMemberIds = useAppStore(
    (state) => state.pendingReplyMemberIds,
  );
  const pendingReplyCount = useAppStore((state) => state.pendingReplyCount);
  const reentryNoticePendingByConversation = useAppStore(
    (state) => state.timeAwareReentryNoticePendingByConversation,
  );
  const pagination = useAppStore((state) =>
    conversationId
      ? state.messagePaginationByConversation[conversationId]
      : undefined,
  );

  useEffect(() => {
    if (conversation) {
      selectConversation(conversation.id);
    }
  }, [conversation, selectConversation]);

  const member = useMemo(() => {
    if (!conversation?.chamberMemberId) return undefined;
    return members.find(
      (item) => item.id === conversation.chamberMemberId && !item.deletedAt,
    );
  }, [conversation, members]);

  if (!conversation) {
    return (
      <Placeholder
        title="Thread not found"
        description="Choose a chamber thread from the sidebar."
      />
    );
  }

  const messages = allMessages.filter(
    (message) =>
      message.conversationId === conversation.id &&
      !message.deletedAt &&
      !message.supersededAt,
  );
  const typingMembers = member
    ? (pendingReplyMemberIds[conversation.id] ?? [])
        .filter((pendingMemberId) => pendingMemberId === member.id)
        .map(() => ({
          id: member.id,
          name: member.name,
          avatarUrl: member.avatarUrl,
        }))
    : [];

  const isSending = (pendingReplyCount[conversation.id] ?? 0) > 0;
  const showReentryNotice = Boolean(
    reentryNoticePendingByConversation[conversation.id] ||
    (conversation.timeAwareReentryState &&
      !conversation.timeAwareReentryNoticeSeenAt),
  );

  const reentryNotice = showReentryNotice ? (
    <div className="mx-auto flex w-full max-w-4xl items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-sm text-foreground">
        Time-Aware Re-entry adjusted this reply after a long pause.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => {
            void setChamberTimeAwareReentryEnabled(conversation.id, false)
              .then(() =>
                markChamberTimeAwareReentryNoticeSeen(conversation.id),
              )
              .finally(() =>
                dismissChamberTimeAwareReentryNotice(conversation.id),
              );
          }}
        >
          Turn off for this thread
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => {
            void markChamberTimeAwareReentryNoticeSeen(conversation.id).finally(
              () => dismissChamberTimeAwareReentryNotice(conversation.id),
            );
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <ChatScreen
      messages={messages}
      conversationKind="chamber"
      isRouting={false}
      typingMembers={typingMembers}
      isSending={isSending}
      hasOlderMessages={pagination?.hasOlder ?? false}
      loadingOlderMessages={pagination?.isLoadingOlder ?? false}
      chamberResponseMode={conversation.chamberResponseMode ?? "instant"}
      timeAwareReentryEnabled={conversation.timeAwareReentryEnabled ?? true}
      placeholder={
        member ? `Ask ${member.name}...` : "Ask your chamber member..."
      }
      onLoadOlder={() => loadOlderMessages(conversation.id)}
      onDeleteLatestTurn={(message) =>
        deleteLatestUserTurn(conversation.id, message.id)
      }
      onEditLatestTurn={(message, { text }) =>
        editLatestUserTurn(conversation.id, message.id, text)
      }
      beforeComposer={reentryNotice}
      onChamberResponseModeChange={(mode) =>
        setChamberResponseMode(conversation.id, mode)
      }
      onTimeAwareReentryEnabledChange={(enabled) =>
        setChamberTimeAwareReentryEnabled(conversation.id, enabled)
      }
      emptyState={{
        title: "No messages yet",
        description: member
          ? `Start a thread with ${member.name}.`
          : "Start this chamber thread.",
      }}
      onSend={async ({ text }) => {
        const sendResult = await sendUserMessage(conversation.id, text);
        void generateReplies(
          conversation.id,
          text,
          [],
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
