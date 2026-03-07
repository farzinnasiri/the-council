import { useAppStore } from '../../store/appStore';

export function ToastHost() {
  const toasts = useAppStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[80] flex justify-center px-4">
      <div className="grid gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-[0_6px_18px_rgba(0,0,0,0.12)]"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
