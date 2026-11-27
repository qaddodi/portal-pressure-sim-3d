// The dive's flash (Mohammad 22 Nov, the Lobule -> Sinusoid clip): while the sinusoid scene is whole and in front (dive share 0.68 on) and the lobule has not yet dropped out (0.70 to 0.74), a lobule
// layer was still painted OVER the sinusoid and then popped off. Root cause: the marks plate (Disse's lining, the septa, the tracts, the vein's cuff) was the one depth-BLIND material under the Lobule
// root, drawn in the see-through list after the opaque sinusoid, so it painted over it whatever stood in front. Now every lobule material tests depth, and every lobule part stands UNDER the sinusoid's
// lowest surface (its ground, 12 µm down at the scene's lift), also when congestion has widened the tubes (sinusoid3d.ts liftUm follows the tallest tube in view).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, type Material, type Object3D } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { Lobule3D, LZ, OVER_Z, DIVE_RHO } from '../src/scene/micro3d/lobule3d.ts';
import { LIFT, LIFT_MARGIN, UM_LOBULE as UM, Z } from '../src/scene/micro3d/sinusoid3d.ts';
import { sinRadius } from '../src/scene/lobule/widths.ts';
import { PLATE_Z } from '../src/scene/lobule/plate.ts';

const shared = createShared();
const flat = new LobuleView(shared);
const l3 = new Lobule3D(flat, shared);
l3.buildForTest('light', 0, 1);   // (septU 1: the tallest nucleus crowns)
flat.setVisible(true);

const materialsUnder = (root: Object3D): Material[] => {
  const out: Material[] = [];
  root.traverse((o) => { const m = (o as Mesh).material; if (m) for (const x of Array.isArray(m) ? m : [m]) out.push(x); });
  return out;
};
const maxZ = (g: { getAttribute(n: string): { count: number; getZ(i: number): number } | undefined }): number => {
  const p = g.getAttribute('position'); let m = -Infinity;
  if (p) for (let i = 0; i < p.count; i++) m = Math.max(m, p.getZ(i));
  return m;
};
/** The sinusoid scene's lowest surface at the dive (local units of the lobule): its ground, 12 µm down in its own units, at the lift, at its full scale (the eye is far: holdScale's k is just under 1). */
const sinusoidFloor = (liftUm: number): number => (liftUm + Z.ground) * UM;

test('no material under the Lobule root ignores depth, and none is drawn over a nearer thing', () => {
  const mats = materialsUnder(l3.group);
  assert.ok(mats.length > 20, 'the whole lobule is walked');
  const blind = mats.filter((m) => m.depthTest === false).map((m) => m.name || m.type);
  assert.deepEqual(blind, [], 'a depth-blind lobule layer is painted over the sinusoid at the handoff');
  const plate = (l3 as unknown as { marksMat: Material }).marksMat;
  assert.equal(plate.depthTest, true, 'the marks plate tests depth');
  assert.equal(plate.depthWrite, false, 'and writes none, so every vessel still draws over it');
});

test('the marks plate stands over every solid it paints on and under the sinusoid\'s lowest surface', () => {
  let crown = -Infinity;
  for (const p of l3.partsForTest) if (p.toonMesh.name === 'lobule3d/nuclei' || p.toonMesh.name === 'lobule3d/hepatocytes') crown = Math.max(crown, maxZ(p.geometry));
  assert.ok(LZ.marks > crown + 0.002, `the plate (${LZ.marks}) is over the nucleus crowns and tile tops (${crown.toFixed(4)})`);
  assert.ok(LZ.marks < sinusoidFloor(LIFT) - 2 * UM, `the plate is at least 2 µm under the sinusoid's ground (${sinusoidFloor(LIFT).toFixed(4)})`);
  assert.ok(PLATE_Z < LZ.ground, 'the tap halo and the neighbours\' field lie far under the plate, as before');
});

test('every blood tube in the dive\'s view stands under the sinusoid, healthy and in the widest congestion', () => {
  // healthy: the tubes as built (the geometry's own tops, the swell off)
  let top = -Infinity;
  for (const n of ['sinusoids-0', 'sinusoids-1', 'sinusoids-links', 'arteriole-twigs', 'canaliculi', 'lymph-channels', 'terminal-lymphatics']) {
    const p = l3.partsForTest.find((x) => x.toonMesh.name === `lobule3d/${n}`)!;
    top = Math.max(top, maxZ(p.geometry));
  }
  assert.ok(top < sinusoidFloor(LIFT) - LIFT_MARGIN * UM * 0.5, `healthy: the tallest tube (${top.toFixed(4)}) is under the sinusoid's ground (${sinusoidFloor(LIFT).toFixed(4)}) at the default lift`);
  // the dive's tallest tube as the scene reports it, at rest and widened to the worst congestion
  const at = (cong: number, lum = 1): number => {
    (flat as unknown as { cur: { congU: number; lum: number } }).cur.congU = cong; (flat as unknown as { cur: { congU: number; lum: number } }).cur.lum = lum;
    return l3.diveTopZ();
  };
  const healthyTop = at(0), congTop = at(1);
  assert.ok(healthyTop >= top - 1e-9, 'the reported top covers the built tubes');
  assert.ok(congTop > healthyTop + 0.01, 'congestion widens the tubes, and so lifts the tallest');
  const lift = (z: number): number => Math.max(LIFT, z / UM - Z.ground + LIFT_MARGIN);
  for (const z of [healthyTop, congTop]) assert.ok(z < sinusoidFloor(lift(z)) - 1.9 * UM, `tube top ${z.toFixed(4)} is under the sinusoid's ground ${sinusoidFloor(lift(z)).toFixed(4)} with 2 µm to spare`);
  assert.equal(lift(healthyTop), LIFT, 'healthy: the lift is the one the dive always had, nothing changes');
  assert.ok(lift(congTop) > LIFT, 'congested: the scene stands higher, over the widened tubes');
  at(0);
  assert.ok(DIVE_RHO[0] < 0.45 && 0.45 < DIVE_RHO[1], 'the sinusoid\'s own station (rho 0.45) is inside the span');
  assert.ok(sinRadius('s1', 0.45) > 0);
  assert.ok(OVER_Z > 0);
});
