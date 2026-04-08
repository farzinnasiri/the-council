import { Check, Copy, Link2, UserCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { MarkdownMessage } from "../features/chat/MarkdownMessage";
import { resolveConvexSiteUrl } from "../lib/resolveConvexSiteUrl";

interface PublicRoundtableParticipant {
  name: string;
  avatarUrl: string | null;
}

interface PublicRoundtableEntry {
  sequence: number;
  role: "user" | "member" | "system";
  speakerName?: string;
  speakerAvatarUrl: string | null;
  content: string;
  roundNumber?: number;
  createdAt: number;
  isFinalSynthesis: boolean;
}

interface PublicRoundtablePayload {
  title: string;
  hallMode: "roundtable";
  closedAt: number;
  publishedAt: number;
  participants: PublicRoundtableParticipant[];
  entries: PublicRoundtableEntry[];
}

function formatDateTime(epochMs: number) {
  return new Date(epochMs).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function TranscriptAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null;
  name: string;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }

  return (
    <UserCircle2
      className="h-10 w-10 shrink-0 text-muted-foreground/60"
      aria-label={name}
    />
  );
}

export function PublicRoundtablePage() {
  const { slug } = useParams();
  const [payload, setPayload] = useState<PublicRoundtablePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEntrySequence, setCopiedEntrySequence] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const root = document.getElementById("root");
    const previousRootHeight = root?.style.height ?? "";
    const previousRootMinHeight = root?.style.minHeight ?? "";
    const previousRootOverflow = root?.style.overflow ?? "";

    document.body.style.overflow = "auto";
    if (root) {
      root.style.height = "auto";
      root.style.minHeight = "100%";
      root.style.overflow = "visible";
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      if (root) {
        root.style.height = previousRootHeight;
        root.style.minHeight = previousRootMinHeight;
        root.style.overflow = previousRootOverflow;
      }
    };
  }, []);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);

    const siteUrl = resolveConvexSiteUrl().replace(/\/$/u, "");
    void fetch(`${siteUrl}/public/roundtables/${encodeURIComponent(slug)}`, {
      method: "GET",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) {
          setPayload(null);
          setNotFound(true);
          return;
        }
        if (!response.ok) {
          throw new Error("Could not load this public roundtable.");
        }
        const data = (await response.json()) as PublicRoundtablePayload;
        setPayload(data);
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name === "AbortError") return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Could not load this public roundtable.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [slug]);

  const pageUrl = useMemo(() => {
    if (!slug) return window.location.href;
    return `${window.location.origin}/public/roundtable/${slug}`;
  }, [slug]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1200);
    } catch {
      setCopiedLink(false);
    }
  };

  const copyEntry = async (entry: PublicRoundtableEntry) => {
    try {
      await navigator.clipboard.writeText(entry.content);
      setCopiedEntrySequence(entry.sequence);
      window.setTimeout(() => setCopiedEntrySequence(null), 1200);
    } catch {
      setCopiedEntrySequence(null);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-svh place-items-center bg-background px-6">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading public roundtable...
          </p>
        </div>
      </div>
    );
  }

  if (notFound || !payload) {
    return (
      <div className="grid min-h-svh place-items-center bg-background px-6">
        <div className="max-w-md text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Public Roundtable
          </p>
          <h1 className="mt-4 font-display text-3xl text-foreground">
            This public page is unavailable
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The link may be invalid, or the owner may have unpublished the
            roundtable.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-svh place-items-center bg-background px-6">
        <div className="max-w-md text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Public Roundtable
          </p>
          <h1 className="mt-4 font-display text-3xl text-foreground">
            Could not load this page
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
        <header className="rounded-[28px] border border-border/80 bg-card px-5 py-6 shadow-sm md:px-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Public Roundtable
              </p>
              <h1 className="mt-3 font-display text-3xl leading-tight md:text-4xl">
                {payload.title}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Closed {formatDateTime(payload.closedAt)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 gap-2 self-start"
              onClick={() => void copyLink()}
            >
              {copiedLink ? (
                <Check className="h-4 w-4" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {copiedLink ? "Copied link" : "Copy link"}
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {payload.participants.map((participant) => (
              <div
                key={`${participant.name}-${participant.avatarUrl ?? "none"}`}
                className="flex items-center gap-3 rounded-full border border-border/80 bg-background px-3 py-2"
              >
                <TranscriptAvatar
                  avatarUrl={participant.avatarUrl}
                  name={participant.name}
                />
                <span className="text-sm font-medium">{participant.name}</span>
              </div>
            ))}
          </div>
        </header>

        <section className="flex flex-col gap-4">
          {payload.entries.map((entry) => {
            const isPrompt = entry.role === "user";
            const isFinalSynthesis = entry.isFinalSynthesis;
            const speakerName =
              entry.speakerName ??
              (isPrompt ? "Prompt" : isFinalSynthesis ? "The Council" : "Reply");

            return (
              <article
                key={`${entry.sequence}-${entry.createdAt}`}
                className="rounded-[24px] border border-border/70 bg-card px-4 py-4 shadow-sm md:px-5"
              >
                <div className="flex items-start gap-3">
                  {entry.role === "member" ? (
                    <TranscriptAvatar
                      avatarUrl={entry.speakerAvatarUrl}
                      name={speakerName}
                    />
                  ) : (
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-background text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isFinalSynthesis ? "TC" : "Q"}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {speakerName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {typeof entry.roundNumber === "number"
                            ? `Round ${entry.roundNumber} · `
                            : ""}
                          {formatDateTime(entry.createdAt)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-2 self-start text-muted-foreground"
                        onClick={() => void copyEntry(entry)}
                      >
                        {copiedEntrySequence === entry.sequence ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedEntrySequence === entry.sequence
                          ? "Copied"
                          : "Copy"}
                      </Button>
                    </div>

                    <div className="mt-4 text-sm leading-relaxed">
                      <MarkdownMessage content={entry.content} />
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
