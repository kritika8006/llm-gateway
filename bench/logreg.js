// Minimal logistic regression (batch gradient descent, L2). Inputs are unit-norm embeddings.
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export const predictProb = (m, x) => sigmoid(dot(m.w, x) + m.b);

export function train(X, y, { epochs = 600, lr = 2, l2 = 0.01 } = {}) {
  const d = X[0].length, n = X.length;
  const w = new Array(d).fill(0);
  let b = 0;
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const err = sigmoid(dot(w, X[i]) + b) - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * X[i][j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
    b -= (lr * gb) / n;
  }
  return { w, b };
}

// k-fold cross-validation, folds assigned per class so both classes appear in every fold.
// Returns out-of-fold probabilities: each prompt is scored by a model that never saw it.
export function crossVal(X, y, k = 5, opts) {
  const fold = new Array(X.length), seen = [0, 0];
  y.forEach((c, i) => { fold[i] = seen[c]++ % k; });
  const probs = new Array(X.length);
  for (let f = 0; f < k; f++) {
    const tr = X.map((_, i) => i).filter((i) => fold[i] !== f);
    const m = train(tr.map((i) => X[i]), tr.map((i) => y[i]), opts);
    X.forEach((x, i) => { if (fold[i] === f) probs[i] = predictProb(m, x); });
  }
  return probs;
}