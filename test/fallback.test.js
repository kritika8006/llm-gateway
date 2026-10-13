import test from 'node:test';
import assert from 'node:assert/strict';
import { callWithFallback } from '../src/providers.js';

const ok = { name: 'b', call: async () => ({ text: 'hi', tokensIn: 1, tokensOut: 1 }) };
const bad = { name: 'a', call: async () => { throw new Error('down'); } };

test('falls back to next provider and records who failed', async () => {
  const r = await callWithFallback([bad, ok], 'x');
  assert.equal(r.provider, 'b');
  assert.deepEqual(r.fallbackFrom, ['a']);
});

test('throws when every provider fails', async () => {
  await assert.rejects(callWithFallback([bad, bad], 'x'), /all providers failed/);
});
