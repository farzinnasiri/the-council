/**
 * Shared Convex client singleton.
 *
 * Using a single ConvexReactClient instance across the whole app is required
 * so that ConvexAuthProvider can inject its auth token into the same object
 * that the repository layer calls fetchQuery / fetchMutation on.
 *
 * Do NOT create a second ConvexHttpClient anywhere — it will not have the token.
 */
import { ConvexReactClient } from 'convex/react';

export const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
