import { useState } from 'react';
import { convexRepository } from '../../repository/ConvexCouncilRepository';
import type {
  PersonalArchiveBucket,
  PersonalArchiveCapturePreview,
} from '../../types/domain';
import { useAudioRecorder } from '../chat/useAudioRecorder';
import { transcribeRecordedAudio, uploadFileToConvexStorage } from '../../lib/aiClient';

export type DraftEntry = {
  bucket: PersonalArchiveBucket;
  title: string;
  content: string;
};

export const PERSONAL_ARCHIVE_BUCKET_ORDER: PersonalArchiveBucket[] = [
  'reflection',
  'cookie_jar',
  'accountability',
  'world_model',
];

export function getPersonalArchiveBucketLabel(bucket: PersonalArchiveBucket): string {
  switch (bucket) {
    case 'cookie_jar':
      return 'Cookie Jar';
    case 'world_model':
      return 'World Model';
    case 'accountability':
      return 'Accountability';
    default:
      return 'Reflection';
  }
}

function toDraftEntries(preview: PersonalArchiveCapturePreview | null): DraftEntry[] {
  return (preview?.proposedEntries ?? []).map((entry) => ({
    bucket: entry.bucket,
    title: entry.title ?? '',
    content: entry.content,
  }));
}

interface UsePersonalArchiveCaptureFlowOptions {
  onCommitted?: () => void | Promise<void>;
}

export function usePersonalArchiveCaptureFlow(
  options: UsePersonalArchiveCaptureFlowOptions = {},
) {
  const [captureLabel, setCaptureLabel] = useState('');
  const [captureText, setCaptureText] = useState('');
  const [captureBucket, setCaptureBucket] = useState<'auto' | PersonalArchiveBucket>('auto');
  const [preview, setPreview] = useState<PersonalArchiveCapturePreview | null>(null);
  const [draftEntries, setDraftEntries] = useState<DraftEntry[]>([]);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const recorder = useAudioRecorder();

  const previewCapture = async (input: {
    sourceType: 'text' | 'audio' | 'file' | 'import';
    rawText?: string;
    storageId?: string;
    originalLabel?: string;
    mimeType?: string;
    sizeBytes?: number;
    forcedBucket?: PersonalArchiveBucket;
  }) => {
    setBusy('preview');
    setError(null);
    setSuccessMessage(null);
    try {
      const nextPreview = await convexRepository.previewPersonalArchiveCapture(input);
      setPreview(nextPreview);
      setDraftEntries(toDraftEntries(nextPreview));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not prepare capture.');
    } finally {
      setBusy(null);
    }
  };

  const previewTextCapture = async () => {
    if (!captureText.trim()) return;
    await previewCapture({
      sourceType: 'text',
      rawText: captureText,
      originalLabel: captureLabel.trim() || 'Quick capture',
      forcedBucket: captureBucket === 'auto' ? undefined : captureBucket,
    });
  };

  const handleFileCapture = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy('preview');
    setError(null);
    setSuccessMessage(null);
    try {
      const uploaded = await uploadFileToConvexStorage(file);
      await previewCapture({
        sourceType: 'file',
        storageId: uploaded.storageId,
        originalLabel: uploaded.displayName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        forcedBucket: captureBucket === 'auto' ? undefined : captureBucket,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not upload file.');
      setBusy(null);
    }
  };

  const stopVoiceCapture = async () => {
    const blob = await recorder.stopRecording();
    if (!blob) return;
    setBusy('preview');
    setError(null);
    setSuccessMessage(null);
    try {
      const transcript = await transcribeRecordedAudio(blob, blob.type || 'audio/webm');
      await previewCapture({
        sourceType: 'audio',
        rawText: transcript.transcript,
        originalLabel: `Voice note ${new Date().toLocaleString()}`,
        forcedBucket: captureBucket === 'auto' ? undefined : captureBucket,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not transcribe voice note.');
      setBusy(null);
    }
  };

  const commitPreview = async () => {
    if (!preview || draftEntries.length === 0) return;
    setBusy('commit');
    setError(null);
    setSuccessMessage(null);
    try {
      await convexRepository.commitPersonalArchiveCapture({
        captureId: preview.captureId,
        entries: draftEntries.map((entry) => ({
          bucket: entry.bucket,
          title: entry.title.trim() || undefined,
          content: entry.content.trim(),
        })),
      });
      const committedCount = draftEntries.length;
      setPreview(null);
      setDraftEntries([]);
      setCaptureLabel('');
      setCaptureText('');
      setCaptureBucket('auto');
      setSuccessMessage(
        `${committedCount} ${committedCount === 1 ? 'entry' : 'entries'} added to Personal Archive.`,
      );
      await options.onCommitted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not commit capture.');
    } finally {
      setBusy(null);
    }
  };

  return {
    captureLabel,
    setCaptureLabel,
    captureText,
    setCaptureText,
    captureBucket,
    setCaptureBucket,
    preview,
    draftEntries,
    setDraftEntries,
    busy,
    error,
    successMessage,
    recorder,
    previewTextCapture,
    handleFileCapture,
    stopVoiceCapture,
    commitPreview,
  };
}
