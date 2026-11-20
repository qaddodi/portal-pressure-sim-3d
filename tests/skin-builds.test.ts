// Every junction of the inventory builds its welded skin: none falls back to the old join (the builder's "surface folds" came from the remesh leaving tiny sliver faces, because a collapse
// pass only takes an independent set of edges and the loop ran out of rounds before the crowded patches in the crotches were cleared: PVT_L and CV_R fell back; mesh.ts COLLAPSE_PASSES).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { findSkinJunctions } from '../src/scene/vessels/skin/inventory.ts';

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
  const nodes = findSkinJunctions().map((j) => j.node);
  const built = draws.map((d) => d.mesh.name.replace('skin:', ''));
  for (const n of nodes) assert.ok(built.some((b) => b.split('+').includes(n)), `${n} has a skin`);
});
