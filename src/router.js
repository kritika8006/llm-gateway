// Prompt router: logistic regression over the same embedding the cache already computes.
// Predicts P(prompt needs the strong model). Weights live in src/router_model.json (made by bench/train_router.mjs).
import { readFileSync } from 'node:fs';

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export const pHard = (model, vec) => sigmoid(dot(model.w, vec) + model.b);

export function loadModel(url = new URL('./router_model.json', import.meta.url)) {
  try { return JSON.parse(readFileSync(url, 'utf8')); } catch { return null; }
}

// No model or no embedding -> play it safe and use the strong model.
export function pickRoute(model, vec, threshold = 0.5) {
  if (!model || !vec) return { route: 'strong', pHard: null };
  const p = pHard(model, vec);
  return { route: p >= threshold ? 'strong' : 'cheap', pHard: p };
}