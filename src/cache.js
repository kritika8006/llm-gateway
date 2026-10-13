// Semantic cache: embed the prompt, find the closest cached prompt, reuse its answer if similar enough.
// shortcut: linear scan over a Redis hash and one global cache shared by all users. Fine for thousands of
// entries; at scale use a vector index (RediSearch / pgvector) and namespace the cache per user or tenant.
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const normalize = (v) => { const n = Math.sqrt(dot(v, v)) || 1; return v.map((x) => x / n); };

export function bestMatch(entries, vec) {
  let entry = null, score = -1;
  for (const e of entries) {
    const s = dot(e.vec, vec);
    if (s > score) { score = s; entry = e; }
  }
  return { entry, score };
}

export async function embed(text) {
  const r = await fetch(`${process.env.EMBED_URL || 'http://localhost:8000'}/embed`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }), signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`embed ${r.status}`);
  return normalize((await r.json()).vector);
}

export function makeCache(redis, { threshold = 0.9, embedFn = embed, maxEntries = 5000 } = {}) {
  return {
    async lookup(prompt) {
      const vec = await embedFn(prompt);
      const entries = (await redis.hvals('sc')).map((s) => JSON.parse(s));
      const { entry, score } = bestMatch(entries, vec);
      return { vec, score, hit: entry && score >= threshold ? entry : null };
    },
    async store(prompt, vec, { text, tokensIn = 0, tokensOut = 0 }) {
      if ((await redis.hlen('sc')) >= maxEntries) return; // full: stop adding, no eviction yet
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await redis.hset('sc', id, JSON.stringify({ prompt, text, tokensIn, tokensOut, vec: vec.map((x) => +x.toFixed(4)) }));
    },
  };
}