// Review a56feaf2, item 5 (Mohammad, 23 Nov, picked "Reshape to a belly curve"): the shunts ascites read as a straight-sided tub. Root cause: 2D's wall is a near-straight diagonal from the waist (y 470) to the lower belly (y 954)
// and the water's top is flat, so the 3D hull inherited a trapezoid. polyOf now bows each flank outward (bellyPolygon); the waist, the lower belly and the floor are 2D's own points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BELLY, bellyPolygon, outlinePolygon, polyOf, POOL_X0, POOL_STEP, POOL_COLS } from '../src/scene/disease/ascites-pool.ts';
import { ABDOMEN_OUTLINES } from '../src/scene/disease/copied/anatomy-b4.ts';

const STEPS = [0, 10, 20, 34, 50, 68];
const flank = (p: readonly (readonly [number, number])[]) => p.filter((q) => q[0] < 712 && q[1] > BELLY.top && q[1] < BELLY.foot);

test('every flank bows outward (never inward), from the waist straight down to the lower belly, at every volume', () => {
  for (const st of STEPS) {
    const raw = outlinePolygon(ABDOMEN_OUTLINES[st]!), p = polyOf(st);
    assert.equal(p.length, raw.length);
    raw.forEach((q, i) => {
      const [x, y] = p[i]!, left = q[0] < 712;
      assert.equal(y, q[1]);
      assert.ok(left ? x <= q[0] + 1e-9 : x >= q[0] - 1e-9, `step ${st} point ${i}: moved inward`);
      if (!(q[1] > BELLY.top && q[1] < BELLY.foot)) assert.equal(x, q[0], `step ${st} point ${i}: 2D's own point`);
    });
    // convex: the flank's middle stands further out than the chord between its ends, by a visible amount (a tub's wall is the chord)
    const f = flank(p).sort((a, b) => a[1] - b[1]), a = f[0]!, b = f[f.length - 1]!, mid = f[Math.floor(f.length / 2)]!;
    const chord = a[0] + ((b[0] - a[0]) * (mid[1] - a[1])) / (b[1] - a[1]);
    assert.ok(chord - mid[0] > 8, `step ${st}: bows ${(chord - mid[0]).toFixed(1)}`);
  }
});

test('the bow is smooth: no flank point turns more than the 2D wall does between neighbours, and the polygon stays inside the pool columns', () => {
  const x0 = POOL_X0, x1 = POOL_X0 + (POOL_COLS - 1) * POOL_STEP;
  for (const st of STEPS) {
    const p = polyOf(st), f = flank(p).sort((a, b) => a[1] - b[1]);
    const turn = (i: number) => { const u = [f[i]![0] - f[i - 1]![0], f[i]![1] - f[i - 1]![1]], v = [f[i + 1]![0] - f[i]![0], f[i + 1]![1] - f[i]![1]]; return Math.abs(Math.atan2(u[0]! * v[1]! - u[1]! * v[0]!, u[0]! * v[0]! + u[1]! * v[1]!)); };
    for (let i = 1; i < f.length - 1; i++) assert.ok(turn(i) < 0.12, `step ${st} point ${i}: turns ${turn(i).toFixed(3)} rad`);
    for (const q of p) assert.ok(q[0] >= x0 && q[0] <= x1 + STEP(), `step ${st}: x ${q[0]} outside the pool`);
  }
});
const STEP = () => POOL_STEP;

test('bellyPolygon is a pure function of the polygon (the same twice, the input untouched)', () => {
  const raw = outlinePolygon(ABDOMEN_OUTLINES[0]!), copy = raw.map((q) => [...q]);
  assert.deepEqual(bellyPolygon(raw), bellyPolygon(raw));
  assert.deepEqual(raw, copy);
});
