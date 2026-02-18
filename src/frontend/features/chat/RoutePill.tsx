import { useAppStore } from '../../store/appStore';

export function RoutePill({ memberIds }: { memberIds: string[] }) {
  const members = useAppStore((state) => state.members);
  const names = memberIds
    .map((id) => members.find((member) => member.id === id)?.name ?? id)
    .join(', ');

  return (
    <div className="mx-auto flex max-w-[88%] items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground animate-fade-in-up">
      <span className="h-2 w-2 rounded-full bg-primary" />
      <span>Routed to {names}</span>
    </div>
  );
}
