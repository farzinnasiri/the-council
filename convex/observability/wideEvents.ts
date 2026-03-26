'use node';

import os from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ensureWideEventError } from './errors';

type WideEventPrimitive = string | number | boolean;
type WideEventValue = WideEventPrimitive | null | undefined;
type WideEventAttributes = Record<string, WideEventValue>;
type WideEventListEntry = Record<string, unknown> | string | number | boolean | null;

type WideEventSink = (event: Record<string, unknown>) => void;

interface WideEventState {
  event: Record<string, unknown>;
  startedAt: number;
}

const storage = new AsyncLocalStorage<WideEventState>();

let sink: WideEventSink = (event) => {
  console.log(event);
};

const ESSENTIAL_EVENT_KEYS = new Set([
  'timestamp',
  'main',
  'trace.id',
  'event.id',
  'event.name',
  'http.request.method',
  'http.route',
  'url.path',
  'http.response.status_code',
  'duration_ms',
  'service.name',
  'service.environment',
  'service.version',
  'service.build.git_hash',
  'sample_rate',
  'error',
  'exception.slug',
  'exception.type',
  'exception.message',
  'exception.stacktrace',
  'ai.response.model',
  'ai.retrieval.model',
  'knowledge.list.error',
  'knowledge.list.error_message',
  'knowledge.planner.status',
  'knowledge.planner.error',
  'knowledge.gate.run',
  'knowledge.gate.disabled_reason',
  'knowledge.error_count',
  'knowledge.errors',
  'memory.summary.present',
  'memory.context_messages.count',
  'memory.episodes.count',
  'memory.pinned_messages.count',
  'personal_source.available',
  'personal_source.count',
  'personal_source.list.error',
  'personal_source.list.error_message',
  'personal_source.plan.status',
  'personal_source.plan.error',
  'personal_source.plan.reason',
  'personal_source.run',
  'personal_source.gate.disabled_reason',
  'personal_source.error_count',
  'personal_source.errors',
  'llm.calls',
]);

function nowMs(): number {
  return Date.now();
}

function randomId(): string {
  return crypto.randomUUID();
}

function serviceEnvironment(): string {
  const explicit = process.env.SERVICE_ENVIRONMENT?.trim();
  if (explicit) return explicit;

  const deployment = process.env.CONVEX_DEPLOYMENT?.trim().toLowerCase();
  if (deployment?.includes('prod')) return 'production';
  if (deployment) return 'development';

  const nodeEnv = process.env.NODE_ENV?.trim();
  return nodeEnv || 'unknown';
}

function serviceVersion(): string {
  return process.env.SERVICE_VERSION?.trim() || process.env.npm_package_version?.trim() || '1.0.0';
}

function serviceGitHash(): string {
  return (
    process.env.SERVICE_GIT_HASH?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim() ||
    'unknown'
  );
}

function isVerboseWideEventsEnabled(): boolean {
  const raw = process.env.WIDE_EVENTS_VERBOSE?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9:_-]+/g, '/');
}

function buildBaseEvent(name: string): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    'main': true,
    'trace.id': randomId(),
    'event.id': randomId(),
    'event.name': name,
    'http.request.method': 'POST',
    'http.route': name,
    'url.path': `/convex/action/${sanitizePathSegment(name)}`,
    'service.name': 'the-council-convex',
    'service.environment': serviceEnvironment(),
    'service.version': serviceVersion(),
    'service.build.git_hash': serviceGitHash(),
    'instance.id': `${os.hostname()}:${process.pid}`,
    'instance.memory_mb': Math.round(process.memoryUsage().rss / (1024 * 1024)),
    'instance.cpu_count': os.cpus().length,
    'uptime_sec': Math.round(process.uptime()),
    'sample_rate': 1,
    'error': false,
  };
}

function currentState(): WideEventState | undefined {
  return storage.getStore();
}

function mergeAttributes(target: Record<string, unknown>, attrs: WideEventAttributes): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    target[key] = value;
  }
}

function addDurationField(target: Record<string, unknown>, key: string, durationMs: number): void {
  const previous = typeof target[key] === 'number' ? (target[key] as number) : 0;
  target[key] = Math.round((previous + durationMs) * 100) / 100;
}

export function setWideEventSinkForTests(nextSink: WideEventSink): void {
  sink = nextSink;
}

export function resetWideEventSinkForTests(): void {
  sink = (event) => {
    console.log(event);
  };
}

export function getMainTraceId(): string {
  return String(currentState()?.event['trace.id'] ?? randomId());
}

export function setMainSpanAttributes(attrs: WideEventAttributes): void {
  const state = currentState();
  if (!state) return;
  mergeAttributes(state.event, attrs);
}

export function appendMainList(name: string, value: WideEventListEntry): void {
  const state = currentState();
  if (!state) return;
  const current = Array.isArray(state.event[name]) ? [...(state.event[name] as WideEventListEntry[])] : [];
  current.push(value);
  state.event[name] = current;
}

export function incrementMainStat(name: string, value = 1): void {
  const state = currentState();
  if (!state) return;
  const current = typeof state.event[name] === 'number' ? (state.event[name] as number) : 0;
  state.event[name] = current + value;
}

export function addMainDuration(name: string, durationMs: number): void {
  const state = currentState();
  if (!state) return;
  addDurationField(state.event, name, durationMs);
}

export function recordMainError(error: unknown, fallbackSlug?: string): void {
  const state = currentState();
  if (!state) return;

  const resolved = ensureWideEventError(error, fallbackSlug);
  state.event['error'] = true;
  state.event['http.response.status_code'] = resolved.statusCode;
  state.event['exception.slug'] = resolved.slug;
  state.event['exception.type'] = resolved.name || 'Error';
  state.event['exception.message'] = resolved.message;
  if (resolved.stack) {
    state.event['exception.stacktrace'] = resolved.stack.slice(0, 4000);
  }
}

export async function measureMainStage<T>(
  name: string,
  fn: () => Promise<T>,
  options?: { counter?: string }
): Promise<T> {
  const start = nowMs();
  try {
    return await fn();
  } finally {
    addMainDuration(`${name}.duration_ms`, nowMs() - start);
    if (options?.counter) {
      incrementMainStat(options.counter, 1);
    }
  }
}

function wrapStorage(storageApi: any): any {
  if (!storageApi || typeof storageApi !== 'object') return storageApi;
  return {
    ...storageApi,
    get: async (...args: any[]) =>
      await measureMainStage('storage.get', async () => await storageApi.get(...args), {
        counter: 'stats.storage.get.count',
      }),
    delete: async (...args: any[]) =>
      await measureMainStage('storage.delete', async () => await storageApi.delete(...args), {
        counter: 'stats.storage.delete.count',
      }),
  };
}

function instrumentCtx(ctx: any): any {
  if (!ctx || typeof ctx !== 'object') return ctx;

  return {
    ...ctx,
    runQuery: async (...args: any[]) =>
      await measureMainStage('db.query', async () => await ctx.runQuery(...args), {
        counter: 'stats.db.query.count',
      }),
    runMutation: async (...args: any[]) =>
      await measureMainStage('db.mutation', async () => await ctx.runMutation(...args), {
        counter: 'stats.db.mutation.count',
      }),
    vectorSearch: typeof ctx.vectorSearch === 'function'
      ? async (...args: any[]) =>
          await measureMainStage('vector_search', async () => await ctx.vectorSearch(...args), {
            counter: 'stats.vector_search.count',
          })
      : ctx.vectorSearch,
    storage: wrapStorage(ctx.storage),
  };
}

export function observeAction<THandler extends (ctx: any, args: any) => Promise<any>>(
  name: string,
  handler: THandler
): THandler {
  return (async (ctx: Parameters<THandler>[0], args: Parameters<THandler>[1]) => {
    const state: WideEventState = {
      event: buildBaseEvent(name),
      startedAt: nowMs(),
    };

    return await storage.run(state, async () => {
      const instrumentedCtx = instrumentCtx(ctx);
      try {
        const result = await handler(instrumentedCtx, args);
        state.event['http.response.status_code'] = 200;
        return result;
      } catch (error) {
        recordMainError(error);
        throw error;
      } finally {
        state.event['duration_ms'] = nowMs() - state.startedAt;
        state.event['instance.memory_mb'] = Math.round(process.memoryUsage().rss / (1024 * 1024));
        state.event['uptime_sec'] = Math.round(process.uptime());
        const output = isVerboseWideEventsEnabled()
          ? state.event
          : Object.fromEntries(
              Object.entries(state.event).filter(([key]) => ESSENTIAL_EVENT_KEYS.has(key))
            );
        sink(output);
      }
    });
  }) as THandler;
}
