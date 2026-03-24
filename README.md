# The Council

Hall + Chamber advisory chat app with:

- React 19 + Vite + TypeScript frontend
- Zustand state + Convex-backed repository layer
- Convex backend functions (queries, mutations, and Node actions)
- LangChain/LangGraph orchestration with provider split (OpenAI chat + Google utility tasks) in `convex/ai/*`
- DDD-lite bounded-context backend organization under `convex/contexts/*`
- centralized backend model mapping in `convex/ai/modelConfig.ts`

## Current Product Behavior

- Halls are created lazily from `/hall/new` on first send.
- Hall routing is one-off per hall: first routed turn chooses participants, later turns use active hall participants.
- Roundtable halls open with one parallel opening round, then switch to user-moderated one-speaker-at-a-time rounds.
- Later roundtable rounds re-evaluate raised hands after each speaker and stop when the round cap is hit, nobody still wants to speak, or the user moves on.
- Chambers support multiple threads per member. `/chamber/member/:memberId` opens the latest thread, and `/chamber/:conversationId` is the canonical thread route.
- Hall member replies are generated in parallel and rendered progressively as they arrive.
- Member avatars support crop/upload via `react-easy-crop`; create flow stages avatar and applies it after first save.

## Backend Organization

- `convex/ai/*` contains the Convex action surface and AI platform internals (runtime, provider, graphs).
- `convex/contexts/hall/*` contains Hall + Roundtable domain/application/infrastructure logic.
- `convex/contexts/chamber/*` contains Chamber chat and compaction application logic.
- `convex/contexts/knowledge/*` contains knowledge store lifecycle application/infrastructure logic.
- `convex/contexts/shared/*` contains shared contracts, auth ownership checks, and Convex gateway helpers.
- `convex/ai/routing.ts`, `convex/ai/chat.ts`, `convex/ai/roundtable.ts`, and `convex/ai/knowledge.ts` are thin action adapters that delegate to context use-cases.

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
make deploy         # validate + sync env + deploy to dev (convex dev --once)
make deploy-prod    # validate + sync env + deploy to prod (convex deploy)
make logs           # dev logs
make logs-prod      # prod logs
make vercel-init-check    # validate Vercel CLI + routing config
make vercel-preview       # deploy frontend to Vercel preview
make vercel-deploy        # deploy frontend to Vercel production
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

Important:
- `SITE_URL` must be set in `.env.convex.local` (do not rely on defaults).
- `JWT_PRIVATE_KEY` and `JWKS` are managed by `npx @convex-dev/auth` and should not be manually set in `.env.convex.local`.
- Response-model slots use `AI_MODEL_CHAT_RESPONSE` for slot 1, then `AI_MODEL_CHAT_RESPONSE_2`, `AI_MODEL_CHAT_RESPONSE_3`, and so on. There is no `AI_MODEL_CHAT_RESPONSE_1`.
- `openai:*` and `google:*` response models use the native integrations already in the app.
- Any other response-model shorthand in `<vendor>:<model>` form, such as `x-ai:grok-4.20-beta`, is routed through OpenRouter at runtime.
- `OPENROUTER_API_KEY` is only required when at least one configured `AI_MODEL_CHAT_RESPONSE*` slot uses that OpenRouter shorthand.

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

Deploy targets also run the matching env sync automatically before pushing Convex code, so auth/runtime settings do not drift from the checked local configuration.

## Vercel Deployment

- Frontend is deployed to Vercel as a static SPA.
- Backend/data/auth remain on Convex.
- SPA rewrites are configured in `vercel.json` so deep links resolve to `index.html`.

### Required Vercel environment variables

- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL`

### Required Convex auth URL setting

- Convex runtime `SITE_URL` should match your deployed frontend URL (for OAuth callbacks), for example:
  - `SITE_URL=https://the-council-hazel.vercel.app`

### Local/manual Vercel ops

```bash
make vercel-init-check
make vercel-preview
make vercel-deploy
```

### Rollback path

- Re-deploy a known-good commit:
  - `git checkout <good-commit>`
  - `npm ci && npm run build`
  - `make vercel-deploy`

## Backend Surface (Convex Actions)

- `ai/routing:routeHallMembers`
- `ai/routing:suggestHallTitle`
- `ai/routing:suggestMemberSpecialties`
- `ai/chat:chatWithMember`
- `ai/chat:compactConversation`
- `ai/voice:transcribeAudioFromStorage`
- `ai/roundtable:prepareRoundtableRound`
- `ai/roundtable:refreshRoundtableRound`
- `ai/roundtable:chatRoundtableSpeaker`
- `ai/knowledge:ensureMemberKnowledgeStore`
- `ai/knowledge:uploadMemberDocuments`
- `ai/knowledge:listMemberKnowledgeDocuments`
- `ai/knowledge:deleteMemberKnowledgeDocument`
- `ai/knowledge:rehydrateMemberKnowledgeStore`
- `ai/knowledge:purgeExpiredStagedKnowledgeDocuments`
- `ai/knowledge:rebuildMemberKnowledgeDigests`

## Notes

- Convex is the source of truth for members, conversations, messages, app config, and staged KB upload audit records.
- AI/KB actions enforce auth and ownership checks.
- Legacy Express backend has been removed.
