// Every junction of the inventory builds its welded skin: none falls back to the old join (the builder's "surface folds" came from the remesh leaving tiny sliver faces, because a collapse
// pass only takes an independent set of edges and the loop ran out of rounds before the crowded patches in the crotches were cleared: PVT_L and CV_R fell back; mesh.ts COLLAPSE_PASSES).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { findSkinJunctions, nodesBeyondReach, withoutGrowers } from '../src/scene/vessels/skin/inventory.ts';
import type { SkinJunction } from '../src/scene/vessels/skin/types.ts';

test('every inventory node builds a skin, with no fallback to the old join', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const draws: SkinObject[] = [], warnings: string[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => { const d = new SkinObject(mesh, arms[0]!, axes, arms); draws.push(d); return d; },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: (m) => warnings.push(m),
  });
  set.build(2);
  assert.deepEqual(warnings, [], 'no skin falls back to the old join');
  const all = findSkinJunctions().filter((j) => !['SVC_E'].includes(j.node)), far = nodesBeyondReach(all.map((j) => withoutGrowers(j)).filter((j): j is SkinJunction => !!j));
  const built = draws.map((d) => d.mesh.name.replace('skin:', ''));
  for (const j of all) {
    if (far.includes(j.node)) continue;
    const skinned = built.some((b) => b.split('+').includes(j.node));
    // a node of three or more permanent arms always has its skin; a run-on pair has one only where a collateral or shunt stayed on it (the arms a skin could not take are named in `dropped`, tests/skin-grow.test.ts)
    if (j.arms.filter((a) => !a.grow).length >= 3) assert.ok(skinned, `${j.node} has a skin`);
    else assert.ok(skinned || j.arms.filter((a) => a.grow).every((a) => set.dropped.includes(`${j.node}:${a.vesselId}`)), `${j.node}: a skin, or every growing arm named as dropped`);
  }
  // the nodes the 2D art leaves too far apart for a junction (spec 10.6) keep the old join, named here so a new one fails until someone looks:
  // SIN_R and SIN_L, where the hepatic arteriole ends 20 and 38 radii of the bed's inflow from J (the arteriole feeds the bed from beside it; there is no fork to weld)
  // IVCS too: the hepatic veins end on the cava's SIDE, 1.7 to 7 radii down its axis from the node (MHV 7.1): a side-wall junction (spec 10.1), which the side-wall arms (T3) weld; as a star at the node it is not a shape the art has
  assert.deepEqual([...set.fellBack].sort(), ['IVCS', 'SIN_L', 'SIN_R'], 'the pinned list of nodes that keep the old join');
});
