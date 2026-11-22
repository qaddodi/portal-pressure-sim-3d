// Three defects of the Circuit's map seen on the owner's Mac (22 Nov 2026), each pinned at its ROOT and for every vessel the same cause reaches:
//   1. A bend drawn as doubled, zig-zag segments with stray ink (the rectal and retroperitoneal collaterals' rounded corners, every map corner): a collateral is drawn by its STRANDS, and only the first tube of a vessel was built with the map's ring
//      count (slicesFor), so the strands (77 rings on 1250 map units where the map needs 400) each cut a 16 unit corner into its own few chords, three different zig-zags laid over one course. Every tube of a vessel has the map's rings now.
//   2. A hard width step at the SMV node (a thin vein meeting a wide one at the same ring): a skinned end had no map taper at all, on the idea that its welded skin carries the join; but the skin is not drawn while its growing arm (a shunt, a collateral)
//      is closed, so the two permanent arms of a node met at their own two widths. A skinned end keeps its taper as far as its skin's cut (circuit/mates.ts skinnedEase).
//   3. A seam at the paraumbilical vein's end (EPI node): a collateral's or shunt's sunk, narrowed map end (circuit/map-sewn.ts, laid on `rkc` when the tube is built) was thrown away by the first rebuild of its shape (shape-track.ts built the tube again and
//      `reshape` copied its `rkc`), so the wide vein stood out to the cut of its skin, 9 map units from the node, and stepped down to the skin's narrow ring.
// Node only. Run: node --test tests/circuit-corners-and-joins.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, STRAND_RINGS_MAX, STRAND_RING_K, coursesOf, tubularOf, type ShapeState } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { COURSES } from '../src/scene/circuit/course.ts';
import { slicesFor } from '../src/scene/circuit/geometry.ts';
import { MAP_K } from '../src/scene/circuit/map.ts';
import { CIRCUIT_MATES, mapLen, skinnedEase, taperWidth } from '../src/scene/circuit/mates.ts';
import { CircuitSkinSet } from '../src/scene/circuit/skins.ts';
import { sewOnMap } from '../src/scene/circuit/map-sewn.ts';
import { circuitWidthMap } from '../src/scene/circuit/width.ts';

const widthOf = (id: string): number => { const v = NETWORK_BY_ID.get(id)!; return circuitWidthMap(v.widthKind, v.baseD, 1, v.circFine ?? 1); };

/** The farthest (map units) the straight chords between a tube's rings lie from the map course the rings are laid on. */
function sagOf(id: string, tubular: number): number {
  const c = COURSES.get(id)!.curveC, fine = 8;
  let worst = 0;
  for (let k = 0; k < tubular; k++) {
    const a = c.getPointAt(k / tubular), b = c.getPointAt((k + 1) / tubular);
    for (let q = 1; q < fine; q++) {
      const u = q / fine, on = c.getPointAt((k + u) / tubular), chord = new Vector3().lerpVectors(a, b, u);
      worst = Math.max(worst, on.distanceTo(chord) / MAP_K);
    }
  }
  return worst;
}

test('every strand of a collateral has a ring every 3 map units or less on the map (the trunk keeps the count the skins are meshed on): a rounded corner is an arc and never a chord', () => {
  let strands = 0;
  for (const def of NETWORK) {
    if (!def.plan || !COURSES.has(def.id)) continue;
    const min = slicesFor(def.id), tubular = tubularOf(def, min);
    tubular.forEach((n, i) => {
      assert.ok(n >= min, `${def.id} tube ${i}: ${n} rings against the map's ${min}`);
      if (i === 0) return;
      strands++;
      assert.ok(n >= Math.min(STRAND_RINGS_MAX, Math.ceil(min * STRAND_RING_K)), `${def.id} strand ${i}: ${n} rings`);
      if (n < STRAND_RINGS_MAX) assert.ok(mapLen(def.id) / n <= 3.1, `${def.id} strand ${i}: a ring every ${(mapLen(def.id) / n).toFixed(2)} map units`);
    });
  }
  assert.ok(strands >= 15, `${strands} strands checked`);
  // the vessels the owner saw: the rectal (C4) and retroperitoneal (C7) collaterals are three strands each; their bends are arcs of 16 and 24 map units
  for (const id of ['C4', 'C7']) {
    const def = NETWORK_BY_ID.get(id)!, t = tubularOf(def, slicesFor(id));
    assert.ok(t.length > 1);
    t.slice(1).forEach((n) => assert.ok(sagOf(id, n) < 0.12, `${id}: the strand's rings leave the arc by ${sagOf(id, n).toFixed(3)} map units`));
  }
});

test('the same strands as the trunk was counted (no floor of their own) cut the corner by a visible chord (the failure this pins)', () => {
  const def = NETWORK_BY_ID.get('C4')!;
  // (the count a strand has with no map floor: tubularFor of its own course, 77 rings on 1250 map units)
  const own = tubularOf(def, 0)[1]!;
  assert.ok(sagOf('C4', own) > 0.6, `a strand of ${own} rings sags ${sagOf('C4', own).toFixed(2)} map units at the bend`);
  assert.ok(own < tubularOf(def, slicesFor('C4'))[1]!);
});

test('a skinned end keeps its map taper as far as its skin\'s cut: the pair at SMV, a thin vein into a wide one, is ONE smoothstep through the node whether or not the skin is drawn', () => {
  const mates = CIRCUIT_MATES.get('V_INT_1')!, len = mapLen('V_INT_1');
  // (a cut 13 map units from the node: the whole taper, 12 each way, stands outside it; the other end has no skin: its whole taper too)
  assert.deepEqual(skinnedEase('V_INT_1', mates, [false, true], [-1, 1 - 13 / len]), [mates[0]?.ease ?? 0, 12]);
  // a cut nearer the node than the taper holds the taper to the cut: the tube is its own width at and past the ring the skin stands on
  assert.ok(Math.abs(skinnedEase('V_INT_1', mates, [false, true], [-1, 1 - 5 / len])[1]! - 5) < 1e-6);
  // an end with no skin has its whole taper; a cut that is not set (-1, 2) leaves none to a skinned end
  assert.equal(skinnedEase('V_INT_1', mates, [false, false], [-1, 2])[1], 12);
  assert.equal(skinnedEase('V_INT_1', mates, [false, true], [-1, 2])[1], 0);   // (the cut is the node itself: nothing to taper)
  // the pair meets at the mean width at the node from both sides: no step
  const w = (id: string) => { const v = NETWORK_BY_ID.get(id)!; return circuitWidthMap(v.widthKind, v.baseD, 1, v.circFine ?? 1); };
  const a = taperWidth(w('V_INT_1'), w('SMV_CONF'), 0, 12), b = taperWidth(w('SMV_CONF'), w('V_INT_1'), 0, 12);
  assert.ok(Math.abs(a - b) < 1e-9 && Math.abs(a - 0.5 * (w('V_INT_1') + w('SMV_CONF'))) < 1e-9);
});

test('the scene writes the taper to a skinned end: SMV\'s two permanent arms carry on into one another over 12 map units each way, every skinned end with a mate of another width has one', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    // the scene's own Circuit skins, built and handed back the way the scene does it (endsChanged writes the map's mates again)
    const inside = scene as unknown as { circuitSkins: CircuitSkinSet | null; applyMates(): void };
    const parent = new Group();
    inside.circuitSkins = new CircuitSkinSet({
      vessel: (id) => scene.vesselObject(id), make: (mesh) => ({ mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} }) as never,
      add: (o) => parent.add(o), remove: (o) => parent.remove(o), warn: () => {}, endsChanged: () => inside.applyMates(),
    });
    inside.circuitSkins.build();
    assert.ok(inside.circuitSkins.endsOf('V_INT_1')[1], 'V_INT_1\'s end at SMV is a skin\'s');
    const cease = (id: string) => (scene.vesselObject(id)!.toon.uniforms.cease!.value as { x: number; y: number });
    assert.ok(cease('V_INT_1').y > 0, 'V_INT_1 end: a taper into SMV_CONF');
    assert.ok(cease('SMV_CONF').x > 0, 'SMV_CONF start: a taper into V_INT_1');
    for (const [id, m] of CIRCUIT_MATES) {
      const o = scene.vesselObject(id);
      if (!o) continue;
      const c = cease(id);
      // no end whose mate is another width is left with no taper (the step this pins), whether its skin is drawn or not
      m.forEach((x, end) => { if (x && x.ease > 0 && mapLen(id) > 40 && Math.abs(widthOf(id) - widthOf(x.id)) > 0.5) assert.ok((end ? c.y : c.x) > 1, `${id} end ${end} carries on into ${x.id} with a taper of ${(end ? c.y : c.x).toFixed(2)}`); });
    }
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('a collateral\'s sunk and narrowed map end survives the rebuild of its shape: the live rkc is the sewn one, not the full width at the node', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const inside = scene as unknown as { shapes: { rebuild(i: unknown): boolean; items: { v: { id: string }; shown: number; spread: number; strandsOn: boolean; state: ShapeState }[] } };
    for (const id of ['C3', 'C4', 'C7', 'C5', 'C9']) {
      const it = inside.shapes.items.find((q) => q.v.id === id);
      if (!it) continue;
      it.state.wig = 1.2; it.state.spr = 1; it.state.strandsOn = true; it.state.rec = 1;
      inside.shapes.rebuild(it);
      const def = NETWORK_BY_ID.get(id)!, want = buildTubes(coursesOf(def, { ...REST, ...it.state }), tubularOf(def, slicesFor(id)), def.radius);
      const raw = (want.geometry.getAttribute('rkc').array as Float32Array).slice();
      sewOnMap(id, want.geometry, want.runs);
      const sewn = want.geometry.getAttribute('rkc').array as Float32Array, got = (scene.vesselObject(id) as unknown as { toonMesh: { geometry: { getAttribute(n: string): { array: Float32Array } } } }).toonMesh.geometry.getAttribute('rkc').array;
      assert.equal(got.length, sewn.length, id);
      let narrowed = 0, off = 0;
      for (let i = 0; i < sewn.length; i++) { if (sewn[i]! < raw[i]! - 1e-6) narrowed++; if (Math.abs(got[i]! - sewn[i]!) > 1e-5) off++; }
      assert.ok(narrowed > 0, `${id}: the map sews some end of it`);
      assert.equal(off, 0, `${id}: ${off} of ${sewn.length} vertices have the full width, not the sewn one`);
    }
  } finally { scene.dispose(); setSmoothJoins(was); }
});
