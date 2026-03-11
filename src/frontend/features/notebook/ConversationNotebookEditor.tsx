import { Loader2, NotebookPen, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { useConversationNotebook } from './useConversationNotebook';

interface ConversationNotebookEditorProps {
  conversationId: string;
  title: string;
  detail?: string;
  className?: string;
  onClose?: () => void;
  autoFocus?: boolean;
  variant?: 'panel' | 'page' | 'sheet';
}

function getSaveLabel(saveState: 'idle' | 'saving' | 'saved' | 'error', hasContent: boolean) {
  if (saveState === 'saving') return 'Saving…';
  if (saveState === 'saved') return hasContent ? 'Saved' : 'Cleared';
  if (saveState === 'error') return 'Save failed';
  return hasContent ? 'Autosave on' : 'Empty';
}

export function ConversationNotebookEditor({
  conversationId,
  title,
  detail,
  className,
  onClose,
  autoFocus = false,
  variant = 'panel',
}: ConversationNotebookEditorProps) {
  const { draft, loaded, saveState, error, setDraft, saveNow } = useConversationNotebook(conversationId);

  return (
    <section className={cn('flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-muted-foreground" />
            <h2 className="m-0 truncate text-sm font-semibold leading-5">{title}</h2>
          </div>
          {detail ? <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">{detail}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs text-muted-foreground', saveState === 'error' && 'text-destructive')}>
            {getSaveLabel(saveState, draft.trim().length > 0)}
          </span>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                void saveNow();
                onClose();
              }}
              aria-label="Close notebook"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {!loaded ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading notebook
          </div>
        ) : (
          <textarea
            rows={1}
            value={draft}
            autoFocus={autoFocus}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => {
              void saveNow();
            }}
            placeholder="Write here while the conversation is still live."
            className={cn(
              'block h-full min-h-full w-full resize-none border-0 bg-background px-4 py-4 text-sm leading-6 outline-none',
              variant === 'page' ? 'md:px-6 md:py-5' : ''
            )}
          />
        )}
      </div>

      {error ? (
        <div className="border-t border-border px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
    </section>
  );
}
