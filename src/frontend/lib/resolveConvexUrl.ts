function deriveConvexUrlFromSiteUrl(siteUrl: string | undefined): string | undefined {
  const normalized = siteUrl?.trim();
  if (!normalized) return undefined;

  try {
    const url = new URL(normalized);
    if (url.hostname.endsWith('.convex.site')) {
      url.hostname = url.hostname.replace(/\.convex\.site$/u, '.convex.cloud');
      return url.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function resolveConvexUrl(): string {
  const explicit = import.meta.env.VITE_CONVEX_URL?.trim();
  if (explicit) return explicit;

  const derived = deriveConvexUrlFromSiteUrl(import.meta.env.VITE_CONVEX_SITE_URL);
  if (derived) return derived;

  throw new Error(
    'Missing Convex deployment URL. Set VITE_CONVEX_URL or provide a VITE_CONVEX_SITE_URL that can be converted to a Convex cloud URL.',
  );
}
