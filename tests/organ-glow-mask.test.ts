// An organ's glow is the vessels' glow pipeline (mask, Gaussian blur, lay), not stacked hulls: the fall-off is a distance by construction (22 Nov: the five hulls of ORGAN_GLOW were five steps; e7f98289's hop-count ramp tore).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { BufferGeometry, Group, MaxEquation, Mesh, ShaderMaterial, Vector3, Vector4 } from 'three';
import { OrganPins } from '../src/scene/highlight.ts';
import type { CelObject } from '../src/scene/materials/cel.ts';
import { NO_GLOW_ORGANS, organMask, organTakesGlow, ORGAN_MASK_FLAGS, ORGAN_MASK_FS, ORGAN_MASK_VS, ORGAN_WINDOW_Q, ORGAN_WINDOW_WIN } from '../src/scene/organs/glow-mask.ts';
import { ORGAN_FS } from '../src/scene/organs/organ-shader.ts';
import { GLOW_LAYER, GLOW_SIGMA, ORGAN_GLOW_LAYER } from '../src/scene/glow.ts';
import { GlowFx, LAY_FS } from '../src/scene/glow-fx.ts';
import { GLOW_A_MAX, GLOW_GAIN } from '../src/scene/glow.ts';
import { sceneSource } from './helpers/scene-source.ts';

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
  assert.equal((vx.materials[1] as { fragmentShader: string }).fragmentShader, LAY_FS, 'the vessels\' lay is LAY_FS');
  assert.equal((fx.materials[1] as { fragmentShader: string }).fragmentShader, LAY_FS, 'the organs\' lay is the very same shader');
  assert.equal((fx.materials[0] as { fragmentShader: string }).fragmentShader, (vx.materials[0] as { fragmentShader: string }).fragmentShader, 'one blur shader');
  assert.ok(GLOW_SIGMA > 0);
  assert.equal(fx.figure.material, fx.materials[1], 'the quad shares the lay material: no second program');
  assert.equal(fx.figure.visible, false);
  assert.equal(fx.figure.layers.mask, 1, 'layer 0: the figure\'s FIRST pass, which every vessel of the vessels\' pass (VESSEL_LAYER, over a cleared depth) is drawn after');
  const sc = sceneSource();
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

test('the vessels\' lay and the organs\' are one shader, and its inside is coverage: any mask alpha of half a level up (a translucent join never takes the halo over its body)', () => {
  assert.match(LAY_FS, /float inside = step\(0\.5 \/ 255\.0, texture2D\(tMask, vUv\)\.a\);/);
  assert.doesNotMatch(LAY_FS, /float inside = smoothstep/);
});

test('the lay parses as GLSL (pure JS parser, no browser)', async () => {
  const { parser } = await import('@shaderfrog/glsl-parser');
  assert.doesNotThrow(() => parser.parse(LAY_FS), 'parses');
});

// JS twin of the lay (glow-fx.ts LAY_FS): inside = step(0.5/255, mask.a); a = clamp(g.a * GAIN, 0, MAX) * (1 - inside).
test('while the pick weight eases 0 to 1 the organ\'s interior takes no glow at any step, and the halo outside the rim rises monotonically from 0', () => {
  const step = (e: number, x: number): number => (x < e ? 0 : 1);
  const lay = (g: number, m: number): number => Math.min(Math.max(g * GLOW_GAIN, 0), GLOW_A_MAX) * (1 - step(0.5 / 255, m));
  // the mask is amt inside the organ and 0 outside; the blurred mask just outside the rim is a fraction of amt (a Gaussian of a step edge: half at the rim)
  let prev = 0;
  for (let i = 0; i <= 20; i++) {
    const amt = i / 20;
    assert.equal(lay(amt, amt) , i === 0 ? lay(0, 0) : 0, `interior at amt ${amt}`);
    const outside = lay(amt * 0.5, 0);
    assert.ok(outside >= prev, `halo rises at amt ${amt}`);
    prev = outside;
  }
  assert.equal(lay(0, 0), 0);
  assert.ok(prev > 0);
  // the old lay for contrast: at amt 0.1 the interior took glow (the flash)
  const old = (g: number, m: number): number => Math.min(g * GLOW_GAIN, GLOW_A_MAX) * (1 - m * m * (3 - 2 * m));
  assert.ok(old(0.1, 0.1) > 0.05, 'the smoothstep lay let early glow over the interior');
});

// The heart wears no glow (owner, 25 Nov: "remove the heart glow").
// The rule is general: an organ in NO_GLOW_ORGANS (the heart and its atrium) makes no mask however it is lit, on every deck and view.
const fakeOrgan = () => {
  const ink = new ShaderMaterial({ uniforms: { hiPx: { value: 0 }, hiOn: { value: 0 }, hiDir: { value: 0 }, hiOffset: { value: 0 }, reveal: { value: 1 }, hiColor: { value: new Vector3() } } });
  const toon = new ShaderMaterial({ uniforms: { fade: { value: 1 }, cut: { value: new Vector4() } } });
  const group = new Group(); new Group().add(group);
  const toonMesh = new Mesh(new BufferGeometry(), toon); const inkMesh = new Mesh(toonMesh.geometry, ink);
  group.add(toonMesh, inkMesh);
  return { group, ink, toon, toonMesh } as unknown as CelObject;
};

test('the heart and its atrium take no glow; the liver still does', () => {
  assert.deepEqual([...NO_GLOW_ORGANS].sort(), ['heart', 'heart-ra']);
  assert.equal(organTakesGlow('heart'), false); assert.equal(organTakesGlow('heart-ra'), false);
  for (const id of ['liver', 'spleen', 'stomach', 'kidney-l', 'bowel', 'colon', 'duodenum', 'caudate']) assert.equal(organTakesGlow(id), true, id);
  assert.throws(() => organMask('heart', fakeOrgan()), /takes no glow/);
});

test('pinned or tapped, the heart makes no glow mask and nothing glows; its outline still comes on', () => {
  const heart = fakeOrgan(), ra = fakeOrgan();
  const pins = new OrganPins();
  pins.set(['heart', 'heart-ra']); pins.select(['heart']);
  for (let i = 0; i < 60; i++) pins.step(50, new Map([['heart', heart], ['heart-ra', ra]]));
  assert.equal(pins.glowing, false); assert.equal(pins.glowAmount, 0);
  assert.equal(heart.group.children.filter((c) => c.name.startsWith('highlight/glow/')).length, 0, 'no glow mesh on the heart');
  assert.equal(ra.group.children.filter((c) => c.name.startsWith('highlight/glow/')).length, 0, 'none on the atrium');
  assert.equal(heart.ink.uniforms.hiOn!.value, 1, 'the outline is untouched');
  const liver = fakeOrgan(); const lp = new OrganPins(); lp.set(['liver']);
  for (let i = 0; i < 60; i++) lp.step(50, new Map([['liver', liver]]));
  assert.equal(lp.glowing, true, 'a lit liver still glows');
});
