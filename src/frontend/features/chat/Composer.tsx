import { useRef, useState } from 'react';
import { Mic, SendHorizontal } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';

interface ComposerProps {
  onSend: (text: string) => void | Promise<void>;
  placeholder?: string;
  sendDisabled?: boolean;
}

export function Composer({ onSend, placeholder = 'Ask your council something...', sendDisabled = false }: ComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [hasText, setHasText] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isLocked = sendDisabled || isSubmitting;

  const submit = async () => {
    if (isLocked) return;
    const text = inputRef.current?.value?.trim() ?? '';
    if (!text) return;
    setIsSubmitting(true);
    try {
      await onSend(text);
      if (inputRef.current) {
        inputRef.current.value = '';
        inputRef.current.style.height = 'auto';
      }
      setHasText(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-background/80 px-4 py-4 backdrop-blur md:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col">
        <div className="flex items-center gap-2 rounded-[2rem] border border-border bg-card p-2.5 shadow-glass">
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
            <Button variant="ghost" size="icon" className="rounded-full">
              <Mic className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className={cn(
                'rounded-full transition-colors',
                hasText && !isLocked
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
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
      </div>
    </div>
  );
}
