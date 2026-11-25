// The portal fork turned into a ball (Mohammad, 25 Nov, at 2a54261a: "the portal vein bifurcation it's back looking like a ball"). Root cause: through.ts welds two arms as one vessel running through a node only when the seam-to-far chord of each half is
// within 35 degrees of straight. That chord moves with where the seam rings are cut: when the DIPS was led out of the portal fork (6c6b8c9d) the right portal vein's chord turned 4 degrees, the portal trunk -> right portal vein run went from 34 to 39 degrees off
// straight, stopped being a run, and the trunk, the right and the left portal vein became a three-way hub of discs (a ball) instead of one trunk with the left branch leaving it. The network already says which two vessels run on into each other at a node (RUN_ONS):
// a declared run is welded up to DECLARED_THROUGH_DEG whatever way the seams fall. These tests pin the rule on synthetic arms and on EVERY skin of the placed anatomy (the portal fork was the only declared run that had fallen out).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject, type ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import { declaredRuns } from '../src/scene/vessels/skin/inventory.ts';
import { DECLARED_THROUGH_DEG, THROUGH_DEG, throughMates, weldThrough } from '../src/scene/vessels/skin/through.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

type V3 = [number, number, number];
const arm = (dir: V3, r: number): ArmAxis => {
  const l = Math.hypot(...dir), d = dir.map((x) => x / l) as V3, at = (t: number): V3 => [d[0] * t, d[1] * t, d[2] * t];
  return { pts: [[0, 0, 0], at(0.1), at(0.2), at(0.6)], radii: [r, r, r, r] };
};
/** an arm leaving the node `off` degrees away from straight opposite to +y (the other half of the run) */
const bent = (off: number, r: number): ArmAxis => { const a = ((180 - off) * Math.PI) / 180; return arm([Math.sin(a), Math.cos(a), 0], r); };

test('a declared run is welded up to DECLARED_THROUGH_DEG off straight; undeclared, only within THROUGH_DEG; past the limit it is a bend either way', () => {
  const up = arm([0, 1, 0], 0.025), at39 = bent(THROUGH_DEG + 4, 0.021), at59 = bent(DECLARED_THROUGH_DEG - 1, 0.021), at70 = bent(DECLARED_THROUGH_DEG + 10, 0.021), side = arm([1, 0, 0], 0.02);
  assert.deepEqual(throughMates([up, at39]), [-1, -1], 'the angle rule alone: 39 degrees off straight is no run (the portal fork at 2a54261a)');
  assert.deepEqual(throughMates([up, at39], [], [[0, 1]]), [1, 0], 'declared by the network: the same two arms are one vessel');
  assert.deepEqual(throughMates([up, at59], [], [[0, 1]]), [1, 0]);
  assert.deepEqual(throughMates([up, at70], [], [[0, 1]]), [-1, -1], 'past DECLARED_THROUGH_DEG it is a real bend, declared or not');
  assert.deepEqual(throughMates([up, at39, side], [], [[0, 1]]), [1, 0, -1], 'the side branch of a fork is no part of the run');
  assert.deepEqual(throughMates([up, at39], [true, false], [[0, 1]]), [-1, -1], 'a growing arm is never one half of a run, declared or not');
  // a declared pair takes the arms before an undeclared pair that is more nearly opposite (the network decides which two are the vessel)
  const down = arm([0, -1, 0], 0.025);
  assert.deepEqual(throughMates([up, down, at39], [], [[0, 2]]), [2, -1, 0], 'declared 0-2 first; the straighter 0-1 loses arm 0');
  // and the weld itself: the run's halves carry the mate and one capsule from seam to seam
  const w = weldThrough([up, at39, side], [], [[0, 1]]);
  assert.equal(w[0]!.mate, 1); assert.equal(w[1]!.mate, 0); assert.equal(w[2]!.mate, undefined);
});

test('every run-on the network declares is welded as a run in every skin of the placed anatomy (the portal trunk into the right portal vein included)', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const built: { mesh: SkinMesh; axes: readonly ArmAxis[] }[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => { built.push({ mesh, axes }); return new SkinObject(mesh, arms[0]!, axes, arms); },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
  });
  set.build(2);
  const live = new Set<unknown>(set.liveDraws());
  assert.ok(live.size > 0 && built.length >= 12);
  let declared = 0, portal = 0;
  for (const { mesh, axes } of built) {
    const j = mesh.junction;
    for (const [a, b] of declaredRuns(j.arms)) {
      if (j.arms[a]!.grow || j.arms[b]!.grow) continue;
      declared++;
      assert.equal(axes[a]!.mate, b, `${j.node}: ${j.arms[a]!.vesselId} and ${j.arms[b]!.vesselId} run on into each other in the network and must be one run in the skin`);
      assert.equal(axes[b]!.mate, a, `${j.node}: the mate is mutual`);
      if (j.node.startsWith('PVH') && [j.arms[a]!.vesselId, j.arms[b]!.vesselId].sort().join() === 'PVH_R,PV_TRUNK') portal++;
    }
  }
  assert.ok(declared >= 15, `declared runs checked: ${declared}`);
  assert.ok(portal >= 2, `the portal trunk and the right portal vein are one run at the fork, in the fork's own skin and its plain trunk (${portal})`);
});
