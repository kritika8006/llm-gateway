// Usage: node bench/train_router.mjs   (embed service must be running on :8000)
// Trains the router on data/router.json, prints cross-validated results, writes src/router_model.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { train, crossVal } from './logreg.js';

const EMBED = process.env.EMBED_URL || 'http://localhost:8000';
const data = JSON.parse(readFileSync(new URL('../data/router.json', import.meta.url)));
const prompts = [...data.easy, ...data.hard];
const y = [...data.easy.map(() => 0), ...data.hard.map(() => 1)];

const r = await fetch(`${EMBED}/embed_batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ texts: prompts }) });
if (!r.ok) throw new Error(`embed service said ${r.status}`);
const X = (await r.json()).vectors.map((v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map((x) => x / n); });

const probs = crossVal(X, y, 5);
let tp = 0, fp = 0, fn = 0, tn = 0;
const mistakes = [];
probs.forEach((p, i) => {
  const pred = p >= 0.5 ? 1 : 0;
  if (pred && y[i]) tp++; else if (pred && !y[i]) fp++; else if (!pred && y[i]) fn++; else tn++;
  if (pred !== y[i]) mistakes.push(`  ${y[i] ? 'HARD sent to cheap' : 'EASY sent to strong'} (p=${p.toFixed(2)}): ${prompts[i]}`);
});
const n = prompts.length;
console.log(`${n} labelled prompts (${data.easy.length} easy, ${data.hard.length} hard), 5-fold cross-validation`);
console.log(`accuracy:                       ${(100 * (tp + tn) / n).toFixed(1)}%`);
console.log(`hard prompts caught (recall):   ${(100 * tp / (tp + fn)).toFixed(1)}%   <- misses here risk quality`);
console.log(`easy prompts kept cheap:        ${(100 * tn / (tn + fp)).toFixed(1)}%   <- misses here waste money`);
if (mistakes.length) console.log(`\nmistakes:\n${mistakes.join('\n')}`);

const m = train(X, y);
const r5 = (x) => +x.toFixed(5);
writeFileSync(new URL('../src/router_model.json', import.meta.url),
  JSON.stringify({ w: m.w.map(r5), b: r5(m.b), trainedOn: n }));
console.log('\nwrote src/router_model.json  (rebuild the gateway so it picks it up)');