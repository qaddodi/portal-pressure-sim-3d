import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyVesselOverrides, knotSpline } from '../src/editor/vessel-apply.ts';

test('the control curve passes through every knot, with zero ends, for any number of knots', () => {
  for (const n of [1, 2, 5, 9]) {
    const U = [0, ...Array.from({ length: n }, (_, i) => (i + 1) / (n + 1)), 1], Y = [0, ...Array.from({ length: n }, (_, i) => 10 + 3 * Math.sin(i)), 0];
    const f = knotSpline(U, Y);
    U.forEach((u, i) => assert.ok(Math.abs(f(u) - Y[i]!) < 1e-9, `${n} knots, knot ${i}`));
    assert.ok(Math.abs((f(1e-6) - f(0)) / 1e-6) < 0.01 && Math.abs((f(1) - f(1 - 1e-6)) / 1e-6) < 0.01);
  }
});

test('the curve is C2: no jump in the second difference at a knot, and five offsets the same way make a smooth bend, not terraces', () => {
  const U = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1], Y = [0, 6, 9, 10, 9, 6, 0], f = knotSpline(U, Y), h = 1e-4;
  const d2 = (u: number): number => (f(u + h) - 2 * f(u) + f(u - h)) / (h * h);
  for (const k of U.slice(1, -1)) assert.ok(Math.abs(d2(k - h) - d2(k + h)) < 1, `curvature jumps at ${k}`);
  // a steady climb through the first three knots has no flat stretch at them (a smoothstep blend has zero slope at every knot)
  for (const k of [0.15, 0.3]) assert.ok((f(k + h) - f(k - h)) / (2 * h) > 5, `terrace at ${k}`);
});

test('nine control points on a plan path bend it smoothly: turning per bone stays below the sharpest turn of the offsets alone', () => {
  const p = Array.from({ length: 64 }, (_, i) => [i * 4, 0] as const);
  const pts = Array.from({ length: 9 }, (_, i) => ({ u: (i + 1) / 10, dx: 0, dy: 14 * Math.sin(((i + 1) / 10) * Math.PI) }));
  const r = applyVesselOverrides({ id: 'a', from: 'X', to: 'Y' }, p, { version: 1, vessels: { a: { pts } } });
  let m = 0;
  for (let i = 12; i < 52; i++) m = Math.max(m, Math.abs(Math.atan2(r.path[i + 1]![1] - r.path[i]![1], 4) - Math.atan2(r.path[i]![1] - r.path[i - 1]![1], 4)));
  assert.ok(m < 0.03, `max turn per bone ${m}`);
  assert.deepEqual(r.path[0], [0, 0]); assert.deepEqual(r.path[63], [252, 0]);
});
