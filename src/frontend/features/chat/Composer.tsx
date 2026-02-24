import { useEffect, useRef, useState } from 'react';
import { Mic, SendHorizontal } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';

interface ComposerProps {
  onSend: (payload: { text: string; mentionedMemberIds?: string[] }) => void | Promise<void>;
  placeholder?: string;
  sendDisabled?: boolean;
  mentionOptions?: Array<{ id: string; name: string }>;
  mentionError?: string;
}

export function Composer({
  onSend,
  placeholder = 'Ask your council something...',
  sendDisabled = false,
  mentionOptions = [],
  mentionError,
}: ComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [hasText, setHasText] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMentionIds, setSelectedMentionIds] = useState<string[]>([]);
  const isLocked = sendDisabled || isSubmitting;

  useEffect(() => {
    const mentionSet = new Set(mentionOptions.map((item) => item.id));
    setSelectedMentionIds((current) => current.filter((id) => mentionSet.has(id)));
  }, [mentionOptions]);

  const toggleMention = (memberId: string) => {
    setSelectedMentionIds((current) => {
      if (current.includes(memberId)) {
        return current.filter((id) => id !== memberId);
      }
      return [...current, memberId];
    });
  };

  const submit = () => {
    if (isLocked) return;
    const text = inputRef.current?.value?.trim() ?? '';
    if (!text) return;
    setIsSubmitting(true);
    try {
      void onSend({
        text,
        mentionedMemberIds: selectedMentionIds.length > 0 ? selectedMentionIds : undefined,
      });
      if (inputRef.current) {
        inputRef.current.value = '';
        inputRef.current.style.height = 'auto';
      }
      setHasText(false);
      setSelectedMentionIds([]);
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <Textarea
            ref={inputRef}
            placeholder={placeholder}
            rows={1}
            className="max-h-44 min-h-[1.75rem] resize-none border-0 bg-transparent px-3 py-1.5 leading-[1.4] focus-visible:ring-0"
            onInput={(event) => {
              const element = event.currentTarget;
              element.style.height = 'auto';
              element.style.height = `${Math.min(element.scrollHeight, 176)}px`;
              setHasText(element.value.trim().length > 0);
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

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground">
              <Mic className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className={cn(
                'h-8 w-8 rounded-md transition-colors',
                hasText && !isLocked
                  ? 'bg-foreground text-background hover:bg-foreground/90'
                  : 'bg-muted text-muted-foreground hover:bg-muted'
              )}
              onClick={() => {
                void submit();
              }}
              disabled={!hasText || isLocked}
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {mentionError ? <p className="px-2 text-xs text-destructive">{mentionError}</p> : null}
      </div>
    </div>
  );
}
