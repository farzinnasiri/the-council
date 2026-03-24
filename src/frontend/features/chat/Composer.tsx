import { useEffect, useRef, useState } from 'react';
import { AlignJustify, Brain, Check, ChevronDown, Loader2, Mic, Search, SendHorizontal, Square, Zap } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';
import { transcribeRecordedAudio } from '../../lib/aiClient';
import { appendTranscriptToDraft } from './audio';
import { LiveWaveform } from './LiveWaveform';
import { useAudioRecorder } from './useAudioRecorder';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import type { ChamberResponseMode } from '../../types/domain';

interface ComposerProps {
  onSend: (payload: { text: string; mentionedMemberIds?: string[] }) => void | Promise<void>;
  placeholder?: string;
  sendDisabled?: boolean;
  mentionOptions?: Array<{ id: string; name: string }>;
  mentionError?: string;
  chamberResponseMode?: ChamberResponseMode;
  onChamberResponseModeChange?: (mode: ChamberResponseMode) => void | Promise<void>;
  timeAwareReentryEnabled?: boolean;
  onTimeAwareReentryEnabledChange?: (enabled: boolean) => void | Promise<void>;
}

const CHAMBER_MODE_OPTIONS: Array<{
  value: ChamberResponseMode;
  label: string;
  description: string;
  Icon: typeof Zap;
}> = [
  { value: 'instant', label: 'Instant', description: 'Fast default reply', Icon: Zap },
  { value: 'short', label: 'Short', description: 'Concise default reply', Icon: AlignJustify },
  { value: 'think', label: 'Think', description: 'Reason more before replying', Icon: Brain },
  { value: 'brainstorm', label: 'Brainstorm', description: 'Wider, more surprising angles', Icon: Search },
  { value: 'deep_dive', label: 'Deep Dive', description: 'Explore broadly, then dig into the best paths', Icon: Search },
];

export function Composer({
  onSend,
  placeholder = 'Ask your council something...',
  sendDisabled = false,
  mentionOptions = [],
  mentionError,
  chamberResponseMode,
  onChamberResponseModeChange,
  timeAwareReentryEnabled,
  onTimeAwareReentryEnabledChange,
}: ComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedMentionIds, setSelectedMentionIds] = useState<string[]>([]);
  const {
    isRecording,
    audioStream,
    durationSec,
    error: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError: clearRecorderError,
  } = useAudioRecorder();

  const hasText = inputValue.trim().length > 0;
  const isLocked = sendDisabled || isSubmitting || isVoiceProcessing;

  useEffect(() => {
    const mentionSet = new Set(mentionOptions.map((item) => item.id));
    setSelectedMentionIds((current) => current.filter((id) => mentionSet.has(id)));
  }, [mentionOptions]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 176)}px`;
  }, [inputValue, isRecording]);

  const toggleMention = (memberId: string) => {
    setSelectedMentionIds((current) => {
      if (current.includes(memberId)) {
        return current.filter((id) => id !== memberId);
      }
      return [...current, memberId];
    });
  };

  const submit = async () => {
    if (isLocked || isRecording) return;
    const text = inputValue.trim();
    if (!text) return;
    setSendError(null);
    setIsSubmitting(true);
    try {
      await onSend({
        text,
        mentionedMemberIds: selectedMentionIds.length > 0 ? selectedMentionIds : undefined,
      });
      setInputValue('');
      setSelectedMentionIds([]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Could not send message right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMicClick = async () => {
    if (isVoiceProcessing || sendDisabled || isSubmitting) return;
    setVoiceError(null);
    clearRecorderError();

    if (!isRecording) {
      await startRecording();
      return;
    }

    setIsVoiceProcessing(true);
    try {
      const blob = await stopRecording();
      if (!blob) return;
      const response = await transcribeRecordedAudio(blob, blob.type || undefined);
      setInputValue((current) => appendTranscriptToDraft(current, response.transcript));
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : 'Could not transcribe audio right now.');
    } finally {
      setIsVoiceProcessing(false);
    }
  };

  const currentVoiceError = voiceError ?? recorderError;
  const activeMode = CHAMBER_MODE_OPTIONS.find((option) => option.value === chamberResponseMode);
  const ActiveModeIcon = activeMode?.Icon ?? Zap;

  return (
    <div className="bg-background px-4 py-4 md:px-8 border-t border-border">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
        {mentionOptions.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {mentionOptions.map((member) => {
              const active = selectedMentionIds.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  className={cn(
                    'shrink-0 rounded-md border px-3 py-1 font-mono text-xs transition',
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-transparent text-muted-foreground hover:border-foreground hover:text-foreground'
                  )}
                  onClick={() => toggleMention(member.id)}
                  disabled={isLocked}
                >
                  @{member.name}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex items-center gap-2 rounded-lg border border-border bg-transparent p-2">
          {chamberResponseMode && onChamberResponseModeChange ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1 rounded-md px-2 text-muted-foreground hover:text-foreground"
                  disabled={isLocked}
                  aria-label={`Response mode: ${activeMode?.label ?? 'Instant'}`}
                >
                  <ActiveModeIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{activeMode?.label ?? 'Instant'}</span>
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>Response Mode</DropdownMenuLabel>
                {CHAMBER_MODE_OPTIONS.map(({ value, label, description, Icon }) => (
                  <DropdownMenuItem
                    key={value}
                    onSelect={(event) => {
                      event.preventDefault();
                      void onChamberResponseModeChange(value);
                    }}
                    className={cn(
                      'gap-2',
                      chamberResponseMode === value && 'bg-muted text-foreground'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <div className="min-w-0">
                      <p className="text-sm">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{description}</p>
                    </div>
                  </DropdownMenuItem>
                ))}
                {typeof timeAwareReentryEnabled === 'boolean' && onTimeAwareReentryEnabledChange ? (
                  <>
                    <DropdownMenuLabel>Thread Behavior</DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        void onTimeAwareReentryEnabledChange(!timeAwareReentryEnabled);
                      }}
                      className="gap-2"
                    >
                      <div className="flex h-3.5 w-3.5 items-center justify-center">
                        {timeAwareReentryEnabled ? <Check className="h-3.5 w-3.5" /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm">Time-Aware Re-entry</p>
                        <p className="text-[11px] text-muted-foreground">
                          Ease stale momentum after long pauses
                        </p>
                      </div>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <div className="flex min-w-0 flex-1 items-center">
            {isRecording ? (
              <div className="w-full px-2">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                    Recording
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {Math.floor(durationSec / 60)
                      .toString()
                      .padStart(2, '0')}
                    :
                    {(durationSec % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <LiveWaveform audioStream={audioStream} />
              </div>
            ) : (
              <Textarea
                ref={inputRef}
                placeholder={placeholder}
                rows={1}
                value={inputValue}
                className="max-h-44 min-h-[1.75rem] resize-none border-0 bg-transparent px-3 py-1.5 leading-[1.4] focus-visible:ring-0"
                onChange={(event) => {
                  setSendError(null);
                  setInputValue(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (!isLocked) {
                      void submit();
                    }
                  }
                }}
              />
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 rounded-md text-muted-foreground hover:text-foreground',
                isRecording ? 'bg-destructive/15 text-destructive hover:text-destructive' : ''
              )}
              onClick={() => {
                void handleMicClick();
              }}
              disabled={isLocked && !isRecording}
            >
              {isVoiceProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isRecording ? (
                <Square className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              className={cn(
                'h-8 w-8 rounded-md transition-colors',
                hasText && !isLocked && !isRecording
                  ? 'bg-foreground text-background hover:bg-foreground/90'
                  : 'bg-muted text-muted-foreground hover:bg-muted'
              )}
              onClick={() => {
                void submit();
              }}
              disabled={!hasText || isLocked || isRecording}
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {mentionError ? <p className="px-2 text-xs text-destructive">{mentionError}</p> : null}
        {sendError ? <p className="px-2 text-xs text-destructive">{sendError}</p> : null}
        {currentVoiceError ? <p className="px-2 text-xs text-destructive">{currentVoiceError}</p> : null}
        {isRecording ? (
          <div className="px-2 text-[11px] text-muted-foreground">
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                cancelRecording();
                clearRecorderError();
              }}
            >
              Cancel recording
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
