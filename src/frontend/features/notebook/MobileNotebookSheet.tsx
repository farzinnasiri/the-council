import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { ConversationNotebookEditor } from './ConversationNotebookEditor';

const SNAP_POINTS = [0.3, 0.5, 1] as const;

interface MobileNotebookSheetProps {
  open: boolean;
  conversationId: string;
  title: string;
  detail?: string;
  snap: 0.3 | 0.5 | 1;
  onSnapChange: (snap: 0.3 | 0.5 | 1) => void;
  onClose: () => void;
}

export function MobileNotebookSheet({
  open,
  conversationId,
  title,
  detail,
  snap,
  onSnapChange,
  onClose,
}: MobileNotebookSheetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; startSnap: number } | null>(null);
  const dragFractionRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const activeFraction = dragFraction ?? snap;

  useEffect(() => {
    if (!open) {
      setDragFraction(null);
      dragFractionRef.current = null;
    }
  }, [open]);

  const sheetHeight = useMemo(() => `${activeFraction * 100}%`, [activeFraction]);

  const bindPointer = () => {
    const move = (event: PointerEvent) => {
      if (!containerRef.current || !dragRef.current) return;
      const height = containerRef.current.clientHeight;
      if (height <= 0) return;
      const delta = dragRef.current.startY - event.clientY;
      if (Math.abs(delta) > 6) {
        dragMovedRef.current = true;
      }
      const nextFraction = Math.max(0.3, Math.min(1, dragRef.current.startSnap + delta / height));
      setDragFraction(nextFraction);
      dragFractionRef.current = nextFraction;
    };

    const stop = () => {
      const finalFraction = dragFractionRef.current ?? dragRef.current?.startSnap ?? snap;
      const nextSnap = SNAP_POINTS.reduce((closest, point) =>
        Math.abs(point - finalFraction) < Math.abs(closest - finalFraction) ? point : closest
      , SNAP_POINTS[0]);
      onSnapChange(nextSnap);
      setDragFraction(null);
      dragFractionRef.current = null;
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  if (!open) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 z-40 md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-background/30"
        aria-label="Close notebook"
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 flex min-h-0 flex-col border-t border-border bg-background transition-[height] duration-150 ease-out'
        )}
        style={{ height: sheetHeight }}
      >
        <button
          type="button"
          className="flex h-8 items-center justify-center border-b border-border"
          aria-label="Resize notebook sheet"
          onClick={() => {
            if (dragMovedRef.current) {
              dragMovedRef.current = false;
              return;
            }
            const currentIndex = SNAP_POINTS.indexOf(snap);
            onSnapChange(SNAP_POINTS[(currentIndex + 1) % SNAP_POINTS.length]);
          }}
          onPointerDown={(event) => {
            dragRef.current = { startY: event.clientY, startSnap: activeFraction };
            dragMovedRef.current = false;
            (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
            bindPointer();
          }}
        >
          <span className="h-1.5 w-12 rounded-full bg-border" />
        </button>
        <ConversationNotebookEditor
          conversationId={conversationId}
          title={title}
          detail={detail}
          variant="sheet"
          onClose={onClose}
          autoFocus={false}
        />
      </div>
    </div>
  );
}
