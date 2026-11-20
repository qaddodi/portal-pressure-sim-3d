// Every junction of the inventory builds its welded skin: none falls back to the old join (the builder's "surface folds" came from the remesh leaving tiny sliver faces, because a collapse
// pass only takes an independent set of edges and the loop ran out of rounds before the crowded patches in the crotches were cleared: PVT_L and CV_R fell back; mesh.ts COLLAPSE_PASSES).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { findSkinJunctions, nodesBeyondReach } from '../src/scene/vessels/skin/inventory.ts';

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
  const all = findSkinJunctions().filter((j) => !['SVC_E'].includes(j.node)), far = nodesBeyondReach(all);
  const built = draws.map((d) => d.mesh.name.replace('skin:', ''));
  for (const j of all) if (!far.includes(j.node)) assert.ok(built.some((b) => b.split('+').includes(j.node)), `${j.node} has a skin`);
  // the nodes the 2D art leaves too far apart for a junction (spec 10.6) keep the old join, named here so a new one fails until someone looks:
  // SIN_R and SIN_L, where the hepatic arteriole ends 20 and 38 radii of the bed's inflow from J. Measured (tests/skin-side-wall.test.ts): A_HR ends 3.2 radii of PRE_R from the start of PRE_R and 5.4 of the right portal vein's end from RPV, which is no junction (a
  // through branch's tip); A_HL ends 1.8 radii from LPV_A, the left portal vein's bend, where the cuts' hull rule refuses PVH_L_1. Neither lands on the SIDE of a tube, so the side-wall rule (spec 10.1) cannot weld them without drawing new tube.
  // IVCS is no longer here: the hepatic veins end on the cava's SIDE, 1.7 to 7.1 radii down its axis, so it is a side-wall junction (T3): the cava is a side arm and the skin stands mid-cava.
  assert.deepEqual([...set.fellBack].sort(), ['SIN_L', 'SIN_R'], 'the pinned list of nodes that keep the old join');
  assert.ok(set.nodes.includes('IVCS'), 'IVCS is welded as a side-wall junction');
});

test('shading normals across a ridge: no two neighbouring vertices of a skin differ by 80 degrees or more, and the seam rings keep the tube\'s own normals (a crotch\'s two-tone band drew a dark line along the ridge: PVT_L 138, CV_R 116 degrees before the easing)', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const meshes: Array<{ node: string; normal: Float32Array; index: Uint32Array }> = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => { meshes.push({ node: mesh.junction.node, normal: mesh.normal, index: mesh.index }); return new SkinObject(mesh, arms[0]!, axes, arms); },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
  });
  set.build(2);
  assert.ok(meshes.length >= 9);
  for (const m of meshes) {
    let worst = 0;
    for (let i = 0; i < m.index.length; i += 3) for (let s = 0; s < 3; s++) {
      const a = m.index[i + s]!, b = m.index[i + (s + 1) % 3]!;
      const d = m.normal[3 * a]! * m.normal[3 * b]! + m.normal[3 * a + 1]! * m.normal[3 * b + 1]! + m.normal[3 * a + 2]! * m.normal[3 * b + 2]!;
      worst = Math.max(worst, (Math.acos(Math.min(1, Math.max(-1, d))) * 180) / Math.PI);
    }
    assert.ok(worst < 80, `${m.node}: neighbouring normals differ by ${worst.toFixed(0)} degrees`);
  }
});
