// The 2D figure's run-ons (vein-joins.js smoothRunOn): the pairs of vessels that continue one another are found by the 2D rule and their courses are one smooth curve through
// the join, so no kink shows where the splenic vein runs on into its next stretch, or a hepatic vein into the cava.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUN_ONS } from '../src/scene/vessels/network.ts';
import { courseOf } from '../src/scene/vessels/network.ts';
import { findRunOns } from '../src/scene/vessels/joins.ts';

const has = (a: string, b: string) => RUN_ONS.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));

import { PLACED_EDGE_3D } from '../src/scene/anatomy/placed-network.ts';
import { centrelineOf } from '../src/scene/vessels/centreline.ts';
import { WHOLE_PIECES, firstPieceOf, lastPieceOf } from '../src/scene/anatomy/whole-pieces.ts';

test('the main trunks run on into each other: every stretch of a whole vein into the next (splenic to its confluence, the cava through each cut), portal trunk to the right branch', () => {
  // (the engine's junction table cuts a vein wherever a shunt or a collateral joins it: the pieces of each whole vessel, in flow order, are the run-on chain)
  for (const [whole, pieces] of Object.entries(WHOLE_PIECES)) pieces.slice(1).forEach((p, i) => assert.ok(has(pieces[i]!, p), `${whole}: ${pieces[i]} runs on into ${p}`));
  assert.ok(has('PV_TRUNK', firstPieceOf('PVH_R')));
  // (RHV_IVC_1 is drawn only from its split, so the hidden bed behind it no longer runs on into it)
  assert.ok(has(lastPieceOf('IVC_IS'), 'IVCS_RA'));
});

test('no vessel runs on into two at one end, and a vessel never into itself', () => {
  const seen = new Set<string>();
  for (const r of RUN_ONS) {
    assert.notEqual(r.a, r.b);
    for (const k of [`${r.a}|${r.ia}`, `${r.b}|${r.ib}`]) { assert.ok(!seen.has(k), `${k} twice`); seen.add(k); }
  }
});

test('through a run-on the two courses meet with no kink (the cubic follows each course), where the raw 2D samples turned by up to 57 degrees', () => {
  // (placed: the run-ons are made one curve in 3D by the placed network (placed-network.ts runOn), not by the 2D cubic: the two centrelines meet heading on, under the smooth bar's 5 degrees)
  for (const r of RUN_ONS) {
    const a = centrelineOf(r.a)!, b = centrelineOf(r.b)!, h = (c: typeof a, u: 0 | 1) => { const p = c.pointAt(u), q = c.pointAt(u ? 1 - 0.003 / c.length : 0.003 / c.length); return [p[0] - q[0], p[1] - q[1], p[2] - q[2]]; };
    const A = h(a, r.ia), B = h(b, r.ib), turn = 180 - (Math.acos(Math.max(-1, Math.min(1, (A[0]! * B[0]! + A[1]! * B[1]! + A[2]! * B[2]!) / Math.hypot(...A) / Math.hypot(...B)))) * 180) / Math.PI;
    assert.ok(turn < 5, `${r.a} to ${r.b} turns ${turn.toFixed(1)} degrees`);
  }
});

test('the scene course carries the smooth one: x and y by the one linear map', () => {
  const r = RUN_ONS.find((q) => q.a === lastPieceOf('V_SPL') && q.b === 'SV_MID')!;
  // (placed: the course is the placed network's, point for point: the 2D course and its extension into the spleen are today's)
  const c = courseOf('V_SPL'), P = PLACED_EDGE_3D.V_SPL!; assert.equal(c.length, P.length); c.forEach((p, i) => assert.ok(Math.hypot(p[0] - P[i]![0], p[1] - P[i]![1]) < 1e-9, `point ${i}`)); assert.ok(r);
});

test('a node of two vessels meeting head on is a run-on pair, one meeting at a right angle is not', () => {
  const straight = findRunOns([
    { id: 'a', from: 'X', to: 'N', art: false, kind: 'vein', path: Array.from({ length: 30 }, (_, i) => [i * 10, 0] as const) },
    { id: 'b', from: 'N', to: 'Y', art: false, kind: 'vein', path: Array.from({ length: 30 }, (_, i) => [290 + i * 10, 0] as const) },
  ]);
  assert.equal(straight.length, 1);
  const bend = findRunOns([
    { id: 'a', from: 'X', to: 'N', art: false, kind: 'vein', path: Array.from({ length: 30 }, (_, i) => [i * 10, 0] as const) },
    { id: 'b', from: 'N', to: 'Y', art: false, kind: 'vein', path: Array.from({ length: 30 }, (_, i) => [290, i * 10] as const) },
  ]);
  assert.equal(bend.length, 0);
});

// ── forks: a branch blends into its trunk (the 2D figure's fillet) ──
import { NETWORK_BY_ID, RUN_ONS as RO } from '../src/scene/vessels/network.ts';
import { buildTubes, flareAdd } from '../src/scene/vessels/tubes.ts';
import { coursesOf } from '../src/scene/vessels/shape.ts';
import { REST, tubularOf } from '../src/scene/vessels/shape.ts';

test('a branch that ends on a trunk has a collar at that end; the vessels that run on into each other have none', () => {
  const lgv = NETWORK_BY_ID.get('LGV_CONF')!;
  assert.ok(lgv.flare?.[1], 'the left gastric vein blooms where it meets the portal trunk');
  assert.ok(lgv.flare![1]!.add > 0 && lgv.flare![1]!.span > 0);
  for (const r of RO) {
    for (const [id, end] of [[r.a, r.ia], [r.b, r.ib]] as const) assert.equal(NETWORK_BY_ID.get(id)?.flare?.[end] ?? null, null, `${id} end ${end} runs on, so no collar`);
  }
});

test('the collar is all of `add` up to the host wall, then melts to nothing over `span`', () => {
  const f = { add: 0.02, wall: 0.1, span: 0.05 };
  assert.equal(flareAdd(f, 0), 0.02);
  assert.equal(flareAdd(f, 0.1), 0.02);
  assert.ok(flareAdd(f, 0.125) < 0.02 && flareAdd(f, 0.125) > 0);
  assert.ok(flareAdd(f, 0.15) < 1e-9);
  assert.equal(flareAdd(f, 5), 0);
  assert.equal(flareAdd(null, 0), 0);
});

test('the built tube is wider at the collared end than anywhere along its plain length, and plain at its other end', () => {
  const v = NETWORK_BY_ID.get('LGV_CONF')!;
  const { geometry } = buildTubes(coursesOf(v, REST), tubularOf(v), v.radius);
  const rk = geometry.getAttribute('rk');
  const tube = coursesOf(v, REST)[0]!;
  const seg = tubularOf(v)[0]!, per = 15;
  const at = (k: number) => rk.getX(k * per);
  const mid = at(Math.floor(seg / 2)), endK = at(seg);
  assert.ok(endK > mid * 1.05, `end ${endK} vs middle ${mid}`);
  assert.ok(Math.abs(at(0) - (v.taper?.[0] ?? 1) * 1) < 0.5);
  assert.ok(tube.flare);
});
