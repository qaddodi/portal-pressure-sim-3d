// The 2D figure's run-ons (vein-joins.js smoothRunOn): the pairs of vessels that continue one another are found by the 2D rule and their courses are one smooth curve through
// the join, so no kink shows where the splenic vein runs on into its next stretch, or a hepatic vein into the cava.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUN_ONS } from '../src/scene/vessels/network.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';
import { courseOf } from '../src/scene/vessels/network.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { findRunOns, smoothRunOns } from '../src/scene/vessels/joins.ts';

const has = (a: string, b: string) => RUN_ONS.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));

import { withStartInOrgan } from '../src/scene/vessels/starts.ts';

test('the main trunks run on into each other: splenic to its confluence, portal trunk to the right branch, the hepatic veins into the cava', () => {
  assert.ok(has('V_SPL', 'SV_MID'));
  assert.ok(has('SV_MID', 'SV_CONF'));
  assert.ok(has('PV_TRUNK', 'PVH_R'));
  assert.ok(has('POST_R_RHV', 'RHV_IVC_1'));
  assert.ok(has('IVC_IS', 'IVCS_RA'));
});

test('no vessel runs on into two at one end, and a vessel never into itself', () => {
  const seen = new Set<string>();
  for (const r of RUN_ONS) {
    assert.notEqual(r.a, r.b);
    for (const k of [`${r.a}|${r.ia}`, `${r.b}|${r.ib}`]) { assert.ok(!seen.has(k), `${k} twice`); seen.add(k); }
  }
});

/** The turn (degrees) between the two courses' directions through the join, 0 when they continue straight. */
function turnAt(P: readonly (readonly [number, number])[], ia: number, Q: readonly (readonly [number, number])[], ib: number): number {
  const dir = (C: readonly (readonly [number, number])[], i: number, k: number) => { const n = C.length, a = i ? C[n - 1]! : C[0]!, b = i ? C[n - 1 - k]! : C[k]!; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  let d = Math.abs(dir(P, ia, 2) - dir(Q, ib, 2)) * 180 / Math.PI;
  d = Math.abs(((d % 360) + 360) % 360 - 180);
  return d;
}

test('through a run-on the two courses meet with no kink (the cubic follows each course), where the raw 2D samples turned by up to 57 degrees', () => {
  const paths = new Map(Object.entries(EDGE_PATH_2D));
  const smooth = smoothRunOns(paths, RUN_ONS);
  let worstBefore = 0, worstAfter = 0;
  for (const r of RUN_ONS) {
    const P = paths.get(r.a)!, Q = paths.get(r.b)!, Ps = smooth.get(r.a) ?? P, Qs = smooth.get(r.b) ?? Q;
    worstBefore = Math.max(worstBefore, turnAt(P, r.ia, Q, r.ib));
    const after = turnAt(Ps, r.ia, Qs, r.ib);
    worstAfter = Math.max(worstAfter, after);
    if (!/^C\d/.test(r.a) && !/^C\d/.test(r.b)) assert.ok(after < 25, `${r.a} to ${r.b} still turns ${after.toFixed(1)} degrees`);   // (a collateral's strands braid along it: its own pair is left to the coil)
    // the samples keep their count and the join stays near where it was (the 2D cubic passes the node within 2 units at its middle; its ends move a few more, 16 at the worst, on the cava's pieces)
    assert.equal(Ps.length, P.length);
    const e0 = r.ia ? Ps[Ps.length - 1]! : Ps[0]!, o0 = r.ia ? P[P.length - 1]! : P[0]!;
    assert.ok(Math.hypot(e0[0] - o0[0], e0[1] - o0[1]) < 20, `${r.a}'s end moved too far`);
  }
  assert.ok(worstBefore > 30, 'the raw courses do kink somewhere (the test means something)');
  assert.ok(worstAfter < worstBefore);
});

test('the scene course carries the smooth one: x and y by the one linear map', () => {
  const r = RUN_ONS.find((q) => q.a === 'V_SPL' && q.b === 'SV_MID')!;
  const c = courseOf('V_SPL'), n = c.length, raw = EDGE_PATH_2D.V_SPL!;
  const ext = withStartInOrgan('V_SPL', raw).length - raw.length;   // (carried on into the spleen: starts.ts)
  assert.ok(ext > 0);
  assert.equal(n, raw.length + ext);
  // away from the join the course is the 2D sample itself, after the stretch inside the spleen
  assert.equal(c[ext]![0], x3(raw[0]![0]));
  assert.equal(c[ext]![1], y3(raw[0]![1]));
  assert.ok(r);
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
