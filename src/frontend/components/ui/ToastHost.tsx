import { useAppStore } from '../../store/appStore';

export function ToastHost() {
  const toasts = useAppStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-[80] flex justify-center px-4 md:top-5">
      <div className="grid max-w-[min(92vw,32rem)] gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
