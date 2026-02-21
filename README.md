# The Council

Hall + Chamber advisory chat app with:

- React 19 + Vite + TypeScript frontend
- Zustand state + Convex-backed repository layer
- Convex backend functions (queries, mutations, and Node actions)
- Gemini + File Search orchestration in `convex/ai.ts` and `convex/ai/*`
- centralized backend model mapping in `convex/ai/modelConfig.ts`

## Current Product Behavior

- Halls are created lazily from `/hall/new` on first send.
- Hall routing is one-off per hall: first routed turn chooses participants, later turns use active hall participants.
- Chambers are member-centric (`/chamber/member/:memberId`) and created lazily on first send.
- Hall member replies are generated in parallel and rendered progressively as they arrive.
- Member avatars support crop/upload via `react-easy-crop`; create flow stages avatar and applies it after first save.

## Make Commands

`make` is the primary operational interface.

```bash
make help           # list all commands
make setup          # validate toolchain + bootstrap local env templates
make install        # npm ci (fallback npm install)
make dev            # run local app
make build          # production build
make check          # build + convex typecheck dry-run
make env-doctor     # validate merged env (TARGET=dev by default)
make env-sync       # sync required env to dev deployment
make env-sync-prod  # sync required env to prod deployment
make deploy         # validate + deploy to dev (convex dev --once)
make deploy-prod    # validate + deploy to prod (convex deploy)
make logs           # dev logs
make logs-prod      # prod logs
```

## Environment Source Of Truth

### Frontend local runtime (`.env.local`)

- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL`
- `CONVEX_DEPLOYMENT` (optional, for CLI targeting)

### Convex runtime env management

Merged in this order:
1. `config/env/convex.defaults.env` (tracked defaults)
2. `.env.convex.local` (ignored local overrides + secrets)

Required keys are defined in `config/env/convex.required.keys`.

Bootstrap local secret file:

```bash
cp .env.convex.local.example .env.convex.local
```

Validate before sync/deploy:

```bash
make env-doctor            # dev target
make env-doctor TARGET=prod
```

Sync examples:

```bash
make env-sync
make env-sync-prod
```

## Backend Surface (Convex Actions)

- `ai:routeHallMembers`
- `ai:suggestHallTitle`
- `ai:suggestMemberSpecialties`
- `ai:chatWithMember`
- `ai:compactConversation`
- `ai:ensureMemberKnowledgeStore`
- `ai:uploadMemberDocuments`
- `ai:listMemberKnowledgeDocuments`
- `ai:deleteMemberKnowledgeDocument`
- `ai:rehydrateMemberKnowledgeStore`
- `ai:purgeExpiredStagedKnowledgeDocuments`

## Notes

- Convex is the source of truth for members, conversations, messages, app config, and staged KB upload audit records.
- AI/KB actions enforce auth and ownership checks.
- Legacy Express backend has been removed.
