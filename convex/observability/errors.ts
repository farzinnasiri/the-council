'use node';

export class WideEventError extends Error {
  readonly slug: string;
  readonly statusCode: number;
  readonly cause: unknown;

  constructor(slug: string, message: string, options?: { statusCode?: number; cause?: unknown }) {
    super(message);
    this.name = 'WideEventError';
    this.slug = slug;
    this.statusCode = options?.statusCode ?? 500;
    this.cause = options?.cause;
  }
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function sanitizeErrorMessage(error: unknown, fallback = 'Unexpected error'): string {
  const raw = error instanceof Error ? error.message : String(error ?? fallback);
  const compact = compactWhitespace(raw || fallback);
  return compact.slice(0, 240) || fallback;
}

export function slugifyError(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'unexpected-internal-error';
}

export function ensureWideEventError(
  error: unknown,
  fallbackSlug = 'unexpected-internal-error',
  fallbackStatusCode = 500
): WideEventError {
  if (error instanceof WideEventError) {
    return error;
  }

  const message = sanitizeErrorMessage(error);
  const derivedSlug = message ? slugifyError(message) : fallbackSlug;
  return new WideEventError(derivedSlug || fallbackSlug, message, {
    statusCode: fallbackStatusCode,
    cause: error,
  });
}

export function wideEventError(
  slug: string,
  message: string,
  options?: { statusCode?: number; cause?: unknown }
): WideEventError {
  return new WideEventError(slug, message, options);
}
