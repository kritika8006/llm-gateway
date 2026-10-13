import express from 'express';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import mongoose from 'mongoose';
import { geminiModel, ollama, callWithFallback } from './providers.js';
import { rateLimit } from './rateLimit.js';
import { makeCache, embed } from './cache.js';
import { loadModel, pickRoute } from './router.js';
import { summarize } from './stats.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
await mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/gateway');
const Log = mongoose.model('Log', new mongoose.Schema({
  user: String, provider: String, prompt: String, latencyMs: Number,
  tokensIn: Number, tokensOut: Number, fallbackFrom: [String], error: String,
  errors: [mongoose.Schema.Types.Mixed],
  cacheHit: Boolean, similarity: Number, tokensSaved: Number,
  route: String, pHard: Number,
}, { timestamps: true }));

const useCache = process.env.CACHE_ENABLED !== 'false';
const cache = makeCache(redis, { threshold: Number(process.env.CACHE_THRESHOLD || 0.9) });

const CHEAP = geminiModel(process.env.GEMINI_MODEL_CHEAP || 'gemini-2.5-flash-lite');
const STRONG = geminiModel(process.env.GEMINI_MODEL || 'gemini-2.5-flash');
const routerModel = process.env.ROUTER_ENABLED === 'false' ? null : loadModel();
const routerThreshold = Number(process.env.ROUTER_THRESHOLD || 0.5);

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url)))); // built dashboard (Docker image)

app.post('/v1/chat', rateLimit(redis), async (req, res) => {
  const t0 = Date.now();
  const { prompt } = req.body ?? {};
  if (typeof prompt !== 'string' || !prompt.trim()) return res.status(400).json({ error: 'prompt (string) required' });

  let vec = null, embedFailed = false;
  if (useCache) {
    try {
      const r = await cache.lookup(prompt);
      vec = r.vec;
      if (r.hit) {
        const latencyMs = Date.now() - t0;
        await Log.create({ user: req.userKey, prompt, provider: 'cache', cacheHit: true, similarity: r.score, latencyMs,
          tokensSaved: (r.hit.tokensIn || 0) + (r.hit.tokensOut || 0) });
        return res.json({ text: r.hit.text, provider: 'cache', cache: 'hit', similarity: +r.score.toFixed(3), latencyMs });
      }
    } catch (e) { embedFailed = true; console.error('cache lookup skipped:', e.message); } // fail open
  }
  if (!vec && !embedFailed && routerModel) {
    try { vec = await embed(prompt); } catch (e) { console.error('router embed skipped:', e.message); }
  }

  const { route, pHard } = pickRoute(routerModel, vec, routerThreshold);
  const order = route === 'cheap' ? [CHEAP, STRONG, ollama] : [STRONG, CHEAP, ollama];

  try {
    const out = await callWithFallback(order, prompt);
    if (vec && useCache) cache.store(prompt, vec, out).catch((e) => console.error('cache store failed:', e.message));
    await Log.create({ user: req.userKey, prompt, ...out, cacheHit: false, route, pHard });
    res.json({ text: out.text, provider: out.provider, route, pHard: pHard == null ? null : +pHard.toFixed(3),
      cache: useCache ? 'miss' : 'off', latencyMs: out.latencyMs });
  } catch (e) {
    await Log.create({ user: req.userKey, prompt, error: e.message, errors: e.details, cacheHit: false, route, pHard });
    res.status(502).json({ error: e.message, details: e.details });
  }
});

// Aggregated numbers for the dashboard. Set ADMIN_KEY in production so only you can read it.
const adminOnly = (req, res, next) =>
  process.env.ADMIN_KEY && req.get('x-admin-key') !== process.env.ADMIN_KEY ? res.status(401).json({ error: 'admin key required' }) : next();

app.get('/v1/stats', adminOnly, async (req, res) => {
  const hours = Math.min(Number(req.query.hours) || 24, 720);
  const since = new Date(Date.now() - hours * 3600 * 1000);
  // shortcut: summarizes the newest 5000 logs in JS; use Mongo aggregation pipelines past that
  const docs = await Log.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(5000).lean();
  res.json({ hours, ...summarize(docs) });
});

app.get('/health', (_, res) => res.json({ ok: true }));
app.listen(3000, () => console.log(`gateway on :3000 (cache ${useCache ? 'on' : 'off'}, router ${routerModel ? 'on' : 'off'})`));