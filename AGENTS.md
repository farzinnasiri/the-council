# AGENTS.md

The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in the project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the agent MD file to help prevent future agents from having the same issue.

## Keep These Invariants

1. Backend is Convex-only. Do not add Express/Node API runtime paths.
2. All app content is auth-gated. Unauthenticated users must not see app pages.
3. Do not bypass Convex auth context in backend functions (`getAuthUserId`).
4. Do not create/use `ConvexHttpClient` flows without token wiring (`setToken()` via auth gate path).
5. Keep UI/UX responsive and mobile-safe.

## Operational Rules

1. Prefer `make` targets for env/deploy/verification workflows.
2. Prefer `make vercel-*` targets for Vercel operations.
3. Never commit secrets or env files (`.env`, `.env.local`, `.env.convex.local`), never read them, only ask the user. 

## Known Confusion Points

1. The workspace path currently includes trailing spaces (`.../the-council  `). Absolute-path tooling can fail with `Not a directory` unless paths preserve those trailing spaces exactly. Prefer repo-relative paths in shell/apply_patch commands.

## Required Validation Before Finalizing

1. `npm run build`
2. `npx convex codegen --typecheck enable --dry-run`

## Development Phase and Collaboration

This project is still greenfield and actively evolving. It is acceptable to re-architect, redesign, repurpose, or replace existing patterns when there is a better approach.

Strict collaboration rule:
1. If something looks messy, fragile, or suboptimal, tell the developer explicitly.
2. If you see a materially better approach, propose it before or alongside implementation.
3. Do not silently continue with questionable code just to ship quickly. actively ask questions and seek clarification. 
4. Treat this as collaborative engineering: surface tradeoffs, risks, and alternatives, then align with the developer.
