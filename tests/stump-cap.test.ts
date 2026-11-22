// A vein divided at surgery ends in a round, tied stump (Mohammad, 22 Nov: "the tie off the portal vein looks bad"): the cap is made of every ring of the divided stretch, the tie is a pale suture and never orange,
// and no flow mark stands in the blind end. Node only.  Run: node --test tests/stump-cap.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIVIDED, capArc, divideOf } from '../src/scene/vessels/divide.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { tubularFor } from '../src/scene/vessels/tubes.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { PROCEDURE_MARKS_GLSL } from '../src/scene/vessels/glsl-shared.ts';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';

test('the divided stretch is laid over the cap: every ring lands in [cut, cut + R], in order, and the rings past it stay where they are', () => {
  const cut = 30, R = 6, Z = cut + R;
  let last = -Infinity;
  for (let a = 0; a <= Z; a += 0.5) { const b = capArc(a, cut, R); assert.ok(b >= cut - 1e-9 && b <= Z + 1e-9, `${a} -> ${b}`); assert.ok(b >= last, 'in order'); last = b; }
  assert.equal(capArc(Z, cut, R), Z, 'continuous where the stretch ends');
  assert.equal(capArc(Z + 3, cut, R), Z + 3);
  assert.equal(capArc(2, 0, R), 2, 'a vein not divided is untouched');
});

test('the vertex stage does the same sum, with the cap as long as the radius, and the tie, the fade and the marks read the laid-over arc', () => {
  assert.match(VESSEL_VS, /arcB = stump\.x \+ capR \* \(arcA \/ capZ\)/);
  assert.match(VESSEL_VS, /capZ = stump\.x \+ capR/);
  assert.match(VESSEL_VS, /aPos \+= aTan \* \(\(arcB - arcA\) \/ vU\)/, 'the ring moves along its own tangent');
  assert.match(VESSEL_VS, /swell \*= stumpK\(uv\.x \* len \* vU, capR\)/, 'the cap is shaped on the laid-over arc');
  assert.match(VESSEL_VS, /#define uv uvS/, 'everything after reads the laid-over arc: the fade, the tie, the highlight');
});

test('a real divided vein has enough rings in its stretch for a smooth cap (it was 3: a flat cut)', () => {
  for (const [shunt, vein] of DIVIDED) {
    const d = divideOf(shunt, vein)!, v = NETWORK_BY_ID.get(vein)!, path = EDGE_PATH_2D[vein]!;
    let len = 0; for (let i = 1; i < path.length; i++) len += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
    const lenScene = len / UNITS_PER_SCENE, rings = tubularFor(lenScene, 6), perUnit = rings / len, R = v.radius * UNITS_PER_SCENE;
    // (the cap is every ring of cut + R; before, the cap held only the rings of its own one radius)
    assert.ok((d.cut + R) * perUnit >= 24, `${vein}: ${(d.cut + R) * perUnit} rings in the stretch`);
    assert.ok(R * perUnit < 8, `${vein}: the cap's own share was ${R * perUnit} rings`);
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
  assert.match(VESSEL_FS, /\* stumpMk;\n  fd = clamp/, 'the dust');
  assert.match(VESSEL_FS, /markK\(vUv\.x \* len \* vU, \(1\.0 - vUv\.x\) \* len \* vU\) \* stumpMk/, 'the heads');
});
