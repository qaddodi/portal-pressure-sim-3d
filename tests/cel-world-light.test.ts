// One light, fixed in the WORLD (Mohammad, 20 Nov, on the 3D lobule: "why is there so much light that changes direction as I move the camera wtf? I'm moving the camera NOT the figure"):
// every lit 3D surface takes n.L against CEL_STYLE.LIGHT with the normal in world axes, never a view-space normal against a screen light.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { CEL_LIGHT_GLSL, CEL_LIGHT_UNIT, CEL_TUBE_GLSL, glslNum as F } from '../src/scene/cel-glsl.ts';
import { MICRO_FS, MICRO_VS } from '../src/scene/micro3d/cel3d.ts';
import { ORGAN_FS, ORGAN_VS } from '../src/scene/organs/organ-shader.ts';
import { TOON_FS } from '../src/scene/materials/shaders.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { LOBULE_TOON_FS } from '../src/scene/lobule/shading.ts';
import { CelScene } from '../src/scene/scene.ts';

test('the light is one world constant in cel-style.ts, and every shader reads it from there', () => {
  assert.deepEqual([...CEL_STYLE.LIGHT], [-0.5, 0.62, 0.6]);
  const l = Math.hypot(...CEL_STYLE.LIGHT);
  assert.ok(Math.abs(Math.hypot(...CEL_LIGHT_UNIT) - 1) < 1e-12 && Math.abs(CEL_LIGHT_UNIT[0] - CEL_STYLE.LIGHT[0] / l) < 1e-12);
  assert.ok(CEL_LIGHT_GLSL.includes(CEL_LIGHT_UNIT.map(F).join(', ')));
  assert.ok(MICRO_FS.includes(`vec3(${CEL_LIGHT_UNIT.map(F).join(', ')})`), 'the 3D lobule and sinusoid');
  assert.ok(ORGAN_FS.includes(`vec3(${CEL_LIGHT_UNIT.map(F).join(', ')})`), 'Organ depth');
  assert.ok(VESSEL_FS.includes(CEL_LIGHT_GLSL) && TOON_FS.includes(CEL_LIGHT_GLSL) && LOBULE_TOON_FS.includes(CEL_LIGHT_GLSL), 'vessels, strands, the lobule\'s vessels');
  // no second copy of a light in the sources
  const src = (p: string) => readFileSync(new URL(`../src/scene/${p}`, import.meta.url), 'utf8');
  assert.ok(!/-0\.45, 0\.75, 0\.55/.test(src('materials/cel.ts')), 'the shared uniform is made from the one constant');
  assert.ok(!/ORGAN\.LIGHT/.test(src('micro3d/cel3d.ts') + src('organs/organ-shader.ts')));
});

test('a lit shader never lights with a view-space normal: n.L is taken in world axes, so the camera changes nothing', () => {
  // the micro parts: the normal handed to the fragment is the world one (model matrix), the light a world constant, no view matrix in the lighting
  assert.match(MICRO_VS, /vN = normalize\(mat3\(modelMatrix\) \* n\);/);
  assert.doesNotMatch(MICRO_VS.replace(/projectionMatrix \* modelViewMatrix/g, ''), /normalMatrix|viewMatrix/, 'no view-space normal in the micro cel');
  assert.doesNotMatch(MICRO_FS, /viewMatrix|normalMatrix/);
  // organ depth: its n.L uses the world normal
  assert.match(ORGAN_VS, /vNw = normalize\(mat3\(modelMatrix\) \* normal\);/);
  assert.match(ORGAN_FS, /float lam = dot\(normalize\(vNw\), LIGHT\);/);
  // the tubes (vessels, strands, the lobule's): n.L against the world light turned into view axes by the camera's own matrix (a view normal dotted with the view-space light IS the world n.L)
  assert.match(CEL_LIGHT_GLSL, /viewMatrix \* vec4\(CEL_LIGHT, 0\.0\)/);
  assert.match(VESSEL_FS, /float sT = dot\(n, celLightView\(\)\);/);
  assert.match(TOON_FS, /float sT0 = dot\(n, celLightView\(\)\);/);
  assert.match(TOON_FS, /\(viewMatrix \* vec4\(light, 0\.0\)\)/, 'the shared toon\'s light uniform is the world light turned by the camera');
  // no lit tube takes a SCREEN direction any more
  assert.doesNotMatch(CEL_TUBE_GLSL, /celTubeK|sideS/);
  assert.doesNotMatch(VESSEL_FS + TOON_FS, /celTubeK|sideS/);
  // and the shared uniform is the world light
  const s = new CelScene();
  const u = s.vesselObject('PV_TRUNK')!.toon.uniforms.light!.value as { x: number; y: number; z: number };
  assert.ok(Math.abs(u.x - CEL_LIGHT_UNIT[0]) < 1e-9 && Math.abs(u.y - CEL_LIGHT_UNIT[1]) < 1e-9 && Math.abs(u.z - CEL_LIGHT_UNIT[2]) < 1e-9);
  s.dispose();
});

test('the 3D lobule and sinusoid are exactly two flat tones, matte', () => {
  assert.match(MICRO_FS, new RegExp(`${F(CEL_STYLE.VESSEL_STEP_AT)} - w`));
  assert.doesNotMatch(MICRO_FS, /litT|vec3\(1\.0\), /, 'no lit tone toward white');
  assert.ok(!('LIT' in CEL_STYLE.MICRO));
});
