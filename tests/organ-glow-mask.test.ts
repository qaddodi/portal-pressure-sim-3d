// An organ's glow is the vessels' glow pipeline (mask, Gaussian blur, lay), not stacked hulls: the fall-off is a distance by construction (22 Nov: the five hulls of ORGAN_GLOW were five steps; e7f98289's hop-count ramp tore).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { MaxEquation } from 'three';
import { ORGAN_MASK_FLAGS, ORGAN_MASK_FS, ORGAN_MASK_VS, ORGAN_WINDOW_Q, ORGAN_WINDOW_WIN } from '../src/scene/organs/glow-mask.ts';
import { ORGAN_FS } from '../src/scene/organs/organ-shader.ts';
import { GLOW_LAYER, GLOW_SIGMA, ORGAN_GLOW_LAYER } from '../src/scene/glow.ts';
import { GlowFx } from '../src/scene/glow-fx.ts';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the glow shells are gone: no ORGAN_GLOW list, no per-shell mesh', () => {
  const hl = read('src/scene/highlight.ts');
  assert.doesNotMatch(hl, /ORGAN_GLOW\b/);
  assert.doesNotMatch(hl, /ORGAN_GLOW\.map|shells/);
  assert.match(hl, /organMask\(/);
});

test('the mask is painted by MAX (two lit organs never add up), on its own layer, with no depth', () => {
  assert.equal(ORGAN_MASK_FLAGS.blendEquation, MaxEquation);
  assert.equal(ORGAN_MASK_FLAGS.depthTest, false); assert.equal(ORGAN_MASK_FLAGS.depthWrite, false);
  assert.notEqual(ORGAN_GLOW_LAYER, GLOW_LAYER, 'the vessels\' lay and the organs\' lay never paint each other\'s glow twice');
  assert.ok(![0, 1, 2].includes(ORGAN_GLOW_LAYER), 'not a layer the figure\'s passes or the picks draw');
});

test('the mask draws only what the organ draws: its own positions, its fade, the dive window (the very lines of ORGAN_FS) and the tail fade', () => {
  assert.match(ORGAN_MASK_VS, /vec4\(position, 1\.0\)/, 'unpushed positions: no hull push along hullN');
  assert.doesNotMatch(ORGAN_MASK_VS, /hullN|inflate/);
  for (const u of ['uniform float fade;', 'uniform vec4 cut;', 'uniform float reveal;', 'uniform float amt;', 'uniform vec3 hiColor;']) assert.ok(ORGAN_MASK_FS.includes(u), u);
  assert.ok(ORGAN_FS.includes(ORGAN_WINDOW_Q) && ORGAN_FS.includes(ORGAN_WINDOW_WIN), 'the window is the organ fill\'s own');
  assert.ok(ORGAN_MASK_FS.includes(ORGAN_WINDOW_Q) && ORGAN_MASK_FS.includes(ORGAN_WINDOW_WIN));
  assert.match(ORGAN_MASK_FS, /w = amt \* clamp\(fade, 0\.0, 1\.0\) \* win \* tail;/);
  assert.match(ORGAN_MASK_FS, /vec4\(hiColor \* w, w\)/, 'premultiplied colour and weight, as the vessels\' mask');
  assert.doesNotMatch(ORGAN_MASK_FS, /dFdx|dFdy|fwidth|ringD|vRd/, 'no screen derivative of a hop count: that is what tore e7f98289');
});

test('the lay is the vessels\' own (same blur sigma and the same lay shader); the organs\' lay is a quad of the figure, drawn before the vessels\' pass', async () => {
  const fx = new GlowFx(ORGAN_GLOW_LAYER), vx = new GlowFx();
  assert.equal(fx.materials.length, 2);
  assert.equal((fx.materials[1] as { fragmentShader: string }).fragmentShader, (vx.materials[1] as { fragmentShader: string }).fragmentShader, 'one lay shader');
  assert.equal((fx.materials[0] as { fragmentShader: string }).fragmentShader, (vx.materials[0] as { fragmentShader: string }).fragmentShader, 'one blur shader');
  assert.ok(GLOW_SIGMA > 0);
  assert.equal(fx.figure.material, fx.materials[1], 'the quad shares the lay material: no second program');
  assert.equal(fx.figure.visible, false);
  assert.equal(fx.figure.layers.mask, 1, 'layer 0: the figure\'s FIRST pass, which every vessel of the vessels\' pass (VESSEL_LAYER, over a cleared depth) is drawn after');
  const sc = read('src/scene/scene.ts');
  assert.ok(sc.indexOf('this.organGlowFx.prepare(') < sc.indexOf("lap('render: pass 1, layer 0"), 'the mask and blur run before the first pass');
  assert.ok(sc.indexOf("lap('render: pass 1, layer 0") < sc.indexOf('this.glowFx.run('), 'the vessels\' glow stays over the figure');
  fx.dispose(); vx.dispose();
});

test('the lay quad stands just before the lit organ\'s own line, so it lies over the organs drawn before and under the ones drawn after, behind the vessels', async () => {
  const { readFileSync: rf } = await import('node:fs');
  const { setOrganData } = await import('../src/scene/organs/meshes.ts');
  const b = rf(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const { CelScene } = await import('../src/scene/scene.ts');
  const { OrganPins } = await import('../src/scene/highlight.ts');
  const s = new CelScene(); await s.organsBuilt;
  const byId = s.disease.organs.byId, pins = new OrganPins();
  pins.select(['spleen']);
  for (let i = 0; i < 30; i++) pins.step(16, byId);
  const sp = byId.get('spleen')!, ink = sp.group.children.find((c) => (c as { material?: unknown }).material === sp.ink)!;
  assert.equal(pins.glowOrder, ink.renderOrder - 0.25);
  assert.ok(pins.glowOrder > sp.toonMesh.renderOrder, 'after the organ\'s own fill (which the sharp mask gates away) and its seat');
  assert.ok(pins.glowOrder < ink.renderOrder, 'before its line: the line is never tinted');
  s.dispose?.();
});
