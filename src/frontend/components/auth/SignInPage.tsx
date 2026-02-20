import { useAuthActions } from '@convex-dev/auth/react';

/**
 * SignInPage — shown when the user is not authenticated.
 * Clean, minimal card that mirrors the app's existing dark/light design tokens.
 */
export function SignInPage() {
    const { signIn } = useAuthActions();

    return (
        <div className="grid h-svh place-items-center bg-background px-4">
            <div className="w-full max-w-sm">
                {/* Logo / branding */}
                <div className="mb-10 text-center">
                    <p className="font-display text-4xl tracking-tight">The Council</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Your private advisory council, powered by AI.
                    </p>
                </div>

                {/* Sign-in card */}
                <div className="rounded-2xl border border-border bg-card px-6 py-8 shadow-lg">
                    <p className="mb-6 text-center text-sm font-medium text-foreground/80">
                        Sign in to continue
                    </p>

                    <button
                        id="signin-google-btn"
                        type="button"
                        onClick={() => void signIn('google')}
                        className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition hover:bg-muted active:scale-[0.98]"
                    >
                        {/* Google logo SVG */}
                        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                            <path
                                d="M17.64 9.2a10.34 10.34 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92A8.78 8.78 0 0 0 17.64 9.2z"
                                fill="#4285F4"
                            />
                            <path
                                d="M9 18a8.59 8.59 0 0 0 5.96-2.18l-2.91-2.26a5.42 5.42 0 0 1-8.09-2.85H.98v2.33A9 9 0 0 0 9 18z"
                                fill="#34A853"
                            />
                            <path
                                d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.98a9 9 0 0 0 0 8.08l2.98-2.33z"
                                fill="#FBBC04"
                            />
                            <path
                                d="M9 3.58a4.86 4.86 0 0 1 3.44 1.35l2.58-2.58A8.64 8.64 0 0 0 9 0 9 9 0 0 0 .98 4.96L3.96 7.3A5.43 5.43 0 0 1 9 3.58z"
                                fill="#EA4335"
                            />
                        </svg>
                        Continue with Google
                    </button>

                    <p className="mt-5 text-center text-xs text-muted-foreground">
                        By signing in you agree to our terms of service.
                    </p>
                </div>
            </div>
        </div>
    );
}
