import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Message } from '../../types/domain';
import type { MessageSpeechResult } from '../../repository/CouncilRepository';
import { synthesizeMessageSpeech } from '../../lib/aiClient';
import { useAppStore } from '../../store/appStore';
import { readCachedSpeechEntry, writeCachedSpeechEntry } from './speechCache';

interface PreparedSpeechItem {
  cacheKey: string;
  mimeType: string;
  voiceName: string;
  segmentUrls: string[];
}

interface SpeechQueueItem {
  message: Message;
  speakerName: string;
  conversationTitle: string;
  status: 'loading' | 'ready';
  prepared?: PreparedSpeechItem;
}

interface ChatSpeechContextValue {
  toggleMessage: (message: Message) => void | Promise<void>;
  isLoading: (messageId: string) => boolean;
  isQueued: (messageId: string) => boolean;
  isPlaying: (messageId: string) => boolean;
  hasPlayback: boolean;
  currentSpeakerName?: string;
  currentConversationTitle?: string;
  currentMessageId?: string;
  currentStatus: 'idle' | 'loading' | 'playing' | 'paused';
  queueCount: number;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  togglePlayback: () => void | Promise<void>;
  skipCurrent: () => void;
}

const ChatSpeechContext = createContext<ChatSpeechContextValue | null>(null);

function base64ToObjectUrl(base64: string, mimeType: string): string {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function toPreparedSpeechItem(payload: MessageSpeechResult): PreparedSpeechItem {
  const segmentUrls = [...payload.segments]
    .sort((left, right) => left.index - right.index)
    .map((segment) => base64ToObjectUrl(segment.audioBase64, payload.mimeType));

  return {
    cacheKey: payload.cacheKey,
    mimeType: payload.mimeType,
    voiceName: payload.voiceName,
    segmentUrls,
  };
}

function revokePreparedSpeechItem(prepared?: PreparedSpeechItem) {
  prepared?.segmentUrls.forEach((url) => URL.revokeObjectURL(url));
}

export function ChatSpeechProvider({ children }: PropsWithChildren) {
  const conversations = useAppStore((state) => state.conversations);
  const members = useAppStore((state) => state.members);
  const showToast = useAppStore((state) => state.showToast);
  const [queue, setQueue] = useState<SpeechQueueItem[]>([]);
  const [playbackStatus, setPlaybackStatus] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<SpeechQueueItem[]>([]);
  const playbackRef = useRef<{ messageId?: string; segmentIndex: number }>({ segmentIndex: 0 });
  const playbackRateRef = useRef(1);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const clearAudioElement = useEffectEvent(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    playbackRef.current = { segmentIndex: 0 };
    setPlaybackStatus(queueRef.current.length > 0 ? 'loading' : 'idle');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    }
  });

  const updateMediaSession = useEffectEvent((item: SpeechQueueItem) => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.speakerName,
      artist: item.conversationTitle,
      album: 'The Council',
    });
  });

  const loadSegment = useEffectEvent(async (item: SpeechQueueItem, segmentIndex: number) => {
    if (!item.prepared) return;
    const url = item.prepared.segmentUrls[segmentIndex];
    if (!url) return;

    const audio = audioRef.current;
    if (!audio) return;

    playbackRef.current = {
      messageId: item.message.id,
      segmentIndex,
    };
    audio.playbackRate = playbackRateRef.current;
    updateMediaSession(item);
    audio.src = url;
    audio.load();
    try {
      await audio.play();
      setPlaybackStatus('playing');
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch (error) {
      setPlaybackStatus('paused');
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      showToast(error instanceof Error ? error.message : 'Playback could not start.');
    }
  });

  const startHeadIfReady = useEffectEvent(async () => {
    const head = queueRef.current[0];
    if (!head?.prepared) {
      if (!head) {
        clearAudioElement();
      } else {
        setPlaybackStatus('loading');
      }
      return;
    }

    const currentPlayback = playbackRef.current;
    const audio = audioRef.current;
    if (!audio) return;

    if (currentPlayback.messageId === head.message.id && audio.src) {
      return;
    }

    await loadSegment(head, 0);
  });

  const removeQueuedMessage = useEffectEvent((messageId: string) => {
    const wasHead = queueRef.current[0]?.message.id === messageId;
    const removedItem = queueRef.current.find((item) => item.message.id === messageId);

    if (!removedItem) {
      return;
    }

    if (wasHead) {
      clearAudioElement();
    }

    revokePreparedSpeechItem(removedItem.prepared);
    setQueue((current) => current.filter((item) => item.message.id !== messageId));

    if (wasHead) {
      window.setTimeout(() => {
        void startHeadIfReady();
      }, 0);
    }
  });

  const finishCurrentAndAdvance = useEffectEvent(() => {
    const currentMessageId = playbackRef.current.messageId;
    if (!currentMessageId) {
      void startHeadIfReady();
      return;
    }
    removeQueuedMessage(currentMessageId);
  });

  const hydrateQueueItem = useEffectEvent(async (message: Message) => {
    try {
      let payload = await readCachedSpeechEntry(message.id);
      if (!payload) {
        payload = await synthesizeMessageSpeech({
          conversationId: message.conversationId,
          messageId: message.id,
        });
        await writeCachedSpeechEntry(message.id, payload);
      }

      if (!queueRef.current.some((item) => item.message.id === message.id)) {
        return;
      }

      const prepared = toPreparedSpeechItem(payload);
      setQueue((current) =>
        current.map((item) =>
          item.message.id === message.id
            ? {
                ...item,
                status: 'ready',
                prepared,
              }
            : item
        )
      );

      if (queueRef.current[0]?.message.id === message.id) {
        window.setTimeout(() => {
          void startHeadIfReady();
        }, 0);
      }
    } catch (error) {
      removeQueuedMessage(message.id);
      showToast(error instanceof Error ? error.message : 'Could not generate speech.');
    }
  });

  const toggleMessage = useEffectEvent(async (message: Message) => {
    const existing = queueRef.current.find((item) => item.message.id === message.id);
    if (existing) {
      removeQueuedMessage(message.id);
      return;
    }

    const member = message.authorMemberId
      ? members.find((item) => item.id === message.authorMemberId)
      : undefined;
    const conversation = conversations.find((item) => item.id === message.conversationId);

    const nextItem: SpeechQueueItem = {
      message,
      speakerName: member?.name ?? 'Council Member',
      conversationTitle: conversation?.title ?? 'The Council',
      status: 'loading',
    };

    setQueue((current) => [...current, nextItem]);
    window.setTimeout(() => {
      void hydrateQueueItem(message);
    }, 0);
  });

  const handleAudioEnded = useEffectEvent(() => {
    const currentMessageId = playbackRef.current.messageId;
    if (!currentMessageId) return;

    const head = queueRef.current[0];
    if (!head || head.message.id !== currentMessageId || !head.prepared) {
      finishCurrentAndAdvance();
      return;
    }

    const nextSegmentIndex = playbackRef.current.segmentIndex + 1;
    if (nextSegmentIndex < head.prepared.segmentUrls.length) {
      void loadSegment(head, nextSegmentIndex);
      return;
    }

    finishCurrentAndAdvance();
  });

  const handleAudioPause = useEffectEvent(() => {
    if (queueRef.current.length > 0) {
      setPlaybackStatus('paused');
    } else {
      setPlaybackStatus('idle');
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = queueRef.current.length > 0 ? 'paused' : 'none';
    }
  });

  const handleAudioPlay = useEffectEvent(() => {
    setPlaybackStatus('playing');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  });

  const togglePlayback = useEffectEvent(async () => {
    const head = queueRef.current[0];
    if (!head) return;

    const audio = audioRef.current;
    if (!audio) return;

    if (audio.src && !audio.paused) {
      audio.pause();
      return;
    }

    if (audio.src && audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Playback could not start.');
      }
      return;
    }

    await startHeadIfReady();
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => handleAudioEnded();
    const onPause = () => handleAudioPause();
    const onPlay = () => handleAudioPlay();

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);

    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, [handleAudioEnded, handleAudioPause, handleAudioPlay]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const bind = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some actions are not supported on every browser.
      }
    };

    bind('play', async () => {
      const head = queueRef.current[0];
      if (!head?.prepared) {
        await startHeadIfReady();
        return;
      }
      await audioRef.current?.play();
    });
    bind('pause', () => {
      audioRef.current?.pause();
    });
    bind('stop', () => {
      clearAudioElement();
      queueRef.current.forEach((item) => revokePreparedSpeechItem(item.prepared));
      setQueue([]);
    });
    bind('nexttrack', () => {
      finishCurrentAndAdvance();
    });

    return () => {
      bind('play', null);
      bind('pause', null);
      bind('stop', null);
      bind('nexttrack', null);
    };
  }, [clearAudioElement, finishCurrentAndAdvance, startHeadIfReady]);

  useEffect(() => {
    if (queue.length === 0) {
      clearAudioElement();
      return;
    }
    void startHeadIfReady();
  }, [clearAudioElement, queue, startHeadIfReady]);

  useEffect(() => {
    return () => {
      queueRef.current.forEach((item) => revokePreparedSpeechItem(item.prepared));
    };
  }, []);

  const value = useMemo<ChatSpeechContextValue>(
    () => ({
      toggleMessage,
      isLoading: (messageId: string) =>
        queue.some((item) => item.message.id === messageId && item.status === 'loading'),
      isQueued: (messageId: string) =>
        queue.some((item, index) => item.message.id === messageId && index > 0),
      isPlaying: (messageId: string) => queue[0]?.message.id === messageId,
      hasPlayback: queue.length > 0,
      currentSpeakerName: queue[0]?.speakerName,
      currentConversationTitle: queue[0]?.conversationTitle,
      currentMessageId: queue[0]?.message.id,
      currentStatus: queue.length === 0 ? 'idle' : queue[0]?.status === 'loading' ? 'loading' : playbackStatus,
      queueCount: queue.length,
      playbackRate,
      setPlaybackRate,
      togglePlayback,
      skipCurrent: finishCurrentAndAdvance,
    }),
    [finishCurrentAndAdvance, playbackRate, playbackStatus, queue, toggleMessage, togglePlayback]
  );

  return (
    <ChatSpeechContext.Provider value={value}>
      {children}
      <audio ref={audioRef} hidden preload="auto" playsInline />
    </ChatSpeechContext.Provider>
  );
}

export function useChatSpeech() {
  const context = useContext(ChatSpeechContext);
  if (!context) {
    throw new Error('useChatSpeech must be used inside ChatSpeechProvider');
  }
  return context;
}
