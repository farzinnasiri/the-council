# The Council

Hall + Chamber advisory chat app with:

- React 19 + Vite + TypeScript frontend
- Zustand state + Convex-backed repository layer
- Express + TypeScript API (`src/backend/server.ts`)
- Gemini RAG service (`src/backend/geminiRag.ts`) with:
  - member chat
  - hall routing
  - first-message hall title generation
  - member specialties suggestion
  - rolling conversation compaction
  - optional per-member File Search knowledge stores
- centralized backend model mapping in `src/backend/modelConfig.ts`

## Current Product Behavior

- Halls are created lazily from `/hall/new` on first send.
- Hall routing is one-off per hall: first routed turn chooses participants, later turns use active hall participants.
- Chambers are member-centric (`/chamber/member/:memberId`) and created lazily on first send.
- Hall member replies are generated in parallel and rendered progressively as they arrive.
- Member avatars support crop/upload via `react-easy-crop`; create flow stages avatar and applies it after first save.

## Development

```bash
npm install
npm run dev
```

- Frontend (Vite): [http://localhost:43112](http://localhost:43112)
- Backend (Express): [http://localhost:43111](http://localhost:43111)

Run Convex in a separate terminal when needed:

```bash
npx convex dev
```

## Build / Start

```bash
npm run build
npm start
```

- Frontend bundle output: `frontend-dist/`
- Server output: `dist/server.js`

## Environment

1. Copy env template:

```bash
cp .env.example .env
```

2. Set at least:
- `GEMINI_API_KEY`
- `VITE_CONVEX_URL` in `.env.local` (written by `npx convex dev`)

## API Surface

### Chat
- `POST /api/member-chat`
- `POST /api/hall/route`
- `POST /api/hall/title`
- `POST /api/compact`
- `POST /api/member/specialties/suggest`

### Member Knowledge Base
- `POST /api/member-kb/ensure`
- `POST /api/member-kb/upload`
- `GET /api/member-kb/documents`
- `POST /api/member-kb/document/delete`

### Legacy / Utility
- `GET /api/health`
- `POST /api/upload`
- `GET /api/documents`
- `POST /api/chat`
- `POST /api/history/clear`

## Notes

- Convex is the source of truth for members, conversations, messages, and app config.
- Model IDs per backend path are resolved from `src/backend/modelConfig.ts` (`MODEL_IDS` + `resolveModel()`).
- Legacy IndexedDB implementation is archived under `archive/legacy-indexeddb/` and is not used at runtime.
