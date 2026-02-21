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

## Development

```bash
npm install
npm run dev
```

- Frontend (Vite): [http://localhost:43112](http://localhost:43112)

Run Convex in a separate terminal:

```bash
npx convex dev
```

## Build / Preview

```bash
npm run build
npm start
```

- Frontend bundle output: `frontend-dist/`

## Environment

### Local frontend env (`.env.local`)

- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL`

### Convex runtime env (set on deployment)

```bash
npx convex env set GEMINI_API_KEY <value>
npx convex env set GEMINI_CHAT_MODEL <value>
npx convex env set GEMINI_RETRIEVAL_MODEL <value>
npx convex env set GEMINI_ROUTER_MODEL <value>
npx convex env set GEMINI_HALL_TITLE_MODEL <value>
npx convex env set GEMINI_SPECIALTIES_MODEL <value>
npx convex env set GEMINI_SUMMARY_MODEL <value>
npx convex env set GEMINI_CHAMBER_MEMORY_MODEL <value>
npx convex env set GEMINI_KB_GATE_MODEL <value>
npx convex env set GEMINI_ROUTER_TEMPERATURE <value>
npx convex env set GEMINI_DEBUG_LOGS <value>
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
