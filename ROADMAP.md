# Product Roadmap

This roadmap organizes current brainstormed ideas into a practical implementation order.

## 1) Near-Term (High Priority)

### 1.3 Hall UX Improvements
Status: In Progress (as of February 27, 2026)
- Improve Hall layout and interaction design for clarity and speed.
- Reduce friction in multi-member conversations (readability, action affordances, composer flow).

### 1.4 Hall Context/Cost Management
- Add memory/context management specifically for Hall multi-speaker calls.
- Introduce context compaction and token-budget strategies to reduce cost.
- Define guardrails for how much prior context is included per turn.

### 1.6 Monetization Guardrails (Tier + Message Caps)
- Add subscription/usage tiers and enforce usage caps so app sharing/release is cost-safe.
- Support hour-based value proposition (example: "talk to experts for X hours/month").
- Add per-user budget controls (hard cap, soft warning, overage behavior).
- Add model-aware usage accounting so caps can be defined in turns, credits, or estimated conversation hours.
- Baseline cost assumptions (to validate with real telemetry before launch):
  - Gemini 3 Flash Preview: `$0.00967/turn`, `$0.213/hour` (SD `$0.068`)
  - Chat Latest: `$0.03462/turn`, `$0.762/hour` (SD `$0.244`)
  - Claude Sonnet 4.6: `$0.05736/turn`, `$1.262/hour` (SD `$0.401`)
  - Grok 4 Fast (non-thinking): `$0.00371/turn`, `$0.082/hour` (SD `$0.026`)

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

### 1.5 Time-Aware Chamber Continuity
(Completed: March 12, 2026)
- Detect significant idle gaps (for example, 1+ day).
- Avoid carrying stale conversational momentum after long pauses.
- Re-introduce context with a lightweight recap when needed.

### 1.7 Conversation Scratchpad Notes (Hall + Chamber)
(Completed: March 7, 2026)
- Add per-conversation user notes/receipts as a built-in scratchpad in both Hall and Chamber.
- Goal: preserve chat flow while letting users quickly capture/copy/paste/edit supporting info.
- Keep editing lightweight (quick add, directly adding a whole response, inline edit, simple formatting only).
- UX requirement: first-class support on both mobile and desktop (layout, keyboard behavior, easy open/close).
- Scope boundary: notes are conversation-scoped (not global memory) and should not block chatting.

### 1.8 Chamber Guidance System
Status: Completed (March 16, 2026)
- Completed: added a Chamber-only member guidance layer that stores short-lived thread directives instead of mutating the member persona.
- Completed: added editable member guidance profiles in member settings, with generation from the member system prompt and manual regeneration/edit support.
- Completed: integrated deterministic thread guidance from time-aware re-entry and response-level user feedback.
- Completed: added Chamber message feedback controls for `Helpful`, `Not helpful`, `Shorter`, `Longer`, and `More direct`.
- Completed: guidance directives now steer future replies through a runtime inner-compass prompt block while preserving the member’s identity.
- Completed: added background Chamber reflection on a configurable cadence (`N` user turns, default `3`) to write temporary guidance notes for future replies.

## 2) Mid-Term (Core Capabilities)

### 2.1 Chamber Member Memory System
Status: Completed (March 20, 2026)
- Keep Personal Archive as the user-authored memory layer.
- Completed: added Chamber-only per-member long-term memory:
  - interaction policy,
  - mental model,
  - episodic memories.
- Completed: these memories are shared across that member's Chamber threads only.
- Completed: they are user-visible and user-editable from member settings.
- Completed: long-term member memory now refreshes in background jobs only (not from the chat path).
- Completed: Hall memory activation remains excluded.
- Follow-up: improve interaction-policy and mental-model extraction quality:
  - use more Bayesian-style evidence updates instead of blunt rewrites,
  - reduce fluff and repetition,
  - avoid echoing the member system prompt inside generated memory docs.
- Follow-up: dedicate env vars / model selection specifically for memory extraction and memory compaction jobs.
- Follow-up: add a non-locking user-nudges layer for memory building:
  - let the user add stable instructions such as `always talk shorter` or suggested edits,
  - store these as a separate collection instead of hard-overwriting the generated memory,
  - inject them into future memory-refresh prompts so new memory generations respect user guidance without locking the document.

### 2.2 Scheduled Chamber Memory Maintenance
Status: Completed (March 20, 2026)
- Completed: moved thread working memory / compaction ownership to the backend.
- Completed: long-term member memory refresh now runs on a scheduled Convex cadence.
- Completed: added refresh-state tracking, retry behavior, and maintenance workflows.

### 2.3 The Mirror (Talk to Yourself)
- Add a "Mirror" experience where the user talks to a reflection of themselves.
- Mirror should use the user's memories, reflections, and prior conversations as context.
- Dependency: only implement after memory features are mature and reliable.
- Goal: make introspection/coaching feel continuous and personal, not stateless.

### 2.4 Chamber Threads with Shared Memory
Status: Completed (March 20, 2026)
- Completed: chamber multi-thread support and thread UX.
- Completed: shared per-member Chamber memory across chamber threads.
- Allow multiple chamber threads per member (different subjects/workstreams).
- Threads must not feel like fresh-start chats every time.
- Thread model goal: same member persona and stable understanding of the user across that member's threads, with thread-specific working memory layered on top.
- Explicitly exclude:
  - cross-member memory sharing,
  - Hall memory activation,
  - generic cross-thread memory outside a single member's Chamber.

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

### 2.6 Response Modes (Behavior + Length Control)
Status: Completed (March 12, 2026)
- Completed: chamber response-mode switcher with `Instant`, `Short`, `Think`, and `Deep Dive`.
- Completed: latest-reply refinement actions with `Think harder`, `Deep dive`, `Shorter`, and `Elaborate`.
- Completed: per-thread mode persistence for Chamber only, with one-turn refinement overrides that do not mutate the thread mode.
- Completed: deep-dive retrieval/profile behavior, richer KB query planning, and superseded-message exclusion from future context.
- Add user-selectable response modes (examples):
  - Instant,
  - Brief/Short,
  - Deep Think,
  - Deep Dive,
- KB-assisted variants.
- Define UX for mode selection and mode persistence.

## 3) Platform / Architecture Changes

### 3.2 Improve KB Metadata Extraction
(Completed 22 March)
- Redesign extraction prompt(s) and extraction schema.
- Revisit what metadata is extracted and how it is normalized.
- Evaluate retrieval quality improvements from richer metadata.

### 3.3 Advanced KB Search (Parallel Querying)
(Completed 22 March)
- Implement advanced KB retrieval using multiple parallel queries per user request.
- Add query decomposition/rewrite strategies (facets, synonyms, intent slices).
- Merge/rank parallel retrieval results before final response generation.
- Add safeguards for duplicate hits, latency limits, and token/cost budgets.

### 3.6 Member Image Capability
- Add image capability to members (input and/or generation flow to be finalized).
- Define storage, moderation, and UI presentation rules.

### 3.7 Implement Wide Events
(Completed 20 March)
- Implement request-scoped wide events across backend pipelines.
- Standardize event shape for query-first debugging (request/user/conversation/member/model/retrieval context).
- Ensure critical AI paths emit one rich main event per unit of work with error and latency dimensions.
- Priority: high (required before broader release).

### 3.8 Backend-Owned Thread Working Memory
Status: Completed (March 20, 2026)
- Completed: moved Chamber compaction ownership out of the frontend and into backend chat workflows.
- Completed: replaced generic chamber summaries with a structured thread working-memory contract.
- Completed: keep recent raw turns alongside the working-memory snapshot.
- Follow-up: add evaluation checks for summary fidelity, drift, and token-efficiency.
- Follow-up: improve compaction behavior around dense user-provided payloads and pinned-thread context interactions.

### 3.9 Monitoring, Tracing, and Dashboards
- Add monitoring + tracing across frontend and backend paths.
- Add operational dashboards for usage, errors, latency, and cost trends (candidate: PostHog + backend telemetry sink).
- Priority: low (after core observability event instrumentation is in place).

### 3.1 Migrate Core Chat Stack to LangChain/LangGraph
Status: Completed (February 25, 2026)
- LangChain/LangGraph orchestration is now the core runtime architecture.
- OpenAI is the default for chat-generation tasks (chat-latest).
- Google models remain for selected non-chat tasks (routing, summaries, KB utility flows).
- Preserve existing Convex action contracts during migration.

### 3.4 KB Retrieval Activation + Query Planning Upgrade
Status: Completed (February 26, 2026, single-plan + fallback phase)
- Increase KB search activation likelihood when requests may benefit from grounded context (reduce over-conservative gating).
- Add a smarter query planner that can choose between direct retrieval, rewritten retrieval, and multi-query retrieval paths.
- Improve retrieval relevance/recall via better planning heuristics, reranking, and fallback behavior.
- Priority: high.

### 3.5 Voice Features
Status: Completed (March 5, 2026)
- Implemented voice-to-text in the shared chat composer (Hall, Hall Draft, Chamber).
- Finalized provider and API surface with Convex storage upload + Gemini transcription action (`ai/voice:transcribeAudioFromStorage`).
- Added live recording waveform UX, mic state handling, and transcript append-to-draft behavior.

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

### 4.3 Thread Archive Retrieval
- Deferred.
- Add semantic retrieval over older thread history when the summary + recent raw tail no longer provide enough coverage.
- Keep out of the current implementation scope.

## 5) Cross-Cutting Implementation Checklist
- Add telemetry and debug logging for each new pipeline.
- Add retry/idempotency safeguards for ingestion and memory writes.
- Add tests for lifecycle events (store deletion, retries, idle-gap behavior).
- Add migration plan + rollout flags for architecture transitions.
- Validate mobile + desktop UX for every major UI change.

## Notes
- This document captures brainstormed items and an initial ordering.
- Final sequencing should be validated against dependencies, risk, and release goals.

---
brainstorm:
inbox, timed tasks, reminders

better context management in the hall,

fast reserach context gathering: using grok and Gemini, do reserach and grounding -> we should think about the ux and product design.

Adding cognitive dissonance to members behaviour

memory retention policies, forgetingn memory system

history search mechanims (past chats of the same member/thread)

user commands can overwrite some of reeds system prompt behavior: change your tone, don't use emojis etc -> thread overwrite (targetd feedback, persisting directive) 

paragraph based query builder for kb search (the queris should cover all the parts of the input text)

mmebers area, double creation bug!

Wizard for member creation

byok for Gemini and free tier

pinning memebrs in list, 
members list based on latest activlity, up and down, both in chabmers and quick acess

api's with api key to use the council via external service, or change stuff

memebrs settings page, instead of side thing, open a box to change stuff

sticky kb/ cached kb, keep some kb search results in context, don't forget them -> needs more thinking

in the hall/roundtabe , on avery N rounds (say N = 5), do a redistriubtion of models + an re-evaultion mechinsm so the members don't get stuck with the same ideas or iterate them (needs more thinking)

bugs in the hall where the typing indcator comes after a member replies, 

search member names

global chat(thread+hall)/member search via shrotcut like shitf + cmd + p 

pagination for threads and hall chats. 

ai note polisher: for chat notes, have a button to just polish the note, make it more concise, readable, better fromated and organized, while keeping the original meaning intact, keeping the original substance, even verbatium if possible ...


image inputs in composer (up to 3 images per turn) + the model should write down details in the text first and put them in the context 

on long threads, the app becomes slow, even hard to wrote down in the composer

thinking modes and other modes that use thinking for creating response should use the thinking of the base model, not gemini

halls with profile memoery/personal sources or not option

brainstorm mode responses are very short, they should be more verbose

aliases in the coucnil url for fast access -> url:///elon ... -> opens a new chat with elon 


improve the observer in the council -> say stuff that the llm is not addressing like: you should let that girl go... it should work like a break, refelectio etc mechanism for the llm

helps, explantions for differnt features - council

improve kb serach -> bring in whole files, do agentic search etc
