// Replays a prompt stream through a simulated cache. Each item: { group, vec } (vec normalized).
// A hit is "wrong" when the matched cached prompt belongs to a different group (different intent).
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

export function simulate(items, threshold) {
  const cache = [];
  let hits = 0, wrong = 0;
  for (const it of items) {
    let best = -1, bi = -1;
    cache.forEach((c, i) => { const s = dot(c.vec, it.vec); if (s > best) { best = s; bi = i; } });
    if (bi >= 0 && best >= threshold) { hits++; if (cache[bi].group !== it.group) wrong++; }
    else cache.push(it);
  }
  return { hits, wrong, total: items.length };
}