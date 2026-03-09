import { useMemo, useState, type ReactNode } from 'react';
import {
  Archive,
  ArrowLeft,
  ChevronRight,
  History,
  Loader2,
  MessagesSquare,
  Mic,
  Plus,
  SendHorizontal,
  Square,
  UserCircle2,
  Users2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { useAppStore } from '../store/appStore';
import { cn } from '../lib/utils';
import { formatSessionTime } from '../lib/time';
import { LiveWaveform } from '../features/chat/LiveWaveform';
import {
  PERSONAL_ARCHIVE_BUCKET_ORDER,
  getPersonalArchiveBucketLabel,
  usePersonalArchiveCaptureFlow,
} from '../features/archive/usePersonalArchiveCaptureFlow';

type QuickStartView = 'root' | 'capture' | 'hall' | 'member' | 'memberThreads';

function getConversationHref(conversationId: string, kind: 'hall' | 'chamber') {
  return kind === 'hall' ? `/hall/${conversationId}` : `/chamber/${conversationId}`;
}

export function QuickStartPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<QuickStartView>('root');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [creatingMemberId, setCreatingMemberId] = useState<string | null>(null);
  const conversations = useAppStore((state) => state.conversations);
  const members = useAppStore((state) => state.members);
  const createChamberThread = useAppStore((state) => state.createChamberThread);
  const listChamberThreadsForMember = useAppStore((state) => state.listChamberThreadsForMember);
  const capture = usePersonalArchiveCaptureFlow();

  const activeMembers = useMemo(
    () => members.filter((member) => !member.deletedAt),
    [members],
  );
  const membersById = useMemo(
    () => new Map(activeMembers.map((member) => [member.id, member])),
    [activeMembers],
  );

  const latestConversation = useMemo(() => {
    return conversations
      .filter((conversation) => !conversation.deletedAt)
      .sort(
        (a, b) =>
          Math.max(b.lastMessageAt ?? 0, b.updatedAt) -
          Math.max(a.lastMessageAt ?? 0, a.updatedAt),
      )[0];
  }, [conversations]);

  const latestConversationMeta = useMemo(() => {
    if (!latestConversation) return null;
    if (latestConversation.kind === 'hall') {
      return {
        href: getConversationHref(latestConversation.id, latestConversation.kind),
        title: latestConversation.title,
        subtitle:
          latestConversation.hallMode === 'roundtable' ? 'Roundtable hall' : 'Advisory hall',
      };
    }

    const member = latestConversation.chamberMemberId
      ? membersById.get(latestConversation.chamberMemberId)
      : undefined;
    return {
      href: getConversationHref(latestConversation.id, latestConversation.kind),
      title: latestConversation.title,
      subtitle: member ? `Chamber · ${member.name}` : 'Chamber thread',
    };
  }, [latestConversation, membersById]);

  const selectedMember = selectedMemberId ? membersById.get(selectedMemberId) ?? null : null;
  const selectedMemberThreads = selectedMember ? listChamberThreadsForMember(selectedMember.id) : [];
  const hasCaptureFollowup =
    capture.busy === 'preview' ||
    !!capture.preview ||
    !!capture.error ||
    !!capture.successMessage;
  const captureComposer = (
    <section className="border border-border bg-card">
      <div className="space-y-4 p-4 md:p-5">
        <QuickBucketPicker
          value={capture.captureBucket}
          onChange={capture.setCaptureBucket}
        />

        <textarea
          aria-label="Capture content"
          className="min-h-56 w-full resize-none border border-border bg-background px-4 py-4 text-base leading-relaxed outline-none transition focus:border-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={capture.captureText}
          onChange={(event) => capture.setCaptureText(event.target.value)}
          placeholder="Capture a thought..."
        />

        <div className="flex items-center justify-between gap-3 pt-6">
          {!capture.recorder.isRecording ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              onClick={() => void capture.recorder.startRecording()}
              disabled={capture.busy === 'preview'}
            >
              <Mic className="h-4 w-4" />
              Voice
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              onClick={() => void capture.stopVoiceCapture()}
            >
              <Square className="h-4 w-4" />
              Stop
            </Button>
          )}

          <Button
            className="rounded-none"
            onClick={() => void capture.previewTextCapture()}
            disabled={capture.busy === 'preview' || !capture.captureText.trim()}
          >
            {capture.busy === 'preview' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
            Send
          </Button>
        </div>

        {capture.recorder.isRecording ? (
          <div className="border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Recording</span>
              <span>{capture.recorder.durationSec}s</span>
            </div>
            <LiveWaveform audioStream={capture.recorder.audioStream} />
          </div>
        ) : null}
      </div>
    </section>
  );

  const handleBack = () => {
    if (view === 'memberThreads') {
      setView('member');
      return;
    }
    setView('root');
  };

  const beginNewConversation = async (memberId: string) => {
    setCreatingMemberId(memberId);
    try {
      const thread = await createChamberThread(memberId);
      navigate(`/chamber/${thread.id}`);
    } finally {
      setCreatingMemberId(null);
    }
  };

  if (view === 'capture') {
    if (!hasCaptureFollowup) {
      return (
        <PageFrame>
          <CenteredQuickStartLayout
            stage={captureComposer}
            back={<ReachBackRow onBack={handleBack} />}
          />
        </PageFrame>
      );
    }

    return (
      <PageFrame>
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col">
          <div
            className={cn(
              'flex flex-1',
              hasCaptureFollowup ? 'items-start justify-center pt-6' : 'items-center justify-center',
            )}
          >
            <div className="w-full max-w-3xl space-y-5">
              {captureComposer}

              {capture.busy === 'preview' ? (
                <section className="border border-border bg-card px-4 py-4 text-sm text-muted-foreground md:px-5">
                  Digesting capture…
                </section>
              ) : null}

              {capture.preview ? (
                <section className="border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
                    <div className="font-mono text-sm font-semibold uppercase tracking-[0.14em]">
                      Review
                    </div>
                    <Button
                      className="rounded-none"
                      onClick={() => void capture.commitPreview()}
                      disabled={
                        capture.busy === 'commit' ||
                        capture.draftEntries.length === 0 ||
                        capture.preview.parseStatus !== 'ready'
                      }
                    >
                      {capture.busy === 'commit' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Save
                    </Button>
                  </div>

                  {capture.preview.parseStatus === 'failed' ? (
                    <div className="border-t border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive md:px-5">
                      {capture.preview.parseError || 'Capture parsing failed.'}
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {capture.draftEntries.map((entry, index) => (
                        <article key={`${capture.preview?.captureId ?? 'draft'}-${index}`} className="space-y-3 p-4 md:p-5">
                          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                            <select
                              aria-label={`Entry ${index + 1} bucket`}
                              className="h-10 border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              value={entry.bucket}
                              onChange={(event) =>
                                capture.setDraftEntries((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          bucket: event.target.value as (typeof PERSONAL_ARCHIVE_BUCKET_ORDER)[number],
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {PERSONAL_ARCHIVE_BUCKET_ORDER.map((bucket) => (
                                <option key={bucket} value={bucket}>
                                  {getPersonalArchiveBucketLabel(bucket)}
                                </option>
                              ))}
                            </select>
                            <input
                              aria-label={`Entry ${index + 1} title`}
                              className="h-10 w-full border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              value={entry.title}
                              onChange={(event) =>
                                capture.setDraftEntries((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, title: event.target.value } : item,
                                  ),
                                )
                              }
                              placeholder="Title"
                            />
                          </div>
                          <textarea
                            aria-label={`Entry ${index + 1} content`}
                            className="min-h-32 w-full border border-border bg-background px-3 py-3 text-sm outline-none transition focus:border-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            value={entry.content}
                            onChange={(event) =>
                              capture.setDraftEntries((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, content: event.target.value } : item,
                                ),
                              )
                            }
                          />
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          </div>
          <ReachBackRow onBack={handleBack} />
        </div>

        {capture.error ? (
          <InlineMessage tone="error">{capture.error}</InlineMessage>
        ) : null}
        {capture.successMessage ? (
          <InlineMessage tone="success">{capture.successMessage}</InlineMessage>
        ) : null}
      </PageFrame>
    );
  }

  if (view === 'hall') {
    return (
      <PageFrame>
        <CenteredQuickStartLayout
          stage={
            <div className="grid w-full gap-3 md:gap-4">
              <QuickStartChoiceCard
                title="Advisory"
                onClick={() => navigate('/hall/new?mode=advisory')}
              />
              <QuickStartChoiceCard
                title="Roundtable"
                onClick={() => navigate('/hall/new?mode=roundtable')}
              />
            </div>
          }
          back={<ReachBackRow onBack={handleBack} />}
        />
      </PageFrame>
    );
  }

  if (view === 'member') {
    return (
      <PageFrame>
        <CenteredQuickStartLayout
          stage={
            <div className="w-full max-h-[65dvh] overflow-y-auto">
              {activeMembers.length === 0 ? (
                <EmptyState
                  title="No members"
                  actionLabel="Open Members"
                  onAction={() => navigate('/members')}
                />
              ) : (
                <ActionList>
                  {activeMembers.map((member) => (
                    <ActionRow
                      key={member.id}
                      label={member.name}
                      leading={
                        <Avatar className="h-12 w-12 rounded-none border border-border bg-background">
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} alt={member.name} className="h-full w-full object-cover" />
                          ) : (
                            <AvatarFallback className="rounded-none bg-background">
                              <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                            </AvatarFallback>
                          )}
                        </Avatar>
                      }
                      onClick={() => {
                        setSelectedMemberId(member.id);
                        setView('memberThreads');
                      }}
                    />
                  ))}
                </ActionList>
              )}
            </div>
          }
          back={<ReachBackRow onBack={handleBack} />}
        />
      </PageFrame>
    );
  }

  if (view === 'memberThreads') {
    return (
      <PageFrame>
        {selectedMember ? (
          <CenteredQuickStartLayout
            stage={
              <div className="flex w-full max-h-[65dvh] flex-col gap-6">
                <NewConversationRow
                  onClick={() => void beginNewConversation(selectedMember.id)}
                  disabled={creatingMemberId === selectedMember.id}
                />

                <section className="flex min-h-0 flex-1 flex-col gap-4">
                  <div className="font-mono text-sm font-semibold uppercase tracking-[0.14em]">
                    Previous Threads
                  </div>
                  {selectedMemberThreads.length > 0 ? (
                    <div className="min-h-0 overflow-y-auto">
                      <CompactActionList>
                        {selectedMemberThreads.map((thread) => (
                          <CompactActionRow
                            key={thread.id}
                            label={thread.title}
                            meta={formatSessionTime(thread.updatedAt)}
                            onClick={() => navigate(`/chamber/${thread.id}`)}
                          />
                        ))}
                      </CompactActionList>
                    </div>
                  ) : (
                    <div className="border-y border-border py-4 text-sm text-muted-foreground">
                      No previous threads.
                    </div>
                  )}
                </section>
              </div>
            }
            back={<ReachBackRow onBack={handleBack} />}
          />
        ) : (
          <CenteredQuickStartLayout
            stage={
              <div className="border-y border-border py-4 text-sm text-muted-foreground">
                Member not found.
              </div>
            }
            back={<ReachBackRow onBack={handleBack} />}
          />
        )}
      </PageFrame>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center">
        <div className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
          <QuickStartCard
            title="New Capture"
            onClick={() => setView('capture')}
          />
          <QuickStartCard
            title="New Hall"
            onClick={() => setView('hall')}
          />
          <QuickStartCard
            title="Talk to a Member"
            onClick={() => setView('member')}
          />
          <QuickStartCard
            title={latestConversationMeta?.title ?? 'Resume'}
            meta={
              latestConversationMeta && latestConversation
                ? `${latestConversationMeta.subtitle} · ${formatSessionTime(latestConversation.updatedAt)}`
                : 'No recent chat'
            }
            onClick={() => {
              if (!latestConversationMeta) return;
              navigate(latestConversationMeta.href);
            }}
            disabled={!latestConversationMeta}
          />
        </div>
      </div>
    </div>
  );
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6">{children}</div>
    </div>
  );
}

function CenteredQuickStartLayout({
  stage,
  back,
}: {
  stage: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 items-center justify-center">
      <div className="flex w-full flex-col gap-6">
        {stage}
        {back}
      </div>
    </div>
  );
}

function ReachBackRow({ onBack }: { onBack: () => void }) {
  return (
    <div className="pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <Button
        type="button"
        variant="ghost"
        onClick={onBack}
        aria-label="Back"
        className="min-h-12 w-full justify-center rounded-none border border-border px-4 text-sm text-muted-foreground hover:bg-muted/20 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ActionList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border border-y border-border">{children}</div>;
}

function CompactActionList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border border-y border-border">{children}</div>;
}

function ActionRow({
  label,
  meta,
  leading,
  onClick,
  disabled = false,
}: {
  label: string;
  meta?: string;
  leading?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      variant="ghost"
      className={cn(
        'h-auto w-full justify-start rounded-none px-0 py-0 text-left text-foreground hover:bg-muted/20 hover:text-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60',
      )}
    >
      <div className="flex min-h-20 w-full items-center gap-4 py-4">
        {leading ? <div className="flex h-12 w-12 shrink-0 items-center justify-center">{leading}</div> : null}
        <div className={cn('min-w-0 flex-1', !leading && 'pl-0')}>
        <div className="font-display text-[clamp(2rem,4vw,3.4rem)] leading-[0.92] tracking-tight">{label}</div>
        {meta ? <div className="mt-2 text-sm text-muted-foreground">{meta}</div> : null}
      </div>
      <div className="flex h-full shrink-0 items-center px-4 text-muted-foreground">
        {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-5 w-5" />}
      </div>
      </div>
    </Button>
  );
}

function CompactActionRow({
  label,
  meta,
  onClick,
  disabled = false,
}: {
  label: string;
  meta?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      variant="ghost"
      className={cn(
        'h-auto w-full justify-start rounded-none px-0 py-0 text-left text-foreground hover:bg-muted/20 hover:text-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60',
      )}
    >
      <div className="flex min-h-16 w-full items-center gap-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-xl font-medium leading-tight md:text-2xl">{label}</div>
          {meta ? <div className="mt-2 text-sm text-muted-foreground">{meta}</div> : null}
        </div>
        <div className="flex h-full shrink-0 items-center px-4 text-muted-foreground">
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-5 w-5" />}
        </div>
      </div>
    </Button>
  );
}

function NewConversationRow({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      variant="outline"
      aria-label="New conversation"
      className={cn(
        'min-h-12 w-full justify-center rounded-none border-border px-4 text-foreground hover:bg-muted/20 hover:text-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60',
      )}
    >
      {disabled ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="h-7 w-7" />}
    </Button>
  );
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <div className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      {children}
    </label>
  );
}

function QuickBucketPicker({
  value,
  onChange,
}: {
  value: 'auto' | (typeof PERSONAL_ARCHIVE_BUCKET_ORDER)[number];
  onChange: (value: 'auto' | (typeof PERSONAL_ARCHIVE_BUCKET_ORDER)[number]) => void;
}) {
  const options: Array<{
    value: 'auto' | (typeof PERSONAL_ARCHIVE_BUCKET_ORDER)[number];
    label: string;
  }> = [
    { value: 'auto', label: 'Auto' },
    ...PERSONAL_ARCHIVE_BUCKET_ORDER.map((bucket) => ({
      value: bucket,
      label: getPersonalArchiveBucketLabel(bucket),
    })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant="outline"
          className={cn(
            'h-9 rounded-none px-3 text-sm',
            value === option.value && 'bg-foreground text-background hover:bg-foreground hover:text-background',
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function InlineMessage({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'border px-4 py-3 text-sm',
        tone === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      )}
    >
      {children}
    </div>
  );
}

function EmptyState({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <Button className="rounded-none" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}

function QuickStartCard({
  title,
  meta,
  onClick,
  disabled = false,
}: {
  title: string;
  meta?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      variant="outline"
      className={cn(
        'h-28 justify-start rounded-none border-border bg-card p-0 text-left text-foreground sm:h-auto sm:aspect-square lg:h-[320px] lg:aspect-auto',
        'hover:bg-muted/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55',
      )}
    >
      <div className="flex h-full w-full items-center justify-center px-4 py-4 md:px-6 md:py-6">
        <div className="flex min-w-0 max-w-[16ch] flex-col items-center justify-center text-center">
          <div className="text-balance font-display text-[clamp(1.3rem,3vw,3rem)] leading-[0.95] tracking-tight break-words">
            {title}
          </div>
          {meta ? (
            <div className="mt-2 max-w-[26ch] text-balance text-[11px] leading-tight text-muted-foreground md:mt-3 md:text-sm">
              {meta}
            </div>
          ) : null}
        </div>
      </div>
    </Button>
  );
}

function QuickStartChoiceCard({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="h-28 justify-center rounded-none border-border bg-card text-center text-foreground hover:bg-muted/20 hover:text-foreground"
    >
      <span className="font-display text-[clamp(2rem,4vw,3.4rem)] leading-[0.95] tracking-tight">
        {title}
      </span>
    </Button>
  );
}
