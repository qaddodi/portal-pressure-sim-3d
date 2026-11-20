// The lobule's dust routes (lobule-routes.ts): every particle keeps one identity through the lobule's joints (Mohammad, 20 Nov: "also same streaks in lobule view please").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lobuleRoutes, type LobuleRouteCourse } from '../src/scene/micro3d/lobule-routes.ts';

// an inlet along y = 0 from x 0 to 4; two first sinusoids leave its left (y > 0) at x 1 and x 3, merge at (2, 2), and the merged one runs to (2, 4)
const line = (a: [number, number], b: [number, number], n = 8): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
const courses: LobuleRouteCourse[] = [
  { col: 0, kind: 'in', path: line([0, 0], [4, 0], 16), radius: 0.1 },
  { col: 1, kind: 's0', path: line([1, 0], [2, 2]), radius: 0.05 },
  { col: 2, kind: 's0', path: line([3, 0], [2, 2]), radius: 0.05 },
  { col: 3, kind: 's1', path: line([2, 2], [2, 4]), radius: 0.05 },
];

test('first sinusoids take a strip of the inlet on their side, from the inlet arc at the branch', () => {
  const r = lobuleRoutes(courses, 0.01);
  const a = r.get(1)!, b = r.get(2)!;
  assert.equal(a.length, 1); assert.equal(a[0]!.root, 0); assert.ok(Math.abs(a[0]!.A - 1) < 1e-9);
  assert.equal(b[0]!.root, 0); assert.ok(Math.abs(b[0]!.A - 3) < 1e-9);
  for (const s of [a[0]!, b[0]!]) { const lo = s.c0 - s.c1, hi = s.c0 + s.c1; assert.ok(lo >= -1e-9 && hi <= 1 + 1e-9, 'inside the inlet\'s left half'); }
});

test('the merged sinusoid tiles its lanes with both inflows and carries their arc on without a jump', () => {
  const r = lobuleRoutes(courses, 0.01);
  const m = r.get(3)!;
  assert.ok(m.length >= 2);
  assert.ok(Math.abs(m[0]!.y0 + 1) < 1e-9 && Math.abs(m.at(-1)!.y1 - 1) < 1e-9);
  for (let i = 1; i < m.length; i++) assert.ok(Math.abs(m[i]!.y0 - m[i - 1]!.y1) < 1e-9, 'no gap or overlap');
  // the arc on the root's stream at the merged one's start equals each inflow's at its end
  const lenIn = Math.hypot(1, 2);
  for (const k of [1, 2]) {
    const s = r.get(k)![0]!, endRoot = s.A + s.B * lenIn;
    assert.ok(m.some((g) => g.root === 0 && Math.abs(g.A - endRoot) < 1e-6), `inflow ${k} carries on`);
  }
});

test('sinusoids leaving one side of an inlet share its half without overlap', () => {
  const r = lobuleRoutes(courses, 0.01);
  const span = (k: number) => { const s = r.get(k)![0]!; return [s.c0 - s.c1, s.c0 + s.c1] as const; };
  const [a0, a1] = span(1), [b0, b1] = span(2);
  assert.ok(a0 >= -1e-9 && a1 <= 1 + 1e-9 && b0 >= -1e-9 && b1 <= 1 + 1e-9);
  assert.ok(Math.min(a1, b1) - Math.max(a0, b0) <= 1e-9, 'no overlap');
  assert.ok(Math.abs((a1 - a0) + (b1 - b0) - 1) < 1e-9, 'the half is shared out whole');
});

test('each family joins only itself: a bile channel ending where a sinusoid ends is no joint, two bile channels meeting are', () => {
  const fam: LobuleRouteCourse[] = [
    ...courses,
    { col: 4, kind: 'bile', path: line([2, 2], [2, 5]), radius: 0.02 },   // (starts where the sinusoids merge: another family)
    { col: 5, kind: 'bile', path: line([0, 6], [2, 5]), radius: 0.02 },
    { col: 6, kind: 'bile', path: line([4, 6], [2, 5]), radius: 0.02 },
    { col: 7, kind: 'bile', path: line([2, 5], [2, 8]), radius: 0.02 },
  ];
  const r = lobuleRoutes(fam, 0.01);
  assert.ok(r.get(4)!.every((g) => g.root === 4), 'the bile channel at the blood\'s node keeps its own particles');
  const m = r.get(7)!;
  assert.deepEqual(new Set(m.map((g) => g.root)), new Set([4, 5, 6]), 'three bile channels merge into the next, side by side');
  assert.ok(r.get(3)!.every((g) => g.root === 0), 'the blood is untouched');
});

test('a bile canal ending on the side of a duct carries the duct\'s particles, so each runs on into the duct at the join', () => {
  const fam: LobuleRouteCourse[] = [
    { col: 0, kind: 'bile', path: line([0, 0], [10, 0], 20), radius: 0.2 },   // the duct
    { col: 1, kind: 'bile', path: line([4, 3], [4, 0.1]), radius: 0.05 },      // a canal into its side at arc 4, from its left (y > 0)
  ];
  const r = lobuleRoutes(fam, 0.01);
  const g = r.get(1)!;
  assert.ok(g.every((s) => s.root === 0), 'the duct\'s own particles');
  const len = 2.9;
  for (const s of g) assert.ok(Math.abs(s.A + s.B * len - 4) < 0.15, `at the join it is at the duct's place: ${s.A + s.B * len}`);
  for (const s of g) { const lo = s.c0 + s.c1 * s.y0, hi = s.c0 + s.c1 * s.y1; assert.ok(Math.min(lo, hi) >= 0.6 - 1e-9 && Math.max(lo, hi) <= 1 + 1e-9, 'a strip on the duct\'s left wall'); }
});
