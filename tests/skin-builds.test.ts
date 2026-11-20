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
  { const live = new Set<unknown>(set.liveDraws()); for (let i = draws.length - 1; i >= 0; i--) if (!live.has(draws[i])) draws.splice(i, 1); }   // (a skin the planner took back to plan with its neighbours is not one of them)
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
  // no node keeps the old join. SIN_R and SIN_L, the liver beds, did until 21 Nov: the hepatic arteriole ended 20 and 38 radii of the bed's inflow from the node, beside the start of the portal venule it follows, which is no junction. Mohammad chose to extend it: A_HR and A_HL
  // now run on to the bed's node (starts.ts alongVein, BED_ANGLE), so the beds are three-arm junctions like any other (tests/skin-sheet.test.ts).
  // IVCS is a side-wall junction (T3): the cava is a side arm and the skin stands mid-cava.
  assert.deepEqual([...set.fellBack].sort(), [], 'the pinned list of nodes that keep the old join: none (the liver beds SIN_R and SIN_L are welded since the hepatic arteries run on to them)');
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
