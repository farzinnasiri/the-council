# AGENTS.md

Guidance for agents working in `/Users/farzin/MyProjects/the-council`.

## Project Snapshot

- **Product**: The Council — Hall + Chamber advisory chat UX
- **Frontend**: React 19 + Vite + TypeScript + Vanilla CSS (no Tailwind)
- **State**: Zustand (`appStore.ts`) + Convex repository layer
- **Backend API**: Express + TypeScript served on port `43111`
- **Gemini service**: `src/geminiRag.ts` — chat, routing, summarisation (File Search, prompt-only, RAG)
- **Database**: [Convex](https://convex.dev) (managed serverless DB, real-time capable)
- **PWA**: Vite PWA plugin (manifest + service worker)

---

## High-Level Rules

1. Do not break Gemini/File Search backend behaviour in `src/geminiRag.ts` and `src/server.ts`.
2. Keep Hall and Chamber chat UX responsive and mobile-safe.
3. Avoid over-engineering; prefer feature-level code over deep abstraction.
4. Preserve route shape unless explicitly requested.
5. Keep visual style minimal, modern, and consistent with existing CSS tokens.
6. Always run `npm run build` before finalising any change.
7. Never commit `.env`, `.env.local`, or secrets to the repo.

---

## Important Paths

### Frontend
| Path | Purpose |
|------|---------|
| `src/frontend/main.tsx` | App entry |
| `src/frontend/App.tsx` | Route definitions |
| `src/frontend/layouts/AppShell.tsx` | Layout wrapper |
| `src/frontend/components/sidebar/Sidebar.tsx` | Sidebar |
| `src/frontend/components/header/TopBar.tsx` | Fixed header |
| `src/frontend/features/chat/ChatScreen.tsx` | Main chat view |
| `src/frontend/features/chat/MessageBubble.tsx` | Individual message UI |
| `src/frontend/features/chat/Composer.tsx` | Input composer |
| `src/frontend/routes/MembersPage.tsx` | Members management page |
| `src/frontend/store/appStore.ts` | Zustand state + actions |
| `src/frontend/types/domain.ts` | Shared domain types |
| `src/frontend/lib/geminiClient.ts` | API client (fetch wrappers) |
| `src/frontend/repository/CouncilRepository.ts` | Repository interface |
| `src/frontend/repository/ConvexCouncilRepository.ts` | Convex implementation |
| `src/frontend/styles/globals.css` | Design tokens + global CSS |

### Backend / Convex
| Path | Purpose |
|------|---------|
| `src/server.ts` | Express API server |
| `src/geminiRag.ts` | `GeminiRAGChatbot` class |
| `convex/schema.ts` | Convex database schema (V2) |
| `convex/members.ts` | Members queries/mutations |
| `convex/conversations.ts` | Conversations queries/mutations + `applyCompaction` |
| `convex/messages.ts` | Messages queries/mutations + `listActive`, `getContext` |
| `convex/settings.ts` | App config key/value store |
| `convex/seed.ts` | One-time seed logic |

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

## Architecture: Data Layer (V2 — Convex)

**Convex is the single source of truth.** The old IndexedDB layer has been fully removed.

### Schema tables

| Table | Key fields |
|-------|-----------|
| `members` | `name`, `emoji`, `role`, `specialties`, `systemPrompt`, `kbStoreName?`, `status`, `updatedAt` |
| `conversations` | `type` (hall/chamber), `title`, `memberIds`, `status`, `summary?`, `summaryTokens?`, `messageCount`, `updatedAt` |
| `messages` | `conversationId`, `role` (user/member/system), `memberId?`, `content`, `status`, `compacted`, `routing?`, `error?` |
| `settings` | `key`, `value` (string key/value config) |
| `meta` | `key`, `value` (internal flags, e.g. seed sentinel) |

### Indexes used
- `messages.by_conversation` — fetch all messages for a conversation
- `messages.by_conversation_active` — `(conversationId, compacted)` — active messages only
- `conversations.by_status` — active conversations list

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

### Knowledge Base (per member)
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/member-kb/ensure` | Create File Search store for a member |
| `POST` | `/api/member-kb/upload` | Upload docs to member's store |
| `GET`  | `/api/member-kb/documents` | List documents in a store |
| `POST` | `/api/member-kb/document/delete` | Delete a document by name |

---

## Environment Variables

Variables live in `.env` (server) and `.env.local` (Convex CLI / Vite):

| Var | Source | Purpose |
|-----|--------|---------|
| `GEMINI_API_KEY` | `.env` | Gemini API key (required) |
| `GEMINI_MODEL` | `.env` | Default Gemini model |
| `GEMINI_CHAT_MODEL` | `.env` | Model for member chat responses |
| `GEMINI_RETRIEVAL_MODEL` | `.env` | Model for File Search retrieval |
| `GEMINI_ROUTER_MODEL` | `.env` | Model for routing + summarisation |
| `GEMINI_DEBUG_LOGS` | `.env` | Set to `1` to enable server-side verbose logs |
| `PORT` | `.env` | Express server port (default `43111`) |
| `VITE_CONVEX_URL` | `.env.local` | Convex deployment URL (written by `npx convex dev`) |
| `CONVEX_DEPLOYMENT` | `.env.local` | Convex deployment ID |

> **Important**: `dotenv/config` loads `.env`; the server also explicitly loads `.env.local` via `dotenv.config({ path: '.env.local', override: false })` so that `VITE_CONVEX_URL` is available at runtime.

Keep `.env.example` updated whenever new variables are added.

---

## Product Contracts (Do Not Regress)

### UI / UX
1. **Sidebar**: Desktop collapsible; mobile slide-in sheet with smooth transition.
2. **Header**: Fixed; scroll in chat/content area only.
   - Hall: member management pill on the right
   - Chamber: online indicator (green dot + "Online") on the right
3. **Composer**: Single-line start, auto-grow, dim send button when empty.
4. **Chat bubbles**:
   - Hall member bubbles: reply/comment/copy actions
   - Chamber member bubbles: copy action only
   - User bubbles: copy action in footer
   - Markdown rendering enabled inside `.message-markdown`
5. **Sidebar groups**: Hall and Chambers are collapsible directory-style groups; chamber items show avatar and omit the `Chamber ·` prefix.
6. **Members page**: No system prompt preview in list; KB upload/delete inside edit/create panel only; on mobile the active panel appears above the list.

### Chat behaviour
1. Messages are always persisted in Convex after being appended to local state.
2. Routing messages (system role) are stored and displayed as `RoutePill`.
3. `buildMemberContextWindow()` excludes `compacted: true` messages and system messages.
4. Previous conversation summary is prepended to the system prompt on every chat call once compaction has occurred.

### Gemini / KB
1. Member KB is optional — AI must work without KB (prompt-only fallback).
2. KB uploads use File Search store path via `uploadDocumentToStore()`.
3. Duplicate upload guard: backend skips re-uploading the same filename for the same member store.
4. Hall routing uses `POST /api/hall/route` with a lightweight model.

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

---

## Safe Change Strategy

1. Edit the smallest responsible component/module.
2. Verify mobile + desktop paths after any layout change.
3. Run `npm run build` before finalising.
4. Do not remove or break existing endpoints unless explicitly asked.
5. When changing the Convex schema, run `npx convex dev --once` to validate before pushing.

---

## Commit Guidance

- Focused, descriptive commits.
- Mention user-visible behaviour changes in the message body.
- Prefer one cohesive commit per user-request batch.
