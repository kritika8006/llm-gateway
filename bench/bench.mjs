// Usage: node bench/bench.mjs   (needs the embed service on :8000, makes no LLM calls)
import { readFileSync } from 'node:fs';
import { simulate } from './simulate.js';

const EMBED = process.env.EMBED_URL || 'http://localhost:8000';
const data = JSON.parse(readFileSync(new URL('../data/prompts.json', import.meta.url)));
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const items = Object.entries(data).flatMap(([group, ps]) => ps.map((prompt) => ({ group, prompt })));
for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }

const t0 = Date.now();
const r = await fetch(`${EMBED}/embed_batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ texts: items.map((i) => i.prompt) }) });
if (!r.ok) throw new Error(`embed service said ${r.status}`);
const { vectors } = await r.json();
const ms = Date.now() - t0;
items.forEach((it, i) => {
  const v = vectors[i], n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  it.vec = v.map((x) => x / n);
});

const groups = Object.keys(data).length;
console.log(`${items.length} prompts, ${groups} intents, embedded in ${ms} ms (${(ms / items.length).toFixed(1)} ms each, batched)`);
console.log(`Best possible hit rate: ${(100 * (items.length - groups) / items.length).toFixed(1)}% (first prompt of each intent must miss)\n`);
console.log('threshold  hit rate  wrong-hit rate  (wrong hits / hits)');
for (const t of [0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) {
  const s = simulate(items, t);
  console.log(`${t.toFixed(2)}       ${(100 * s.hits / s.total).toFixed(1).padStart(5)}%    ${(s.hits ? 100 * s.wrong / s.hits : 0).toFixed(1).padStart(5)}%         (${s.wrong}/${s.hits})`);
}
console.log('\nPick the highest hit rate whose wrong-hit rate you can defend, then set CACHE_THRESHOLD.');