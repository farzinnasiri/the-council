import assert from 'node:assert/strict';
import {
  observeAction,
  resetWideEventSinkForTests,
  setMainSpanAttributes,
  setWideEventSinkForTests,
} from '../convex/observability/wideEvents';
import { wideEventError } from '../convex/observability/errors';

type CapturedEvent = Record<string, unknown>;

process.env.WIDE_EVENTS_VERBOSE = '1';

async function main() {
  const events: CapturedEvent[] = [];
  setWideEventSinkForTests((event) => {
    events.push(event);
  });

  const mockCtx = {
    async runQuery() {
      return { ok: true };
    },
    async runMutation() {
      return { ok: true };
    },
    async vectorSearch() {
      return [];
    },
    storage: {
      async get() {
        return null;
      },
      async delete() {
        return undefined;
      },
    },
  };

  const okHandler = observeAction('test.wideEvents.success', async (ctx: typeof mockCtx, args: { memberId: string }) => {
    setMainSpanAttributes({
      'member.id': args.memberId,
      'knowledge.docs_count': 2,
    });
    await ctx.runQuery('members:getById', {});
    await ctx.runMutation('members:update', {});
    await ctx.vectorSearch('kbDocumentChunks', 'by_embedding', {});
    await ctx.storage.delete('storage-id');
    return { ok: true };
  });

  const errorHandler = observeAction('test.wideEvents.error', async () => {
    setMainSpanAttributes({ 'guidance.trigger': 'feedback' });
    throw wideEventError('guidance-reflection-failed', 'Reflection failed');
  });

  await okHandler(mockCtx, { memberId: 'member_123' });
  await assert.rejects(() => errorHandler(mockCtx, {}), /Reflection failed/);

  assert.equal(events.length, 2, 'expected exactly one event per wrapped action');

  const success = events[0];
  const failure = events[1];

  assert.equal(success['main'], true);
  assert.equal(success['http.request.method'], 'POST');
  assert.equal(success['http.route'], 'test.wideEvents.success');
  assert.equal(typeof success['url.path'], 'string');
  assert.equal(success['http.response.status_code'], 200);
  assert.equal(success['service.name'], 'the-council-convex');
  assert.equal(success['error'], false);
  assert.equal(typeof success['duration_ms'], 'number');
  assert.equal(success['member.id'], 'member_123');
  assert.equal(success['stats.db.query.count'], 1);
  assert.equal(success['stats.db.mutation.count'], 1);
  assert.equal(success['stats.vector_search.count'], 1);
  assert.equal(success['stats.storage.delete.count'], 1);
  assert.equal(success['sample_rate'], 1);

  assert.equal(failure['main'], true);
  assert.equal(failure['error'], true);
  assert.equal(failure['http.response.status_code'], 500);
  assert.equal(failure['exception.slug'], 'guidance-reflection-failed');
  assert.equal(failure['exception.message'], 'Reflection failed');

  const serialized = JSON.stringify(events);
  assert.ok(!serialized.includes('answerPrompt'));
  assert.ok(!serialized.includes('retrievalText'));
  assert.ok(!serialized.includes('snippets'));
  assert.ok(!serialized.includes('transcript'));

  console.log('wide-events verification passed');
  resetWideEventSinkForTests();
}

void main().catch((error) => {
  resetWideEventSinkForTests();
  console.error(error);
  process.exitCode = 1;
});
