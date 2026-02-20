import { useEffect, type ReactNode } from 'react';
import { useConvexAuth } from 'convex/react';
import { useAuthToken } from '@convex-dev/auth/react';
import { SignInPage } from './SignInPage';
import { convexRepository } from '../../repository/ConvexCouncilRepository';

interface AuthGateProps {
    children: ReactNode;
}

/**
 * AuthGate — two responsibilities:
 * 1. Block unauthenticated access to the app (show SignInPage)
 * 2. Push the JWT token into ConvexHttpClient so all repository calls are authenticated
 *
 * ConvexAuthProvider manages the token internally on ConvexReactClient.
 * We use useAuthToken() to read it and pass it to the Zustand repository's
 * ConvexHttpClient via setToken() whenever it changes.
 */
export function AuthGate({ children }: AuthGateProps) {
    const { isLoading, isAuthenticated } = useConvexAuth();
    const token = useAuthToken();

    // Keep the repository's ConvexHttpClient in sync with the auth token
    useEffect(() => {
        convexRepository.setToken(token);
    }, [token]);

    if (isLoading) {
        return (
            <div className="grid h-svh place-items-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
                    <p className="text-sm text-muted-foreground">Loading…</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <SignInPage />;
    }

    return <>{children}</>;
}
