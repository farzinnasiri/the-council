import { useCallback, useEffect, useRef, useState } from 'react';
import { getBestAudioMimeType, normalizeRecordedBlob } from './audio';

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const preferredMimeTypeRef = useRef<string>('audio/webm');

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    if (!streamRef.current) return;
    for (const track of streamRef.current.getTracks()) {
      track.stop();
    }
    streamRef.current = null;
    setAudioStream(null);
  }, []);

  const resetSession = useCallback(() => {
    stopTimer();
    releaseStream();
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setDurationSec(0);
  }, [releaseStream, stopTimer]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden || !isRecording) return;
      resetSession();
      setError('Recording stopped because the tab became inactive.');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isRecording, resetSession]);

  useEffect(() => () => resetSession(), [resetSession]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    setError(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType = getBestAudioMimeType();
      preferredMimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      streamRef.current = stream;
      setAudioStream(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start(200);
      setIsRecording(true);

      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        setDurationSec(Math.floor((Date.now() - startedAt) / 1000));
      }, 1000);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Could not access your microphone. Please check permissions.';
      setError(message);
      resetSession();
    }
  }, [isRecording, resetSession]);

  const stopRecording = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === 'inactive') {
          resetSession();
          resolve(null);
          return;
        }

        recorder.onstop = () => {
          const raw = new Blob(chunksRef.current, {
            type: preferredMimeTypeRef.current,
          });
          const normalized = normalizeRecordedBlob(raw, preferredMimeTypeRef.current);
          resetSession();
          resolve(normalized);
        };

        recorder.stop();
      }),
    [resetSession]
  );

  const cancelRecording = useCallback(() => {
    setError(null);
    resetSession();
  }, [resetSession]);

  return {
    isRecording,
    audioStream,
    durationSec,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError: () => setError(null),
  };
}
