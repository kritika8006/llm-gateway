import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCache, normalize } from '../src/cache.js';
import { simulate } from '../bench/simulate.js';

// tiny in-memory stand-in for the Redis calls the cache uses
const fakeRedis = () => { const h = new Map(); return {
  hvals: async () => [...h.values()], hset: async (_k, id, v) => h.set(id, v), hlen: async () => h.size }; };
// fake embedder: maps a prompt to a fixed 2-d direction
const vecs = { a: [1, 0], 'a-ish': [0.95, 0.31], b: [0, 1] };
const embedFn = async (p) => normalize(vecs[p]);

test('cache hits on similar prompts and misses on different ones', async () => {
  const c = makeCache(fakeRedis(), { threshold: 0.9, embedFn });
  const first = await c.lookup('a');
  assert.equal(first.hit, null);
  await c.store('a', first.vec, { text: 'answer A', tokensIn: 3, tokensOut: 7 });

  const similar = await c.lookup('a-ish');
  assert.equal(similar.hit.text, 'answer A');
  assert.ok(similar.score > 0.9);

  const different = await c.lookup('b');
  assert.equal(different.hit, null);
});

test('threshold decides the hit', async () => {
  const c = makeCache(fakeRedis(), { threshold: 0.999, embedFn });
  const first = await c.lookup('a');
  await c.store('a', first.vec, { text: 'x' });
  assert.equal((await c.lookup('a-ish')).hit, null);
});

test('simulate counts hits and wrong hits', () => {
  const n = normalize;
  const items = [
    { group: 'g1', vec: n([1, 0]) },
    { group: 'g1', vec: n([0.98, 0.2]) },  // correct hit
    { group: 'g2', vec: n([0.97, 0.25]) }, // wrong hit: close to g1 but a different intent
    { group: 'g3', vec: n([0, 1]) },       // miss
  ];
  assert.deepEqual(simulate(items, 0.9), { hits: 2, wrong: 1, total: 4 });
});