// The knob on the right hepatic vein's fork (21 Nov, Mohammad: "a stupid knob in the bend of the RHV branches"). A side-wall skin's branch arm runs from J (on the host's axis) to its seam ring far out, and its tube BENDS on the way. The axis's second point was the
// seam's heading line run back by the distance from the arm's end ring to the seam: on a bent branch that point lies a radius or more off the tube's course (1.4 radii behind the host on the real RHV fork), and the bridge J -> it -> seam made a capsule that stood out of
// the host's wall as a knob. The heading line is now trusted only BACK_SIDE_R seam radii back (skin-set.ts axisOf), so the bridge stays on the tube's course. Pinned over every side-wall skin of the Anatomy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet, BACK_SIDE_R } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject, type ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

/** How far the axis's second point stands off the straight bridge from its first point to the seam, in the seam's radii. */
function detour(ax: ArmAxis): number {
  const J = ax.pts[0], P = ax.pts[1], S = ax.pts[2];
  const d = [S[0] - J[0], S[1] - J[1], S[2] - J[2]], l2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2, q = [P[0] - J[0], P[1] - J[1], P[2] - J[2]];
  const t = l2 > 0 ? Math.min(1, Math.max(0, (q[0] * d[0] + q[1] * d[1] + q[2] * d[2]) / l2)) : 0;
  return Math.hypot(q[0] - t * d[0], q[1] - t * d[1], q[2] - t * d[2]) / ax.radii[2];
}

test('the branch arm of a side-wall skin bridges from J to its seam on the tube\'s own course: no detour of its heading point', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const built: { mesh: SkinMesh; axes: readonly ArmAxis[] }[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => { built.push({ mesh, axes }); return new SkinObject(mesh, arms[0]!, axes, arms); },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
  });
  set.build(2);
  let checked = 0;
  for (const { mesh, axes } of built) {
    if (!mesh.junction.arms.some((a) => a.side)) continue;
    mesh.junction.arms.forEach((a, i) => {
      if (a.side || a.grow || axes[i]!.mate !== undefined) return;
      checked++;
      assert.ok(detour(axes[i]!) <= 0.6, `${mesh.junction.node} ${a.vesselId}: the heading point stands ${detour(axes[i]!).toFixed(2)} seam radii off the bridge (a knob in the wall)`);
    });
  }
  assert.ok(checked >= 2, `side-wall branch arms checked: ${checked}`);
  assert.ok(BACK_SIDE_R > 0 && BACK_SIDE_R <= 2);
});
