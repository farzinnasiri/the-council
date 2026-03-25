import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { api } from '../../../convex/_generated/api';
import {
  ChevronDown,
  Clipboard,
  Download,
  Loader2,
  LogOut,
  RefreshCcw,
  Save,
  Trash2,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { AvatarUploader } from '../components/members/AvatarUploader';
import { convexRepository } from '../repository/ConvexCouncilRepository';
import { uploadFileToConvexStorage } from '../lib/aiClient';
import { formatSessionTime } from '../lib/time';
import { cn } from '../lib/utils';
import type { KbChunkConfig } from '../repository/CouncilRepository';
import type { PersonalSourceDigest, PersonalSourceDocument } from '../types/domain';
import { DEFAULT_KB_CHUNK_CONFIG, validateKbChunkConfig } from '../constants/kbChunking';

type VoiceValue = 'first_person' | 'second_person' | 'mixed' | 'unknown';

interface DigestDraft {
  displayName: string;
  documentKinds: string;
  semanticClasses: string;
  queryHints: string;
  voice: VoiceValue;
}

interface ChunkInputDraft {
  chunkSizeChars: string;
  chunkOverlapChars: string;
}

export function ProfilePage() {
  const user = useQuery(api.users.viewer);
  const updateUserMutation = useMutation(api.users.update);
  const { signOut } = useAuthActions();

  const [name, setName] = useState('');
  const [profileNote, setProfileNote] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [documents, setDocuments] = useState<PersonalSourceDocument[]>([]);
  const [digests, setDigests] = useState<PersonalSourceDigest[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingCopiedText, setIsCreatingCopiedText] = useState(false);
  const [isCopiedTextDialogOpen, setIsCopiedTextDialogOpen] = useState(false);
  const [copiedTextTitle, setCopiedTextTitle] = useState('');
  const [copiedTextBody, setCopiedTextBody] = useState('');
  const [uploadChunkDraft, setUploadChunkDraft] = useState<ChunkInputDraft>({
    chunkSizeChars: String(DEFAULT_KB_CHUNK_CONFIG.chunkSizeChars),
    chunkOverlapChars: String(DEFAULT_KB_CHUNK_CONFIG.chunkOverlapChars),
  });
  const [chunkInputDrafts, setChunkInputDrafts] = useState<Record<string, ChunkInputDraft>>({});
  const [digestDrafts, setDigestDrafts] = useState<Record<string, DigestDraft>>({});
  const [savingDigestIds, setSavingDigestIds] = useState<Record<string, boolean>>({});
  const [reprocessingIds, setReprocessingIds] = useState<Record<string, boolean>>({});
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});
  const [downloadingIds, setDownloadingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setProfileNote(user.profileNote ?? '');
  }, [user]);

  useEffect(() => {
    if (user && !user.profileNote?.trim()) {
      void convexRepository
        .migrateLegacyProfileNote()
        .catch(() => null);
    }
  }, [user]);

  const loadSources = async () => {
    setDocumentsLoaded(false);
    setDocumentsError(null);
    try {
      const [nextDocuments, nextDigests] = await Promise.all([
        convexRepository.listPersonalSourceDocuments(),
        convexRepository.listPersonalSourceDigests(),
      ]);
      setDocuments(nextDocuments);
      setDigests(nextDigests);
    } catch (error) {
      setDocumentsError(error instanceof Error ? error.message : 'Could not load personal sources.');
    } finally {
      setDocumentsLoaded(true);
    }
  };

  useEffect(() => {
    void loadSources();
  }, []);

  useEffect(() => {
    const hasInFlight = documents.some(
      (document) =>
        document.chunkingStatus === 'pending' ||
        document.chunkingStatus === 'running' ||
        document.indexingStatus === 'pending' ||
        document.indexingStatus === 'running' ||
        document.metadataStatus === 'pending' ||
        document.metadataStatus === 'running',
    );
    if (!hasInFlight) return;

    const timer = window.setInterval(() => {
      void loadSources();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [documents]);

  const digestBySourceName = useMemo(
    () => new Map(digests.map((digest) => [digest.personalSourceName, digest])),
    [digests],
  );

  useEffect(() => {
    setDigestDrafts((current) => {
      const next = { ...current };
      for (const digest of digests) {
        if (next[digest.id]) continue;
        next[digest.id] = {
          displayName: digest.displayName,
          documentKinds: digest.metadata.documentKinds.join(', '),
          semanticClasses: digest.metadata.semanticClasses.join(', '),
          queryHints: digest.metadata.queryHints.join(', '),
          voice: digest.metadata.voice ?? 'unknown',
        };
      }
      return next;
    });
  }, [digests]);

  useEffect(() => {
    setChunkInputDrafts((current) => {
      const next = { ...current };
      for (const document of documents) {
        if (next[document.id]) continue;
        next[document.id] = {
          chunkSizeChars: String(document.chunkConfig.chunkSizeChars),
          chunkOverlapChars: String(document.chunkConfig.chunkOverlapChars),
        };
      }
      return next;
    });
  }, [documents]);

  const onSaveAccount = async () => {
    if (!name.trim()) return;
    setAccountBusy(true);
    try {
      await updateUserMutation({ name: name.trim() });
    } finally {
      setAccountBusy(false);
    }
  };

  const onSaveProfileNote = async () => {
    setProfileBusy(true);
    try {
      await convexRepository.updateProfileNote(profileNote.trim());
    } finally {
      setProfileBusy(false);
    }
  };

  const onAvatarUpload = async (blob: Blob) => {
    setAccountBusy(true);
    try {
      const uploadUrl = await convexRepository.generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      });
      const { storageId } = (await response.json()) as { storageId: string };
      await updateUserMutation({ image: storageId });
    } finally {
      setAccountBusy(false);
    }
  };

  const parseChunkInputDraft = (draft: ChunkInputDraft): KbChunkConfig => ({
    chunkSizeChars: Number(draft.chunkSizeChars.trim()),
    chunkOverlapChars: Number(draft.chunkOverlapChars.trim()),
  });

  const updateChunkInputDraft = (
    documentId: string,
    patch: Partial<ChunkInputDraft>,
    fallback: KbChunkConfig,
  ) => {
    setChunkInputDrafts((current) => ({
      ...current,
      [documentId]: {
        ...(current[documentId] ?? {
          chunkSizeChars: String(fallback.chunkSizeChars),
          chunkOverlapChars: String(fallback.chunkOverlapChars),
        }),
        ...patch,
      },
    }));
  };

  const getChunkInputDraft = (document: PersonalSourceDocument): ChunkInputDraft =>
    chunkInputDrafts[document.id] ?? {
      chunkSizeChars: String(document.chunkConfig.chunkSizeChars),
      chunkOverlapChars: String(document.chunkConfig.chunkOverlapChars),
    };

  const parseCsv = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const onUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nextChunkConfig = parseChunkInputDraft(uploadChunkDraft);
    const configError = validateKbChunkConfig(nextChunkConfig);
    if (configError) {
      setUploadError(configError);
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const staged = await uploadFileToConvexStorage(file);
        const record = await convexRepository.createPersonalSourceRecord({
          stagedFile: staged,
          chunkConfig: nextChunkConfig,
        });
        await convexRepository.processPersonalSource({
          personalSourceDocumentId: record.personalSourceDocumentId,
        });
      }
      await loadSources();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not upload personal sources.');
    } finally {
      setIsUploading(false);
    }
  };

  const onCreateCopiedTextSource = async () => {
    const body = copiedTextBody.trim();
    if (!body) return;
    const nextChunkConfig = parseChunkInputDraft(uploadChunkDraft);
    const configError = validateKbChunkConfig(nextChunkConfig);
    if (configError) {
      setUploadError(configError);
      return;
    }

    const normalizedTitle = copiedTextTitle.trim();
    const fallbackTitle = `copied-text-${new Date().toISOString().slice(0, 10)}`;
    const displayName = normalizedTitle || fallbackTitle;
    const safeFileName =
      displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'copied-text';

    setIsCreatingCopiedText(true);
    setUploadError(null);
    try {
      const file = new File([body], `${safeFileName}.txt`, { type: 'text/plain' });
      const staged = await uploadFileToConvexStorage(file);
      const record = await convexRepository.createPersonalSourceRecord({
        stagedFile: {
          ...staged,
          displayName,
          mimeType: 'text/plain',
        },
        chunkConfig: nextChunkConfig,
      });
      await convexRepository.processPersonalSource({
        personalSourceDocumentId: record.personalSourceDocumentId,
      });
      setCopiedTextTitle('');
      setCopiedTextBody('');
      setIsCopiedTextDialogOpen(false);
      await loadSources();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not create copied text source.');
    } finally {
      setIsCreatingCopiedText(false);
    }
  };

  const onSaveDigest = async (digest: PersonalSourceDigest) => {
    const draft = digestDrafts[digest.id];
    if (!draft) return;
    setSavingDigestIds((current) => ({ ...current, [digest.id]: true }));
    try {
      await convexRepository.updatePersonalSourceDigestMetadata({
        digestId: digest.id,
        displayName: draft.displayName.trim() || digest.displayName,
        metadata: {
          documentKinds: parseCsv(draft.documentKinds),
          semanticClasses: parseCsv(draft.semanticClasses),
          queryHints: parseCsv(draft.queryHints),
          voice: draft.voice,
        },
      });
      await loadSources();
    } finally {
      setSavingDigestIds((current) => {
        const next = { ...current };
        delete next[digest.id];
        return next;
      });
    }
  };

  const onReprocess = async (document: PersonalSourceDocument) => {
    const nextChunkConfig = parseChunkInputDraft(getChunkInputDraft(document));
    const configError = validateKbChunkConfig(nextChunkConfig);
    if (configError) {
      setDocumentsError(configError);
      return;
    }

    setReprocessingIds((current) => ({ ...current, [document.id]: true }));
    try {
      await convexRepository.reprocessPersonalSource({
        personalSourceDocumentId: document.id,
        chunkConfig: nextChunkConfig,
      });
      await loadSources();
    } finally {
      setReprocessingIds((current) => {
        const next = { ...current };
        delete next[document.id];
        return next;
      });
    }
  };

  const onDelete = async (document: PersonalSourceDocument) => {
    setDeletingIds((current) => ({ ...current, [document.id]: true }));
    try {
      await convexRepository.deletePersonalSource({ personalSourceDocumentId: document.id });
      await loadSources();
    } finally {
      setDeletingIds((current) => {
        const next = { ...current };
        delete next[document.id];
        return next;
      });
    }
  };

  const onDownload = async (document: PersonalSourceDocument) => {
    setDownloadingIds((current) => ({ ...current, [document.id]: true }));
    try {
      const url = await convexRepository.getPersonalSourceDownloadUrl({
        personalSourceDocumentId: document.id,
      });
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadingIds((current) => {
        const next = { ...current };
        delete next[document.id];
        return next;
      });
    }
  };

  const displayName = user?.name ?? 'Council Member';
  const email = user?.email ?? '';
  const avatarUrl = user?.image;
  const chunkNumberInputClass =
    'h-10 rounded-lg border border-border bg-background/70 px-3 text-sm [appearance:textfield] focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <h1 className="font-display text-3xl tracking-tight">Profile</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Build the context chamber members should rely on. Keep a stable profile note, add personal sources
            for deeper retrieval, and adjust account details when needed.
          </p>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.45fr)_320px]">
          <main className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  Profile Note
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  This stays pinned in chamber chats. Use it for stable identity, preferences, values, and
                  context you want members to consistently carry.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
                Always available in chamber chat
              </div>
            </div>

            <textarea
              className="mt-5 min-h-56 w-full rounded-lg border border-border bg-background/50 px-4 py-4 text-sm leading-7 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
              value={profileNote}
              onChange={(event) => setProfileNote(event.target.value)}
              placeholder="Add a pinned note about who you are, what matters to you, and the stable context members should understand."
            />

            <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Keep this concise. Sources below are better for long reflections, old essays, journals, and
                quotes.
              </p>
              <Button
                onClick={() => void onSaveProfileNote()}
                disabled={profileBusy || profileNote.trim() === (user?.profileNote ?? '').trim()}
                className="gap-2 self-end sm:self-auto"
              >
                {profileBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save profile note
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-xl font-medium tracking-tight">Personal Sources</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Add diaries, essays, notes, reports, or pasted text about yourself. Chamber members use
                  these sources to surface older patterns, reflections, quotes, wins, and failures when a
                  conversation calls for them.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild variant="outline" className="w-full justify-start sm:w-[220px]">
                  <label className="cursor-pointer">
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Upload source
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      onChange={(event) => {
                        void onUploadFiles(event.target.files);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2 sm:w-[220px]"
                  onClick={() => setIsCopiedTextDialogOpen(true)}
                >
                  <Clipboard className="h-4 w-4" />
                  Paste copied text
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {['Journal entry', 'Reflection', 'Essay draft', 'Self-review', 'Copied notes'].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>

            <details className="group mt-5 rounded-lg border border-border/70 bg-background/35">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                <span>Processing defaults</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
              </summary>
              <div className="grid gap-3 border-t border-border/70 p-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Chunk size</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={50}
                    step={100}
                    className={chunkNumberInputClass}
                    value={uploadChunkDraft.chunkSizeChars}
                    onChange={(event) =>
                      setUploadChunkDraft((current) => ({
                        ...current,
                        chunkSizeChars: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Chunk overlap</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={50}
                    className={chunkNumberInputClass}
                    value={uploadChunkDraft.chunkOverlapChars}
                    onChange={(event) =>
                      setUploadChunkDraft((current) => ({
                        ...current,
                        chunkOverlapChars: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </details>

            {uploadError ? <p className="mt-3 text-sm text-destructive">{uploadError}</p> : null}
            {documentsError ? <p className="mt-3 text-sm text-destructive">{documentsError}</p> : null}

            <div className="mt-6 border-t border-border/60 pt-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-lg font-medium">Library</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review processing, adjust metadata, and refine chunking only when needed.
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {documents.length} source{documents.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="mt-5 space-y-4">
              {!documentsLoaded ? (
                <div className="rounded-lg border border-border/70 bg-background/30 px-6 py-12 text-center text-sm text-muted-foreground">
                  Loading personal sources…
                </div>
              ) : documents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/80 bg-background/25 p-6">
                  <h3 className="text-base font-medium">No personal sources yet</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Start with something small: a diary excerpt, copied reflection, old essay, self-review, or
                    notes from a difficult period all work well.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {['Diary', 'Reflection', 'Essay', 'Report', 'Copied text'].map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                documents.map((document) => {
                  const digest = digestBySourceName.get(document.personalSourceName);
                  const digestDraft = digest ? digestDrafts[digest.id] : null;
                  const chunkInputDraft = getChunkInputDraft(document);
                  const isSavingDigest = digest ? Boolean(savingDigestIds[digest.id]) : false;
                  const isReprocessing = Boolean(reprocessingIds[document.id]);
                  const isDeleting = Boolean(deletingIds[document.id]);
                  const isDownloading = Boolean(downloadingIds[document.id]);
                  const failedStages = [
                    document.chunkingStatus === 'failed' ? 'Chunking' : null,
                    document.indexingStatus === 'failed' ? 'Indexing' : null,
                    document.metadataStatus === 'failed' ? 'Metadata' : null,
                  ].filter(Boolean) as string[];
                  const ingestErrorMessage =
                    document.ingestErrorIndexing?.trim() ||
                    document.ingestErrorChunking?.trim() ||
                    document.ingestErrorMetadata?.trim() ||
                    '';

                  return (
                    <article key={document.id} className="rounded-lg border border-border/70 bg-background/25 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-medium">{document.displayName}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Updated {formatSessionTime(document.updatedAt)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => void onDownload(document)}
                            disabled={isDownloading}
                          >
                            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Download
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => void onReprocess(document)}
                            disabled={isReprocessing}
                          >
                            {isReprocessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                            Reprocess
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2 text-destructive hover:text-destructive"
                            onClick={() => void onDelete(document)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Delete
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 md:grid-cols-3">
                        <StatusPill label="Chunking" status={document.chunkingStatus} />
                        <StatusPill label="Indexing" status={document.indexingStatus} />
                        <StatusPill label="Metadata" status={document.metadataStatus} />
                      </div>

                      {failedStages.length > 0 ? (
                        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                          <p className="font-medium">
                            {failedStages.join(' / ')} failed
                          </p>
                          <p className="mt-1 text-sm text-destructive/90">
                            {ingestErrorMessage || 'No detailed error message was recorded for this source.'}
                          </p>
                        </div>
                      ) : null}

                      {digest ? (
                        <div className="mt-4 space-y-3">
                          <MetadataRow label="Kinds" values={digest.metadata.documentKinds} />
                          <MetadataRow label="Classes" values={digest.metadata.semanticClasses} />
                          {digest.metadata.voice && digest.metadata.voice !== 'unknown' ? (
                            <MetadataRow
                              label="Voice"
                              values={[digest.metadata.voice.replace('_', ' ')]}
                              tone="bg-primary/6 text-foreground"
                            />
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-muted-foreground">
                          Processing is still running. Metadata will appear here once the source is ready.
                        </p>
                      )}

                      <details className="group mt-4 rounded-lg border border-border/70 bg-card/40">
                        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                          <span>Edit metadata and processing</span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
                        </summary>
                        <div className="grid gap-4 border-t border-border/70 p-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-1.5">
                              <span className="text-xs font-medium text-muted-foreground">Chunk size</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={50}
                                step={100}
                                className={chunkNumberInputClass}
                                value={chunkInputDraft.chunkSizeChars}
                                onChange={(event) =>
                                  updateChunkInputDraft(
                                    document.id,
                                    { chunkSizeChars: event.target.value },
                                    document.chunkConfig,
                                  )
                                }
                              />
                            </label>
                            <label className="grid gap-1.5">
                              <span className="text-xs font-medium text-muted-foreground">Chunk overlap</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={50}
                                className={chunkNumberInputClass}
                                value={chunkInputDraft.chunkOverlapChars}
                                onChange={(event) =>
                                  updateChunkInputDraft(
                                    document.id,
                                    { chunkOverlapChars: event.target.value },
                                    document.chunkConfig,
                                  )
                                }
                              />
                            </label>
                          </div>

                          {digest && digestDraft ? (
                            <>
                              <label className="grid gap-1.5">
                                <span className="text-xs font-medium text-muted-foreground">Display name</span>
                                <input
                                  className="h-10 rounded-lg border border-border bg-background/70 px-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                                  value={digestDraft.displayName}
                                  onChange={(event) =>
                                    setDigestDrafts((current) => ({
                                      ...current,
                                      [digest.id]: {
                                        ...current[digest.id],
                                        displayName: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>

                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="grid gap-1.5">
                                  <span className="text-xs font-medium text-muted-foreground">Document kinds</span>
                                  <input
                                    className="h-10 rounded-lg border border-border bg-background/70 px-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                                    value={digestDraft.documentKinds}
                                    onChange={(event) =>
                                      setDigestDrafts((current) => ({
                                        ...current,
                                        [digest.id]: {
                                          ...current[digest.id],
                                          documentKinds: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="diary, essay, notes"
                                  />
                                </label>
                                <label className="grid gap-1.5">
                                  <span className="text-xs font-medium text-muted-foreground">Semantic classes</span>
                                  <input
                                    className="h-10 rounded-lg border border-border bg-background/70 px-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                                    value={digestDraft.semanticClasses}
                                    onChange={(event) =>
                                      setDigestDrafts((current) => ({
                                        ...current,
                                        [digest.id]: {
                                          ...current[digest.id],
                                          semanticClasses: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="failure, reflection, quote"
                                  />
                                </label>
                              </div>

                              <label className="grid gap-1.5">
                                <span className="text-xs font-medium text-muted-foreground">Query hints</span>
                                <textarea
                                  className="min-h-24 rounded-lg border border-border bg-background/70 px-3 py-3 text-sm leading-relaxed focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                                  value={digestDraft.queryHints}
                                  onChange={(event) =>
                                    setDigestDrafts((current) => ({
                                      ...current,
                                      [digest.id]: {
                                        ...current[digest.id],
                                        queryHints: event.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="comma-separated retrieval anchors"
                                />
                              </label>

                              <label className="grid gap-1.5 md:max-w-xs">
                                <span className="text-xs font-medium text-muted-foreground">Voice</span>
                                <select
                                  className="h-10 rounded-lg border border-border bg-background/70 px-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                                  value={digestDraft.voice}
                                  onChange={(event) =>
                                    setDigestDrafts((current) => ({
                                      ...current,
                                      [digest.id]: {
                                        ...current[digest.id],
                                        voice: event.target.value as VoiceValue,
                                      },
                                    }))
                                  }
                                >
                                  <option value="first_person">First person</option>
                                  <option value="second_person">Second person</option>
                                  <option value="mixed">Mixed</option>
                                  <option value="unknown">Unknown</option>
                                </select>
                              </label>

                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  onClick={() => void onSaveDigest(digest)}
                                  disabled={isSavingDigest}
                                  className="gap-2"
                                >
                                  {isSavingDigest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                  Save metadata
                                </Button>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Metadata editing will appear here once processing completes.
                            </p>
                          )}
                        </div>
                      </details>
                    </article>
                  );
                })
              )}
              </div>
            </div>
          </section>
          </main>

          <aside className="space-y-4">
            <section className="rounded-xl border border-border bg-card/90 p-5">
              <div className="flex items-start gap-4">
                <AvatarUploader currentAvatarUrl={avatarUrl} onUpload={onAvatarUpload} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-medium">Account</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These details are administrative. The profile note and source library do the real context work.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Display name</span>
                  <input
                    className="h-10 w-full rounded-lg border border-border bg-background/70 px-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                  />
                </label>

                <div className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Email address</span>
                  <p className="text-sm text-muted-foreground">{email || 'No email connected'}</p>
                </div>

                <Button
                  onClick={() => void onSaveAccount()}
                  disabled={accountBusy || !name.trim() || name === user?.name}
                  className="w-full gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save account
                </Button>
              </div>
            </section>

            <button
              id="signout-btn"
              type="button"
              onClick={() => void signOut()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground transition hover:border-destructive/50 hover:bg-destructive/5 hover:text-foreground active:scale-[0.98]"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </aside>
        </div>
      </div>

      <DialogPrimitive.Root open={isCopiedTextDialogOpen} onOpenChange={setIsCopiedTextDialogOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(92vw,760px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl focus:outline-none">
            <div className="mb-5">
              <DialogPrimitive.Title className="text-lg font-medium">Paste copied text</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                Turn copied notes, journal excerpts, essays, or reflections into a personal source without
                uploading a file.
              </DialogPrimitive.Description>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Source title</span>
                <input
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  value={copiedTextTitle}
                  onChange={(event) => setCopiedTextTitle(event.target.value)}
                  placeholder="Copied notes, journal excerpt, reflection..."
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Text</span>
                <textarea
                  className="min-h-64 rounded-lg border border-border bg-background px-3 py-3 text-sm leading-relaxed focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  value={copiedTextBody}
                  onChange={(event) => setCopiedTextBody(event.target.value)}
                  placeholder="Paste copied text here."
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button
                type="button"
                className="gap-2"
                onClick={() => void onCreateCopiedTextSource()}
                disabled={isCreatingCopiedText || !copiedTextBody.trim()}
              >
                {isCreatingCopiedText ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clipboard className="h-4 w-4" />}
                Create source
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

function StatusPill({
  label,
  status,
}: {
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}) {
  const tone =
    status === 'completed'
      ? 'text-emerald-600'
      : status === 'running'
        ? 'text-sky-500'
        : status === 'failed'
          ? 'text-destructive'
          : 'text-muted-foreground';

  return (
    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/45 px-3 py-2 text-sm">
      <span>{label}</span>
      <span className={tone}>{status}</span>
    </div>
  );
}

function MetadataRow({
  label,
  values,
  tone,
}: {
  label: string;
  values: string[];
  tone?: string;
}) {
  if (values.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={`${label}-${value}`}
            className={cn(
              'rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground',
              tone,
            )}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
