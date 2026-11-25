// The hepatic veins' openings on the cava (frozen round 19; art/anatomy-placement/RULINGS.md). Mohammad, 25 Nov: "RHV alone, MHV+LHV shared trunk" (round 18), then, seeing the preview with the middle and left veins fused and the middle one crossing the face of the cava:
// "Move the middle hepatic vein to be separate from left" (round 19). Each hepatic vein opens into the cava on its own: the right one on its right wall; the middle one on its left wall, a little below the right one's mouth (the left vein's diagonal leaves no room for it above: 0.7 to 0.9 % of the cava's lumen was ink); the left one on its left wall, highest, just below the diaphragm.
// The middle one comes up on the patient's left of the cava and never crosses its face, and no hepatic vein runs along the cava's axis before its own ostium. The Budd-Chiari clot sits at each vein's own outflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { PLACED_EDGE_3D, PLACED_NODE_3D } = await import('../src/scene/anatomy/placed-network.ts');
const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
const { drawnHost, cavaWallShare } = await import('../src/scene/disease/host.ts');
const { ostialEnds } = await import('../src/scene/disease/clots.ts');
const { opensIntoCava, ostiumHostOf } = await import('../src/scene/vessels/fades.ts');

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

/** The middle one's mouth is on the cava's left wall, level with the right one's on the opposite wall or a little below it (at most 2 cava radii below), and at least 4 cava radii below the left one's on the same wall: the left vein's diagonal leaves no room between its mouth and the right one's (the cava's junction then inks 0.7 to 0.9 % of its lumen, tests/skin-weld-shade.test.ts bars 0.5). */
const M_BELOW_R_MAX = 2, M_BELOW_L_MIN = 4;
/** How near a hepatic vein may come to the cava's axis (in its radii) before its own ostium, and how much of its course before its end counts as the ostium (in the cava's radii: the arrival through the wall at an angle). */
const AXIS_CLEAR_R = 2, OSTIUM_REACH_R = 3;
const HV = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'] as const;

test('three ostia: each hepatic vein opens inside the cava on its own, the middle one on the left wall just below the right one\'s mouth and well below the left one\'s, the cava\'s node at the left one\'s', () => {
  const [r, m, l] = HV.map((id) => nearest(CAVA, end(id)));
  assert.ok([r, m, l].every((x) => x!.d < R), `all three ends open inside the cava (${[r, m, l].map((x) => (x!.d / R).toFixed(2)).join(', ')} of its radius off its axis)`);
  const below = (r!.s - m!.s) / R, belowL = (l!.s - m!.s) / R;
  assert.ok(below >= 0 && below <= M_BELOW_R_MAX, `the middle mouth is ${below.toFixed(2)} cava radii below the right one's (0 to ${M_BELOW_R_MAX})`);
  assert.ok(belowL >= M_BELOW_L_MIN && l!.s > r!.s, `the left mouth is ${belowL.toFixed(2)} cava radii above the middle one's (at least ${M_BELOW_L_MIN}), and the highest`);
  assert.ok(dist(PLACED_NODE_3D.IVCS!, end('LHV_IVC')) < 1e-3, 'the cava\'s node IVCS is the left hepatic vein\'s ostium, the highest');
  // (each from its own side: the right hepatic vein from the patient's right; the middle and left ones from the left)
  const back = (id: string): V => { const c = PLACED_EDGE_3D[id]!; return c[Math.max(0, c.length - 1 - Math.round(OSTIUM_REACH_R * R / 0.006))]!; };
  assert.ok(back('RHV_IVC')[0]! < end('RHV_IVC')[0]! - R, 'the right hepatic vein comes from the right');
  for (const id of ['MHV_IVC', 'LHV_IVC']) assert.ok(back(id)[0]! > end(id)[0]! + 0.4 * R, `${id} comes from the left`);
});

test('no vein crosses the face of the cava: the middle hepatic vein stays on the patient\'s left of the cava\'s axis for its whole course, and it is a tube of its own, apart from the left one', () => {
  const cx = (y: number): number => { let k = 1; while (k < CAVA.length - 1 && CAVA[k]![1]! < y) k++; const a = CAVA[k - 1]!, b = CAVA[k]!, t = (y - a[1]!) / (b[1]! - a[1]! || 1); return a[0]! + t * (b[0]! - a[0]!); };
  const mhv = PLACED_EDGE_3D.MHV_IVC! as V[];
  for (const p of mhv) assert.ok(p[0]! >= cx(p[1]!) - 0.2 * R, `a point of the middle hepatic vein (${p.map((x) => x.toFixed(3)).join(', ')}) is on the right of the cava's axis`);
  // (it ends on the cava, not on the left hepatic vein's tube, and keeps clear of it until its mouth)
  assert.equal(ostiumHostOf('MHV_IVC'), 'IVC_IS');
  assert.ok(opensIntoCava('MHV_IVC') && opensIntoCava('LHV_IVC') && opensIntoCava('RHV_IVC'));
  const lhv = PLACED_EDGE_3D.LHV_IVC! as V[], rM = NETWORK_BY_ID.get('MHV_IVC')!.radius, rL = NETWORK_BY_ID.get('LHV_IVC')!.radius, sm = arc(mhv), Lm = sm[sm.length - 1]!;
  let least = Infinity;
  mhv.forEach((p, i) => { if (Lm - sm[i]! > OSTIUM_REACH_R * R) least = Math.min(least, nearest(lhv, p).d); });
  assert.ok(least >= 1.4 * (rM + rL), `the middle hepatic vein keeps ${(least / (rM + rL)).toFixed(2)} of the two veins' radii (centre to centre) from the left one until its mouth (at least 1.4: a wall-to-wall gap of 0.4 of a vein's width)`);
});

test(`no hepatic vein runs within ${AXIS_CLEAR_R} cava radii of the cava's axis except at its own ostium`, () => {
  const bad: string[] = [];
  for (const id of ['RHV_IVC', 'RHV_IVC_1', 'MHV_IVC', 'LHV_IVC']) {
    const c = PLACED_EDGE_3D[id]! as V[], s = arc(c), L = s[s.length - 1]!, opens = id !== 'RHV_IVC_1';
    c.forEach((p, i) => { const d = nearest(CAVA, p).d; if (d < AXIS_CLEAR_R * R && !(opens && L - s[i]! <= OSTIUM_REACH_R * R)) bad.push(`${id} ${(L - s[i]!).toFixed(3)} from its end, ${(d / R).toFixed(2)} radii off the axis`); });
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

test('the Budd-Chiari clot sits at each vein\'s own outflow: each one\'s runs to its own wall on the cava, ostial', () => {
  for (const id of HV) {
    const h = drawnHost(id)!, wall = cavaWallShare(h);
    assert.ok(wall != null && wall > 0.85, `${id} meets the cava's wall near its end (${wall?.toFixed(3)})`);
    for (const v of [0.3, 0.66, 1]) {
      const e = ostialEnds(h, v, 1)!;
      assert.ok(e && e.b >= wall! - 1e-9 && e.a > 0.4 && e.a < e.b0, `${id}: its clot (from ${e.a.toFixed(3)}) runs to its wall at v ${v}`);
    }
  }
});
