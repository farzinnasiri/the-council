# AGENTS.md

Guidance for agents working in `/Users/farzin/MyProjects/the-council`.

## Project Snapshot

- Product: **The Council** web app (Hall + Chamber chat UX)
- Frontend: React + Vite + TypeScript + Tailwind + shadcn-style local components
- Backend: Express + TypeScript + Gemini File Search / chat endpoints
- PWA: Vite PWA plugin (manifest + service worker)

## High-Level Rules

1. Do not break existing Gemini backend behavior (`src/geminiRag.ts`, API contracts in `src/server.ts`).
2. Frontend work should prioritize usability on both desktop and mobile.
3. Keep UI modern and minimal; avoid heavy borders, noisy visual effects, and clutter.
4. Do not over-abstract. Prefer clear feature-level components over deep indirection.
5. Avoid introducing breaking route/path changes unless explicitly requested.

## Important Paths

- Frontend entry: `src/frontend/main.tsx`
- App routes: `src/frontend/App.tsx`
- Layout shell: `src/frontend/layouts/AppShell.tsx`
- Sidebar: `src/frontend/components/sidebar/Sidebar.tsx`
- Header: `src/frontend/components/header/TopBar.tsx`
- Chat composer: `src/frontend/features/chat/Composer.tsx`
- Store/state: `src/frontend/store/appStore.ts`
- Mocks: `src/frontend/mocks/*`
- Backend server: `src/server.ts`

## Dev / Build Commands

- Install: `npm install`
- Dev (frontend + backend): `npm run dev`
  - Frontend: `http://localhost:43112`
  - Backend: `http://localhost:43111`
- Build: `npm run build`
- Start production server: `npm start`

## Current UX Contracts (Do Not Regress)

1. Sidebar is collapsible on desktop and a slide-in sheet on mobile.
2. Header remains visible while only chat content scrolls.
3. Composer starts as single-line, auto-grows with content, and send button is dim when empty.
4. Hall/Chamber member indicator is interactive and opens popup with:
   - Active members first
   - Inactive members below
   - `+ Add` for Hall context
5. Hall and Chambers in sidebar are collapsible directory groups.

## Styling / Theming

1. Respect light/dark/system theme behavior.
2. Use existing CSS tokens and Tailwind utility patterns in `src/frontend/styles/globals.css`.
3. Keep component visuals subtle; avoid “2000s UI” feel (thick borders, hard separators, overly loud CTAs).

## Safe Change Strategy

When modifying UI behavior:

1. Change the smallest responsible component.
2. Verify both mobile and desktop behavior paths.
3. Run `npm run build` before finalizing.

## Data / Security

1. Never commit `.env` or secrets.
2. Keep `.env.example` updated when adding new environment variables.
3. Ignore generated outputs (`dist`, `frontend-dist`, `dev-dist`, `node_modules`).

## Commit Guidance

- Make focused, descriptive commits.
- Mention user-visible behavior changes in commit message.
- Prefer one cohesive commit per user request batch.
