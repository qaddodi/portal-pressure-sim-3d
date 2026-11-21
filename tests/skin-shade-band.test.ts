import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { skinKOf } from '../src/scene/vessels/skin/sdf.ts';
import { skinNormalTwin, SKIN_SHADE_K, type TwinArm } from '../src/scene/vessels/skin/exact-normal.ts';
import { SKIN_ARM_ABSENT } from '../src/scene/vessels/skin/shaders.ts';
import { CEL_LIGHT_UNIT } from '../src/scene/cel-glsl.ts';
// 21 Nov, Mohammad: "why is the joint a different colour, brighter?" (wedge slide). Hypothesis tested here: the skin's shading normal lands in the lit cel band where the tubes beside it are in shade. It does not: the skin's
// pixel normal (the smooth union's gradient at the shade width) and the plain tube normal (the union at ~0 width) fall in the same two-tone band at all but a few percent of the surface, in both directions alike,
// so a join shades like its tubes and a brighter joint is NOT the normal. (Pinned so a change to how skin normals are built cannot make the joint systematically lit.)
test('a join lands in the same cel band as its tubes: the skin normal and the tube normal disagree on under 5% of a skin, and not mostly one way', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const L = CEL_LIGHT_UNIT, step = 0.25;
  const dot = (n: number[]) => n[0]!*L[0]+n[1]!*L[1]+n[2]!*L[2];
  let tot=0, skinLitTubeShade=0, skinShadeTubeLit=0, meshLitTubeShade=0;
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => {
      const k = skinKOf(mesh.junction.arms), kS = k*SKIN_SHADE_K;
      const tw = axes.map((a): TwinArm => ({ pts: a.pts.flat(), r: a.radii, mate: a.mate, sw: 1, off: false }));
      let n=0,a1=0,a2=0,a3=0;
      const ring = new Set(mesh.seamVerts.flatMap((a) => [...a]));
      for (let vi=0; vi<mesh.position.length/3; vi++) {
        if (ring.has(vi)) continue;
        const P=[mesh.position[3*vi]!,mesh.position[3*vi+1]!,mesh.position[3*vi+2]!] as const;
        const sk = skinNormalTwin(tw, kS, ...P, SKIN_ARM_ABSENT), tu = skinNormalTwin(tw, 1e-4, ...P, SKIN_ARM_ABSENT);
        const mv=[mesh.normal[3*vi]!,mesh.normal[3*vi+1]!,mesh.normal[3*vi+2]!];
        const sLit = dot(sk)>step, tLit = dot(tu)>step, mLit = dot(mv)>step;
        n++; if (sLit&&!tLit) a1++; if(!sLit&&tLit) a2++; if (mLit&&!tLit) a3++;
      }
      tot+=n; skinLitTubeShade+=a1; skinShadeTubeLit+=a2; meshLitTubeShade+=a3;
      return new SkinObject(mesh, arms[0]!, axes, arms);
    },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
  });
  set.build(2);
  assert.ok(tot > 5000);
  assert.ok((skinLitTubeShade + skinShadeTubeLit) / tot < 0.05, `bands differ on ${skinLitTubeShade + skinShadeTubeLit} of ${tot}`);
  assert.ok(skinLitTubeShade <= 1.5 * skinShadeTubeLit + 5, `the skin is not systematically lit where the tubes are in shade (${skinLitTubeShade} vs ${skinShadeTubeLit})`);
});
