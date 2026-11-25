// The hepatic veins' openings on the cava (frozen round 18; art/anatomy-placement/RULINGS.md). Mohammad, 25 Nov: "RHV alone, MHV+LHV shared trunk": the right hepatic vein opens on its own into the cava's right wall, lower;
// the middle hepatic vein joins the left one in a short common trunk that opens higher, on the cava's left wall, below the diaphragm; the two ostia are apart along the cava, and no hepatic vein runs along the cava's axis before
// its own ostium (round 17 had all three opening at one point of the axis, the middle one within 1.3 cava radii of it for its last 0.07, and the crowded junction notched). The Budd-Chiari clot of the left hepatic vein sits in the
// common trunk, short of the middle one's mouth, and the middle one's at its own mouth on the trunk.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { PLACED_EDGE_3D, PLACED_NODE_3D, PLACED_HV_TRUNK, HV_TRUNK_R } = await import('../src/scene/anatomy/placed-network.ts');
const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
const { drawnHost, cavaWallShare } = await import('../src/scene/disease/host.ts');
const { ostialEnds, mergeShare } = await import('../src/scene/disease/clots.ts');

type V = readonly number[];
const dist = (a: V, b: V): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const arc = (c: readonly V[]): number[] => { const s = [0]; for (let i = 1; i < c.length; i++) s.push(s[i - 1]! + dist(c[i]!, c[i - 1]!)); return s; };
/** The nearest point of a polyline: its distance and its arc length along it. */
function nearest(c: readonly V[], p: V): { d: number; s: number } {
  const s = arc(c); let best = { d: Infinity, s: 0 };
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1]!, b = c[i]!, ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], l2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0]! - a[0]!) * ab[0]! + (p[1]! - a[1]!) * ab[1]! + (p[2]! - a[2]!) * ab[2]!) / l2)) : 0;
    const d = dist(p, [a[0]! + t * ab[0]!, a[1]! + t * ab[1]!, a[2]! + t * ab[2]!]);
    if (d < best.d) best = { d, s: s[i - 1]! + t * (s[i]! - s[i - 1]!) };
  }
  return best;
}
const CAVA = [...PLACED_EDGE_3D.IVC_IS_1!, ...PLACED_EDGE_3D.IVC_IS!, ...PLACED_EDGE_3D.IVCS_RA!] as V[];
const R = NETWORK_BY_ID.get('IVC_IS')!.radius;
const end = (id: string): V => { const c = PLACED_EDGE_3D[id]!; return c[c.length - 1]!; };

/** The least distance between the two ostia along the cava, in its radii. */
const OSTIA_APART_R = 3;
/** How near a hepatic vein may come to the cava's axis (in its radii) before its own ostium, and how much of its course before its end counts as the ostium (in the cava's radii: the arrival through the wall at an angle). */
const AXIS_CLEAR_R = 2, OSTIUM_REACH_R = 3;
/** The common trunk's length, in the left hepatic vein's radii (the anatomy's 1 to 1.5 cm; HV_TRUNK_R aims at 3). */
const TRUNK_MIN_R = 2, TRUNK_MAX_R = 3.5;

test('two ostia: the right hepatic vein opens on the cava on its own, lower, and the common trunk higher, at least 3 cava radii apart, the cava\'s node at the trunk\'s', () => {
  const r = nearest(CAVA, end('RHV_IVC')), l = nearest(CAVA, end('LHV_IVC'));
  assert.ok(r.d < R && l.d < R, `both ends open inside the cava (${(r.d / R).toFixed(2)}, ${(l.d / R).toFixed(2)} of its radius off its axis)`);
  const apart = (l.s - r.s) / R;
  assert.ok(apart >= OSTIA_APART_R, `the common trunk opens ${apart.toFixed(2)} cava radii above the right hepatic vein (at least ${OSTIA_APART_R})`);
  assert.ok(dist(PLACED_NODE_3D.IVCS!, end('LHV_IVC')) < 1e-3, 'the cava\'s node IVCS is the common trunk\'s ostium');
  // (each from its own side: the right hepatic vein from the patient's right, the trunk from the left)
  const back = (id: string): V => { const c = PLACED_EDGE_3D[id]!; return c[Math.max(0, c.length - 1 - Math.round(OSTIUM_REACH_R * R / 0.006))]!; };
  assert.ok(back('RHV_IVC')[0]! < end('RHV_IVC')[0]! - R && back('LHV_IVC')[0]! > end('LHV_IVC')[0]! + R, 'the right hepatic vein comes from the right and the trunk from the left');
});

test(`the middle and left hepatic veins share a trunk ${TRUNK_MIN_R} to ${TRUNK_MAX_R} of its radii long: the middle one ends on the left one's axis`, () => {
  const lhv = PLACED_EDGE_3D.LHV_IVC! as V[], m = end('MHV_IVC'), rL = NETWORK_BY_ID.get('LHV_IVC')!.radius;
  assert.ok(nearest(lhv, m).d < 2e-3, `the middle hepatic vein ends on the left one's axis (${nearest(lhv, m).d.toFixed(4)} off)`);
  assert.ok(dist(m, PLACED_HV_TRUNK.at) < 2e-3);
  // (the trunk: from the middle one's join to where the left one crosses the cava's wall)
  const s = arc(lhv); let k = lhv.length - 1; while (k > 0 && nearest(CAVA, lhv[k]!).d < R) k--;
  const trunk = s[k]! - nearest(lhv, m).s;
  assert.ok(trunk >= TRUNK_MIN_R * rL && trunk <= TRUNK_MAX_R * rL, `the common trunk is ${(trunk / rL).toFixed(2)} of its radii long`);
  assert.ok(Math.abs(trunk - PLACED_HV_TRUNK.length) < 0.007 && HV_TRUNK_R >= TRUNK_MIN_R && HV_TRUNK_R <= TRUNK_MAX_R);
});

test(`no hepatic vein runs within ${AXIS_CLEAR_R} cava radii of the cava's axis except at its own ostium`, () => {
  const bad: string[] = [];
  for (const id of ['RHV_IVC', 'RHV_IVC_1', 'MHV_IVC', 'LHV_IVC']) {
    const c = PLACED_EDGE_3D[id]! as V[], s = arc(c), L = s[s.length - 1]!, opens = id === 'RHV_IVC' || id === 'LHV_IVC';
    c.forEach((p, i) => { const d = nearest(CAVA, p).d; if (d < AXIS_CLEAR_R * R && !(opens && L - s[i]! <= OSTIUM_REACH_R * R)) bad.push(`${id} ${(L - s[i]!).toFixed(3)} from its end, ${(d / R).toFixed(2)} radii off the axis`); });
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

test('the Budd-Chiari clot sits at each vein\'s own outflow: the left one\'s in the common trunk, short of the middle one\'s mouth; the middle one\'s at its mouth on the trunk', () => {
  const l = drawnHost('LHV_IVC')!, m = drawnHost('MHV_IVC')!;
  const lm = mergeShare(l);
  assert.ok(lm > 0.5 && lm < 1, `the merge is on the left hepatic vein's last stretch (${lm.toFixed(3)})`);
  for (const v of [0.3, 0.66, 1]) {
    const e = ostialEnds(l, v, 1)!;
    assert.ok(e && e.a >= lm - 1e-9 && e.a < e.b0, `the left hepatic vein's clot (from ${e.a.toFixed(3)}) stays short of the middle one's mouth (${lm.toFixed(3)}) at v ${v}`);
  }
  const wall = cavaWallShare(m);
  assert.ok(wall != null && wall > 0.85, `the middle hepatic vein meets the trunk's wall near its end (${wall?.toFixed(3)})`);
  const em = ostialEnds(m, 1, 1)!;
  assert.ok(em.b >= wall! - 1e-9 && em.a > 0.5, 'its clot runs to the trunk\'s wall, ostial');
});
