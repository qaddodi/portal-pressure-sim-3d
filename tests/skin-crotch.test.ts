// A tight crotch (LRV_S: the shunts C6 and S_DSR leave a trunk side by side) held two free vertices 79.8 degrees apart in shading normal after the crease easing; mesh.ts `refined` builds only such a skin again with a finer target edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { REFINE_AT, worstNormalAngle } from '../src/scene/vessels/skin/mesh.ts';

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
  // (placed anatomy: the TIPS arm of RHV_T builds (the 2D figure's crotch dropped it). What is named dropped is the growing ends that land past SKIN_REACH of their node (skin-set.ts farGone): no skin failed and lost an arm (why is empty). Those ends land
  //  on a host's wall instead where a wall skin takes them (REX and C3 on PVH_L_1, S_PC and C9 on IVC_IS_1, C6's renal end on LRV_IVC), or keep the tube's own sewn end (C2 at the splenic vein, C6's splenic end))
  assert.ok(!set.dropped.includes('RHV_T:TIPS'), 'the TIPS arm of RHV_T is kept');
  assert.deepEqual((set as unknown as { why: Record<string, string> }).why, {}, 'no arm was dropped by a failed build');
  assert.deepEqual([...set.dropped].sort(), ['IVCI:C9', 'IVCI:S_PC', 'LPV:C3', 'LPV:REX', 'LRV_S:C6', 'SV:C2', 'SVD:C6'], 'the same far ends as before');
});
