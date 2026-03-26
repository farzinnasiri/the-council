import {
  AlignJustify,
  Brain,
  Bug,
  Check,
  ChevronRight,
  Copy,
  Expand,
  LoaderCircle,
  MessageCircle,
  MessageSquarePlus,
  NotebookPen,
  Pin,
  Reply,
  Search,
  SlidersHorizontal,
  Square,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserCircle2,
  Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/appStore";
import type {
  CustomGuidanceChipKey,
  Message,
  PromptTraceRecord,
} from "../../types/domain";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { RoutePill } from "./RoutePill";
import { MarkdownMessage } from "./MarkdownMessage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { cn } from "../../lib/utils";
import { useChatSpeech } from "./ChatSpeechProvider";
import { ENABLE_PROMPT_TRACE_DEBUG } from "../../../../shared/featureFlags";

const FEEDBACK_OPTIONS = [
  { key: "helpful", label: "Helpful", activeLabel: "Helpful", Icon: ThumbsUp },
  {
    key: "not_helpful",
    label: "Not helpful",
    activeLabel: "Not helpful",
    Icon: ThumbsDown,
  },
  {
    key: "shorter",
    label: "Shorter",
    activeLabel: "Shorter replies",
    Icon: AlignJustify,
  },
  {
    key: "longer",
    label: "Longer",
    activeLabel: "Longer replies",
    Icon: Expand,
  },
  {
    key: "more_direct",
    label: "More direct",
    activeLabel: "More direct",
    Icon: Reply,
  },
] as const;
const CUSTOM_GUIDANCE_OPTIONS: Array<{
  key: CustomGuidanceChipKey;
  label: string;
}> = [
  { key: "repetitive", label: "Repetitive" },
  { key: "structure", label: "Structure" },
  { key: "tone", label: "Tone" },
  { key: "formatting", label: "Formatting" },
  { key: "persona", label: "Persona" },
  { key: "missed_my_point", label: "Missed my point" },
];
const CUSTOM_GUIDANCE_TEXT_MAX = 160;

/** Format epoch ms → "HH:MM" */
function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MemberAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl?: string | null;
  name: string;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="mt-1 h-8 w-8 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }
  return (
    <UserCircle2
      className="mt-1 h-8 w-8 shrink-0 text-muted-foreground/60"
      aria-label={name}
    />
  );
}

function formatPromptTraceMetaValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

export function MessageBubble({
  message,
  canDeleteLatestTurn = false,
  canEditLatestTurn = false,
  onDeleteLatestTurn,
  onEditLatestTurn,
}: {
  message: Message;
  canDeleteLatestTurn?: boolean;
  canEditLatestTurn?: boolean;
  onDeleteLatestTurn?: (message: Message) => void | Promise<void>;
  onEditLatestTurn?: (message: Message) => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [startingFollowUp, setStartingFollowUp] = useState(false);
  const [customGuidanceDialogOpen, setCustomGuidanceDialogOpen] =
    useState(false);
  const [customGuidanceChips, setCustomGuidanceChips] = useState<
    CustomGuidanceChipKey[]
  >([]);
  const [customGuidanceText, setCustomGuidanceText] = useState("");
  const [savingCustomGuidance, setSavingCustomGuidance] = useState(false);
  const [clearingCustomGuidance, setClearingCustomGuidance] = useState(false);
  const [promptTraceDialogOpen, setPromptTraceDialogOpen] = useState(false);
  const [promptTraceLoading, setPromptTraceLoading] = useState(false);
  const [promptTraceError, setPromptTraceError] = useState<string | null>(null);
  const [collapsedPromptTraceSections, setCollapsedPromptTraceSections] =
    useState<Record<string, boolean>>({});
  const {
    toggleMessage,
    isLoading: isSpeechLoading,
    isQueued: isSpeechQueued,
    isPlaying: isSpeechPlaying,
  } = useChatSpeech();
  const navigate = useNavigate();
  const members = useAppStore((state) => state.members);
  const conversations = useAppStore((state) => state.conversations);
  const messages = useAppStore((state) => state.messages);
  const appendMessageToNotebook = useAppStore(
    (state) => state.appendMessageToNotebook,
  );
  const refiningActionByMessageId = useAppStore(
    (state) => state.refiningActionByMessageId,
  );
  const messageFeedbackByMessageId = useAppStore(
    (state) => state.messageFeedbackByMessageId,
  );
  const customGuidanceByMessageId = useAppStore(
    (state) => state.customGuidanceByMessageId,
  );
  const refineLatestChamberResponse = useAppStore(
    (state) => state.refineLatestChamberResponse,
  );
  const setMessageFeedback = useAppStore((state) => state.setMessageFeedback);
  const saveCustomGuidanceForMessage = useAppStore(
    (state) => state.saveCustomGuidanceForMessage,
  );
  const clearCustomGuidanceForMessage = useAppStore(
    (state) => state.clearCustomGuidanceForMessage,
  );
  const setMessagePinned = useAppStore((state) => state.setMessagePinned);
  const retryFailedMessage = useAppStore((state) => state.retryFailedMessage);
  const retryingMessageIds = useAppStore((state) => state.retryingMessageIds);
  const startHallFollowUpThread = useAppStore(
    (state) => state.startHallFollowUpThread,
  );
  const promptDebugMode = useAppStore((state) => state.promptDebugMode);
  const promptTraceByMessageId = useAppStore(
    (state) => state.promptTraceByMessageId,
  );
  const promptTraceMessageIdsByConversation = useAppStore(
    (state) => state.promptTraceMessageIdsByConversation,
  );
  const getMessagePromptTrace = useAppStore(
    (state) => state.getMessagePromptTrace,
  );
  const showToast = useAppStore((state) => state.showToast);

  if (message.role === "system") {
    const systemKind =
      message.systemKind ?? (message.routing ? "routing" : undefined);
    if (systemKind === "routing") {
      const isManual = message.content
        .toLowerCase()
        .startsWith("manually routed");
      return (
        <RoutePill
          memberIds={message.routing?.memberIds ?? []}
          label={isManual ? "Manually routed to" : "Routed to"}
        />
      );
    }

    if (systemKind === "hall_closure") {
      return (
        <div className="mx-auto flex max-w-[92%] animate-fade-in-up">
          <div className="w-full rounded-2xl border border-border/80 bg-card px-4 py-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                <img
                  src="/icons/favicon.svg"
                  alt="The Council"
                  className="h-5 w-5"
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  The Council
                </p>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Table closed
                </p>
              </div>
            </div>
            <div className="mt-4 text-sm leading-relaxed text-foreground">
              <MarkdownMessage content={message.content} />
            </div>
            <div className="mt-4 flex items-center justify-end">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() =>
                  void appendMessageToNotebook(
                    message.conversationId,
                    message.content,
                    "The Council",
                  )
                }
                title="Add to Notebook"
                aria-label="Add to Notebook"
              >
                <NotebookPen className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto flex max-w-[88%] animate-fade-in-up">
        <div className="w-full rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Hall Context
          </p>
          <div className="mt-2 text-sm leading-relaxed text-foreground">
            <MarkdownMessage content={message.content} />
          </div>
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";
  const member = message.authorMemberId
    ? members.find((item) => item.id === message.authorMemberId)
    : null;
  const label = member?.name ?? "Council Member";
  const conversation = conversations.find(
    (item) => item.id === message.conversationId,
  );
  const isChamber = conversation?.kind === "chamber";
  const latestChamberMemberMessageId = isChamber
    ? messages
        .filter(
          (item) =>
            item.conversationId === message.conversationId &&
            item.role === "member" &&
            item.status === "sent" &&
            !item.deletedAt &&
            !item.supersededAt &&
            !item.compacted,
        )
        .sort((a, b) => b.createdAt - a.createdAt)[0]?.id
    : undefined;
  const canRefine = Boolean(
    isChamber &&
    !isUser &&
    message.status === "sent" &&
    !message.deletedAt &&
    !message.supersededAt &&
    !message.compacted &&
    latestChamberMemberMessageId === message.id,
  );
  const activeRefinement = refiningActionByMessageId[message.id];
  const isReplacementRefining =
    activeRefinement && activeRefinement !== "elaborate";
  const timeLabel = formatClock(message.createdAt);
  const canStartHallFollowUp = Boolean(
    conversation?.kind === "hall" &&
    member &&
    !isUser &&
    message.status === "sent" &&
    !message.deletedAt &&
    !message.supersededAt &&
    !message.compacted,
  );
  const activeFeedback = new Set(messageFeedbackByMessageId[message.id] ?? []);
  const activeFeedbackBadges = FEEDBACK_OPTIONS.filter(({ key }) =>
    activeFeedback.has(key),
  );
  const existingCustomGuidance = customGuidanceByMessageId[message.id];
  const canPin = Boolean(
    isChamber &&
    message.status === "sent" &&
    !message.deletedAt &&
    !message.supersededAt &&
    !message.compacted &&
    message.role !== "system",
  );
  const isPinned = Boolean(message.pinnedAt);
  const isRetrying = Boolean(retryingMessageIds[message.id]);
  const canRetryFailedGeneration = Boolean(
    message.role === "member" &&
    message.status === "error" &&
    !message.deletedAt &&
    !message.supersededAt,
  );
  const canSpeak =
    !isUser &&
    message.role === "member" &&
    message.status === "sent" &&
    !message.deletedAt &&
    !message.supersededAt &&
    !message.compacted &&
    Boolean(message.content.trim());
  const speechLoading = canSpeak && isSpeechLoading(message.id);
  const speechQueued = canSpeak && isSpeechQueued(message.id);
  const speechPlaying = canSpeak && isSpeechPlaying(message.id);
  const canSaveCustomGuidance =
    customGuidanceChips.length > 0 && !savingCustomGuidance;
  const customGuidanceCharactersRemaining =
    CUSTOM_GUIDANCE_TEXT_MAX - customGuidanceText.length;
  const promptTrace = promptTraceByMessageId[message.id] ?? null;
  const hasPromptTrace = Boolean(
    promptTraceMessageIdsByConversation[message.conversationId]?.includes(
      message.id,
    ),
  );
  const canOpenPromptTrace = Boolean(
    ENABLE_PROMPT_TRACE_DEBUG &&
    promptDebugMode &&
    hasPromptTrace &&
    !isUser &&
    message.role === "member" &&
    message.status === "sent" &&
    !message.deletedAt &&
    !message.supersededAt &&
    !message.compacted,
  );

  useEffect(() => {
    if (!promptTraceDialogOpen) {
      setPromptTraceLoading(false);
      setPromptTraceError(null);
      return;
    }
    if (promptTrace) {
      setPromptTraceLoading(false);
      setPromptTraceError(null);
      return;
    }
    if (!hasPromptTrace) return;
    let unmounted = false;
    setPromptTraceLoading(true);
    setPromptTraceError(null);
    void getMessagePromptTrace(message.id)
      .then((result) => {
        if (unmounted || result) return;
        setPromptTraceError("Prompt trace not found for this message.");
      })
      .catch((error) => {
        if (unmounted) return;
        setPromptTraceError(
          error instanceof Error
            ? error.message
            : "Could not load prompt trace.",
        );
      })
      .finally(() => {
        if (unmounted) return;
        setPromptTraceLoading(false);
      });
    return () => {
      unmounted = true;
    };
  }, [
    getMessagePromptTrace,
    hasPromptTrace,
    message.id,
    promptTrace,
    promptTraceDialogOpen,
  ]);

  useEffect(() => {
    if (!promptTraceDialogOpen) {
      setCollapsedPromptTraceSections({});
      return;
    }
    if (!promptTrace) {
      return;
    }
    setCollapsedPromptTraceSections(
      Object.fromEntries(
        promptTrace.sections.map((section, index) => [
          `${section.key}-${index}`,
          true,
        ]),
      ),
    );
  }, [promptTrace, promptTraceDialogOpen]);

  const openCustomGuidanceDialog = () => {
    setCustomGuidanceChips(existingCustomGuidance?.chips ?? []);
    setCustomGuidanceText(existingCustomGuidance?.text ?? "");
    setCustomGuidanceDialogOpen(true);
  };

  const toggleCustomGuidanceChip = (chip: CustomGuidanceChipKey) => {
    setCustomGuidanceChips((current) =>
      current.includes(chip)
        ? current.filter((value) => value !== chip)
        : [...current, chip],
    );
  };

  const handleSaveCustomGuidance = async () => {
    if (!canSaveCustomGuidance) return;
    setSavingCustomGuidance(true);
    try {
      await saveCustomGuidanceForMessage(
        message.id,
        customGuidanceChips,
        customGuidanceText.trim() ? customGuidanceText.trim() : undefined,
      );
      setCustomGuidanceDialogOpen(false);
    } finally {
      setSavingCustomGuidance(false);
    }
  };

  const handleClearCustomGuidance = async () => {
    if (!existingCustomGuidance) return;
    setClearingCustomGuidance(true);
    try {
      await clearCustomGuidanceForMessage(message.id);
      setCustomGuidanceChips([]);
      setCustomGuidanceText("");
      setCustomGuidanceDialogOpen(false);
    } finally {
      setClearingCustomGuidance(false);
    }
  };

  const renderSpeechButton = (tone: "muted" | "user" = "muted") => {
    if (!canSpeak) return null;

    const className =
      tone === "user"
        ? "h-6 w-6 text-background/70 hover:text-background hover:bg-background/20"
        : cn(
            "h-6 w-6 text-muted-foreground",
            (speechQueued || speechPlaying) &&
              "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
          );

    const title = speechPlaying
      ? "Stop speech"
      : speechLoading
        ? "Preparing speech"
        : speechQueued
          ? "Remove from playback queue"
          : "Play aloud";

    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        onClick={() => void toggleMessage(message)}
        title={title}
        aria-label={title}
      >
        {speechLoading ? (
          <LoaderCircle className="h-3 w-3 animate-spin" />
        ) : speechPlaying ? (
          <Square className="h-3 w-3 fill-current" />
        ) : (
          <Volume2 className="h-3 w-3" />
        )}
      </Button>
    );
  };

  const renderPinButton = (tone: "muted" | "user" = "muted") => {
    if (!canPin) return null;

    const className =
      tone === "user"
        ? cn(
            "h-6 w-6",
            isPinned
              ? "bg-background/20 text-background hover:bg-background/25 hover:text-background"
              : "text-background/70 hover:text-background hover:bg-background/20",
          )
        : cn(
            "h-6 w-6",
            isPinned
              ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
              : "text-muted-foreground",
          );

    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        onClick={() => void setMessagePinned(message.id, !isPinned)}
        title={isPinned ? "Unpin from thread context" : "Pin to thread context"}
        aria-label={
          isPinned ? "Unpin from thread context" : "Pin to thread context"
        }
      >
        <Pin className="h-3 w-3" />
      </Button>
    );
  };

  const renderPromptTraceButton = (tone: "muted" | "user" = "muted") => {
    if (!canOpenPromptTrace) return null;

    const className =
      tone === "user"
        ? "h-6 w-6 text-background/70 hover:text-background hover:bg-background/20"
        : "h-6 w-6 text-muted-foreground";

    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        onClick={() => setPromptTraceDialogOpen(true)}
        title="Prompt trace"
        aria-label="Open prompt trace"
      >
        <Bug className="h-3 w-3" />
      </Button>
    );
  };

  if (isReplacementRefining) {
    return null;
  }

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const addToNotebook = async () => {
    await appendMessageToNotebook(
      message.conversationId,
      message.content,
      isUser ? undefined : label,
    );
  };

  const launchHallFollowUp = async () => {
    if (!canStartHallFollowUp || startingFollowUp) return;
    setStartingFollowUp(true);
    try {
      const thread = await startHallFollowUpThread(
        message.conversationId,
        message.id,
      );
      setFollowUpDialogOpen(false);
      navigate(`/chamber/${thread.id}`);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Could not start a private follow-up thread.",
      );
    } finally {
      setStartingFollowUp(false);
    }
  };

  const deleteLatestTurn = async () => {
    if (!onDeleteLatestTurn) return;
    try {
      await onDeleteLatestTurn(message);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Could not delete the latest turn.",
      );
    }
  };

  return (
    <>
      <div
        className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"} animate-fade-in-up`}
      >
        {!isUser && member ? (
          <MemberAvatar avatarUrl={member.avatarUrl} name={label} />
        ) : null}

        <div
          className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col`}
        >
          {!isUser ? (
            <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">
              {label}
            </p>
          ) : null}
          <div
            className={cn(
              "relative px-4 py-3 text-sm leading-relaxed",
              isUser
                ? "rounded-2xl bg-foreground text-background"
                : "rounded-lg border border-border/50 bg-muted/30 text-foreground",
              message.status === "error" && "border border-destructive/50",
            )}
          >
            {canPin ? (
              <div className="absolute right-2 top-2">
                {renderPinButton(isUser ? "user" : "muted")}
              </div>
            ) : null}
            <div className={cn(canPin && "pr-8")}>
              <MarkdownMessage content={message.content} />
            </div>
            {message.status === "error" && message.error ? (
              <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive/90">
                {message.error}
              </div>
            ) : null}
            {canRetryFailedGeneration ? (
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-md px-2 text-[11px]"
                  onClick={() => void retryFailedMessage(message.id)}
                  disabled={isRetrying}
                >
                  {isRetrying ? (
                    <LoaderCircle className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  {isRetrying ? "Retrying" : "Retry"}
                </Button>
              </div>
            ) : null}

            {!isUser ? (
              <>
                <div className="mt-3 flex items-center gap-1.5 opacity-50 transition-opacity hover:opacity-100 sm:gap-2">
                  {isChamber ? (
                    <div className="flex min-w-0 items-center gap-1">
                      {canRefine ? (
                        <>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 rounded-md px-1.5 text-[11px] text-muted-foreground sm:px-2"
                                disabled={Boolean(activeRefinement)}
                                title="Refine reply"
                                aria-label="Refine reply"
                              >
                                <SlidersHorizontal className="h-3 w-3" />
                                <span className="hidden sm:inline">Refine</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-44">
                              <DropdownMenuLabel>
                                Refine Reply
                              </DropdownMenuLabel>
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault();
                                  void refineLatestChamberResponse(
                                    message.conversationId,
                                    "think_harder",
                                  );
                                }}
                                className="gap-2"
                              >
                                <Brain className="h-3.5 w-3.5" />
                                Think harder
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault();
                                  void refineLatestChamberResponse(
                                    message.conversationId,
                                    "deep_dive",
                                  );
                                }}
                                className="gap-2"
                              >
                                <Search className="h-3.5 w-3.5" />
                                Deep dive
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault();
                                  void refineLatestChamberResponse(
                                    message.conversationId,
                                    "brainstorm",
                                  );
                                }}
                                className="gap-2"
                              >
                                <Search className="h-3.5 w-3.5" />
                                Brainstorm
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault();
                                  void refineLatestChamberResponse(
                                    message.conversationId,
                                    "shorter",
                                  );
                                }}
                                className="gap-2"
                              >
                                <AlignJustify className="h-3.5 w-3.5" />
                                Shorter
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 rounded-md px-1.5 text-[11px] text-muted-foreground sm:px-2"
                            onClick={() =>
                              void refineLatestChamberResponse(
                                message.conversationId,
                                "elaborate",
                              )
                            }
                            disabled={Boolean(activeRefinement)}
                            title="Elaborate"
                            aria-label="Elaborate"
                          >
                            <Expand className="h-3 w-3" />
                            <span className="hidden sm:inline">Elaborate</span>
                          </Button>
                        </>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 rounded-md px-1.5 text-[11px] text-muted-foreground sm:px-2"
                            title="Feedback"
                            aria-label="Feedback"
                          >
                            <MessageSquarePlus className="h-3 w-3" />
                            <span className="hidden sm:inline">Feedback</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                          <DropdownMenuLabel>
                            Guide Next Replies
                          </DropdownMenuLabel>
                          {FEEDBACK_OPTIONS.map(({ key, label, Icon }) => {
                            const selected = activeFeedback.has(key as any);
                            return (
                              <DropdownMenuItem
                                key={key}
                                onSelect={(event) => {
                                  event.preventDefault();
                                  void setMessageFeedback(
                                    message.id,
                                    key as any,
                                    !selected,
                                  );
                                }}
                                className="gap-2"
                              >
                                <Icon className="h-3.5 w-3.5" />
                                <span>{label}</span>
                              </DropdownMenuItem>
                            );
                          })}
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              openCustomGuidanceDialog();
                            }}
                            className="mt-1 gap-2 border-t border-border pt-2"
                          >
                            <SquarePen className="h-3.5 w-3.5" />
                            <span>Custom guidance</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground"
                        onClick={() => void addToNotebook()}
                        title="Add to Notebook"
                        aria-label="Add to Notebook"
                      >
                        <NotebookPen className="h-3 w-3" />
                      </Button>
                      {renderPromptTraceButton()}
                      {renderSpeechButton()}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground"
                        onClick={() => void copyContent()}
                        title={copied ? "Copied" : "Copy"}
                        aria-label={copied ? "Copied" : "Copy message"}
                      >
                        {copied ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground"
                      >
                        <Reply className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground"
                        onClick={() => setFollowUpDialogOpen(true)}
                        title="Start private follow-up"
                        aria-label="Start private follow-up"
                        disabled={!canStartHallFollowUp || startingFollowUp}
                      >
                        <MessageCircle className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground"
                        onClick={() => void addToNotebook()}
                        title="Add to Notebook"
                        aria-label="Add to Notebook"
                      >
                        <NotebookPen className="h-3 w-3" />
                      </Button>
                      {renderPromptTraceButton()}
                      {renderSpeechButton()}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground"
                        onClick={() => void copyContent()}
                        title={copied ? "Copied" : "Copy"}
                        aria-label={copied ? "Copied" : "Copy message"}
                      >
                        {copied ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  )}
                  <span
                    className={cn(
                      "ml-auto shrink-0 whitespace-nowrap text-[10px] leading-none text-muted-foreground",
                    )}
                  >
                    {timeLabel}
                  </span>
                </div>
                {isChamber && activeFeedbackBadges.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {activeFeedbackBadges.map(({ key, activeLabel }) => (
                      <span
                        key={key}
                        className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {activeLabel}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-2 flex items-center justify-end gap-2 opacity-50 transition-opacity hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-background/70 hover:text-background hover:bg-background/20"
                  onClick={() => void addToNotebook()}
                  title="Add to Notebook"
                  aria-label="Add to Notebook"
                >
                  <NotebookPen className="h-3 w-3" />
                </Button>
                {canDeleteLatestTurn ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-background/70 hover:bg-background/20 hover:text-background"
                    onClick={() => void deleteLatestTurn()}
                    title="Delete latest turn"
                    aria-label="Delete latest turn"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                ) : null}
                {canEditLatestTurn ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-background/70 hover:bg-background/20 hover:text-background"
                    onClick={() => void onEditLatestTurn?.(message)}
                    title="Edit latest message"
                    aria-label="Edit latest message"
                  >
                    <SquarePen className="h-3 w-3" />
                  </Button>
                ) : null}
                {renderSpeechButton("user")}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-background/70 hover:text-background hover:bg-background/20"
                  onClick={() => void copyContent()}
                  title={copied ? "Copied" : "Copy"}
                  aria-label={copied ? "Copied" : "Copy message"}
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] leading-none text-background/70">
                  {timeLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <DialogPrimitive.Root
        open={followUpDialogOpen}
        onOpenChange={setFollowUpDialogOpen}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl focus:outline-none">
            <DialogPrimitive.Title className="font-display text-lg">
              Start private follow-up?
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              Create a new private thread with {label}. The thread will include
              a compact hall context and this selected reply so the conversation
              can continue privately.
            </DialogPrimitive.Description>
            <div className="mt-5 flex justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-4"
                  disabled={startingFollowUp}
                >
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button
                type="button"
                className="h-9 px-4"
                onClick={() => void launchHallFollowUp()}
                disabled={startingFollowUp}
              >
                {startingFollowUp ? "Starting..." : "Open thread"}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root
        open={promptTraceDialogOpen}
        onOpenChange={setPromptTraceDialogOpen}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] flex h-[min(86vh,860px)] w-[min(94vw,960px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-none border border-border bg-card p-5 shadow-2xl focus:outline-none">
            <div className="border-b border-border pb-3">
              <DialogPrimitive.Title className="font-display text-lg">
                Prompt trace
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
                Exact prompt sections persisted for this reply, in model order.
              </DialogPrimitive.Description>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto pr-2">
              {promptTraceLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  Loading prompt trace...
                </div>
              ) : promptTraceError ? (
                <div className="rounded-none border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {promptTraceError}
                </div>
              ) : promptTrace ? (
                <div className="space-y-4">
                  <div className="rounded-none border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
                    <div>
                      Kind:{" "}
                      <span className="font-mono text-foreground">
                        {promptTrace.kind}
                      </span>
                    </div>
                    <div className="mt-1">
                      KB queries:{" "}
                      <span className="font-mono text-foreground">
                        {promptTrace.retrieval.plannerKbQueries.length}
                      </span>
                    </div>
                    <div className="mt-1">
                      KB second pass:{" "}
                      <span className="font-mono text-foreground">
                        {promptTrace.retrieval.secondPassKbQueries.length}
                      </span>
                    </div>
                    <div className="mt-1">
                      Personal source queries:{" "}
                      <span className="font-mono text-foreground">
                        {promptTrace.retrieval.personalSourceQueries.length}
                      </span>
                    </div>
                  </div>

                  {promptTrace.sections.map((section, index) =>
                    (() => {
                      const sectionId = `${section.key}-${index}`;
                      const collapsed = Boolean(
                        collapsedPromptTraceSections[sectionId],
                      );
                      return (
                        <div
                          key={sectionId}
                          className="rounded-none border border-border/80 bg-background px-4 py-4 shadow-sm"
                        >
                          <div className="flex items-start gap-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="mt-0.5 h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setCollapsedPromptTraceSections((current) => ({
                                  ...current,
                                  [sectionId]: !collapsed,
                                }))
                              }
                              aria-label={
                                collapsed
                                  ? `Expand ${section.label}`
                                  : `Collapse ${section.label}`
                              }
                              title={
                                collapsed
                                  ? "Expand section"
                                  : "Collapse section"
                              }
                            >
                              <ChevronRight
                                className={cn(
                                  "h-4 w-4 transition-transform",
                                  !collapsed && "rotate-90",
                                )}
                              />
                            </Button>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  {index + 1}. {section.label}
                                </span>
                                <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                                  {section.sourceKind}
                                </span>
                                {section.meta
                                  ? Object.entries(section.meta).map(
                                      ([key, value]) => (
                                        <span
                                          key={key}
                                          className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                                        >
                                          {key}=
                                          {formatPromptTraceMetaValue(value)}
                                        </span>
                                      ),
                                    )
                                  : null}
                              </div>
                              {!collapsed ? (
                                <div className="mt-3 whitespace-pre-wrap rounded-none border border-border/70 bg-card px-3 py-3 font-mono text-xs leading-6 text-foreground">
                                  {section.content}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })(),
                  )}
                </div>
              ) : (
                <div className="rounded-none border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                  No prompt trace is available for this message.
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="outline" className="h-9 px-4">
                  Close
                </Button>
              </DialogPrimitive.Close>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root
        open={customGuidanceDialogOpen}
        onOpenChange={setCustomGuidanceDialogOpen}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl focus:outline-none">
            <DialogPrimitive.Title className="font-display text-lg">
              Custom guidance
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              Add deterministic guidance for this thread. Select at least one
              issue and optionally add a short note.
            </DialogPrimitive.Description>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Issues
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CUSTOM_GUIDANCE_OPTIONS.map(({ key, label: optionLabel }) => {
                  const selected = customGuidanceChips.includes(key);
                  return (
                    <Button
                      key={key}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-8 rounded-full px-3",
                        !selected && "text-muted-foreground",
                      )}
                      onClick={() => toggleCustomGuidanceChip(key)}
                    >
                      {optionLabel}
                    </Button>
                  );
                })}
              </div>
              {customGuidanceChips.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Select at least one issue.
                </p>
              ) : null}
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Optional note
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {customGuidanceCharactersRemaining}
                </span>
              </div>
              <Textarea
                value={customGuidanceText}
                onChange={(event) =>
                  setCustomGuidanceText(
                    event.target.value.slice(0, CUSTOM_GUIDANCE_TEXT_MAX),
                  )
                }
                maxLength={CUSTOM_GUIDANCE_TEXT_MAX}
                placeholder="Add a short note about what should change."
                className="mt-3 min-h-[110px] resize-none"
              />
            </div>
            <div className="mt-5 flex justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-4"
                onClick={() => void handleClearCustomGuidance()}
                disabled={
                  !existingCustomGuidance ||
                  clearingCustomGuidance ||
                  savingCustomGuidance
                }
              >
                {clearingCustomGuidance ? "Clearing..." : "Clear"}
              </Button>
              <div className="flex gap-2">
                <DialogPrimitive.Close asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-4"
                    disabled={savingCustomGuidance || clearingCustomGuidance}
                  >
                    Cancel
                  </Button>
                </DialogPrimitive.Close>
                <Button
                  type="button"
                  className="h-9 px-4"
                  onClick={() => void handleSaveCustomGuidance()}
                  disabled={!canSaveCustomGuidance || clearingCustomGuidance}
                >
                  {savingCustomGuidance ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
