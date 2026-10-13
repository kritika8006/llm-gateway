import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, percentile } from '../src/stats.js';
import { rateLimit } from '../src/rateLimit.js';

test('percentile uses nearest-rank on a sorted list', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
  assert.equal(percentile([10, 20, 30, 40], 95), 40);
});

test('summarize counts routes, cache hits, tokens saved and latency', () => {
  const t = '2026-10-13T09:15:00Z';
  const docs = [
    { createdAt: t, provider: 'cache', cacheHit: true, latencyMs: 40, tokensSaved: 30 },
    { createdAt: t, provider: 'cache', cacheHit: true, latencyMs: 60, tokensSaved: 20 },
    { createdAt: t, provider: 'gemini:flash', cacheHit: false, route: 'strong', latencyMs: 2000 },
    { createdAt: '2026-10-13T10:05:00Z', provider: 'gemini:lite', cacheHit: false, route: 'cheap', latencyMs: 800 },
    { createdAt: '2026-10-13T10:06:00Z', cacheHit: false, error: 'all providers failed' },
  ];
  const s = summarize(docs);
  assert.equal(s.total, 5);
  assert.equal(s.cacheHits, 2);
  assert.equal(s.hitRate, 0.4);
  assert.equal(s.tokensSaved, 50);
  assert.deepEqual(s.routes, { cache: 2, cheap: 1, strong: 1, unrouted: 0, error: 1 });
  assert.equal(s.latency.cache.p50, 40);
  assert.equal(s.latency.model.n, 2);
  assert.deepEqual(s.byHour.map((h) => [h.hour, h.requests, h.cacheHits]), [['2026-10-13T09', 3, 2], ['2026-10-13T10', 2, 0]]);
});

test('summarize handles an empty log', () => {
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.equal(s.hitRate, 0);
  assert.equal(s.latency.cache.p50, null);
});

test('rateLimit rejects keys outside API_KEYS and allows listed ones', async () => {
  const run = async (key, allowed) => {
    process.env.API_KEYS = allowed;
    let status = 200, nexted = false;
    const req = { get: (h) => ({ 'x-api-key': key })[h] };
    const res = { status(c) { status = c; return this; }, json() { return this; } };
    await rateLimit({ eval: async () => 1 })(req, res, () => { nexted = true; });
    return { status, nexted };
  };
  assert.deepEqual(await run('hacker', 'demo, me'), { status: 401, nexted: false });
  assert.deepEqual(await run('demo', 'demo, me'), { status: 200, nexted: true });
  delete process.env.API_KEYS;
});