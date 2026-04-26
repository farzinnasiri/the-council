import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

function allowedRedirectOrigins(): Set<string> {
  const origins = [
    process.env.SITE_URL,
    process.env.AUTH_ALLOWED_REDIRECT_ORIGINS,
  ]
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);

  return new Set(origins);
}

function siteUrl(): string {
  const value = process.env.SITE_URL?.trim();
  if (!value) throw new Error("Missing SITE_URL");
  return value.replace(/\/$/u, "");
}

function normalizeRedirectUrl(redirectTo: string): string {
  if (redirectTo.startsWith("?")) return `${siteUrl()}/${redirectTo}`;
  if (redirectTo.startsWith("/")) return `${siteUrl()}${redirectTo}`;

  const url = new URL(redirectTo);
  if (!allowedRedirectOrigins().has(url.origin)) {
    throw new Error(`Invalid redirect origin: ${url.origin}`);
  }

  return url.toString();
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async redirect({ redirectTo }) {
      return normalizeRedirectUrl(redirectTo);
    },
  },
});
