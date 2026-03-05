const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/wav',
] as const;

export function getBestAudioMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return 'audio/webm';
  }

  for (const type of AUDIO_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'audio/webm';
}

export function normalizeRecordedBlob(blob: Blob, preferredMimeType?: string): Blob {
  const mimeType = preferredMimeType?.trim() || blob.type || 'audio/webm';
  return new Blob([blob], { type: mimeType });
}

export function appendTranscriptToDraft(current: string, transcript: string): string {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) return current;

  const trimmedCurrent = current.trim();
  if (!trimmedCurrent) return cleanTranscript;

  const needsSpace = !/[\s.,!?;:]$/.test(trimmedCurrent);
  return `${trimmedCurrent}${needsSpace ? ' ' : ''}${cleanTranscript}`;
}
