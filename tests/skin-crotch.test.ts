// A tight crotch (LRV_S: the shunts C6 and S_DSR leave a trunk side by side) held two free vertices 79.8 degrees apart in shading normal after the crease easing; mesh.ts `refined` builds only such a skin again with a finer target edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { REFINE_AT, worstNormalAngle } from '../src/scene/vessels/skin/mesh.ts';
import { carriedBy, droppedOf } from './skin-names-lib.ts';

test('LRV_S clears the 80 degree limit with margin, and the refinement leaves every other skin as it was', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const worst = new Map<string, number>(), verts = new Map<string, number>();
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (m, axes, arms) => { worst.set(m.junction.node, worstNormalAngle(m)); verts.set(m.junction.node, m.position.length / 3); return new SkinObject(m, arms[0]!, axes, arms); },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
  });
  set.build(2);
  assert.ok(worst.get('LRV_S')! < 75, `LRV_S ${worst.get('LRV_S')}`);
  for (const [n, w] of worst) assert.ok(w < 80, `${n} ${w.toFixed(1)}`);
  assert.ok([...worst].filter(([n, w]) => w < REFINE_AT && n !== 'LRV_S').length > 15, 'most skins are under the refinement threshold and were built once');
  // (placed anatomy: the TIPS arm of RHV_T builds (the 2D figure's crotch dropped it). What is named dropped is a growing end no skin carries (skin-set.ts: one drawn too far from its node, or past the widest SKIN_GROWERS of a merged skin): no skin failed and lost an arm (why is empty).
  //  Which they are is worked out from the network's growers less what the skins carry (tests/skin-grow.test.ts names each with why), not typed: a take-off the table moves changes it here with no edit)
  assert.ok(!set.dropped.includes('RHV_T:TIPS'), 'the TIPS arm of RHV_T is kept');
  assert.deepEqual((set as unknown as { why: Record<string, string> }).why, {}, 'no arm was dropped by a failed build');
  assert.deepEqual([...set.dropped].sort(), droppedOf(carriedBy(set)), 'every growing end is carried by a skin or named dropped');
});
