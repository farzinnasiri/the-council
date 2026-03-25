import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  History,
  Loader2,
  MessagesSquare,
  Plus,
  UserCircle2,
  Users2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { useAppStore } from '../store/appStore';
import { cn } from '../lib/utils';
import { formatSessionTime } from '../lib/time';

type QuickStartView = 'root' | 'hall' | 'member' | 'memberThreads';

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

  const activeMembers = useMemo(() => members.filter((member) => !member.deletedAt), [members]);
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

  if (view === 'hall') {
    const recentHalls = conversations
      .filter((conversation) => conversation.kind === 'hall' && !conversation.deletedAt)
      .slice(0, 5);

    return (
      <PageFrame>
        <CenteredQuickStartLayout
          stage={
            <section className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <QuickStageCard
                  title="Advisory Hall"
                  meta="Fast mode. Active members answer each turn."
                  icon={<MessagesSquare className="h-5 w-5" />}
                  onClick={() => navigate('/hall/new?mode=advisory')}
                />
                <QuickStageCard
                  title="Roundtable Hall"
                  meta="Deliberation mode with guided next speakers."
                  icon={<Users2 className="h-5 w-5" />}
                  onClick={() => navigate('/hall/new?mode=roundtable')}
                />
              </div>

              <section className="border border-border bg-card">
                <div className="border-b border-border px-4 py-3 text-sm font-medium">Recent halls</div>
                <CompactActionList>
                  {recentHalls.length > 0 ? (
                    recentHalls.map((hall) => (
                      <CompactActionRow
                        key={hall.id}
                        icon={<History className="h-4 w-4" />}
                        label={hall.title}
                        meta={formatSessionTime(hall.updatedAt)}
                        onClick={() => navigate(`/hall/${hall.id}`)}
                      />
                    ))
                  ) : (
                    <EmptyListMessage>No halls yet.</EmptyListMessage>
                  )}
                </CompactActionList>
              </section>
            </section>
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
            <section className="border border-border bg-card">
              <div className="border-b border-border px-4 py-3 text-sm font-medium">Choose a member</div>
              <CompactActionList>
                {activeMembers.length > 0 ? (
                  activeMembers.map((member) => {
                    const threads = listChamberThreadsForMember(member.id);
                    return (
                      <CompactActionRow
                        key={member.id}
                        icon={
                          member.avatarUrl ? (
                            <img src={member.avatarUrl} alt={member.name} className="h-9 w-9 rounded-full object-cover" />
                          ) : (
                            <Avatar className="h-9 w-9 rounded-full border border-border">
                              <AvatarFallback className="bg-muted text-xs font-medium">
                                {member.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          )
                        }
                        label={member.name}
                        meta={threads.length > 0 ? `${threads.length} thread${threads.length === 1 ? '' : 's'}` : 'No threads yet'}
                        onClick={() => {
                          setSelectedMemberId(member.id);
                          setView('memberThreads');
                        }}
                      />
                    );
                  })
                ) : (
                  <EmptyListMessage>No members yet.</EmptyListMessage>
                )}
              </CompactActionList>
            </section>
          }
          back={<ReachBackRow onBack={handleBack} />}
        />
      </PageFrame>
    );
  }

  if (view === 'memberThreads') {
    return (
      <PageFrame>
        <CenteredQuickStartLayout
          stage={
            selectedMember ? (
              <section className="space-y-4">
                <section className="border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{selectedMember.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedMemberThreads.length} total thread{selectedMemberThreads.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      className="gap-2"
                      onClick={() => void beginNewConversation(selectedMember.id)}
                      disabled={creatingMemberId === selectedMember.id}
                    >
                      {creatingMemberId === selectedMember.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      New thread
                    </Button>
                  </div>
                </section>

                <section className="border border-border bg-card">
                  <div className="border-b border-border px-4 py-3 text-sm font-medium">Recent threads</div>
                  <CompactActionList>
                    {selectedMemberThreads.length > 0 ? (
                      selectedMemberThreads.map((thread) => (
                        <CompactActionRow
                          key={thread.id}
                          icon={<MessagesSquare className="h-4 w-4" />}
                          label={thread.title}
                          meta={formatSessionTime(thread.updatedAt)}
                          onClick={() => navigate(`/chamber/${thread.id}`)}
                        />
                      ))
                    ) : (
                      <EmptyListMessage>No previous threads.</EmptyListMessage>
                    )}
                  </CompactActionList>
                </section>
              </section>
            ) : (
              <section className="border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                Member not found.
              </section>
            )
          }
          back={<ReachBackRow onBack={handleBack} />}
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center">
        <div className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
          <QuickStartCard title="New Hall" onClick={() => setView('hall')} />
          <QuickStartCard title="Talk to a Member" onClick={() => setView('member')} />
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
    </PageFrame>
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
  back: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col justify-center gap-4">
      {back}
      {stage}
    </div>
  );
}

function ReachBackRow({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-2 self-start text-sm text-muted-foreground transition hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
}

function QuickStartCard({
  title,
  meta,
  onClick,
  disabled,
}: {
  title: string;
  meta?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-40 flex-col justify-between border border-border bg-card p-5 text-left transition hover:border-foreground/20 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-medium">{title}</p>
          <p className="mt-2 text-sm text-muted-foreground">{meta ?? 'Start here'}</p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </div>
    </button>
  );
}

function QuickStageCard({
  title,
  meta,
  icon,
  onClick,
}: {
  title: string;
  meta: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-36 flex-col justify-between border border-border bg-card p-4 text-left transition hover:border-foreground/20 hover:bg-muted/30"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="grid h-10 w-10 place-items-center border border-border bg-background text-muted-foreground">
          {icon}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-base font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
      </div>
    </button>
  );
}

function CompactActionList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>;
}

function CompactActionRow({
  icon,
  label,
  meta,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center border border-border bg-background text-muted-foreground">
        {typeof icon === 'string' ? <UserCircle2 className="h-4 w-4" /> : icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function EmptyListMessage({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-sm text-muted-foreground">{children}</div>;
}
