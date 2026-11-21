// Mohammad, 20 Nov: "a vessel merging into a faded vessel fades gradually on approach, so both share the same fade at the junction" (app-wide), and the torn edge where the hepatic veins' solid streaks met the faint cava (IVCS). ROOT CAUSE: a hepatic
// vein whose cava end a skin takes over was left SOLID to its seam (its opacity ramp was switched off with its cut), and the skin changed from its opacity to the cava's across the arms' weights: a step of 1 - cava alpha along a polygon contour. Now the vein keeps
// the tube's own ramp (vessels/shaders.ts wA: 0 from 2.5 cava radii before the wall, 1 at it, by the pixel's own distance) and the skin carries the SAME ramp on through the junction by its own distance to the trunk, so the two surfaces are one opacity at the wall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { sdArm, closestOnArm, type Capsule } from '../src/scene/vessels/skin/sdf.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { CAVA_RAMP_R, cavaRamp } from '../src/scene/vessels/fade-alpha.ts';
import { CAVA_RECEDE, opensIntoCava } from '../src/scene/vessels/fades.ts';

test('the skin\'s ramp is the tube\'s: 0 at CAVA_RAMP_R trunk radii out, 1 at the wall, and the shader reads the arms that open into the trunk (-2) against the arms of the run (>= 0)', () => {
  assert.match(SKIN_FS, /float wRamp = hasTrunk \? 1\.0 - smoothstep\(0\.0, 2\.5 \* max\(radTrunk, 1\.0e-5\), sdTrunk\) : 0\.0;/);
  assert.equal(CAVA_RAMP_R, 2.5);
  assert.match(SKIN_FS, /armCopy\[\d\]\.w < -1\.5 \? mix\(fadeOf\(\d\), aTrunk, wRamp\)/);
  assert.match(SKIN_FS, /if \(armData\[k\]\.x < 0\.0 \|\| armCopy\[k\]\.w < -0\.5\) continue;/);   // (the trunk: the arms that run through the node)
  // the tube's own, which a skinned vein keeps (cavaCut 2: the ramp alone)
  assert.match(VESSEL_FS, /fadeHere = mix\(vFade, cavaA, wA\);\s+\/\/ \(cavaCut 2:[^\n]*\n\s+if \(cavaCut < 1\.5\) \{/);
  assert.match(VESSEL_FS, /float wA = smoothstep\(-2\.5 \* vNbr\.y, 0\.0, cd\)/);
  // the ramp as a function of the signed distance sd to the wall (positive outside): the shader's 1 - smoothstep(0, 2.5 R, sd) is the tube's smoothstep(-2.5 R, 0, cd = -sd)
  const sst = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let sd = -1; sd <= 4; sd += 0.25) assert.ok(Math.abs((1 - sst(0, CAVA_RAMP_R, sd)) - cavaRamp(-sd)) < 1e-12, `sd ${sd}`);
});

test('every skin that a vein opens into the side of: at the seam the skin\'s opacity is the tube\'s, and where the vein\'s and the cava\'s weights cross the two opacities have met (no step along the weights\' contour)', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  let checked = 0, worstOld = 0, worstNew = 0;
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => {
      const A = axes.length, caps: Capsule[] = axes.map((a) => ({ n: a.pts.length, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii), mate: a.mate }));
      const trunk = axes.map((a) => (a.mate ?? -1) >= 0), veins = mesh.junction.arms.map((a) => opensIntoCava(a.vesselId) && a.end === 1);
      if (!trunk.some(Boolean) || !veins.some(Boolean)) return new SkinObject(mesh, arms[0]!, axes, arms);
      checked++;
      const aT = CAVA_RECEDE, aV = 1;   // the cava's resting opacity and a solid vein
      const w = (v: number, a: number): number => (a < 4 ? mesh.weight[4 * v + a]! : mesh.weight2[2 * v + a - 4]!);
      const ramp = (v: number): number => {   // (the shader's: the nearest trunk arm's distance and radius there, 1 - smoothstep(0, 2.5 R, sd))
        const x = mesh.position[3 * v]!, y = mesh.position[3 * v + 1]!, z = mesh.position[3 * v + 2]!, o = new Float64Array(7);
        let sd = Infinity, rad = 1;
        for (let k = 0; k < A; k++) if (trunk[k]) { const d = sdArm(caps[k]!, x, y, z); if (d < sd) { sd = d; closestOnArm(caps[k]!, x, y, z, o); rad = o[3]!; } }
        const t = Math.min(1, Math.max(0, sd / (CAVA_RAMP_R * rad)));
        return 1 - t * t * (3 - 2 * t);
      };
      for (let v = 0; v < mesh.position.length / 3; v++) {
        let wv = 0, wt = 0;
        for (let k = 0; k < A; k++) { if (veins[k]) wv += w(v, k); if (trunk[k]) wt += w(v, k); }
        if (wv > 0.3 && wv < 0.7 && wt > 0.3) {   // where the vein's and the trunk's shares cross
          const r = ramp(v), vein = aV + (aT - aV) * r, stepOld = aV - aT, stepNew = Math.abs(vein - aT);
          worstOld = Math.max(worstOld, stepOld); worstNew = Math.max(worstNew, stepNew);
        }
      }
      return new SkinObject(mesh, arms[0]!, axes, arms);
    },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
  });
  set.build(2);
  assert.ok(checked >= 1, `${checked} skins with a vein into a trunk`);
  assert.ok(worstOld > 0.5, `the old opacity step along the contour was ${worstOld.toFixed(2)}`);
  assert.ok(worstNew < 0.1 * worstOld, `the step now: ${worstNew.toFixed(2)} (was ${worstOld.toFixed(2)})`);
});
