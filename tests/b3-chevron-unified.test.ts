// ONE chevron (Mohammad, 20 Nov: "use the same chevron shape as the anatomy; chevrons unified. also the blood chevrons black; just like anatomy"): the Anatomy's vessels and the 3D lobule and sinusoid tubes draw the
// head from one GLSL chunk (blood/chevron-glsl.ts), in the Anatomy's tone on blood.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHEVRON_GLSL } from '../src/scene/blood/chevron-glsl.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { MICRO_FS, microMaterials } from '../src/scene/micro3d/cel3d.ts';
import { LENS_SHARED } from '../src/scene/lenses/tokens.copied.ts';
import { Vector2 } from 'three';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the Anatomy\'s vessels and the 3D lobule and sinusoid include the one chevron chunk; neither keeps a head of its own', () => {
  assert.ok(VESSEL_FS.includes(CHEVRON_GLSL), 'the Anatomy');
  assert.ok(MICRO_FS.includes(CHEVRON_GLSL), 'the 3D lobule and sinusoid');
  assert.match(read('../src/scene/vessels/shaders.ts'), /from '\.\.\/blood\/chevron-glsl\.ts'/);
  assert.match(read('../src/scene/micro3d/cel3d.ts'), /from '\.\.\/blood\/chevron-glsl\.ts'/);
  assert.doesNotMatch(read('../src/scene/vessels/shaders.ts'), /float chevD\(|vec2 chevHead\(/, 'the Anatomy\'s own copy is gone');
  assert.equal(VESSEL_FS.split('float chevD(').length - 1, 1);
  assert.equal(MICRO_FS.split('float chevD(').length - 1, 1);
  // the cel3d marks are the shared head, not a stripe
  assert.match(MICRO_FS, /return chevHead\(x, abs\(vAcross\) \* R, hw, pxA, 0\.0\) \* k;/);
  assert.doesNotMatch(MICRO_FS, /float chev = smoothstep\(0\.0, wa, f\)/, 'no stripe chevron left');
});

test('the blood chevron is black like the Anatomy\'s: the look\'s chevron ink on a light lumen, cream on a dark one, the dark ring; bile and lymph keep their flow colour', () => {
  assert.match(CHEVRON_GLSL, /vec3 chevInk\(float cream, vec3 markDark, vec3 markLight\)/);
  assert.match(CHEVRON_GLSL, /float chevLum\(vec3 c\) \{ return dot\(pow\(max\(c, vec3\(0\.0\)\), vec3\(2\.2\)\), vec3\(0\.2126, 0\.7152, 0\.0722\)\); \}/);
  assert.match(CHEVRON_GLSL, /return mix\(markDark \* 0\.5, markLight, cream\);/);
  assert.match(MICRO_FS, /vec3 core = uFlowDark > 0\.5 \? inkH : uFlowCol;/);
  const m = microMaterials({ value: new Vector2(1, 1) }, { value: 1 }, { flow: true });
  const u = m.toon.uniforms;
  const rgb = (c: unknown) => [(c as { r: number }).r, (c as { g: number }).g, (c as { b: number }).b];
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  assert.deepEqual(rgb(u.uFlowInk!.value).map((x) => Math.round(x * 255)), hex(LENS_SHARED.chevron).map((x) => Math.round(x * 255)), 'the Anatomy\'s ink');
  assert.ok(Math.max(...hex(LENS_SHARED.chevron)) < 0.12, 'near black');
});

test('chevrons stay in the lumen: the head is confined to the middle 0.55 of the face (its half width is the lattice\'s hw at |across| 0.55)', () => {
  assert.match(CHEVRON_GLSL, /return chevHead\(dir \* x, abs\(across\) \* hw \/ 0\.55, hw, px, 0\.0\);/);
  // (the lobule's tubes: the Anatomy's own rule, CHEV: chevHw, 55 percent of the lumen, 60 at most)
  assert.match(MICRO_FS, /float hw = chevHw\(R, wpc\) \* chevSize\(kp\);/);
});
