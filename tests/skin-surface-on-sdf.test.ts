// Mohammad, 20 Nov: "hepatic artery welding sucks", "red wedge at the LPV crotch". The first question for any such shape is whether the mesh IS the shape it was designed to be: the smooth union of the
// arms' capsules (spec 4.3). It is the zero level of that union, so every interior vertex lies on it, and the fillet it adds beyond the plain union of the capsules is bounded: the polynomial smooth-min
// never takes the union more than k/4 beyond the plain minimum for each pairing (k = SKIN_K x the narrowest arm). A vertex further out than that, or off the zero level, is a mesh fault (remesh drift,
// a relaxation pass, a wrong normal projection) and no shader can mend it. One invariant over every built skin, so a node that fills its crotch is caught at its root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { sdArm, sdUnion, skinKOf, type Capsule } from '../src/scene/vessels/skin/sdf.ts';

test('every skin: each interior vertex is on the smooth union of its arms and no further out than the fillet allows', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const built: Array<{ node: string; position: ArrayLike<number>; ring: Set<number>; caps: Capsule[]; k: number; rmin: number; arms: number }> = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => {
      const caps: Capsule[] = axes.map((a) => ({ n: a.pts.length, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii), mate: a.mate }));
      built.push({ node: mesh.junction.node, position: mesh.position, ring: new Set(mesh.seamVerts.flatMap((a) => [...a])), caps, k: skinKOf(mesh.junction.arms), rmin: Math.min(...mesh.junction.arms.map((a) => a.restR)), arms: mesh.junction.arms.length });
      return new SkinObject(mesh, arms[0]!, axes, arms);
    },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
  });
  set.build(2);
  assert.ok(built.length >= 9, `${built.length} skins built`);
  for (const b of built) {
    let outside = -Infinity, off = 0;
    for (let v = 0; v < b.position.length / 3; v++) {
      if (b.ring.has(v)) continue;
      const x = b.position[3 * v]!, y = b.position[3 * v + 1]!, z = b.position[3 * v + 2]!;
      let plain = Infinity;
      for (const c of b.caps) plain = Math.min(plain, sdArm(c, x, y, z));
      outside = Math.max(outside, plain);
      off = Math.max(off, Math.abs(sdUnion(b.caps, b.k, x, y, z)));
    }
    const bound = ((b.arms - 1) * b.k) / 4 * 1.5;   // (each pairing may add k/4; the 1.5 is the room for the pairwise order of three or more arms)
    assert.ok(outside <= bound, `${b.node}: a vertex lies ${(outside / b.rmin).toFixed(2)} of the narrowest radius outside the plain union, the fillet allows ${(bound / b.rmin).toFixed(2)}`);
    assert.ok(off <= 0.08 * b.rmin, `${b.node}: a vertex is ${(off / b.rmin).toFixed(3)} of the narrowest radius off the union's surface`);
  }
});
