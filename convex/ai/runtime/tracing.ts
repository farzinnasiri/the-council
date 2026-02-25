export function makeTraceId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function maybeLogDebug(enabled: boolean, event: string, payload: unknown): void {
  if (!enabled) return;
  try {
    console.log(`[convex-ai] ${event}`, JSON.stringify(payload));
  } catch {
    console.log(`[convex-ai] ${event}`, payload);
  }
}
