import { useEffect, useRef, useState } from 'react';

interface LiveWaveformProps {
  audioStream: MediaStream | null;
}

const BAR_COUNT = 48;

export function LiveWaveform({ audioStream }: LiveWaveformProps) {
  const [bars, setBars] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioStream) return;

    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const context = new AudioContextCtor();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;

    const source = context.createMediaStreamSource(audioStream);
    source.connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(bins);
      const step = Math.max(1, Math.floor(bins.length / BAR_COUNT));
      const next = Array.from({ length: BAR_COUNT }, (_, index) => {
        const value = bins[index * step] ?? 0;
        return Math.min(1, value / 255);
      });
      setBars(next);
      rafRef.current = window.requestAnimationFrame(tick);
    };

    if (context.state === 'suspended') {
      void context.resume();
    }

    tick();

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      source.disconnect();
      analyser.disconnect();
      void context.close();
    };
  }, [audioStream]);

  return (
    <div className="flex h-8 w-full items-center gap-[2px] overflow-hidden px-1">
      {bars.map((value, index) => {
        const height = Math.max(10, Math.min(100, Math.round(value * 100)));
        const opacity = Math.max(0.25, value * 1.8);
        return (
          <div
            // index is stable here because bar count is constant.
            key={index}
            className="h-full min-w-[2px] flex-1 rounded-full bg-foreground/30 transition-all duration-100 ease-out"
            style={{ height: `${height}%`, opacity }}
          />
        );
      })}
    </div>
  );
}
