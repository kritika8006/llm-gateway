// Turns raw request logs into dashboard numbers. Pure function, so it is easy to test without Mongo.
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))];
}
const lat = (arr) => { const s = [...arr].sort((a, b) => a - b); return { n: s.length, p50: percentile(s, 50), p95: percentile(s, 95) }; };

export function summarize(docs) {
  const routes = { cache: 0, cheap: 0, strong: 0, unrouted: 0, error: 0 };
  const providers = {}, byHour = {};
  const cacheLat = [], modelLat = [];
  let tokensSaved = 0;
  for (const d of docs) {
    const kind = d.cacheHit ? 'cache' : d.error ? 'error' : d.route === 'cheap' || d.route === 'strong' ? d.route : 'unrouted';
    routes[kind]++;
    if (d.provider) providers[d.provider] = (providers[d.provider] || 0) + 1;
    tokensSaved += d.tokensSaved || 0;
    if (typeof d.latencyMs === 'number') (d.cacheHit ? cacheLat : modelLat).push(d.latencyMs);
    const hour = new Date(d.createdAt).toISOString().slice(0, 13);
    const h = (byHour[hour] ??= { hour, requests: 0, cacheHits: 0 });
    h.requests++;
    if (d.cacheHit) h.cacheHits++;
  }
  const total = docs.length;
  return {
    total, errors: routes.error, cacheHits: routes.cache,
    hitRate: total ? routes.cache / total : 0, // share of all requests answered from the cache
    tokensSaved, routes, providers,
    latency: { cache: lat(cacheLat), model: lat(modelLat) },
    byHour: Object.values(byHour).sort((a, b) => a.hour.localeCompare(b.hour)),
  };
}