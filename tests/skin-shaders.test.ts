// The junction skin's shaders (src/scene/vessels/skin/shaders.ts, rebuild-3d/junction-skin-spec.md WP3): what can be held without a GPU. The glslang compile of both programs is in tests/glsl-compile.test.ts
// (the skin is registered in src/debug/gl-registry.ts); the position, colour and ink agreement with the tubes at a seam is WP6 (tests/skin-agreement.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIN_ARMS, SKIN_FIGURE_UNITS, SKIN_FS, SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { SWELL_OF_GLSL, LENS_OF_AT_GLSL } from '../src/scene/vessels/glsl-shared.ts';
import { ES3_FLOOR, budget, declarations, lateMaterialProgram } from '../src/debug/gl-programs.ts';
import { rawPrograms } from '../src/debug/gl-registry.ts';

const program = lateMaterialProgram('skin', SKIN_VS, SKIN_FS);
const FIBRO = '';

test('the skin takes its swell and its lens colour from the tube\'s own GLSL (the shared chunks), never a copy', () => {
  assert.ok(SKIN_VS.includes(SWELL_OF_GLSL), 'SKIN_VS has swellOf from glsl-shared.ts');
  assert.ok(SKIN_FS.includes(LENS_OF_AT_GLSL), 'SKIN_FS has lensOfAt from glsl-shared.ts');
});

test('the figure\'s units in a scene unit are the vessel\'s own (vU on the body)', () => {
  assert.ok(VESSEL_VS.includes(`mix(${SKIN_FIGURE_UNITS}.0, 1.0 / CIRC_MAPK, circShare)`), 'vessels/shaders.ts sets vU = mix(300, ...): the skin\'s ink and width rules are in the same units');
});

test('the varyings stay within 12 vec4s (an iPhone must have room: the floor is 15 and three adds none; vPos places each arm\'s arc)', () => {
  const b = budget(program);
  assert.ok(b.varyings <= 12, `${b.varyings} varying vectors`);
  const names = declarations(SKIN_VS).filter((d) => d.storage === 'varying').map((d) => d.name).sort();
  assert.deepEqual(names, ['vCenW', 'vN', 'vPos', 'vRest', 'vSwell', 'vV', 'vW', 'vWeight'], 'the vertex stage hands the fragment stage exactly these');
  const fs = declarations(SKIN_FS).filter((d) => d.storage === 'varying').map((d) => d.name).sort();
  assert.deepEqual(fs, names, 'the fragment stage declares the same varyings');
});

test('the skin asks no more of the GPU than the floor, and the fragment stage leaves room for the tubes\' shared lens uniforms', () => {
  const b = budget(program);
  for (const k of Object.keys(ES3_FLOOR) as Array<keyof typeof ES3_FLOOR>) assert.ok(b[k] <= ES3_FLOOR[k], `${k}: ${b[k]} of ${ES3_FLOOR[k]}`);
  assert.ok(b.fragmentUniformVectors <= 120, `${b.fragmentUniformVectors} fragment uniform vectors: a junction is a small area of the screen and must stay a light program`);
});

test('the per-arm uniforms are the spec\'s section 3 names, with its sizes', () => {
  const u = new Map(declarations(SKIN_FS).filter((d) => d.storage === 'uniform').map((d) => [d.name, d]));
  const want: Array<[string, string, number]> = [
    ['armData', 'vec4', SKIN_ARMS], ['armLensU', 'float', SKIN_ARMS], ['armFade', 'float', SKIN_ARMS], ['armHi', 'float', SKIN_ARMS],
    ['armAxis', 'vec3', 12], ['armAxisR', 'float', 12], ['skinK', 'float', 1],
  ];
  for (const [name, type, n] of want) {
    const d = u.get(name);
    assert.ok(d, `${name} is declared in SKIN_FS`);
    assert.equal(d!.type, type, name);
    assert.equal(d!.array, n, name);
  }
  const v = new Map(declarations(SKIN_VS).filter((d) => d.storage === 'uniform').map((d) => [d.name, d]));
  assert.equal(v.get('armData')?.array, SKIN_ARMS, 'the vertex stage reads the arms\' data texels');
  assert.equal(v.get('armHi')?.array, SKIN_ARMS, 'and their highlight');
});

test('the vertex attributes are the spec\'s (cen, weight, restR) on top of three\'s position and normal', () => {
  const a = declarations(SKIN_VS).filter((d) => d.storage === 'attribute').map((d) => `${d.type} ${d.name}`).sort();
  assert.deepEqual(a, ['float restR', 'vec3 cen', 'vec4 weight']);
});

test('the skin draws the tubes\' flow marks, once per arm, with the tubes\' own code (tests/skin-marks.test.ts holds the rest)', () => {
  for (const word of ['chevOne', 'dustSkin(FD0, FD1, w1, ', 'dustTube(FD0, ', 'streamTex', 'chainTex', 'streakAmt', 'armArc']) assert.ok(SKIN_FS.includes(word), `${word} is in the skin`);
});

test('the skin is back-face culled in the fragment stage like the tube, and fades out on the Circuit', () => {
  assert.match(SKIN_FS, /if \(!gl_FrontFacing\) discard;/);
  assert.match(SKIN_FS, /smoothstep\(0\.0, 0\.35, circT\)/);
});

test('the skin\'s program is registered for the compile check and the ?gl page', () => {
  assert.ok(rawPrograms(FIBRO).some((p) => p.name === 'skin'), 'rawPrograms lists the skin');
});
