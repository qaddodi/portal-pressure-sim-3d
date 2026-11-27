// The organ veil (docs/approved/organ-veil.md, src/scene/organ-veil/): the curves, the one switch, and the rule that EVERY program that draws a vessel's body takes the veil through the same chunk, so no piece of a vessel can step at a
// junction (root cause named in the sheet: a veil written per vessel would differ between a tube and its skin). Node only: the GPU look is judged on screen.
// Run: node --test tests/organ-veil.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGAN_VEIL, seeZoomK, veilOf, vesselZoomK } from '../src/scene/organ-veil/config.ts';
import { SEE_DECL, VEIL_DECL } from '../src/scene/organ-veil/glsl.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { ORGAN_FS } from '../src/scene/organs/organ-shader.ts';
import { ORGAN_VEIL_U } from '../src/scene/organ-veil/uniforms.ts';
import { SHOTS, VEIL_WHOLE } from '../src/scene/camera/shots.ts';

const OFF = { ...ORGAN_VEIL, on: false };

test('the vessel veil is whole at the whole-figure framing, whole up to 1.2x, gone from 2x, and only ever falls as the camera comes in', () => {
  assert.equal(vesselZoomK(1), 1);
  assert.equal(vesselZoomK(0.5), 1, 'wider than the whole figure: still whole');
  assert.equal(vesselZoomK(ORGAN_VEIL.vesselFull), 1);
  assert.equal(vesselZoomK(ORGAN_VEIL.vesselGone), 0);
  assert.equal(vesselZoomK(5), 0);
  let prev = 1;
  for (let z = 1.2; z <= 2.0; z += 0.05) { const k = vesselZoomK(z); assert.ok(k <= prev + 1e-12, `falls at ${z.toFixed(2)}`); prev = k; }
  const mid = vesselZoomK(Math.sqrt(1.2 * 2.0));
  assert.ok(Math.abs(mid - 0.5) < 1e-9, `half way on the log scale: ${mid}`);
});

test('the organs\' show-through starts at 1.5x, is whole from 3x, and only rises as the camera comes in', () => {
  assert.equal(seeZoomK(1), 0); assert.equal(seeZoomK(ORGAN_VEIL.seeFrom), 0); assert.equal(seeZoomK(ORGAN_VEIL.seeTo), 1); assert.equal(seeZoomK(10), 1);
  let prev = 0;
  for (let z = 1.5; z <= 3.0; z += 0.05) { const k = seeZoomK(z); assert.ok(k >= prev - 1e-12, `rises at ${z.toFixed(2)}`); prev = k; }
});

test('the one switch: off, both effects are 0 at every zoom', () => {
  for (const z of [0.5, 1, 1.5, 2, 3, 8]) { assert.equal(vesselZoomK(z, OFF), 0); assert.equal(seeZoomK(z, OFF), 0); }
});

test('the veil of a vessel grows with how deep it lies behind the organ\'s surface: nothing at the surface, the strength at depth', () => {
  assert.equal(veilOf(0, 0.55), 0); assert.equal(veilOf(-0.3, 0.55), 0, 'in front of the organ: none');
  assert.equal(veilOf(ORGAN_VEIL.gapFrom, 0.55), 0);
  assert.ok(Math.abs(veilOf(ORGAN_VEIL.gapTo, 0.55) - 0.55) < 1e-12);
  assert.ok(veilOf(0.1, 0.55) > 0 && veilOf(0.1, 0.55) < 0.55);
  assert.equal(veilOf(0.17, 0), 0, 'strength 0: nothing');
  assert.ok(Math.abs(1 - ORGAN_VEIL.vesselMax - 0.45) < 1e-12, 'a vessel keeps 45% at its deepest');
});

test('the shots the HVPG and the wedge are framed on are past the veil (crisp); the title shot keeps all of it (zoom measured from the shots\' own extents)', () => {
  const whole = VEIL_WHOLE.half[1];
  const z = (n: keyof typeof SHOTS) => whole / SHOTS[n].half[1];
  assert.equal(vesselZoomK(z('title')), 1, `title ${z('title').toFixed(2)}`);
  for (const n of ['hvpg', 'wedge', 'free', 'route'] as const) assert.equal(vesselZoomK(z(n)), 0, `${n} at ${z(n).toFixed(2)}x is crisp`);
});

test('every program that draws a vessel\'s body takes the veil through the one chunk, the same way; no program of the figure blends the veil', () => {
  for (const [name, fs] of [['VESSEL_FS', VESSEL_FS], ['SKIN_FS', SKIN_FS]] as const) {
    assert.ok(fs.includes(VEIL_DECL), `${name} holds the chunk`);
    assert.equal((fs.match(/ovlAmount\(gl_FragCoord\.z, gl_FragCoord\.xy\)/g) ?? []).length, 1, `${name} asks for the veil once, from the pixel and its own depth`);
  }
  assert.match(VESSEL_FS, /c = ovlMix\(c, ovlAmount\(gl_FragCoord\.z, gl_FragCoord\.xy\) \* \(1\.0 - circT\) \* \(1\.0 - clamp\(vHi, 0\.0, 1\.0\)\), gl_FragCoord\.xy\);\n  gl_FragColor = vec4\(c, fadeHere \* cavA\);/, 'the tube: the veil is the last colour step before the output');
  assert.match(SKIN_FS, /\(1\.0 - clamp\(circT, 0\.0, 1\.0\)\) \* \(1\.0 - clamp\(hi, 0\.0, 1\.0\)\), gl_FragCoord\.xy\);\n  gl_FragColor = vec4\(c, alpha\);/, 'the skin: the same rule, same place');
  assert.ok(ORGAN_FS.includes(SEE_DECL) && /lay \*= 1\.0 - seeAmount\(gl_FragCoord\.xy\);/.test(ORGAN_FS), 'the organ fill takes its own opacity down by the mask');
  // the chunk reads the pixel and the depth only: no uniform that differs per vessel, so a tube and its skin cannot differ
  for (const u of [...VEIL_DECL.matchAll(/uniform \w+ (\w+)/g)].map((m) => m[1]!)) assert.ok(u in ORGAN_VEIL_U, `${u} is one shared uniform`);
  assert.doesNotMatch(VEIL_DECL, /blend|discard/);
});

test('the organs behind and the organs in front are disjoint and every one is a drawn organ', () => {
  const all = new Set(['heart', 'heart-ra', 'kidney-l', 'spleen', 'caudate', 'liver', 'stomach', 'duodenum', 'bowel', 'colon']);
  for (const id of [...ORGAN_VEIL.behind, ...ORGAN_VEIL.inFront]) assert.ok(all.has(id), id);
  assert.deepEqual(ORGAN_VEIL.behind.filter((b) => ORGAN_VEIL.inFront.includes(b)), []);
});
