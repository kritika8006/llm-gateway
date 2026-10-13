import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRoute, pHard } from '../src/router.js';
import { train, crossVal, predictProb } from '../bench/logreg.js';
import { score } from '../eval/score.js';

test('router picks strong for high P(hard), cheap for low, strong when it cannot tell', () => {
  const model = { w: [4, 0], b: 0 };
  assert.equal(pickRoute(model, [1, 0]).route, 'strong');
  assert.equal(pickRoute(model, [-1, 0]).route, 'cheap');
  assert.ok(pHard(model, [1, 0]) > 0.9);
  assert.deepEqual(pickRoute(null, [1, 0]), { route: 'strong', pHard: null });
  assert.deepEqual(pickRoute(model, null), { route: 'strong', pHard: null });
});

test('logistic regression separates two clusters and cross-validation agrees', () => {
  const X = [], y = [];
  for (let i = 0; i < 20; i++) { X.push([-1, 0.1 * (i % 5)]); y.push(0); X.push([1, 0.1 * (i % 5)]); y.push(1); }
  const m = train(X, y);
  assert.ok(predictProb(m, [1, 0.2]) > 0.5);
  assert.ok(predictProb(m, [-1, 0.2]) < 0.5);
  const probs = crossVal(X, y, 5);
  assert.equal(probs.filter((p, i) => (p >= 0.5 ? 1 : 0) === y[i]).length, X.length);
});

test('score checks every expected string, ignoring case and thousands commas', () => {
  assert.equal(score('The answer is 16,200.', ['16200']), true);
  assert.equal(score('Paris', ['paris']), true);
  assert.equal(score('It is Lyon', ['paris']), false);
  assert.equal(score('Alice is 30', ['30', 'alice']), true);
  assert.equal(score('Alice is 30', ['30', 'bob']), false);
});