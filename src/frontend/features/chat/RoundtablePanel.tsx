import { CheckCircle2, CirclePause, Hand, Loader2 } from 'lucide-react';
import type { Member, RoundtableState } from '../../types/domain';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

interface RoundtablePanelProps {
  state: RoundtableState | null;
  members: Member[];
  onSelectionChange: (roundNumber: number, selectedMemberIds: string[]) => void;
  onStartRound: () => void;
  onContinueRound: () => void;
  isRunning: boolean;
  isPreparing?: boolean;
}

function RoundStatusBadge({
  status,
}: {
  status: RoundtableState['round']['status'] | 'idle' | 'opening';
}) {
  if (status === 'idle') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
        <Hand className="h-3.5 w-3.5" />
        Roundtable ready
      </span>
    );
  }

  if (status === 'opening') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Opening statements
      </span>
    );
  }

  if (status === 'awaiting_user') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
        <Hand className="h-3.5 w-3.5" />
        Hands raised
      </span>
    );
  }

  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Round complete
      </span>
    );
  }

  if (status === 'superseded') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
        Superseded
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
      Round active
    </span>
  );
}

export function RoundtablePanel({
  state,
  members,
  onSelectionChange,
  onStartRound,
  onContinueRound,
  isRunning,
  isPreparing = false,
}: RoundtablePanelProps) {
  const membersById = new Map(members.map((member) => [member.id, member]));

  if (!state) {
    const isBusy = isPreparing || isRunning;
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pt-3 md:px-8">
        <div className="rounded-xl border border-border bg-card/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <RoundStatusBadge status={isRunning ? 'opening' : 'idle'} />
            <Button size="sm" variant="outline" onClick={onContinueRound} disabled={isBusy}>
              Prepare round
            </Button>
          </div>
          {isPreparing ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Collecting hands
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const round = state.round;
  const cap = Math.max(1, state.intents.length);
  const selectedIds = state.intents.filter((intent) => intent.selected).map((intent) => intent.memberId);
  const selectedSet = new Set(selectedIds);
  const isAwaitingUser = round.status === 'awaiting_user';
  const canEdit = isAwaitingUser && !isRunning && !isPreparing;
  const canPrepareNext =
    (round.status === 'completed' || round.status === 'superseded') && !isRunning && !isPreparing;
  const raisedCount = state.intents.filter((intent) => intent.intent !== 'pass').length;
  const passCount = state.intents.length - raisedCount;

  const toggle = (memberId: string) => {
    if (!canEdit) return;
    const next = selectedSet.has(memberId)
      ? selectedIds.filter((id) => id !== memberId)
      : [...selectedIds, memberId].slice(0, cap);
    onSelectionChange(round.roundNumber, next);
  };

  const allPass = state.intents.every((intent) => intent.intent === 'pass');

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-3 md:px-8">
      <div className="rounded-xl border border-border bg-card/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <RoundStatusBadge status={round.status} />
            <p className="text-xs text-muted-foreground">
              Round {round.roundNumber} • {selectedIds.length}/{cap}
            </p>
            <p className="text-xs text-muted-foreground">Raised {raisedCount}</p>
            <p className="text-xs text-muted-foreground">Pass {passCount}</p>
          </div>
          <div className="flex items-center gap-2">
            {canPrepareNext ? (
              <Button size="sm" variant="outline" onClick={onContinueRound} disabled={isPreparing || isRunning}>
                Prepare round
              </Button>
            ) : null}
            {isAwaitingUser ? (
              <Button size="sm" onClick={onStartRound} disabled={!canEdit || selectedIds.length === 0}>
                Start round
              </Button>
            ) : null}
          </div>
        </div>

        {isPreparing ? (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Collecting hands
          </div>
        ) : null}

        {allPass ? <p className="mt-2 text-xs text-muted-foreground">No raised hands for this round.</p> : null}

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {state.intents.map((intent) => {
            const member = membersById.get(intent.memberId);
            const selected = selectedSet.has(intent.memberId);
            const disabled = !canEdit || (!selected && selectedIds.length >= cap);
            return (
              <button
                key={intent.id}
                type="button"
                onClick={() => toggle(intent.memberId)}
                disabled={disabled}
                className={cn(
                  'rounded-lg border p-2 text-left transition',
                  selected ? 'border-primary/60 bg-primary/10' : 'border-border hover:border-foreground/30',
                  disabled && !selected ? 'opacity-60' : ''
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{member?.name ?? intent.memberId}</p>
                  <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {intent.intent === 'pass' ? <CirclePause className="h-3.5 w-3.5" /> : <Hand className="h-3.5 w-3.5" />}
                    {intent.intent}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
