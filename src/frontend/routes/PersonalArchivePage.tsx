import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Loader2,
  Mic,
  Plus,
  Save,
  Search,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '../components/ui/button';
import { convexRepository } from '../repository/ConvexCouncilRepository';
import type {
  PersonalArchiveBucket,
  PersonalArchiveEntry,
} from '../types/domain';
import { LiveWaveform } from '../features/chat/LiveWaveform';
import {
  PERSONAL_ARCHIVE_BUCKET_ORDER as BUCKET_ORDER,
  getPersonalArchiveBucketLabel as bucketLabel,
  usePersonalArchiveCaptureFlow,
} from '../features/archive/usePersonalArchiveCaptureFlow';

export function PersonalArchivePage() {
  const [identity, setIdentity] = useState('');
  const [savedIdentity, setSavedIdentity] = useState('');
  const [entries, setEntries] = useState<PersonalArchiveEntry[]>([]);
  const [search, setSearch] = useState('');
  const [pageBusy, setPageBusy] = useState<'load' | 'identity' | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [editor, setEditor] = useState<PersonalArchiveEntry | null>(null);
  const deferredSearch = useDeferredValue(search);

  async function loadArchive() {
    setPageBusy('load');
    setPageError(null);
    try {
      const [profile, entryRows] = await Promise.all([
        convexRepository.getPersonalArchiveProfile(),
        convexRepository.listPersonalArchiveEntries(false),
      ]);
      const nextIdentity = profile?.identity ?? '';
      setIdentity(nextIdentity);
      setSavedIdentity(nextIdentity);
      setEntries(entryRows);
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : 'Could not load Personal Archive.');
    } finally {
      setPageBusy(null);
    }
  }

  const {
    captureLabel,
    setCaptureLabel,
    captureText,
    setCaptureText,
    captureBucket,
    setCaptureBucket,
    preview,
    draftEntries,
    setDraftEntries,
    busy: captureBusy,
    error: captureError,
    successMessage: captureSuccessMessage,
    recorder,
    previewTextCapture,
    handleFileCapture,
    stopVoiceCapture,
    commitPreview,
  } = usePersonalArchiveCaptureFlow({ onCommitted: loadArchive });

  useEffect(() => {
    void loadArchive();
  }, []);

  const groupedEntries = useMemo(() => {
    const normalized = deferredSearch.trim().toLowerCase();
    const filtered = !normalized
      ? entries
      : entries.filter((entry) =>
          `${entry.title ?? ''}\n${entry.content}`.toLowerCase().includes(normalized),
        );

    return BUCKET_ORDER.map((bucket) => ({
      bucket,
      label: bucketLabel(bucket),
      entries: filtered.filter((entry) => entry.bucket === bucket),
    }));
  }, [deferredSearch, entries]);

  const saveIdentity = async () => {
    setPageBusy('identity');
    setPageError(null);
    try {
      const profile = await convexRepository.updatePersonalArchiveIdentity(identity.trim());
      setIdentity(profile.identity);
      setSavedIdentity(profile.identity);
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : 'Could not save identity.');
    } finally {
      setPageBusy(null);
    }
  };

  const archiveEntry = async (entryId: string) => {
    setPageError(null);
    try {
      await convexRepository.archivePersonalArchiveEntry(entryId);
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : 'Could not archive entry.');
    }
  };

  const deleteEntry = async (entryId: string) => {
    setPageError(null);
    try {
      await convexRepository.deletePersonalArchiveEntry(entryId);
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
      setEditor((current) => (current?.id === entryId ? null : current));
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : 'Could not delete entry.');
    }
  };

  const saveEntryEdit = async () => {
    if (!editor) return;
    setPageError(null);
    try {
      await convexRepository.updatePersonalArchiveEntry({
        entryId: editor.id,
        bucket: editor.bucket,
        title: editor.title,
        content: editor.content,
      });
      setEntries((current) =>
        current.map((entry) =>
          entry.id === editor.id
            ? { ...entry, bucket: editor.bucket, title: editor.title, content: editor.content, updatedAt: Date.now() }
            : entry,
        ),
      );
      setEditor(null);
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : 'Could not update entry.');
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Personal Archive</p>
                <h1 className="mt-2 font-display text-3xl leading-none">Identity and private context, on your terms.</h1>
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                  Identity is always-on orientation for every member. Everything else is review-first, bucketed, and retrievable only when it helps.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/70 px-3 py-2 text-right">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Entries</p>
                <p className="font-mono text-xl font-semibold">{entries.length}</p>
              </div>
            </div>
          </div>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-semibold">Identity</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  Always prepended to member system prompts as orientation, never used for vector retrieval.
                </p>
              </div>
              <Button
                className="h-8 gap-2 rounded-md text-xs"
                onClick={() => void saveIdentity()}
                disabled={pageBusy === 'identity' || identity.trim() === savedIdentity.trim()}
              >
                {pageBusy === 'identity' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save identity
              </Button>
            </div>
            <textarea
              className="mt-4 min-h-44 w-full rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-foreground/30"
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
              placeholder="You are talking to ..., here is who they are, what matters to them, and how to interpret them..."
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-semibold">Capture</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  Paste text, upload a file, or record a voice note. The system proposes entries; nothing is stored until you confirm.
                </p>
              </div>
              {pageBusy === 'load' ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>

            <div className="mt-4 grid gap-3">
              <input
                className="h-10 rounded-xl border border-border bg-background/60 px-3 text-sm outline-none transition focus:border-foreground/30"
                value={captureLabel}
                onChange={(event) => setCaptureLabel(event.target.value)}
                placeholder="Optional label"
              />
              <select
                className="h-10 rounded-xl border border-border bg-background/60 px-3 text-sm outline-none transition focus:border-foreground/30"
                value={captureBucket}
                onChange={(event) => setCaptureBucket(event.target.value as 'auto' | PersonalArchiveBucket)}
              >
                <option value="auto">Auto route bucket</option>
                {BUCKET_ORDER.map((bucket) => (
                  <option key={bucket} value={bucket}>
                    Force: {bucketLabel(bucket)}
                  </option>
                ))}
              </select>
              <textarea
                className="min-h-36 rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-foreground/30"
                value={captureText}
                onChange={(event) => setCaptureText(event.target.value)}
                placeholder="Paste a reflection, theory, mirror statement, resilient memory, or anything else you want available in context later."
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="h-9 gap-2 rounded-md text-xs"
                  onClick={() => void previewTextCapture()}
                  disabled={captureBusy === 'preview' || !captureText.trim()}
                >
                  {captureBusy === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Parse capture
                </Button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-xs transition hover:border-foreground/20 hover:bg-muted/40">
                  <Upload className="h-3.5 w-3.5" />
                  Upload file
                  <input
                    type="file"
                    className="hidden"
                    disabled={captureBusy === 'preview'}
                    onChange={(event) => {
                      void handleFileCapture(event.target.files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                {!recorder.isRecording ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 gap-2 rounded-md text-xs"
                    onClick={() => void recorder.startRecording()}
                    disabled={captureBusy === 'preview'}
                  >
                    <Mic className="h-3.5 w-3.5" />
                    Voice note
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 gap-2 rounded-md text-xs"
                    onClick={() => void stopVoiceCapture()}
                  >
                    <Square className="h-3.5 w-3.5" />
                    Stop recording
                  </Button>
                )}
              </div>

              {recorder.isRecording ? (
                <div className="rounded-2xl border border-border bg-background/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Recording live voice note</span>
                    <span>{recorder.durationSec}s</span>
                  </div>
                  <LiveWaveform audioStream={recorder.audioStream} />
                </div>
              ) : null}
            </div>
          </section>
        </section>

        <section className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-semibold">Review</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  Edit the proposed items and buckets before they enter the archive.
                </p>
              </div>
              <Button
                className="h-8 gap-2 rounded-md text-xs"
                onClick={() => void commitPreview()}
                disabled={captureBusy === 'commit' || !preview || draftEntries.length === 0 || preview.parseStatus !== 'ready'}
              >
                {captureBusy === 'commit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                Commit reviewed entries
              </Button>
            </div>

            {!preview ? (
              <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No capture in review. Parse a text block, uploaded file, or voice note to stage entries here.
              </div>
            ) : preview.parseStatus === 'failed' ? (
              <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                {preview.parseError || 'Capture parsing failed.'}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {draftEntries.map((entry, index) => (
                  <article key={`${preview.captureId}-${index}`} className="rounded-2xl border border-border bg-background/55 p-3">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <select
                        className="h-9 rounded-md border border-border bg-background px-3 text-xs outline-none"
                        value={entry.bucket}
                        onChange={(event) =>
                          setDraftEntries((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, bucket: event.target.value as PersonalArchiveBucket }
                                : item,
                            ),
                          )
                        }
                      >
                        {BUCKET_ORDER.map((bucket) => (
                          <option key={bucket} value={bucket}>
                            {bucketLabel(bucket)}
                          </option>
                        ))}
                      </select>
                      <input
                        className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-xs outline-none"
                        value={entry.title}
                        onChange={(event) =>
                          setDraftEntries((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, title: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="Optional title"
                      />
                    </div>
                    <textarea
                      className="min-h-28 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
                      value={entry.content}
                      onChange={(event) =>
                        setDraftEntries((current) =>
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

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-semibold">Library</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  Search active entries and edit, archive, or delete them individually.
                </p>
              </div>
              <div className="relative w-full max-w-52">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-xs outline-none transition focus:border-foreground/30"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search archive"
                />
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {groupedEntries.map((group) => (
                <section key={group.bucket}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {group.label}
                    </p>
                    <span className="font-mono text-[10px] text-muted-foreground">{group.entries.length}</span>
                  </div>
                  {group.entries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                      No active entries in this bucket.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {group.entries.map((entry) => (
                        <article key={entry.id} className="rounded-2xl border border-border bg-background/55 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-xs font-semibold">
                                {entry.title?.trim() || 'Untitled entry'}
                              </p>
                              <p className="mt-1 line-clamp-4 text-sm text-muted-foreground">{entry.content}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-md px-2 text-[10px]"
                                onClick={() => setEditor(entry)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-md px-2 text-[10px]"
                                onClick={() => void archiveEntry(entry.id)}
                              >
                                Archive
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => void deleteEntry(entry.id)}
                                title="Delete entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </section>

          {captureError || pageError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {captureError ?? pageError}
            </div>
          ) : null}
          {captureSuccessMessage ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              {captureSuccessMessage}
            </div>
          ) : null}
        </section>
      </div>

      <DialogPrimitive.Root open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/80" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[81] flex h-[min(88vh,760px)] w-[min(95vw,820px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-background p-4 shadow-2xl focus:outline-none md:p-5">
            <DialogPrimitive.Title className="font-mono text-lg font-semibold tracking-tight">Edit archive entry</DialogPrimitive.Title>
            {editor ? (
              <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
                <select
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none"
                  value={editor.bucket}
                  onChange={(event) => setEditor((current) => (current ? { ...current, bucket: event.target.value as PersonalArchiveBucket } : current))}
                >
                  {BUCKET_ORDER.map((bucket) => (
                    <option key={bucket} value={bucket}>
                      {bucketLabel(bucket)}
                    </option>
                  ))}
                </select>
                <input
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none"
                  value={editor.title ?? ''}
                  onChange={(event) => setEditor((current) => (current ? { ...current, title: event.target.value } : current))}
                  placeholder="Optional title"
                />
                <textarea
                  className="min-h-[340px] rounded-2xl border border-border bg-background px-3 py-2 text-sm outline-none"
                  value={editor.content}
                  onChange={(event) => setEditor((current) => (current ? { ...current, content: event.target.value } : current))}
                />
              </div>
            ) : null}
            <div className="mt-4 flex items-center gap-2">
              <Button type="button" className="h-8 gap-2 rounded-md text-xs" onClick={() => void saveEntryEdit()}>
                <Save className="h-3.5 w-3.5" />
                Save changes
              </Button>
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" className="h-8 rounded-md text-xs">
                  Cancel
                </Button>
              </DialogPrimitive.Close>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
