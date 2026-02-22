# Product Roadmap

This roadmap organizes current brainstormed ideas into a practical implementation order.

## 1) Near-Term (High Priority)

### 1.1 KB Upload UX (Members)
- Add upload progress/loading bars for knowledge-base document uploads.
- Improve overall KB upload UI states (queued, uploading, staged, ingesting, completed, failed).
- Add retry support for files already staged but not yet ingested.
- Improve error visibility with clear, actionable messages.

### 1.2 Knowledge Store Lifecycle
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

### 2.3 Coach Mode for Members
- Add per-member `Coach Mode` toggle.
- Create a dedicated coaching room experience.
- Keep access to chamber memory, plus separate coaching memory tracks:
  - goals,
  - actions,
  - outcomes,
  - reflections,
  - coach identity/profile memory.
- Apply coaching-specific system prompt/tool presets.

### 2.4 Response Modes (Behavior + Length Control)
- Add user-selectable response modes (examples):
  - Instant,
  - Brief/Short,
  - Deep Think,
  - Deep Dive,
  - KB-assisted variants.
- Define UX for mode selection and mode persistence.

### 2.5 Model Orchestration: Director + Actor
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

## 3) Platform / Architecture Changes

### 3.1 Migrate Core Chat Stack to LangChain/LangGraph
- Replace direct Google GenAI-first orchestration with LangChain/LangGraph orchestration.
- Use OpenAI for chat-generation tasks.
- Keep Gemini for selected non-chat tasks where it performs better.
- Preserve existing Convex action contracts during migration.

### 3.2 Improve KB Metadata Extraction
- Redesign extraction prompt(s) and extraction schema.
- Revisit what metadata is extracted and how it is normalized.
- Evaluate retrieval quality improvements from richer metadata.

### 3.3 Voice Features
- Implement voice-to-text feature (planned provider: Google speech stack).
- Clarify/confirm final provider and API surface (speech-to-text vs text-to-speech naming).

### 3.4 Member Image Capability
- Add image capability to members (input and/or generation flow to be finalized).
- Define storage, moderation, and UI presentation rules.

## 4) Integrations

### 4.1 Telegram Bot Integration
- Add Telegram bot channel for interacting with The Council.
- Define auth/linking flow between Telegram identity and app user account.
- Define message sync policy and capability scope for Telegram sessions.

## 5) Cross-Cutting Implementation Checklist
- Add telemetry and debug logging for each new pipeline.
- Add retry/idempotency safeguards for ingestion and memory writes.
- Add tests for lifecycle events (store deletion, retries, idle-gap behavior).
- Add migration plan + rollout flags for architecture transitions.
- Validate mobile + desktop UX for every major UI change.

## Notes
- This document captures brainstormed items and an initial ordering.
- Final sequencing should be validated against dependencies, risk, and release goals.
