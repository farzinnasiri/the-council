# AGENTS.md

Guidance for agents working in `/Users/farzin/MyProjects/the-council`.

## Project Snapshot

- **Product**: The Council — Hall + Chamber advisory chat UX
- **Frontend**: React 19 + Vite + TypeScript + Tailwind utility classes + CSS tokens in `globals.css`
- **State**: Zustand (`appStore.ts`) + Convex repository layer
- **Backend**: Convex functions only (queries/mutations/actions); no Express runtime
- **Gemini service**: `convex/ai.ts` + `convex/ai/*` (routing, chat, summaries, KB ingest)
- **Database/Auth**: Convex + Convex Auth (Google OAuth)
- **Avatars**: `react-easy-crop`, stored in Convex Storage
- **PWA**: Vite PWA plugin (manifest + service worker)

---

## High-Level Rules

1. Do not break Convex AI/KB actions in `convex/ai.ts` and `convex/ai/*`.
2. Keep Hall and Chamber chat UX responsive and mobile-safe.
3. Avoid over-engineering; prefer feature-level code over deep abstraction.
4. Preserve auth-gated behavior for all app content.
5. Keep visual style minimal, modern, and coherent with CSS tokens.
6. Always run `npm run build` before finalizing changes.
7. Never commit `.env`, `.env.local`, or secrets.
8. Convex is the backend source of truth; do not reintroduce local IndexedDB paths.
9. Use `make` targets for operational workflows (env sync, checks, deploy) unless explicitly debugging.

---

## Important Paths

### Frontend
| Path | Purpose |
|------|---------|
| `src/frontend/main.tsx` | App entry (`ConvexAuthProvider` + `AuthGate`) |
| `src/frontend/lib/convexClient.ts` | Shared `ConvexReactClient` singleton |
| `src/frontend/components/auth/AuthGate.tsx` | Auth boundary |
| `src/frontend/components/auth/SignInPage.tsx` | Google sign-in page |
| `src/frontend/store/appStore.ts` | Zustand state + actions |
| `src/frontend/lib/geminiClient.ts` | Convex-backed AI client wrappers |
| `src/frontend/repository/CouncilRepository.ts` | Repository interface |
| `src/frontend/repository/ConvexCouncilRepository.ts` | Convex implementation |
| `src/frontend/styles/globals.css` | Design tokens + global CSS |

### Backend / Convex
| Path | Purpose |
|------|---------|
| `convex/ai.ts` | Public AI/KB action surface |
| `convex/ai/geminiService.ts` | Gemini + File Search orchestration |
| `convex/ai/modelConfig.ts` | Model ID resolution |
| `convex/ai/ownership.ts` | Auth/ownership checks for actions |
| `convex/ai/kbIngest.ts` | KB staging ingest, rehydrate, purge |
| `convex/kbDigests.ts` | Per-document KB digest storage + lifecycle |
| `convex/kbStagedDocuments.ts` | KB staged-document audit records |
| `convex/memoryLogs.ts` | Chamber memory log reads |
| `convex/schema.ts` | Convex schema |
| `convex/auth.ts` | Convex Auth config |
| `convex/http.ts` | HTTP router (auth callbacks only) |
| `convex/users.ts` | User profile functions |
| `convex/members.ts` | Member functions |
| `convex/conversations.ts` | Conversation functions |
| `convex/messages.ts` | Message functions |
| `convex/settings.ts` | App config functions |

---

## Dev / Build Commands

```bash
npm install
npm run dev
npm run build
npm start
npx convex dev
```

- Frontend dev: `http://localhost:43112`
- Convex functions/schema sync through `npx convex dev`

Primary operational interface (preferred):

```bash
make help
make setup
make install
make dev
make build
make check
make env-doctor
make env-sync
make env-sync-prod
make deploy
make deploy-prod
```

---

## Deployment Sync Checklist

Use this checklist whenever backend actions or env values change:

1. Confirm frontend target deployment in `.env.local`:
   - `VITE_CONVEX_URL`
   - `CONVEX_DEPLOYMENT`
2. Validate merged runtime env before syncing/deploying:
   - `make env-doctor` (dev)
   - `make env-doctor TARGET=prod` (prod)
3. Sync required runtime env keys:
   - `make env-sync` (dev)
   - `make env-sync-prod` (prod)
4. Push functions to the same target deployment:
   - `make deploy` (dev)
   - `make deploy-prod` (prod)
5. Verify new actions exist on that deployment:
   - `npx convex function-spec | rg "ai.js:chatWithMember|ai.js:routeHallMembers"`
6. Verify required runtime env exists on that deployment:
   - `npx convex env list | rg "^GEMINI_API_KEY="`

If the app shows `Could not find public function for 'ai:chatWithMember'`, the frontend is pointed at a deployment that does not have the latest functions yet.

---

## Architecture: Authentication

1. `ConvexAuthProvider` wraps the app.
2. `AuthGate` blocks unauthenticated access and syncs token into repository `ConvexHttpClient`.
3. All Convex functions rely on auth context (`getAuthUserId`).
4. Never create a `ConvexHttpClient` without `setToken()` flow.

---

## Architecture: Data Layer

Core tables:
- `users`
- `members`
- `conversations`
- `conversationParticipants`
- `conversationMemoryLogs`
- `messages`
- `appConfig`
- `kbStagedDocuments`
- `kbDocumentDigests`
- Convex Auth managed tables (`authSessions`, `authAccounts`, ...)

All member/conversation/message access is user-scoped by auth user ID.

---

## Architecture: AI + KB

Public Convex actions in `convex/ai.ts`:
- `routeHallMembers`
- `suggestHallTitle`
- `suggestMemberSpecialties`
- `chatWithMember`
- `compactConversation`
- `ensureMemberKnowledgeStore`
- `uploadMemberDocuments`
- `listMemberKnowledgeDocuments`
- `deleteMemberKnowledgeDocument`
- `rehydrateMemberKnowledgeStore`
- `purgeExpiredStagedKnowledgeDocuments`

KB upload flow:
1. Frontend uploads files to Convex Storage via `generateUploadUrl`.
2. Frontend sends staged `storageId` metadata to `uploadMemberDocuments`.
3. Action ingests to Gemini File Search store and records audit rows in `kbStagedDocuments`.
4. Ingest also upserts per-document digest rows in `kbDocumentDigests`.
5. KB gate/query rewrite can use those digest hints for better recall on follow-ups.
4. Staged binaries are retained for 90 days (rehydration support) unless purged.

---

## Environment Variables

### Local (`.env.local`)
- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL`
- `CONVEX_DEPLOYMENT` (if needed by CLI)

### Local Convex env overrides (`.env.convex.local`, gitignored)
- Secrets and deployment-specific overrides for Convex runtime env sync.
- Merged after `config/env/convex.defaults.env`.
- May use target-specific suffixes: `KEY__DEV`, `KEY__PROD`.

### Convex runtime env
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_CHAT_MODEL`
- `GEMINI_RETRIEVAL_MODEL`
- `GEMINI_ROUTER_MODEL`
- `GEMINI_HALL_TITLE_MODEL`
- `GEMINI_SPECIALTIES_MODEL`
- `GEMINI_SUMMARY_MODEL`
- `GEMINI_CHAMBER_MEMORY_MODEL`
- `GEMINI_KB_GATE_MODEL`
- `GEMINI_KB_QUERY_REWRITE_MODEL`
- `GEMINI_KB_DIGEST_MODEL`
- `GEMINI_ROUTER_TEMPERATURE`
- `GEMINI_DEBUG_LOGS`

Set via:
```bash
make env-sync
```

For production deployment env:
```bash
make env-sync-prod
```

---

## Product Contracts (Do Not Regress)

### Auth
1. No app page content is visible without auth.
2. Sign-out returns to sign-in and clears session state.
3. User profile (`name`, `email`, `image`) is stored in `users`.
4. Theme preference lives in `appConfig` key `theme-mode`.

### UI / UX
1. Sidebar desktop collapse + mobile sheet behavior stays intact.
2. Header remains fixed; scroll only in content area.
3. Composer auto-grows from single-line.
4. Bubble/action behavior stays role-specific.
5. Members page uses avatar uploader and in-panel KB management.

### Chat Behavior
1. Messages persist to Convex after local append.
2. Routing system messages remain persisted and rendered.
3. Compacted/system rows are excluded from member context windows.
4. Error-status messages must not be included in LLM context windows.
4. Chamber memory is injected once compaction exists.
5. Hall routing runs once, then active participants are reused.
6. Hall and chamber creation remain lazy on first message.
7. Member replies remain parallel + progressive.
8. Message history supports upward lazy-loading/pagination in chat views.

### Debug Contract
Console output for member chat should include:
- `KB Check`
- `KB Gate Decision`
- `File Search Request`
- `File Search Response`
- `Chat Model Prompt`

---

## Safe Change Strategy

1. Edit the smallest responsible module.
2. Validate mobile and desktop behavior on UI changes.
3. Run `npm run build` before finalizing.
4. Run `npx convex codegen --typecheck enable --dry-run` for Convex validation.
5. Use additive schema changes for migrations when possible.

## Legacy Archive

- Legacy IndexedDB implementation is in `archive/legacy-indexeddb/`.
- Do not reintroduce IndexedDB runtime paths unless explicitly requested.
