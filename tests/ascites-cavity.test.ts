// The ascites cavity for the placed anatomy (24 Nov 2026, Mohammad picked "B, round belly" of the three mocks, /mnt/project-files/ascites-new-anatomy-24nov/ascites-options-A-B-C.png).
// Root cause of the complaint ("the ascites no longer fits the new anatomy; a flat-walled tub around the gut"): the cavity was 2D's fixed outline (336..1088, floor 1041), drawn for the OLD organs. The placed gut is
// x 453..1038 and its rectum reaches y 1098, so the tub stood 117 units wider than the gut each side and the rectum stuck out under its floor. The wall is now the gut's own edge plus a margin (ascites-cavity.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAVITY, gutEdges, placedCavity } from '../src/scene/disease/ascites-cavity.ts';
import { PLACED_ORGAN_RINGS } from '../src/scene/anatomy/placed-organs.generated.ts';
import { bulgeStep } from '../src/scene/disease/ascites-pool.ts';
import { fluidBase, fluidLevel } from '../src/scene/disease/copied/fluid-step.js';

const rings = { colon: PLACED_ORGAN_RINGS['colon']![0]!, bowel: PLACED_ORGAN_RINGS['bowel']![0]! };
const edges = gutEdges(rings);
const STEPS = [0, 10, 20, 34, 50, 68];
const cross = (p: readonly (readonly [number, number])[], y: number): [number, number] => {
  const xs: number[] = [];
  for (let i = 0; i < p.length; i++) { const [xa, ya] = p[i]!, [xb, yb] = p[(i + 1) % p.length]!; if ((ya <= y && y < yb) || (yb <= y && y < ya)) xs.push(xa + ((y - ya) / (yb - ya)) * (xb - xa)); }
  return [Math.min(...xs), Math.max(...xs)];
};
const gutAt = (y: number): [number, number] => {
  let l = Infinity, r = -Infinity;
  for (const ring of [rings.colon, rings.bowel]) { const xs: number[] = []; for (let i = 0; i < ring.length; i++) { const [xa, ya] = ring[i]!, [xb, yb] = ring[(i + 1) % ring.length]!; if ((ya <= y && y < yb) || (yb <= y && y < ya)) xs.push(xa + ((y - ya) / (yb - ya)) * (xb - xa)); } if (xs.length) { l = Math.min(l, ...xs); r = Math.max(r, ...xs); } }
  return [l, r];
};

test('the wall holds the whole gut at every volume, the rectum included, with room (it was 117 units wide each side and 57 short under the rectum); the floor starts just under the rectum', () => {
  for (const st of STEPS) {
    const p = placedCavity(st, edges);
    for (let y = 560; y <= 1090; y += 10) {
      const [l, r] = gutAt(y), [wl, wr] = cross(p, y);
      assert.ok(wl <= l - 10 && wr >= r + 10, `step ${st} y ${y}: wall ${wl.toFixed(0)}..${wr.toFixed(0)} against gut ${l.toFixed(0)}..${r.toFixed(0)}`);
    }
    // the floor starts just a little under the rectum (Mohammad, 25 Nov: "a bit lower than the rectum"): 6 to 25 units under its lowest point, never short of it, never far under it
    const under = Math.max(...p.map((q) => q[1])) - Math.max(...rings.colon.map((q) => q[1]));
    assert.ok(under >= 6 && under <= 25, `step ${st}: the floor is ${under.toFixed(0)} under the rectum`);
  }
});

test('the wall is a belly, not a tub: it bows outward at mid height, and it stays near the gut (within 160 units, from the colon flexure down to its lower flank)', () => {
  for (const st of STEPS) {
    const p = placedCavity(st, edges);
    const [l0] = cross(p, 480), [l1] = cross(p, 700), [l2] = cross(p, 940);
    assert.ok(l1 < Math.min(l0, l2) - 10 || l1 <= l0 + 1e-6, `step ${st}: no bow (${l0.toFixed(0)}, ${l1.toFixed(0)}, ${l2.toFixed(0)})`);
    for (let y = 640; y <= 900; y += 20) { const [l, r] = gutAt(y), [wl, wr] = cross(p, y); assert.ok(l - wl < 160 && wr - r < 160, `step ${st} y ${y}: ${(l - wl).toFixed(0)} / ${(wr - r).toFixed(0)} from the gut`); }
  }
});

test('the low-fill flare is kept: the wall never closes in faster than 8 degrees going down, and a pool of 1.5 L stands out past the colon\'s lower flank with upright sides', () => {
  for (const st of STEPS) {
    const p = placedCavity(st, edges);
    for (let y = CAVITY.TOP + 4; y + 4 <= CAVITY.JOIN_Y; y += 4) {
      const [a, b] = cross(p, y), [c, d] = cross(p, y + 4);
      assert.ok(c - a <= CAVITY.LEAN * 4 + 1e-6 && b - d <= CAVITY.LEAN * 4 + 1e-6, `step ${st} y ${y}: closes in ${(c - a).toFixed(2)} / ${(b - d).toFixed(2)}`);
    }
  }
  const ml = 1500, st = bulgeStep(ml), p = placedCavity(st, edges), { h } = fluidLevel(ml), ys = fluidBase(712, h);
  const [wl, wr] = cross(p, ys + 0.5), [l2] = cross(p, ys + 14);
  const [gl, gr] = gutAt(900);
  assert.ok(wl < gl - 60 && wr > gr + 60, `1.5 L waterline ${wl.toFixed(0)}..${wr.toFixed(0)} against the colon's flank ${gl.toFixed(0)}..${gr.toFixed(0)}`);
  assert.ok((Math.atan2(l2 - wl, 14) * 180) / Math.PI < 12, 'the wall leans in more than 12 degrees at the 1.5 L waterline');
});

test('the wall is smooth (no corner sharper than 0.35 rad between neighbours), its order is 2D\'s (the two top corners first and last, for the flank line), and it grows outward with the volume', () => {
  let prev: [number, number][] | null = null;
  for (const st of STEPS) {
    const p = placedCavity(st, edges);
    assert.equal(p[0]![1], CAVITY.TOP); assert.equal(p[p.length - 1]![1], CAVITY.TOP);
    for (let i = 1; i < p.length - 1; i++) {
      const u = [p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]], v = [p[i + 1]![0] - p[i]![0], p[i + 1]![1] - p[i]![1]];
      if (Math.hypot(u[0]!, u[1]!) < 1e-9 || Math.hypot(v[0]!, v[1]!) < 1e-9) continue;
      assert.ok(Math.abs(Math.atan2(u[0]! * v[1]! - u[1]! * v[0]!, u[0]! * v[0]! + u[1]! * v[1]!)) < 0.35, `step ${st} point ${i} turns too sharply`);
    }
    if (prev) for (const y of [500, 700, 900]) { const [a, b] = cross(prev, y), [c, d] = cross(p, y); assert.ok(c <= a + 1e-6 && d >= b - 1e-6, `step ${st} y ${y}: the belly shrank`); }
    prev = p;
  }
});

test('a pure function of the step and the rings (the same twice)', () => {
  assert.deepEqual(placedCavity(34, edges), placedCavity(34, gutEdges(rings)));
});
