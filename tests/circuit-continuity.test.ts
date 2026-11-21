// The Circuit draws every permanent vessel as unbroken as the 2D map does (review 21 Nov, #13: "the Lower IVC ends below the hepatic-vein/IVC node, with visible background in between"). Node only: the map's courses are walked
// and every point must be either on a tube's visible stretch (outside its skin cuts) or inside a welded skin, projected on the map. Root cause it pins: a merged skin hides a whole vessel (IVC_IS, 85 map units between IVC_D and IVCS),
// J is the midpoint of the two nodes, and the run-on arm's capsule stopped at J, so nothing covered the far half (circuit/skins.ts bridgeStart). The map is a rigid plate turned a quarter (turnScenePt), so the check is the same in
// both orientations; the skin set holds the whole shape (Healthy, Budd-Chiari: the plain trunk; TIPS and DIPS opened: the full skin with its growing arms), so both are held.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { COURSES } from '../src/scene/circuit/course.ts';
import { CircuitSkinSet } from '../src/scene/circuit/skins.ts';
import { sceneToMap, turnScenePt } from '../src/scene/circuit/map.ts';

type Tri = readonly [readonly number[], readonly number[], readonly number[]];
const inTri = (p: readonly number[], t: Tri): boolean => {
  const s = (a: readonly number[], b: readonly number[], c: readonly number[]) => (a[0]! - c[0]!) * (b[1]! - c[1]!) - (b[0]! - c[0]!) * (a[1]! - c[1]!);
  const d1 = s(p, t[0], t[1]), d2 = s(p, t[1], t[2]), d3 = s(p, t[2], t[0]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
const trisOf = (m: { position: ArrayLike<number>; index: ArrayLike<number> }, rr: number): Tri[] => {
  const P: number[][] = [];
  for (let i = 0; i < m.position.length; i += 3) { const q = turnScenePt(m.position[i]!, m.position[i + 1]!, rr); P.push(sceneToMap(q[0], q[1]).map((v) => v)); }
  return Array.from({ length: m.index.length / 3 }, (_, k) => [P[m.index[3 * k]!]!, P[m.index[3 * k + 1]!]!, P[m.index[3 * k + 2]!]!] as const);
};

test('no stretch of any permanent vessel on the Circuit is neither tube nor skin: the cava is whole from the iliac junction to the right atrium, plain trunk and full skin, wide and upright', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const parent = new Group();
    const set = new CircuitSkinSet({
      vessel: (id) => scene.vesselObject(id),
      make: (mesh) => ({ mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} }) as never,
      add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {}, endsChanged: () => {},
    });
    set.build();
    for (const rr of [0, 1]) {
      for (const which of ['full', 'plain'] as const) {
        const tris: Tri[] = [];
        for (const n of set.nodes) { const m = which === 'full' ? set.skinOf(n) : (set.plainOf(n) ?? set.skinOf(n)); if (m) tris.push(...trisOf(m, rr)); }
        for (const v of NETWORK) {
          if (v.kind === 'collateral' || v.kind === 'shunt' || v.feeder) continue;   // (the opened lanes grow in; their ends are sewn, circuit/map-sewn.ts)
          const c = COURSES.get(v.id);
          if (!c) continue;
          const cut = set.cutOf(v.id), hiddenWhole = cut[0] > 1 && cut[1] < 0;
          const bad: number[] = [];
          for (let i = 0; i <= 120; i++) {
            const u = i / 120, q = c.curveC.getPointAt(u), t = turnScenePt(q.x, q.y, rr), p = sceneToMap(t[0], t[1]);
            const onTube = !hiddenWhole && (cut[0] <= -1 || u >= cut[0]) && (cut[1] >= 2 || u <= cut[1]);
            if (!onTube && !tris.some((tr) => inTri(p, tr))) bad.push(+u.toFixed(3));
          }
          assert.deepEqual(bad, [], `${v.id} (${which}, turn ${rr}): course points at u = ${bad.join(', ')} have no tube and no skin`);
        }
      }
    }
  } finally { scene.dispose(); setSmoothJoins(was); }
});
