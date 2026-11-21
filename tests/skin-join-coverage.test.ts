// Guard for every merged junction skin (rule 1c: a vessel two skins share is HIDDEN whole, the skin is all there is of it): the vessel's whole run must lie inside the skin that replaces it, with every shunt closed (the plain trunk) and open (the welded skin).
// Mohammad, 21 Nov: after RHV_T was merged with the cava's IVCS skin the right hepatic vein ended in a round cap short of the cava with no join, because the merged skin's arms did not reach the hidden piece. Nothing may lose its join or end in a cap.
// Node only: the real network and the real scene's tubes. Run: node --test tests/skin-join-coverage.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { centrelineOf } from '../src/scene/vessels/centreline.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

/** A sample of the hidden vessel's centreline is covered when a vertex of the skin lies within this many of the vessel's radii of it (inside the tube the nearest surface vertex is about one radius away; a cap short of the cava leaves the run beyond it several radii off). */
const REACH_R = 2.6;
const SAMPLES = 40;

const nearest = (m: SkinMesh, p: readonly number[]): number => {
  let best = Infinity;
  for (let i = 0; i < m.position.length; i += 3) { const d = Math.hypot(m.position[i]! - p[0]!, m.position[i + 1]! - p[1]!, m.position[i + 2]! - p[2]!); if (d < best) best = d; }
  return best;
};

test('every vessel a merged skin hides whole lies inside the skin that replaces it, shunts open and closed (no join lost, no cap short of its neighbour)', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const parent = new Group();
    const set = new SkinSet({
      vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
      make: (mesh, ax, arms) => new SkinObject(mesh, arms[0]!, ax, arms),
      add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
    });
    set.build(2);
    let checked = 0;
    const gaps: string[] = [];
    for (const node of set.nodes) {
      for (const id of set.hiddenOf(node)) {
        const c = centrelineOf(id)!;
        for (const [label, mesh] of [['shunts open', set.skinOf(node)], ['shunts closed', set.plainOf(node) ?? set.skinOf(node)]] as const) {
          assert.ok(mesh, `${node}: a skin`);
          for (let s = 0; s <= SAMPLES; s++) {
            const u = s / SAMPLES, d = nearest(mesh!, c.pointAt(u)), r = c.radiusAt(u);
            if (d > REACH_R * r) { gaps.push(`${node} hides ${id}: at u=${u.toFixed(2)} the ${label} skin is ${(d / r).toFixed(1)} radii away`); break; }
          }
        }
        checked++;
      }
    }
    assert.ok(checked >= 1, 'the real network has at least one hidden vessel (PV_TRUNK_1 between CONF and PVT_L)');
    assert.deepEqual(gaps, []);
  } finally { scene.dispose(); setSmoothJoins(was); }
});
