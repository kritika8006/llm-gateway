// Usage: node --env-file=.env eval/run.mjs
// Asks the cheap and the strong model every prompt in data/eval.json, scores the answers, and shows what routing would do.
// Slow on purpose (free-tier rate limits). Progress is saved to eval/results.json, so you can stop and re-run to resume.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { geminiModel } from '../src/providers.js';
import { loadModel, pHard } from '../src/router.js';
import { score } from './score.js';

const CHEAP = process.env.GEMINI_MODEL_CHEAP || 'gemini-2.5-flash-lite';
const STRONG = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const EMBED = process.env.EMBED_URL || 'http://localhost:8000';
const DELAY = Number(process.env.EVAL_DELAY_MS || 6500);
const THRESH = Number(process.env.ROUTER_THRESHOLD || 0.5);
const items = JSON.parse(readFileSync(new URL('../data/eval.json', import.meta.url)));
const resultsUrl = new URL('./results.json', import.meta.url);
const results = existsSync(resultsUrl) ? JSON.parse(readFileSync(resultsUrl)) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(provider, prompt) {
  let last = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    const t0 = Date.now();
    try { const out = await provider.call(prompt); await sleep(DELAY); return { ...out, latencyMs: Date.now() - t0 }; }
    catch (e) {
      last = e.message;
      if (!/gemini (429|5\d\d)/.test(last)) { console.log(`    ${provider.name}: ${last}, not retrying`); break; }
      console.log(`    ${provider.name}: ${last}, retry ${attempt}/4`); await sleep(15000 * attempt);
    }  }
  return { error: last };
}

for (const [slot, name] of [['cheap', CHEAP], ['strong', STRONG]]) {
  const p = geminiModel(name);
  for (const it of items) {
    results[it.id] ??= {};
    if (results[it.id][slot] && !results[it.id][slot].error) continue;
    console.log(`[${slot}] ${it.id}`);
    const out = await ask(p, it.prompt);
    results[it.id][slot] = out.error ? out : { ok: score(out.text, it.expect), text: out.text.slice(0, 2000),
      latencyMs: out.latencyMs, tokensOut: out.tokensOut };
    writeFileSync(resultsUrl, JSON.stringify(results, null, 1));
  }
}

const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
console.log('\ntier    model     answered  accuracy  avg latency  avg out tokens  errors');
for (const tier of ['easy', 'hard']) for (const slot of ['cheap', 'strong']) {
  const rs = items.filter((i) => i.tier === tier).map((i) => results[i.id][slot]);
  const good = rs.filter((r) => !r.error);
  console.log(`${tier.padEnd(7)} ${slot.padEnd(9)} ${String(good.length).padStart(4)}/${rs.length}   ${(100 * good.filter((r) => r.ok).length / (good.length || 1)).toFixed(0).padStart(6)}%   ${avg(good.map((r) => r.latencyMs)).toFixed(0).padStart(8)} ms   ${avg(good.map((r) => r.tokensOut)).toFixed(0).padStart(10)}      ${rs.length - good.length}`);
}

const model = loadModel();
if (!model) { console.log('\nNo src/router_model.json yet, run bench/train_router.mjs first to see routing results.'); process.exit(0); }
const er = await fetch(`${EMBED}/embed_batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ texts: items.map((i) => i.prompt) }) });
const vecs = (await er.json()).vectors.map((v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map((x) => x / n); });

const usable = items.map((it, i) => ({ it, i })).filter(({ it }) => !results[it.id].cheap.error && !results[it.id].strong.error);
let routedOk = 0, cheapN = 0, tokR = 0, tokS = 0;
for (const { it, i } of usable) {
  const slot = pHard(model, vecs[i]) >= THRESH ? 'strong' : 'cheap';
  if (slot === 'cheap') cheapN++;
  if (results[it.id][slot].ok) routedOk++;
  tokR += results[it.id][slot].tokensOut; tokS += results[it.id].strong.tokensOut;
}
const n = usable.length;
const acc = (slot) => (100 * usable.filter(({ it }) => results[it.id][slot].ok).length / n).toFixed(1);
console.log(`\nrouting on ${n} prompts (threshold ${THRESH}):`);
console.log(`  always cheap:  ${acc('cheap')}% correct`);
console.log(`  always strong: ${acc('strong')}% correct`);
console.log(`  routed:        ${(100 * routedOk / n).toFixed(1)}% correct, ${cheapN}/${n} sent to the cheap model`);
console.log(`  (output tokens, routed vs always-strong: ${tokR} vs ${tokS}; prices differ per model, so look up current prices before claiming a cost saving)`);