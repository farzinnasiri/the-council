# Product Roadmap

This roadmap organizes current brainstormed ideas into a practical implementation order.

## 1) Near-Term (High Priority)

### 1.1 KB Upload UX (Members)
Status: Completed (February 26, 2026)
- Add upload progress/loading bars for knowledge-base document uploads.
- Improve overall KB upload UI states (queued, uploading, staged, ingesting, completed, failed).
- Add retry support for files already staged but not yet ingested.
- Improve error visibility with clear, actionable messages.

### 1.2 Knowledge Store Lifecycle
Status: Completed (February 26, 2026)
- When the last document in a member knowledge store is deleted, delete the underlying store as well.
- Ensure cleanup is safe and idempotent.
- Add backend + UI confirmation and post-delete state refresh.

### 1.3 Hall UX Improvements
- Improve Hall layout and interaction design for clarity and speed.
- Reduce friction in multi-member conversations (readability, action affordances, composer flow).

### 1.4 Hall Context/Cost Management
- Add memory/context management specifically for Hall multi-speaker calls.
- Introduce context compaction and token-budget strategies to reduce cost.
- Define guardrails for how much prior context is included per turn.

### 1.5 Time-Aware Chamber Continuity
- Detect significant idle gaps (for example, 1+ day).
- Avoid carrying stale conversational momentum after long pauses.
- Re-introduce context with a lightweight recap when needed.

### 1.6 Monetization Guardrails (Tier + Message Caps)
- Add subscription/usage tiers and enforce usage caps so app sharing/release is cost-safe.
- Support hour-based value proposition (example: "talk to experts for X hours/month").
- Add per-user budget controls (hard cap, soft warning, overage behavior).
- Add model-aware usage accounting so caps can be defined in turns, credits, or estimated conversation hours.
- Baseline cost assumptions (to validate with real telemetry before launch):
  - Gemini 3 Flash Preview: `$0.00967/turn`, `$0.213/hour` (SD `$0.068`)
  - GPT-5.2-chat-latest: `$0.03462/turn`, `$0.762/hour` (SD `$0.244`)
  - Claude Sonnet 4.6: `$0.05736/turn`, `$1.262/hour` (SD `$0.401`)
  - Grok 4 Fast (non-thinking): `$0.00371/turn`, `$0.082/hour` (SD `$0.026`)

### 1.7 Conversation Scratchpad Notes (Hall + Chamber)
- Add per-conversation user notes/receipts as a built-in scratchpad in both Hall and Chamber.
- Goal: preserve chat flow while letting users quickly capture/copy/paste/edit supporting info.
- Keep editing lightweight (quick add, inline edit, simple formatting only).
- UX requirement: first-class support on both mobile and desktop (layout, keyboard behavior, easy open/close).
- Scope boundary: notes are conversation-scoped (not global memory) and should not block chatting.

### 1.8 Response-Level User Signals (Auto-Adjustment)
- Let users attach lightweight feedback signals to each AI response (for example: shorter, clearer, too verbose, better structure).
- Convert these signals into automatic response-style adjustments for subsequent turns.
- Keep controls frictionless in both Hall and Chamber so feedback does not interrupt chat flow.
- Add guardrails to avoid overfitting to one-off signals (decay, recency weighting, reset controls).
- Make the adaptation behavior visible and reversible by the user.

## 2) Mid-Term (Core Capabilities)

### 2.1 User Memory / Background Digestion System
- Add a user profile memory area where users can:
  - write freeform notes,
  - speak audio notes,
  - upload files/data.
- Build ingestion/digestion pipelines so members/system can use this user memory as personalized context.
- Define safety boundaries and user controls for what memory is used.

### 2.2 Writable Chamber Memory + Cleanup
- Add a writable scratchpad memory for member chambers (model can add/update/remove).
- Define memory schema and permissions.
- Add periodic memory cleanup/maintenance (cron-based).

### 2.3 The Mirror (Talk to Yourself)
- Add a "Mirror" experience where the user talks to a reflection of themselves.
- Mirror should use the user's memories, reflections, and prior conversations as context.
- Dependency: only implement after memory features are mature and reliable.
- Goal: make introspection/coaching feel continuous and personal, not stateless.

### 2.4 Chamber Threads with Shared Memory
Status: In Progress (as of February 27, 2026)
- Completed: chamber multi-thread support and thread UX.
- Pending: shared long-term memory across chamber threads.
- Allow multiple chamber threads per member (different subjects/workstreams).
- Threads must not feel like fresh-start chats every time.
- Prerequisite: implement durable member identity memory + user memory integration first.
- Thread model goal: same member persona and stable understanding of the user across threads, with thread-specific context layered on top.
- Add clear thread boundaries (topic/history) while preserving shared long-term memory.

### 2.5 Coach Mode for Members
- Add per-member `Coach Mode` toggle.
- Create a dedicated coaching room experience.
- Keep access to chamber memory, plus separate coaching memory tracks:
  - goals,
  - actions,
  - outcomes,
  - reflections,
  - coach identity/profile memory.
- Apply coaching-specific system prompt/tool presets.

### 2.6 Response Modes (Behavior + Length Control)
- Add user-selectable response modes (examples):
  - Instant,
  - Brief/Short,
  - Deep Think,
  - Deep Dive,
- KB-assisted variants.
- Define UX for mode selection and mode persistence.

### 2.7 Model Orchestration: Director + Actor
- Introduce two-stage generation flow:
  - **Director** sets framing and target length from user prompt.
  - **Actor** generates in-character dialogue/content.
- Planned output contract:

```json
{
  "director_length_target": "very_short | short | medium | long | very_long",
  "character_dialogue": "..."
}
```

### 2.8 Member Agent Skills (Lightweight Context Engineering)
- Add support for installable/authorable member skills (agent behavior packs) that can be added by user or system workflows.
- Focus on soft-skill behaviors first (tone, coaching style, negotiation style, facilitation patterns, etc.).
- Build a KB-to-skills pipeline:
  - parse uploaded member KB files,
  - extract candidate skills/instructions,
  - let users enable/disable skills per member.
- Runtime strategy: prefer precise skill directives for applicable requests instead of always loading full KB RAG context.
- Treat this primarily as a context-engineering problem (instruction quality, activation rules, composition/conflict handling, observability).

### 2.9 Chamber Moderator Reflection Loop
- Add an optional moderator process in Chamber that runs every `N` turns.
- Use a lightweight model to review conversation state and emit structured guidance signals for the main member model.
- Initial signal examples: user is ranting, user is confused, user is disengaged, conversation drifted, tone mismatch.
- Keep outputs constrained to a controlled hint taxonomy (not freeform prompt sprawl).
- Treat moderator output as advisory context to improve response quality without changing visible user flow.

## 3) Platform / Architecture Changes

### 3.1 Migrate Core Chat Stack to LangChain/LangGraph
Status: Completed (February 25, 2026)
- LangChain/LangGraph orchestration is now the core runtime architecture.
- OpenAI is the default for chat-generation tasks (gpt-5.2-chat-latest).
- Google models remain for selected non-chat tasks (routing, summaries, KB utility flows).
- Preserve existing Convex action contracts during migration.

### 3.2 Improve KB Metadata Extraction
- Redesign extraction prompt(s) and extraction schema.
- Revisit what metadata is extracted and how it is normalized.
- Evaluate retrieval quality improvements from richer metadata.

### 3.3 Advanced KB Search (Parallel Querying)
- Implement advanced KB retrieval using multiple parallel queries per user request.
- Add query decomposition/rewrite strategies (facets, synonyms, intent slices).
- Merge/rank parallel retrieval results before final response generation.
- Add safeguards for duplicate hits, latency limits, and token/cost budgets.

### 3.4 KB Retrieval Activation + Query Planning Upgrade
Status: Completed (February 26, 2026, single-plan + fallback phase)
- Increase KB search activation likelihood when requests may benefit from grounded context (reduce over-conservative gating).
- Add a smarter query planner that can choose between direct retrieval, rewritten retrieval, and multi-query retrieval paths.
- Improve retrieval relevance/recall via better planning heuristics, reranking, and fallback behavior.
- Priority: high.

### 3.5 Voice Features
- Implement voice-to-text feature (planned provider: Google speech stack).
- Clarify/confirm final provider and API surface (speech-to-text vs text-to-speech naming).

### 3.6 Member Image Capability
- Add image capability to members (input and/or generation flow to be finalized).
- Define storage, moderation, and UI presentation rules.

### 3.7 Implement Wide Events
- Implement request-scoped wide events across backend pipelines.
- Standardize event shape for query-first debugging (request/user/conversation/member/model/retrieval context).
- Ensure critical AI paths emit one rich main event per unit of work with error and latency dimensions.
- Priority: high (required before broader release).

### 3.8 Improve Chat Compaction/Summarisation Prompt (Post-LangChain)
Status: In Progress (as of February 25, 2026)
- Redesign compaction and summarisation prompt strategy after LangChain/LangGraph migration is in place.
- Align summary contracts with new orchestration flow and memory lifecycle.
- Add evaluation checks for summary fidelity, drift, and token-efficiency.

### 3.9 Monitoring, Tracing, and Dashboards
- Add monitoring + tracing across frontend and backend paths.
- Add operational dashboards for usage, errors, latency, and cost trends (candidate: PostHog + backend telemetry sink).
- Priority: low (after core observability event instrumentation is in place).

### 3.10 Bounded-Context Backend Layout
Status: Completed (February 25, 2026)
- Keep Convex action paths stable while organizing backend internals by bounded context.
- Current target split:
  - `convex/contexts/hall/*`
  - `convex/contexts/chamber/*`
  - `convex/contexts/knowledge/*`
  - `convex/contexts/shared/*`
- Keep `convex/ai/*` as thin action adapters plus AI platform internals.

## 4) Integrations

### 4.1 Telegram Bot Integration
- Add Telegram bot channel for interacting with The Council.
- Define auth/linking flow between Telegram identity and app user account.
- Define message sync policy and capability scope for Telegram sessions.

### 4.2 Release Compliance (Legal/IP/Terms)
- Define release-ready terms and policy set (Terms of Service, privacy policy, acceptable use policy).
- Add legal review for copyright/IP risks in generated content and uploaded knowledge files.
- Define policy and guardrails for real-world personality mimicry/impersonation risk.
- Add user-facing disclosures and enforcement rules before public launch.

## 5) Cross-Cutting Implementation Checklist
- Add telemetry and debug logging for each new pipeline.
- Add retry/idempotency safeguards for ingestion and memory writes.
- Add tests for lifecycle events (store deletion, retries, idle-gap behavior).
- Add migration plan + rollout flags for architecture transitions.
- Validate mobile + desktop UX for every major UI change.

## Notes
- This document captures brainstormed items and an initial ordering.
- Final sequencing should be validated against dependencies, risk, and release goals.
