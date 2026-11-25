// A vein divided at surgery ends in a round, tied stump (Mohammad, 22 Nov: "the tie off the portal vein looks bad"): the round end is made of a dozen rings on the vein's own path, the tie is a pale suture and never orange,
// and no flow mark stands in the blind end. Node only.  Run: node --test tests/stump-cap.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIVIDED, DIVIDED_RING_K, divideOf } from '../src/scene/vessels/divide.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { tubularFor } from '../src/scene/vessels/tubes.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { PROCEDURE_MARKS_GLSL } from '../src/scene/vessels/glsl-shared.ts';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';

test('the vertex stage shapes the cap from the vein\'s own rings, which stay on its path (laying them over the cap along their tangents put them off a bend: a skewed spike)', () => {
  assert.match(VESSEL_VS, /swell \*= stumpK\(uv\.x \* len \* vU, radius \* swell \* vU\)/);
  assert.doesNotMatch(VESSEL_VS, /aPos \+= aTan \* \(\(arcB - arcA\)/, 'no ring is moved along its own tangent');
  assert.doesNotMatch(VESSEL_VS, /#define uv uvS/);
});

test('a real divided vein has a dozen rings in its round end (it was 2: a flat cut)', () => {
  for (const [shunt, vein] of DIVIDED) {
    const v = NETWORK_BY_ID.get(vein)!, path = EDGE_PATH_2D[vein]!, d = divideOf(shunt, vein)!;
    let len = 0; for (let i = 1; i < path.length; i++) len += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
    const rings = tubularFor(len / UNITS_PER_SCENE, 2 * DIVIDED_RING_K), perUnit = rings / len, R = v.radius * UNITS_PER_SCENE;
    assert.ok(R * perUnit >= 12, `${vein}: ${R * perUnit} rings in the round end`);
    assert.ok(d.cut + R < len, `${vein}: the cap lies inside the vein`);
  }
});

test('the tie and the running stitch are a pale suture with a dark edge, never orange', () => {
  assert.doesNotMatch(PROCEDURE_MARKS_GLSL, /0\.910, 0\.455, 0\.165|0\.227, 0\.114, 0\.039/, 'the 2D thread and its brown edge are gone');
  const m = /THREAD = vec3\(([\d.]+), ([\d.]+), ([\d.]+)\)/.exec(PROCEDURE_MARKS_GLSL)!;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number) as [number, number, number];
  assert.ok(r > 0.85 && g > 0.8 && b > 0.7 && r - b < 0.2, `a pale thread, not a colour (${r} ${g} ${b})`);
  assert.match(PROCEDURE_MARKS_GLSL, /c = mix\(c, THREAD, tw \* eK\)/, 'the tie wears it');
  assert.match(PROCEDURE_MARKS_GLSL, /c = mix\(c, THREAD, tw\);/, 'the sewn end wears it');
});

test('no dust and no chevron stands in the blind end of a stump, up to a head past the tie, and it eases in with the cut', () => {
  assert.match(VESSEL_FS, /stumpMk = \(stump\.x > 0\.0 && circT < 0\.001\) \? mix\(1\.0, smoothstep\(stump\.y \+ 2\.5/);
  assert.match(VESSEL_FS, /\* stumpMk;\n  fd = dSafe\(clamp/, 'the dust');   // (the dust's alpha is made whole first since b3afc9a4: dSafe)
  assert.match(VESSEL_FS, /flowHeads\([^;]*markK\([^;]*\) \* stumpMk(?: \* \w+)*, lensHead/, 'the heads');   // (markK's ends are lifted where a skin takes over since 8c46c7bd; the stump's mask still multiplies it, and since 17d68fda so does the end-on fade, `endOn`, after it)
});

test('a divided vein is not cut at its start seam: no skin joins its tied end (the skin arm is absent, arm-twins.ts), so the tube draws its own round end', () => {
  assert.match(VESSEL_FS, /float skinStartCut\(\) \{ return stump\.x > 0\.0 \? -1\.0 : skinCut\.x; \}/);
  for (const fn of ['skinCutOn', 'skinWeldAt', 'skinPast']) {
    const body = new RegExp(`${fn}\\(\\) \\{[^\\n]*`).exec(VESSEL_FS)![0];
    assert.doesNotMatch(body, /skinCut\.x/, `${fn} reads the start seam through skinStartCut`);
  }
});
