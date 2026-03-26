import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import type { Message } from "../../types/domain";
import type { ChamberResponseMode } from "../../types/domain";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../../components/ui/button";

export interface ComposerSendInput {
  text: string;
  mentionedMemberIds?: string[];
}

interface TypingMember {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface ChatScreenProps {
  messages: Message[];
  conversationKind?: "hall" | "chamber";
  hallMode?: "advisory" | "roundtable";
  pendingRoundNumber?: number;
  isRouting?: boolean;
  typingMembers?: TypingMember[];
  isSending?: boolean;
  sendDisabled?: boolean;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  placeholder: string;
  mentionOptions?: Array<{ id: string; name: string }>;
  mentionError?: string;
  onSend: (payload: ComposerSendInput) => void | Promise<void>;
  onDeleteLatestTurn?: (message: Message) => void | Promise<void>;
  onEditLatestTurn?: (
    message: Message,
    payload: ComposerSendInput,
  ) => void | Promise<void>;
  onLoadOlder?: () => void | Promise<void>;
  beforeComposer?: ReactNode;
  chamberResponseMode?: ChamberResponseMode;
  onChamberResponseModeChange?: (
    mode: ChamberResponseMode,
  ) => void | Promise<void>;
  timeAwareReentryEnabled?: boolean;
  onTimeAwareReentryEnabledChange?: (enabled: boolean) => void | Promise<void>;
  emptyState?: {
    title: string;
    description: string;
  };
}

export function ChatScreen({
  messages,
  conversationKind,
  hallMode,
  pendingRoundNumber,
  isRouting = false,
  typingMembers = [],
  isSending = false,
  sendDisabled = false,
  hasOlderMessages = false,
  loadingOlderMessages = false,
  placeholder,
  mentionOptions = [],
  mentionError,
  onSend,
  onDeleteLatestTurn,
  onEditLatestTurn,
  onLoadOlder,
  beforeComposer,
  chamberResponseMode,
  onChamberResponseModeChange,
  timeAwareReentryEnabled,
  onTimeAwareReentryEnabledChange,
  emptyState,
}: ChatScreenProps) {
  const [composerValue, setComposerValue] = useState("");
  const [selectedMentionIds, setSelectedMentionIds] = useState<string[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [composerFocusNonce, setComposerFocusNonce] = useState(0);

  const latestUserMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "user") {
        return messages[index];
      }
    }
    return undefined;
  }, [messages]);

  const editingMessage = useMemo(
    () => messages.find((message) => message.id === editingMessageId) ?? null,
    [editingMessageId, messages],
  );

  useEffect(() => {
    if (editingMessageId && !editingMessage) {
      setEditingMessageId(null);
      setComposerValue("");
      setSelectedMentionIds([]);
    }
  }, [editingMessage, editingMessageId]);

  const editingBanner = editingMessage ? (
    <div className="px-4 pb-3 md:px-8">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-sm text-foreground">
          Editing the latest message. Resending will discard the current reply
          chain.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => {
            setEditingMessageId(null);
            setComposerValue("");
            setSelectedMentionIds([]);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageList
        messages={messages}
        conversationKind={conversationKind}
        hallMode={hallMode}
        pendingRoundNumber={pendingRoundNumber}
        isRouting={isRouting}
        typingMembers={typingMembers}
        hasOlderMessages={hasOlderMessages}
        loadingOlderMessages={loadingOlderMessages}
        onLoadOlder={onLoadOlder}
        emptyState={emptyState}
        latestUserMessageId={latestUserMessage?.id}
        latestTurnActionsDisabled={isSending || sendDisabled}
        onDeleteLatestTurn={onDeleteLatestTurn}
        onEditLatestTurn={
          onEditLatestTurn
            ? (message) => {
                setEditingMessageId(message.id);
                setComposerValue(message.content);
                setSelectedMentionIds(message.mentionedMemberIds ?? []);
                setComposerFocusNonce((current) => current + 1);
              }
            : undefined
        }
      />
      {beforeComposer ? (
        <div className="pb-3 md:pb-4">{beforeComposer}</div>
      ) : null}
      {editingBanner}
      <Composer
        placeholder={placeholder}
        sendDisabled={isSending || sendDisabled}
        mentionOptions={mentionOptions}
        mentionError={mentionError}
        value={composerValue}
        onValueChange={setComposerValue}
        selectedMentionIds={selectedMentionIds}
        onSelectedMentionIdsChange={setSelectedMentionIds}
        chamberResponseMode={
          conversationKind === "chamber"
            ? (chamberResponseMode ?? "instant")
            : undefined
        }
        onChamberResponseModeChange={onChamberResponseModeChange}
        timeAwareReentryEnabled={
          conversationKind === "chamber" ? timeAwareReentryEnabled : undefined
        }
        onTimeAwareReentryEnabledChange={onTimeAwareReentryEnabledChange}
        sendLabel={editingMessage ? "Resend edited message" : "Send"}
        focusNonce={composerFocusNonce}
        onSend={(payload) => {
          if (editingMessage && onEditLatestTurn) {
            return Promise.resolve(
              onEditLatestTurn(editingMessage, payload),
            ).then(() => {
              setEditingMessageId(null);
              setComposerValue("");
              setSelectedMentionIds([]);
            });
          }
          return Promise.resolve(onSend(payload));
        }}
      />
    </div>
  );
}
