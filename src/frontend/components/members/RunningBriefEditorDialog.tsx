import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Save, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import type { MemberRunningBrief } from '../../types/domain';

interface RunningBriefDraft {
  rawBody: string;
  enabled: boolean;
}

interface RunningBriefEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brief: MemberRunningBrief | null;
  draft: RunningBriefDraft;
  onDraftChange: (next: RunningBriefDraft) => void;
  onSave: () => void | Promise<void>;
  isSaving: boolean;
  error?: string | null;
  notice?: string | null;
}

function formatTimestamp(value?: number) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export function RunningBriefEditorDialog({
  open,
  onOpenChange,
  brief,
  draft,
  onDraftChange,
  onSave,
  isSaving,
  error,
  notice,
}: RunningBriefEditorDialogProps) {
  const statusMessage = isSaving ? 'Saving running brief changes.' : error ? error : notice;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isSaving) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/80" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[81] grid h-[min(90vh,860px)] w-[min(96vw,920px)] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-border bg-background shadow-lg focus:outline-none"
          onEscapeKeyDown={(event) => {
            if (isSaving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isSaving) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (isSaving) event.preventDefault();
          }}
        >
          <TooltipProvider>
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 pb-4 pt-5">
              <div className="min-w-0">
                <DialogPrimitive.Title className="font-mono text-lg font-semibold tracking-tight">
                  Running brief
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 max-w-2xl font-mono text-[11px] text-muted-foreground">
                  Static member context that is appended to the system prompt when enabled.
                </DialogPrimitive.Description>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <DialogPrimitive.Close asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        aria-label="Close running brief"
                        disabled={isSaving}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </DialogPrimitive.Close>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-64 leading-relaxed">
                  {isSaving ? 'Close is disabled while save is in progress.' : 'Close the running brief editor.'}
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onDraftChange({ ...draft, enabled: !draft.enabled })}
                  disabled={isSaving}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    draft.enabled
                      ? 'border-foreground/30 bg-foreground text-background'
                      : 'border-border bg-transparent text-foreground hover:bg-muted/40'
                  }`}
                >
                  Running brief {draft.enabled ? 'On' : 'Off'}
                </button>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Last saved {formatTimestamp(brief?.updatedAt)}
                </span>
              </div>

              {statusMessage ? (
                <div className={`mt-3 font-mono text-[11px] ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {statusMessage}
                </div>
              ) : null}
            </div>

            <div className="min-h-0 overflow-hidden px-5 py-4">
              <div className="mb-2">
                <p className="font-mono text-xs font-semibold">Brief body</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  Write the exact context you want appended to this member&apos;s system prompt.
                </p>
              </div>
              <textarea
                className="h-[calc(100%-2.5rem)] min-h-0 w-full resize-none rounded-lg border border-border bg-background px-4 py-4 text-sm leading-relaxed focus-visible:border-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                value={draft.rawBody}
                onChange={(event) => onDraftChange({ ...draft, rawBody: event.target.value })}
                placeholder="Paste the running brief here."
                disabled={isSaving}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <p className="min-w-0 flex-1 font-mono text-[10px] text-muted-foreground">
                This brief is injected only when enabled, non-empty, and not disabled for the current conversation.
              </p>
              <Button type="button" className="h-9 gap-2 rounded-md text-xs" onClick={() => void onSave()} disabled={isSaving}>
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
            </div>
          </TooltipProvider>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
