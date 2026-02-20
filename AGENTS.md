# AGENTS.md

Guidance for agents working in `/Users/farzin/MyProjects/the-council`.

## Project Snapshot

- **Product**: The Council — Hall + Chamber advisory chat UX
- **Frontend**: React 19 + Vite + TypeScript + Tailwind utility classes + CSS tokens in `globals.css`
- **State**: Zustand (`appStore.ts`) + Convex repository layer
- **Backend API**: Express + TypeScript served on port `43111`
- **Gemini service**: `src/backend/geminiRag.ts` — chat, routing, summarisation (File Search, prompt-only, RAG)
- **Database**: [Convex](https://convex.dev) (managed serverless DB, real-time capable)
- **Auth**: Convex Auth + Google OAuth — all routes require authentication
- **Avatars**: Integrated `react-easy-crop` for members and users (stored in Convex Storage)
- **PWA**: Vite PWA plugin (manifest + service worker)

---

## High-Level Rules

1. Do not break Gemini/File Search backend behaviour in `src/backend/geminiRag.ts` and `src/backend/server.ts`.
2. Keep Hall and Chamber chat UX responsive and mobile-safe.
3. Avoid over-engineering; prefer feature-level code over deep abstraction.
4. Preserve route shape unless explicitly requested.
5. Keep visual style minimal, modern, and consistent with existing CSS tokens.
6. Always run `npm run build` before finalising any change.
7. Never commit `.env`, `.env.local`, or secrets to the repo.
8. All pages are auth-gated — never render app content to unauthenticated users.

---

## Important Paths

### Frontend
| Path | Purpose |
|------|---------|
| `src/frontend/main.tsx` | App entry — `ConvexAuthProvider` + `AuthGate` at root |
| `src/frontend/lib/convexClient.ts` | Shared `ConvexReactClient` singleton (used by `ConvexAuthProvider`) |
| `src/frontend/components/auth/AuthGate.tsx` | Auth boundary — shows spinner / sign-in page / app |
| `src/frontend/components/auth/SignInPage.tsx` | Google sign-in card |
| `src/frontend/App.tsx` | Route definitions |
| `src/frontend/layouts/AppShell.tsx` | Layout wrapper |
| `src/frontend/components/sidebar/Sidebar.tsx` | Sidebar |
| `src/frontend/components/header/TopBar.tsx` | Fixed header |
| `src/frontend/features/chat/ChatScreen.tsx` | Main chat view |
| `src/frontend/features/chat/MessageBubble.tsx` | Individual message UI |
| `src/frontend/features/chat/Composer.tsx` | Input composer |
| `src/frontend/routes/MembersPage.tsx` | Members management page |
| `src/frontend/routes/ProfilePage.tsx` | User profile + sign-out |
| `src/frontend/store/appStore.ts` | Zustand state + actions |
| `src/frontend/types/domain.ts` | Shared domain types (incl. `User`) |
| `src/frontend/lib/geminiClient.ts` | API client (fetch wrappers) |
| `src/frontend/repository/CouncilRepository.ts` | Repository interface |
| `src/frontend/repository/ConvexCouncilRepository.ts` | Convex implementation |
| `src/frontend/styles/globals.css` | Design tokens + global CSS |

### Backend / Convex
| Path | Purpose |
|------|---------|
| `src/backend/server.ts` | Express API server |
| `src/backend/geminiRag.ts` | `GeminiRAGChatbot` class |
| `src/backend/modelConfig.ts` | Single source of truth for model IDs per backend path |
| `convex/schema.ts` | Convex database schema (V2 + auth) |
| `convex/auth.ts` | Convex Auth config (Google OAuth provider) |
| `convex/auth.config.ts` | JWT issuer config (auto-generated) |
| `convex/http.ts` | HTTP router — OAuth callback (`/api/auth/callback/google`) |
| `convex/users.ts` | `viewer` query + `updateProfile` mutation |
| `convex/members.ts` | Members queries/mutations (scoped by `userId`) |
| `convex/conversations.ts` | Conversations queries/mutations (scoped by `userId`) |
| `convex/messages.ts` | Messages queries/mutations |
| `convex/settings.ts` | App-wide key/value config (non-user settings) |
| `convex/seed.ts` | One-time init sentinel |

---

## Dev / Build Commands

```bash
npm install          # install all deps
npm run dev          # frontend (43112) + backend (43111) in watch mode
npm run build        # production build (frontend + server tsc)
npm start            # serve production bundle
npx convex dev       # keep Convex schema/functions in sync (run in separate terminal)
```

---

## Architecture: Authentication

**Provider**: Convex Auth + Google OAuth only. No passwords, no Clerk/Auth0.

### How auth works end-to-end

1. `ConvexAuthProvider` (in `main.tsx`) wraps the entire app with the shared `ConvexReactClient` from `src/frontend/lib/convexClient.ts`.
2. `AuthGate` (directly inside the provider) blocks all routes. Uses `useConvexAuth()` to check auth state and `useAuthToken()` to read the JWT.
3. On sign-in, `AuthGate` calls `convexRepository.setToken(token)` to inject the JWT into `ConvexHttpClient.setAuth()` — this makes all Zustand repository calls authenticated.
4. On sign-out, the token is cleared from `ConvexHttpClient` and the user is returned to the sign-in page.

### Auth token flow (critical — do not break)

```
ConvexAuthProvider → manages JWT internally on ConvexReactClient
       ↓
AuthGate (useAuthToken) → pushes token to ConvexHttpClient via convexRepository.setToken()
       ↓
ConvexHttpClient (in ConvexCouncilRepository) → sends token in Authorization header
       ↓
Convex backend → getAuthUserId(ctx) → scopes queries/mutations to the signed-in user
```

> ⚠️ There are **two Convex clients** in use, by design:
> - `ConvexReactClient` (shared singleton in `convexClient.ts`) — used only for `ConvexAuthProvider` and auth hooks
> - `ConvexHttpClient` (in `ConvexCouncilRepository`) — used for all data queries/mutations; token is injected by `AuthGate`
>
> Do NOT create a new `ConvexHttpClient` without calling `setToken()` on it — it will have no auth token and all calls will fail with "Not authenticated".

### Convex Auth environment variables (set on Convex deployment)

| Var | Purpose |
|-----|---------|
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `JWT_PRIVATE_KEY` | Auto-set by `npx @convex-dev/auth` |
| `JWKS` | Auto-set by `npx @convex-dev/auth` |
| `SITE_URL` | Auto-set by `npx @convex-dev/auth` |

---

## Architecture: Data Layer (V2 — Convex)

**Convex is the single source of truth.** The old IndexedDB layer has been fully removed.

### Schema tables

| Table | Owner | Key fields |
|-------|-------|-----------|
| `users` | — | `name?`, `email?`, `image?` (identity from Google or custom storage ID resolved to URL) |
| `members` | `userId` | `name`, `avatarId?` (storage ID), `specialties`, `systemPrompt`, `kbStoreName?`, `deletedAt?`, `updatedAt` |
| `conversations` | `userId` | `kind` (`hall`/`chamber`), `title`, `chamberMemberId?`, `deletedAt?`, `summary?`, `updatedAt` |
| `conversationParticipants` | `userId` | `conversationId`, `memberId`, `status` (`active`/`removed`), `joinedAt`, `leftAt?` |
| `messages` | `userId` | `conversationId`, `role`, `authorMemberId?`, `content`, `status`, `compacted`, `routing?`, `inReplyToMessageId?`, `originConversationId?`, `originMessageId?`, `error?` |
| `appConfig` | — | `key`, `value` — app-wide flags and user theme preference (`theme-mode` key) |
| `authSessions`, `authAccounts`, etc. | — | Managed by `@convex-dev/auth` — do not touch |

**`members` and `conversations` are always scoped to the authenticated user** via `getAuthUserId(ctx)` on the backend. Never query them without auth context.

### Indexes
- `members.by_user` — `(userId)` — members for a user (active derived from `deletedAt`)
- `conversations.by_user` — `(userId)` — conversations for a user
- `conversations.by_user_kind` — `(userId, kind)` — per-kind conversation lists
- `conversations.by_user_kind_member` — `(userId, kind, chamberMemberId)` — one chamber per member lookup
- `conversationParticipants.by_conversation_status` — `(conversationId, status)` — active hall members
- `conversationParticipants.by_user_conversation` — `(userId, conversationId)` — participant management
- `messages.by_conversation` — all messages for a conversation
- `messages.by_conversation_active` — `(conversationId, compacted)` — active messages only
- `messages.by_conversation_parent` — reply threading
- `messages.by_origin` — cross-conversation origin linkage

### Repository layer
`ConvexCouncilRepository` implements `CouncilRepository` using `ConvexHttpClient` (imperative, works outside React). All store actions go through the repository interface — never call Convex directly from components.

---

## Architecture: Compaction (SummaryBuffer Pattern)

Long conversations are managed with a rolling summary. After every reply batch:

1. `maybeCompact()` in `appStore.ts` checks if active messages ≥ `COMPACTION_THRESHOLD` (20).
2. If threshold is met, the **oldest half** of active non-system messages are sent to `POST /api/compact`.
3. The server calls `GeminiRAGChatbot.summarizeMessages()` — a Gemini call combining the previous summary + new messages into one rolling summary.
4. The server then calls `conversations:applyCompaction` on Convex:
   - Stores the new `summary` on the conversation doc
   - Marks the compacted message rows `compacted: true`
5. On the next turn, `buildMemberContextWindow()` skips compacted rows. The `previousSummary` is passed to `POST /api/member-chat` and injected into the effective system prompt between the persona and the recent context window.

**Compaction is fire-and-forget** — failures are logged with `[compaction]` prefix and retried on the next round.

---

## API Endpoints

### Chat
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/member-chat` | Single member chat (prompts Gemini) |
| `POST` | `/api/compact` | Rolling compaction: summarise + store in Convex |
| `POST` | `/api/hall/route` | Route a message to the best council members |
| `POST` | `/api/hall/title` | Generate hall title from first user message |
| `POST` | `/api/member/specialties/suggest` | Generate member specialties from name + system prompt |

### Knowledge Base (per member)
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/member-kb/ensure` | Create File Search store for a member |
| `POST` | `/api/member-kb/upload` | Upload docs to member's store |
| `GET`  | `/api/member-kb/documents` | List documents in a store |
| `POST` | `/api/member-kb/document/delete` | Delete a document by name |

---

## Environment Variables

### Server (`.env`)
| Var | Purpose |
|-----|---------|
| `GEMINI_API_KEY` | Gemini API key (required) |
| `GEMINI_MODEL` | Default Gemini model |
| `GEMINI_CHAT_MODEL` | Model for member chat responses |
| `GEMINI_RETRIEVAL_MODEL` | Model for File Search retrieval |
| `GEMINI_ROUTER_MODEL` | Model for hall router calls |
| `GEMINI_HALL_TITLE_MODEL` | Optional title model override |
| `GEMINI_SPECIALTIES_MODEL` | Optional specialties model override |
| `GEMINI_SUMMARY_MODEL` | Optional compaction summary model override |
| `GEMINI_KB_GATE_MODEL` | Model for KB gate decision |
| `GEMINI_ROUTER_TEMPERATURE` | Router temperature (default `0`) |
| `GEMINI_ROUTER_TIMEOUT_MS` | Router timeout (default `3500`) |
| `GEMINI_DEBUG_LOGS` | Set to `1` for server-side verbose logs |
| `PORT` | Express server port (default `43111`) |

### Vite / Convex CLI (`.env.local`)
| Var | Purpose |
|-----|---------|
| `VITE_CONVEX_URL` | Convex deployment URL (written by `npx convex dev`) |
| `CONVEX_DEPLOYMENT` | Convex deployment ID |

> **Important**: The server explicitly loads `.env.local` via `dotenv.config({ path: '.env.local', override: false })` so that `VITE_CONVEX_URL` is available at runtime.

Keep `.env.example` updated whenever new variables are added.

> Model selection is centralized in `src/backend/modelConfig.ts`. Prefer using `resolveModel()`/`MODEL_IDS` instead of ad-hoc strings.

---

## Product Contracts (Do Not Regress)

### Auth
1. No page is accessible without authentication.
2. `AuthGate` is the single enforcement point — it wraps the entire app inside `ConvexAuthProvider`.
3. Sign-out redirects to the sign-in page and clears the Convex session.
4. User profile data (`name`, `email`, `image`) lives in the `users` table and is editable via the Profile page.
5. User theme preference (`theme-mode`) lives in `appConfig`.

### UI / UX
1. **Sidebar**: Desktop collapsible; mobile slide-in sheet with smooth transition.
2. **Header**: Fixed; scroll in chat/content area only.
   - Hall: member management pill on the right
   - Chamber: online indicator (green dot + "Online") on the right
3. **Composer**: Single-line start, auto-grow, dim send button when empty.
4. **Chat bubbles**:
   - Member bubbles: Use member avatar with `UserCircle2` fallback
   - Hall member bubbles: reply/comment/copy actions
   - Chamber member bubbles: copy action only
   - User bubbles: copy action in footer
   - Markdown rendering enabled inside `.message-markdown`
5. **Sidebar groups**: Hall and Chambers are collapsible directory-style groups; chamber items show avatar and omit the `Chamber ·` prefix.
6. **Profile Link**: Shows logged-in user's avatar (or `UserCircle2` fallback) in the navigation sidebar.
7. **Members page**: No emoji field; uses `AvatarUploader` with `react-easy-crop`; KB upload/delete inside edit/create panel only; on mobile the active panel appears above the list.

### Chat behaviour
1. Messages are always persisted in Convex after being appended to local state.
2. Routing messages (system role) are stored and displayed as `RoutePill`.
3. `buildMemberContextWindow()` excludes `compacted: true` messages and system messages.
4. Previous conversation summary is prepended to the system prompt on every chat call once compaction has occurred.
5. Hall routing runs once per hall (first routed turn); later hall turns target active hall participants.
6. Hall draft (`/hall/new`) is lazy: no persisted hall row until first message.
7. Hall prompts inject hall context (present members + recent member opinions) for each member call.
8. Member replies are generated in parallel and appended as each reply finishes (progressive render).

### Gemini / KB
1. Member KB is optional — AI must work without KB (prompt-only fallback).
2. KB uploads use File Search store path via `uploadDocumentToStore()`.
3. Duplicate upload guard: backend skips re-uploading the same filename for the same member store.
4. Hall routing uses `POST /api/hall/route` with structured output against member IDs.
5. Member specialties suggestions are generated via `POST /api/member/specialties/suggest`.

---

## Browser Debug Contracts

Console group logs for member chat should include:

- `KB Check`
- `KB Gate Decision`
- `File Search Request` (when invoked)
- `File Search Response` (when invoked)
- `Chat Model Prompt`

Server verbose logs are opt-in via `GEMINI_DEBUG_LOGS=1`.

---

## Styling / Theming

1. Respect `light` / `dark` / `system` mode — `ThemeProvider` manages CSS class on `<html>`.
2. Use tokens from `src/frontend/styles/globals.css` (CSS custom properties).
3. Keep UI subtle: avoid heavy borders, loud shadows, or noisy animations.
4. Markdown styling lives in `.message-markdown` — keep it coherent with bubble style.
5. Theme mode preference is stored in `appConfig` under key `theme-mode` — not in the `users` table.

---

## Safe Change Strategy

1. Edit the smallest responsible component/module.
2. Verify mobile + desktop paths after any layout change.
3. Run `npm run build` before finalising.
4. Do not remove or break existing endpoints unless explicitly asked.
5. When changing the Convex schema, run `npx convex dev --once` to validate before pushing.
6. After any schema change that adds required fields, clear existing data or make fields optional temporarily, then restore after migration.

---

## Commit Guidance

- Focused, descriptive commits.
- Mention user-visible behaviour changes in the message body.
- Prefer one cohesive commit per user-request batch.

## Legacy Archive

- Old IndexedDB implementation and seed mocks are archived at `archive/legacy-indexeddb/`.
- Do not reintroduce IndexedDB paths in the active app unless explicitly requested.
