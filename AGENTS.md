# AGENTS.md

Guidance for agents working in `/Users/farzin/MyProjects/the-council`.

## Project Snapshot

- Product: **The Council** (Hall + Chamber advisory chat UX)
- Frontend: React + Vite + TypeScript + Tailwind + local shadcn-style primitives
- State: Zustand + IndexedDB repository layer (`idb`)
- Backend: Express + TypeScript + Gemini chat + File Search store integration
- PWA: Vite PWA plugin (manifest + service worker)

## High-Level Rules

1. Do not break Gemini/File Search backend behavior in `src/geminiRag.ts` and `src/server.ts`.
2. Keep Hall and Chamber chat UX responsive and mobile-safe.
3. Avoid over-engineering; prefer feature-level code over deep abstraction.
4. Preserve route shape unless explicitly requested.
5. Keep visual style minimal, modern, and consistent with existing tokens.

## Important Paths

- Frontend entry: `src/frontend/main.tsx`
- App routes: `src/frontend/App.tsx`
- Layout shell: `src/frontend/layouts/AppShell.tsx`
- Sidebar: `src/frontend/components/sidebar/Sidebar.tsx`
- Header: `src/frontend/components/header/TopBar.tsx`
- Chat bubble/composer: `src/frontend/features/chat/MessageBubble.tsx`, `src/frontend/features/chat/Composer.tsx`
- Members page: `src/frontend/routes/MembersPage.tsx`
- Store/state: `src/frontend/store/appStore.ts`
- Repository layer: `src/frontend/repository/*`
- Frontend Gemini API client: `src/frontend/lib/geminiClient.ts`
- Backend server: `src/server.ts`
- Gemini service: `src/geminiRag.ts`

## Dev / Build Commands

- Install: `npm install`
- Dev (frontend + backend): `npm run dev`
  - Frontend: `http://localhost:43112`
  - Backend: `http://localhost:43111`
- Build: `npm run build`
- Start production server: `npm start`

## Current Product Contracts (Do Not Regress)

1. Sidebar behavior:
   - Desktop: collapsible
   - Mobile: slide-in sheet with smooth transition
2. Header behavior:
   - Header stays fixed; chat/content area scrolls
   - Hall: member management pill on the right
   - Chamber: simple online indicator (green dot + Online) on the right
3. Composer behavior:
   - Single-line start, auto-grow, dim send button when empty
4. Chat bubble behavior:
   - Hall member bubbles: reply/comment/copy actions
   - Chamber member bubbles: copy action only
   - User bubbles also support copy in footer
   - Markdown rendering enabled for message content
5. Sidebar groups:
   - Hall and Chambers are collapsible directory-style groups
   - Chamber list items show avatar before name and omit `Chamber ·` prefix
6. Members page:
   - Member list does NOT show system prompt preview text
   - Upload docs button removed from list items
   - KB upload/delete handled inside edit/create panel
   - On mobile, active create/edit form appears above list for better UX

## Data & Persistence Contracts

1. Browser is source of truth for this phase:
   - Members, conversations, messages, theme, KB store mapping in IndexedDB
2. Repository abstraction is mandatory for persistence changes:
   - `CouncilRepository` + `IndexedDbCouncilRepository`
3. Member document counts must persist through reload:
   - `hydrateMemberDocuments()` preloads docs for members with stores

## Gemini / KB Contracts

1. Member KB is optional:
   - AI must work without KB (prompt-only fallback)
2. KB uploads use File Search store upload path:
   - `uploadToFileSearchStore` via `uploadDocumentToStore()`
3. Duplicate upload guard:
   - Backend skips re-uploading same filename for same member store
4. File management APIs:
   - Ensure store: `POST /api/member-kb/ensure`
   - Upload docs: `POST /api/member-kb/upload`
   - List docs: `GET /api/member-kb/documents`
   - Delete doc: `POST /api/member-kb/document/delete`
5. Hall routing:
   - Lightweight model subset routing endpoint `POST /api/hall/route`
6. KB gating:
   - Hybrid gate (heuristic + LLM gate for ambiguous cases)
   - Gate model default: `gemma-3-12b-it` (`GEMINI_KB_GATE_MODEL`)
7. Rolling context:
   - Member chat includes bounded context window from conversation history

## Browser Debug Contracts

For member chat debug, browser console group logs should include:

- `KB Check`
- `KB Gate Decision`
- `File Search Request` (when invoked)
- `File Search Response` (when invoked)
- `Chat Model Prompt`

Server stdout debug logs are opt-in (`GEMINI_DEBUG_LOGS=1`).

## Styling / Theming

1. Respect `light` / `dark` / `system` mode behavior.
2. Use tokens in `src/frontend/styles/globals.css`.
3. Keep UI subtle; avoid heavy borders and noisy effects.
4. Keep markdown styling in `.message-markdown` coherent with bubble style.

## Safe Change Strategy

When modifying behavior:

1. Edit the smallest responsible component/module.
2. Verify mobile + desktop paths.
3. Run `npm run build` before finalizing.
4. Do not remove or break existing endpoints unless explicitly asked.

## Data / Security

1. Never commit `.env` or secrets.
2. Keep `.env.example` updated for new env vars.
3. Ignore generated outputs (`dist`, `frontend-dist`, `dev-dist`, `node_modules`).

## Commit Guidance

- Make focused, descriptive commits.
- Mention user-visible behavior changes.
- Prefer one cohesive commit per user-request batch.
