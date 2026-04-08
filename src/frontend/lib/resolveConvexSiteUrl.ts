function deriveConvexSiteUrlFromCloudUrl(cloudUrl: string | undefined): string | undefined {
  const normalized = cloudUrl?.trim();
  if (!normalized) return undefined;

  try {
    const url = new URL(normalized);
    if (url.hostname.endsWith('.convex.cloud')) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/u, '.convex.site');
      return url.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function resolveConvexSiteUrl(): string {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL?.trim();
  if (explicit) return explicit;

  const derived = deriveConvexSiteUrlFromCloudUrl(import.meta.env.VITE_CONVEX_URL);
  if (derived) return derived;

  throw new Error(
    'Missing Convex site URL. Set VITE_CONVEX_SITE_URL or provide a VITE_CONVEX_URL that can be converted to a Convex site URL.',
  );
}
