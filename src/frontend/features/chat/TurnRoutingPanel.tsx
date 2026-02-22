import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

interface RoutingMemberOption {
  id: string;
  name: string;
}

interface TurnRoutingPanelProps {
  mode: 'auto' | 'manual';
  onModeChange: (mode: 'auto' | 'manual') => void;
  memberOptions: RoutingMemberOption[];
  selectedMemberIds: string[];
  onToggleMember: (memberId: string) => void;
  onClearSelection?: () => void;
  disabled?: boolean;
  isRouting?: boolean;
  title?: string;
}

export function TurnRoutingPanel({
  mode,
  onModeChange,
  memberOptions,
  selectedMemberIds,
  onToggleMember,
  onClearSelection,
  disabled = false,
  isRouting = false,
  title = 'Who should answer this turn?',
}: TurnRoutingPanelProps) {
  const selectedSet = new Set(selectedMemberIds);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-3 md:px-8">
      <div className="rounded-xl border border-border bg-card/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{title}</p>
          <div className="inline-flex rounded-full border border-border bg-background/70 p-1">
            <button
              type="button"
              className={cn(
                'rounded-full px-3 py-1 text-xs transition',
                mode === 'auto' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              disabled={disabled}
              onClick={() => onModeChange('auto')}
            >
              Auto
            </button>
            <button
              type="button"
              className={cn(
                'rounded-full px-3 py-1 text-xs transition',
                mode === 'manual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              disabled={disabled}
              onClick={() => onModeChange('manual')}
            >
              Manual
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {mode === 'auto'
            ? isRouting
              ? 'Choosing responders for this turn...'
              : 'AI will choose responders for this turn.'
            : 'You choose exactly who responds on this turn.'}
        </p>

        {mode === 'manual' ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {memberOptions.map((member) => {
                const selected = selectedSet.has(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition',
                      selected
                        ? 'border-primary/60 bg-primary/15 text-foreground'
                        : 'border-border bg-background/70 text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    )}
                    disabled={disabled}
                    onClick={() => onToggleMember(member.id)}
                    aria-pressed={selected}
                  >
                    @{member.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Selected: {selectedMemberIds.length}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={disabled || selectedMemberIds.length === 0 || !onClearSelection}
                onClick={() => onClearSelection?.()}
              >
                Clear selection
              </Button>
            </div>
            {selectedMemberIds.length === 0 ? (
              <p className="mt-2 text-xs text-destructive">Pick at least one member to send in Manual mode.</p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
