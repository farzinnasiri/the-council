import { CheckCircle2, Hand, Loader2 } from 'lucide-react';
import type { Member, RoundtableState } from '../../types/domain';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { deriveRoundtableViewModel } from './roundtableViewModel';

interface RoundtablePanelProps {
  state: RoundtableState | null;
  members: Member[];
  onSpeakNext: (memberId: string) => void;
  onFinishRound: () => void;
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
        Opening round
      </span>
    );
  }

  if (status === 'awaiting_user') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
        <Hand className="h-3.5 w-3.5" />
        Pick next speaker
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
  onSpeakNext,
  onFinishRound,
  onContinueRound,
  isRunning,
  isPreparing = false,
}: RoundtablePanelProps) {
  if (!state) {
    const isBusy = isPreparing || isRunning;
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pt-2 md:px-8">
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
  const view = deriveRoundtableViewModel(state, members);
  const isAwaitingUser = round.status === 'awaiting_user';
  const canPrepareNext =
    (round.status === 'completed' || round.status === 'superseded') && !isPreparing && !isRunning;
  const canChooseNext = isAwaitingUser && !isPreparing && !isRunning;
  const showChoices = isAwaitingUser && view.remainingCount > 0;
  const showFallbackChoices = showChoices && view.fallbackChoices.length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-2 md:px-8">
      <div className="rounded-xl border border-border bg-card/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <RoundStatusBadge status={view.isOpeningRound && isRunning ? 'opening' : round.status} />
            <p className="text-xs text-muted-foreground">
              Round {round.roundNumber} • spoken {view.spokenCount}/{Math.max(1, round.maxSpeakers)}
            </p>
            {round.status === 'awaiting_user' ? (
              <p className="text-xs text-muted-foreground">
                {view.volunteeredChoices.length > 0
                  ? `${view.volunteeredChoices.length} raised hand${view.volunteeredChoices.length === 1 ? '' : 's'}`
                  : 'No raised hands'}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {isAwaitingUser ? (
              <Button size="sm" variant="outline" onClick={onFinishRound} disabled={isPreparing || isRunning}>
                End round
              </Button>
            ) : null}
            {canPrepareNext ? (
              <Button size="sm" variant="outline" onClick={onContinueRound} disabled={isPreparing || isRunning}>
                Prepare round
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

        {view.isOpeningRound ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Everyone gives one opener before the table moves into moderated rounds.
          </p>
        ) : null}

        {round.status === 'in_progress' ? (
          <p className="mt-2 text-xs text-muted-foreground">Waiting for the current speaker to finish.</p>
        ) : null}

        {round.status === 'awaiting_user' && view.volunteeredChoices.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No one raised a hand. You can pick any participant or end the round.
          </p>
        ) : null}

        {round.status === 'completed' && view.spokenCount === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">This round ended without any member speaking.</p>
        ) : null}

        {showChoices ? (
          <div className="mt-3 space-y-3">
            {view.volunteeredChoices.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Raised Hands</p>
                <div className="flex flex-wrap gap-2">
                  {view.volunteeredChoices.map((choice) => (
                    <Button
                      key={choice.memberId}
                      size="sm"
                      className="rounded-full"
                      onClick={() => onSpeakNext(choice.memberId)}
                      disabled={!canChooseNext}
                    >
                      <Hand className="mr-1.5 h-3.5 w-3.5" />
                      {choice.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {showFallbackChoices ? (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Pick Anyone</p>
                <div className="flex flex-wrap gap-2">
                  {view.fallbackChoices.map((choice) => (
                    <Button
                      key={choice.memberId}
                      size="sm"
                      variant="outline"
                      className={cn('rounded-full')}
                      onClick={() => onSpeakNext(choice.memberId)}
                      disabled={!canChooseNext}
                    >
                      {choice.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {view.spokenNames.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Spoke
            </span>
            <span>{view.spokenNames.join(', ')}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
