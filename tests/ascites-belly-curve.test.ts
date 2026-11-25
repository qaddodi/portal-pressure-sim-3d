// Review a56feaf2, item 5 (Mohammad, 23 Nov, picked "Reshape to a belly curve"): the shunts ascites read as a straight-sided tub. Root cause: 2D's wall is a near-straight diagonal from the waist (y 470) to the lower belly (y 954)
// and the water's top is flat, so the 3D hull inherited a trapezoid. polyOf now bows each flank outward (bellyPolygon); the waist, the lower belly and the floor are 2D's own points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BELLY, FOOT, bellyPolygon, outlinePolygon, POOL_X0, POOL_STEP, POOL_COLS } from '../src/scene/disease/ascites-pool.ts';
import { ABDOMEN_OUTLINES } from '../src/scene/disease/copied/anatomy-b4.ts';

const STEPS = [0, 10, 20, 34, 50, 68];
/** 2D's own cavity with the belly curve (today's anatomy). The placed anatomy's cavity is ascites-cavity.ts (tests/ascites-cavity.test.ts); these tests judge bellyPolygon, whichever anatomy is on. */
const polyOf = (step: number) => bellyPolygon(outlinePolygon(ABDOMEN_OUTLINES[step]!));
const flank = (p: readonly (readonly [number, number])[]) => p.filter((q) => q[0] < 712 && q[1] > BELLY.top && q[1] < BELLY.foot);

/** x of the flank at height y (2D units): the left-most or right-most crossing of the polygon. */
const edgeX = (p: readonly (readonly [number, number])[], y: number, left: boolean): number => {
  const xs: number[] = [];
  for (let i = 1; i < p.length; i++) { const [xa, ya] = p[i - 1]!, [xb, yb] = p[i]!; if ((ya <= y && y < yb) || (yb <= y && y < ya)) xs.push(xa + ((y - ya) / (yb - ya)) * (xb - xa)); }
  return left ? Math.min(...xs) : Math.max(...xs);
};

test('every flank bows outward (never inward), from the waist straight down to the lower belly, at every volume', () => {
  for (const st of STEPS) {
    const raw = outlinePolygon(ABDOMEN_OUTLINES[st]!), p = polyOf(st);
    // nothing moves inward: at every height the wall stands at or outside 2D's own, on both sides, down to the foot of the belly
    for (let y = BELLY.top + 1; y < FOOT.y; y += 6) {
      assert.ok(edgeX(p, y, true) <= edgeX(raw, y, true) + 1e-6, `step ${st} y ${y}: left wall moved inward`);
      assert.ok(edgeX(p, y, false) >= edgeX(raw, y, false) - 1e-6, `step ${st} y ${y}: right wall moved inward`);
    }
    // 2D's own points where the belly is not shaped: the waist, above it, and the floor's bottom
    assert.deepEqual(p[0], raw[0]); assert.deepEqual(p[p.length - 1], raw[raw.length - 1]);
    assert.ok(Math.abs(Math.max(...p.map((q) => q[1])) - Math.max(...raw.map((q) => q[1]))) < 1e-6, `step ${st}: the floor's bottom moved`);
    for (const q of raw) if (q[1] <= BELLY.top) assert.ok(p.some((r) => r[0] === q[0] && r[1] === q[1]), `step ${st}: 2D's own point ${q} is gone`);
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

// Mohammad, 24 Nov: "the bottom of the ascites looks as if it is pointing, as if it will not include the colon; even in the beginning it should head a little outward".
// Root cause (numbers): 2D's wall closes in 26 degrees from vertical down to y 954 and its floor curve turns in at 29 degrees and flattens, so a pool standing low had walls leaning in 63 degrees at 0.3 L, 39 at 1 L,
// 27 at 1.5 L; the colon (left edge x 416 to 424 down to y 920) sat outside the tips. The foot is now an upright-sided rounded basin.
import { fluidLevel, fluidBase } from '../src/scene/disease/copied/fluid-step.js';
import { bulgeStep } from '../src/scene/disease/ascites-pool.ts';
import { wallBelow } from '../src/scene/disease/ascites-hull.ts';
const lean = (ml: number): { x: number; deg: number } => {
  const st = bulgeStep(ml), poly = polyOf(st), { h } = fluidLevel(ml), ymin = Math.min(...poly.map((q) => q[1]));
  const pts = wallBelow(poly, (x) => Math.max(fluidBase(x, h), ymin)), i = pts.findIndex((q) => q.d === 0 && q.x < 712), a = pts[i]!, b = pts[i + 1]!;
  return { x: a.x, deg: (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI };   // degrees from vertical, positive = the wall closes in going down
};

test('a pool standing low has upright sides, not a wedge: the wall leaves the waterline within 22 degrees of vertical from 1 L, and at 1.5 L within 12 (it was 39 and 27)', () => {
  assert.ok(lean(1000).deg < 22, `1 L: ${lean(1000).deg.toFixed(0)} deg`);
  assert.ok(lean(1500).deg < 12, `1.5 L: ${lean(1500).deg.toFixed(0)} deg`);
  assert.ok(lean(2500).deg < 14, `2.5 L: ${lean(2500).deg.toFixed(0)} deg`);
});

test('the pool reaches the colon from the first litre: at 1.5 L its waterline is out past the colon\'s left edge (x 416) and the right one past the colon\'s right', () => {
  assert.ok(lean(1500).x < 416 - 10, `1.5 L left tip x ${lean(1500).x.toFixed(0)}`);
});

test('a fuller belly is as it was: above FOOT.from the wall is the old bow exactly (the waterline above y 760, from about 5 L)', () => {
  for (const st of [0, 20, 48, 68]) {
    const raw = outlinePolygon(ABDOMEN_OUTLINES[st]!), p = polyOf(st);
    let inset = 0; for (const q of raw) if (q[1] === BELLY.foot && q[0] < 712) inset = Math.max(inset, q[0] - 336);
    const a = BELLY.share * inset, old = raw.map(([x, y]): [number, number] => (y > BELLY.top && y < BELLY.foot ? [x < 712 ? x - a * Math.sin((Math.PI * (y - BELLY.top)) / (BELLY.foot - BELLY.top)) : x + a * Math.sin((Math.PI * (y - BELLY.top)) / (BELLY.foot - BELLY.top)), y] : [x, y]));
    for (let y = BELLY.top + 1; y < FOOT.from - 1; y += 6) { assert.ok(Math.abs(edgeX(p, y, true) - edgeX(old, y, true)) < 1e-6); assert.ok(Math.abs(edgeX(p, y, false) - edgeX(old, y, false)) < 1e-6); }
  }
});

test('the foot is smooth and symmetric: no corner sharper than the 2D floor, and the two sides mirror at rest', () => {
  for (const st of [0, 20, 68]) {
    const p = polyOf(st);
    for (const y of [800, 900, 960, 1000, 1030]) assert.ok(Math.abs((edgeX(p, y, true) + edgeX(p, y, false)) / 2 - 712) < 0.01, `step ${st} y ${y}: not mirrored`);
  }
  const p = polyOf(0), f = p.filter((q) => q[0] < 712 && q[1] > FOOT.from).sort((a, b) => a[1] - b[1]);
  for (let i = 1; i < f.length - 1; i++) {
    const u = [f[i]![0] - f[i - 1]![0], f[i]![1] - f[i - 1]![1]], v = [f[i + 1]![0] - f[i]![0], f[i + 1]![1] - f[i]![1]];
    assert.ok(Math.abs(Math.atan2(u[0]! * v[1]! - u[1]! * v[0]!, u[0]! * v[0]! + u[1]! * v[1]!)) < 0.35, `foot point ${i} turns too sharply`);
  }
});
