# Wide Events Runbook

## Event Shape

Every public Convex Node action in `convex/ai/*` emits exactly one structured JSON event with `main = true`.

Baseline fields:

- `http.request.method`
- `http.response.status_code`
- `http.route`
- `url.path`
- `duration_ms`
- `service.name`
- `service.environment`
- `service.version`
- `service.build.git_hash`
- `instance.id`
- `instance.memory_mb`
- `instance.cpu_count`
- `uptime_sec`
- `error`
- `exception.slug` and `exception.message` on failures
- `sample_rate`

By default, emitted output is intentionally essential-only:

- baseline request fields
- error fields
- `ai.response.model`
- `ai.retrieval.model`
- `llm.calls`

Set `WIDE_EVENTS_VERBOSE=1` to emit the richer debugging payload as well.

Additional verbose-only fields are attached as context becomes known, for example:

- `user.id`
- `conversation.id`
- `conversation.kind`
- `member.id`
- `hall.round_number`
- `routing.source`
- `guidance.trigger`
- `guidance.skipped_reason`
- `knowledge.docs_count`
- `archive.bucket_count`
- `ai.response.model`
- `ai.retrieval.model`

## LLM Payload Logging

`llm.calls` now captures prompt and response payloads for LLM invocations because they are part of the essential debugging surface for this project.

Still never emit:

- raw user messages outside the LLM prompt log
- archive entry text outside the LLM prompt log
- transcripts outside the LLM prompt log
- retrieval snippets
- auth tokens
- secrets

## Sink

Current sink:

```ts
console.log(event)
```

This is intentionally hidden behind the observability sink interface in `convex/observability/wideEvents.ts` so future sinks can be added without touching call sites.

## Sample Queries

Latency by route:

```bash
npx convex logs | jq 'select(.http.route != null) | {route: .["http.route"], duration_ms: .duration_ms}'
```

Failures by slug and version:

```bash
npx convex logs | jq 'select(.error == true) | {slug: .["exception.slug"], version: .["service.version"], route: .["http.route"]}'
```

Behavior by route/member/hall mode:

```bash
npx convex logs | jq '{route: .["http.route"], member: .["member.id"], hall_mode: .["hall.mode"], kb: .["ai.used_knowledge_base"], archive: .["ai.used_personal_archive"]}'
```
