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

function formatDate(epochMs: number) {
  return new Date(epochMs).toLocaleDateString([], {
    dateStyle: "long",
  });
}

function ParticipantAvatar({
  avatarUrl,
  name,
  size = "md",
}: {
  avatarUrl: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-14 w-14",
  };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClasses[size]} shrink-0 rounded-full border border-border/60 object-cover`}
      />
    );
  }

  return (
    <UserCircle2
      className={`${sizeClasses[size]} shrink-0 text-muted-foreground/50`}
      aria-label={name}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Entry card — visual treatment varies by role                      */
/* ------------------------------------------------------------------ */

function EntryCard({
  entry,
  copiedEntrySequence,
  onCopy,
  animationDelay,
}: {
  entry: PublicRoundtableEntry;
  copiedEntrySequence: number | null;
  onCopy: (entry: PublicRoundtableEntry) => void;
  animationDelay: number;
}) {
  const isPrompt = entry.role === "user";
  const isFinalSynthesis = entry.isFinalSynthesis;
  const speakerName =
    entry.speakerName ??
    (isPrompt ? "Prompt" : isFinalSynthesis ? "The Council" : "Reply");

  const isCopied = copiedEntrySequence === entry.sequence;

  /* ── Prompt entries ───────────────────────────────────────────── */
  if (isPrompt) {
    return (
      <article
        className="group relative rounded-2xl border border-border/50 bg-muted/40 px-5 py-5 md:px-6"
        style={{
          animation: `pub-fade-in 420ms ease-out ${animationDelay}ms both`,
        }}
      >
        {/* left accent */}
        <div className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-muted-foreground/25" />

        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Q
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {speakerName}
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              {typeof entry.roundNumber === "number"
                ? `Round ${entry.roundNumber} · `
                : ""}
              {formatDateTime(entry.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCopy(entry)}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-muted-foreground group-hover:opacity-100"
          >
            {isCopied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {isCopied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mt-3 text-sm leading-relaxed">
          <MarkdownMessage content={entry.content} />
        </div>
      </article>
    );
  }

  /* ── Final synthesis ──────────────────────────────────────────── */
  if (isFinalSynthesis) {
    return (
      <article
        className="pub-synthesis group relative overflow-hidden rounded-2xl border border-border/60 px-5 py-5 md:px-6"
        style={{
          animation: `pub-fade-in 420ms ease-out ${animationDelay}ms both`,
        }}
      >
        {/* subtle gradient tint */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-primary/[0.02]" />

        <div className="relative flex items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-[9px] font-bold uppercase tracking-[0.22em] text-background">
            TC
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-foreground/80">
              {speakerName}
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              {typeof entry.roundNumber === "number"
                ? `Round ${entry.roundNumber} · `
                : ""}
              {formatDateTime(entry.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCopy(entry)}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-muted-foreground group-hover:opacity-100"
          >
            {isCopied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {isCopied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="relative mt-4 text-sm leading-relaxed">
          <MarkdownMessage content={entry.content} />
        </div>
      </article>
    );
  }

  /* ── Member entries (default) ─────────────────────────────────── */
  return (
    <article
      className="group rounded-2xl border border-border/40 bg-card px-5 py-5 md:px-6"
      style={{
        animation: `pub-fade-in 420ms ease-out ${animationDelay}ms both`,
      }}
    >
      <div className="flex items-start gap-3">
        <ParticipantAvatar
          avatarUrl={entry.speakerAvatarUrl}
          name={speakerName}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{speakerName}</p>
              <p className="text-[11px] text-muted-foreground/70">
                {typeof entry.roundNumber === "number"
                  ? `Round ${entry.roundNumber} · `
                  : ""}
                {formatDateTime(entry.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCopy(entry)}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-muted-foreground group-hover:opacity-100"
            >
              {isCopied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {isCopied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="mt-3 text-sm leading-relaxed">
            <MarkdownMessage content={entry.content} />
          </div>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

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

  /* ── Loading ──────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="grid min-h-svh place-items-center bg-background px-6">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading public roundtable…
          </p>
        </div>
      </div>
    );
  }

  /* ── Not found ────────────────────────────────────────────────── */
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

  /* ── Error ────────────────────────────────────────────────────── */
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

  /* ── Round separators ─────────────────────────────────────────── */
  const entriesWithSeparators = buildEntriesWithRoundLabels(payload.entries);

  /* ── Main content ─────────────────────────────────────────────── */
  return (
    <div className="pub-page min-h-svh bg-background text-foreground">
      {/* Inject scoped keyframes */}
      <style>{`
        @keyframes pub-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-10 md:px-6 md:py-16">
        {/* ── Hero header ───────────────────────────────────────── */}
        <header
          className="flex flex-col"
          style={{ animation: "pub-fade-in 500ms ease-out both" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/80">
            Public Roundtable
          </p>

          <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight md:text-[2.5rem] md:leading-[1.15]">
            {payload.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <span>Closed {formatDate(payload.closedAt)}</span>
            <span className="hidden text-border sm:inline">·</span>
            <span className="hidden sm:inline">
              {payload.entries.length} messages
            </span>
          </div>

          {/* ── Participants strip ──────────────────────────────── */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {payload.participants.map((participant) => (
              <div
                key={`${participant.name}-${participant.avatarUrl ?? "none"}`}
                className="flex items-center gap-2.5 rounded-full border border-border/50 bg-muted/30 px-3 py-1.5 transition-colors hover:bg-muted/60"
              >
                <ParticipantAvatar
                  avatarUrl={participant.avatarUrl}
                  name={participant.name}
                  size="sm"
                />
                <span className="text-[13px] font-medium">
                  {participant.name}
                </span>
              </div>
            ))}
          </div>

          {/* ── Share bar ───────────────────────────────────────── */}
          <div className="mt-6 flex items-center gap-3 border-t border-border/40 pt-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2 rounded-full px-4 text-xs"
              onClick={() => void copyLink()}
            >
              {copiedLink ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              {copiedLink ? "Copied link" : "Share link"}
            </Button>
          </div>
        </header>

        {/* ── Divider ───────────────────────────────────────────── */}
        <div className="my-8 h-px bg-border/40 md:my-10" />

        {/* ── Transcript ────────────────────────────────────────── */}
        <section className="flex flex-col gap-4">
          {entriesWithSeparators.map((item) => {
            if (item.kind === "separator") {
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-3 py-2"
                  style={{
                    animation: `pub-fade-in 420ms ease-out ${item.delay}ms both`,
                  }}
                >
                  <div className="h-px flex-1 bg-border/30" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/60">
                    Round {item.roundNumber}
                  </span>
                  <div className="h-px flex-1 bg-border/30" />
                </div>
              );
            }

            return (
              <EntryCard
                key={`${item.entry.sequence}-${item.entry.createdAt}`}
                entry={item.entry}
                copiedEntrySequence={copiedEntrySequence}
                onCopy={(e) => void copyEntry(e)}
                animationDelay={item.delay}
              />
            );
          })}
        </section>

        {/* ── Footer ────────────────────────────────────────────── */}
        <footer className="mt-12 flex flex-col items-center gap-2 border-t border-border/30 pt-8 text-center md:mt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground/50">
            The Council
          </p>
          <p className="text-[11px] text-muted-foreground/40">
            Published {formatDate(payload.publishedAt)}
          </p>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers – build a flat list with round separators interleaved      */
/* ------------------------------------------------------------------ */

type TranscriptItem =
  | { kind: "entry"; entry: PublicRoundtableEntry; delay: number }
  | { kind: "separator"; roundNumber: number; key: string; delay: number };

function buildEntriesWithRoundLabels(
  entries: PublicRoundtableEntry[],
): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  let lastRound: number | undefined;
  let delayIndex = 0;
  const DELAY_STEP = 40; // ms between items
  const MAX_ANIMATED = 12; // cap animation to first N items

  for (const entry of entries) {
    const round = entry.roundNumber;
    if (round !== undefined && round !== lastRound) {
      const delay = delayIndex < MAX_ANIMATED ? delayIndex * DELAY_STEP : 0;
      items.push({
        kind: "separator",
        roundNumber: round,
        key: `round-${round}`,
        delay,
      });
      delayIndex += 1;
      lastRound = round;
    }

    const delay = delayIndex < MAX_ANIMATED ? delayIndex * DELAY_STEP : 0;
    items.push({ kind: "entry", entry, delay });
    delayIndex += 1;
  }

  return items;
}
