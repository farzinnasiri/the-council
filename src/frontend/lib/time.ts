export function nowIso(): string {
  return new Date().toISOString();
}

export function formatClock(dateSource: number | string): string {
  return new Date(dateSource).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatSessionTime(dateSource: number | string): string {
  const date = new Date(dateSource);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today · ${formatClock(dateSource)}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
