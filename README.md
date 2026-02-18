# The Council (Frontend Foundation + Gemini Backend)

This project now has:

- A new React + Vite + Tailwind + shadcn frontend for **The Council** chat UX
- Existing Gemini File Search backend logic kept intact (Express + TypeScript)

## Frontend Highlights

- Hall + Chamber chat flows (mocked, deterministic routing)
- Sidebar with Hall/Chamber sessions and new session creation
- Responsive desktop/mobile layout
- Theme modes: `light`, `dark`, `system`
- PWA setup (manifest + service worker + installable shell)
- Placeholder routes for Members, Settings, and Profile

## Run

Install:

```bash
npm install
```

Development (API + frontend together):

```bash
npm run dev
```

- Frontend: [http://localhost:43112](http://localhost:43112)
- Backend API: [http://localhost:43111](http://localhost:43111)

Production build:

```bash
npm run build
npm start
```

This builds frontend assets into `frontend-dist/` and serves them from Express.

## Existing Backend APIs (unchanged)

- `GET /api/health`
- `POST /api/upload` (multipart field: `documents`)
- `GET /api/documents`
- `POST /api/chat` with `{ "message": "..." }`
- `POST /api/history/clear`

## Gemini Setup

1. Copy env template:

```bash
cp .env.example .env
```

2. Set `GEMINI_API_KEY` in `.env`
