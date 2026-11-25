// The selection glow is made on the screen from the picked vessel's mask (Mohammad, 20 Nov: "even the glow should take the shape of the vessel (and fade at the ends)"; "there is a weird outline, and the glow isn't good").
// ROOT CAUSES, in order found: a ribbon on the built course (flat slabs, square ends), then per-piece hulls grown by each tube's and skin's vertex stage (separate pieces that cannot blend at a seam: a pale patch, a halo on one side
// only), and under both a pick lift that fattened the mesh but not the lumen (dark square bands). The glow is now ONE image: the vessels' own programs paint a mask of the picked vessel, tubes and junction skins alike, into a
// texture by MAX; the mask is blurred and laid over the figure outside itself. These tests pin that.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { MaxEquation } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS, SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { glowWeightGlsl } from '../src/scene/vessels/glsl-shared.ts';
import { BLUR_FS, LAY_FS } from '../src/scene/glow-fx.ts';
import * as GLOW from '../src/scene/glow.ts';
import { outlineStrength, computeHighlight } from '../src/scene/highlight.ts';
import { sceneSource } from './helpers/scene-source.ts';

test('the glow has no geometry of its own: no ribbon, no grown hull; the vessels\' vertex stages are untouched by it', () => {
  const src = readFileSync('src/scene/glow.ts', 'utf8');
  assert.doesNotMatch(src, /BufferGeometry|Float32BufferAttribute|MeshBasicMaterial/);
  assert.ok(!Object.keys(GLOW).some((k) => /ribbon|reach/i.test(k)), Object.keys(GLOW).join());
  assert.doesNotMatch(VESSEL_VS, /hiReach|GLOW/, 'the tube grows by its own line only');
  assert.doesNotMatch(SKIN_VS, /hiReach|GLOW/, 'and so does the skin');
  const hl = readFileSync('src/scene/highlight.ts', 'utf8');
  assert.doesNotMatch(hl, /VesselGlow|courseOf|CourseOf/);
});

test('the tube and the junction skin each paint the mask: premultiplied colour as drawn and the pick\'s weight, over the lumen and line only', () => {
  assert.match(VESSEL_FS, /#ifdef GLOW[\s\S]*float wG = [^;]*glowWeight|#ifdef GLOW[\s\S]*float wG = /);
  assert.ok(VESSEL_FS.includes(glowWeightGlsl('vHi')), 'the tube\'s weight is the pick\'s vHi');
  assert.ok(SKIN_FS.includes(glowWeightGlsl('hi')), 'the skin\'s is the arms\' blended pick weight');
  assert.match(SKIN_FS, /float hi = [^;]*armAF[^;]*\.z/);
  for (const fs of [VESSEL_FS, SKIN_FS]) {
    assert.match(fs, /\(1\.0 - smoothstep\(-0\.5, 0\.5, sG \* dpr\)\)/, 'inside the line only: the blur makes the halo outside it');
    assert.match(fs, /gl_FragColor = vec4\([^;]*\* wG, wG\);\s*return;/, 'premultiplied by the weight');
  }
});

test('the mask is blurred in two separable passes and laid outside itself, capped, with no tint on the vessel', () => {
  assert.match(BLUR_FS, /for \(int i = -12; i <= 12; i\+\+\)/);
  assert.match(BLUR_FS, /exp\(-x \* x \/ \(2\.0 \* sigma \* sigma\)\)/);
  assert.match(LAY_FS, /\* \(1\.0 - inside\)/, 'nothing over the vessel itself');
  assert.match(LAY_FS, /clamp\(g\.a \* 1\.25, 0\.0, 0\.93\)/);
  const fx = readFileSync('src/scene/glow-fx.ts', 'utf8');
  assert.match(fx, /GLOW_LAYER/); assert.match(fx, /blendEquation: AddEquation/);
  const scene = sceneSource();
  assert.match(scene, /if \(this\.highlight\.glowing\) this\.glowFx\.run\(gl, into, cam, this\.scene, dpr\)/, 'only while a glow is showing');
});

test('the glow meshes of a vessel are its own geometry and uniforms, on the glow\'s own layer (never the figure\'s passes), painted by max', () => {
  const s = new CelScene();
  const pv = s.vessels.find((o) => o.edge?.id === 'PV_TRUNK')!;
  const g = pv.glowMesh!;
  assert.equal(g.geometry, pv.toonMesh.geometry, 'the very same geometry: its silhouette is the vessel\'s');
  const m = g.material as unknown as { uniforms: unknown; defines: Record<string, number>; blendEquation: number; depthTest: boolean };
  assert.equal(m.uniforms, pv.toon.uniforms, 'the very same uniforms: the live width, the waist, the fade and the pick weight are the tube\'s own');
  assert.equal(m.defines.GLOW, 1); assert.ok(!m.depthTest);
  assert.equal(m.blendEquation, MaxEquation, 'MaxEquation: overlapping pieces never add up');
  assert.equal(g.layers.mask, 1 << GLOW.GLOW_LAYER);
  assert.ok(GLOW.GLOW_LAYER > 2, 'not the figure\'s layers 0, 1 and the faint one 2');
  assert.equal(g.visible, false, 'hidden until a pick');
  for (const o of s.vessels) assert.equal(o.glowMesh!.layers.mask, 1 << GLOW.GLOW_LAYER, o.edge!.id);
  assert.equal(s.highlight.glowing, false);
  s.pick('PV_TRUNK'); s.highlight.step(16);
  assert.equal(s.highlight.glowing, true, 'the mask pass runs while a glow shows');
  s.pick(null); while (s.highlight.step(16)) { /* fade out */ }
  assert.equal(s.highlight.glowing, false, 'and not otherwise');
  s.dispose();
});

test('the weight and the halo: nothing without a pick weight, eased with it, gone with the Circuit\'s change; the halo is capped, outside the vessel only, and thins with the blur', () => {
  assert.equal(GLOW.glowWeight(0), 0);
  let last = 0;
  for (let h = 0; h <= 1.0001; h += 0.05) { const w = GLOW.glowWeight(h); assert.ok(w >= last - 1e-12 && w - last < 0.15, 'smooth'); last = w; }
  assert.equal(GLOW.glowWeight(1, 0.15), 0, 'gone by the Circuit change\'s first 15 %');
  assert.equal(GLOW.glowAlpha(0.5, 1), 0, 'nothing over the vessel');
  // inside is COVERAGE (23 Nov: the white blobs at a picked shunt's joins): a translucent part of the vessel (the join into the receded cava, 0.45) and the faintest covered pixel take no halo either
  for (const a of [1 / 255, 0.45, 0.8, 1]) assert.equal(GLOW.glowAlpha(0.5, a), 0, `nothing over a vessel pixel of mask alpha ${a}`);
  assert.ok(GLOW.glowAlpha(0.5, 0.2 / 255) > 0, 'a pixel under half a level of 8 bits is no vessel');
  assert.equal(GLOW.glowAlpha(1), GLOW.GLOW_A_MAX, 'capped');
  assert.ok(Math.abs(GLOW.glowAlpha(0.5) - GLOW.GLOW_A) < 0.01, 'the rim of a wide vessel is GLOW_A');
  assert.ok(GLOW.glowAlpha(0.3) > GLOW.glowAlpha(0.1) && GLOW.glowAlpha(0.1) > GLOW.glowAlpha(0.02), 'thins out');
  const t = GLOW.blurTaps(GLOW.GLOW_SIGMA * 2 / 2);
  assert.ok(t.sigma * GLOW.BLUR_TAPS >= 2.9 * t.sigma && t.sigma <= GLOW.TAP_SIGMA + 1e-9, 'the taps cover the sigma');
});

test('the pick\'s weight along a vein: nothing at its two outer ends and full in the middle, continuous through a joint between two pieces (the mask fades at both ends, so does the halo)', () => {
  const edges = [{ id: 'A', from: 'n0', to: 'n1', length: 1 }, { id: 'B', from: 'n1', to: 'n2', length: 1 }];
  const spec = computeHighlight(['A', 'B'], edges);
  const a = spec.get('A')!, b = spec.get('B')!;
  assert.equal(outlineStrength(a, 0, 1), 0, 'the vein\'s start');
  assert.equal(outlineStrength(b, 1, 1), 0, 'the vein\'s end');
  assert.ok(Math.abs(outlineStrength(a, 1, 1) - outlineStrength(b, 0, 1)) < 1e-9, 'continuous through the joint');
  assert.ok(outlineStrength(a, 1, 1) > 0.5);
});

// ── the dark bands (Mohammad, 20 Nov: "weird outline"; dark square-ended bands along a picked vein's walls, in separate segments) ──
// ROOT CAUSE: a pick lifted the picked tube by `inflate` 0.012 (highlight.ts PICK_LIFT). `inflate` pushes the whole mesh outward but not the lumen, and the fragment stage inks everything between the lumen's edge and the
// mesh's, so the lift became a thick dark band along both walls of every picked TUBE (a junction skin, which keeps its own inflate, got none), ending square where the tube ends at a skin's seam: segments with gaps and steps.
test('a pick never grows a vessel\'s tube: `inflate` stays 0 through a pick, its fade and a shunt target\'s hover, so the ink line is the vessel\'s own', () => {
  const s = new CelScene();
  const infl = () => s.vessels.map((o) => o.toon.uniforms.inflate!.value as number);
  assert.ok(infl().every((v) => v === 0));
  s.pick('PV_TRUNK'); s.highlight.step(16);
  assert.ok(infl().every((v) => v === 0), 'easing in');
  while (s.highlight.step(16)) { /* settle */ }
  assert.ok(infl().every((v) => v === 0), 'picked');
  s.pick(null); while (s.highlight.step(16)) { /* fade */ }
  s.highlight.setOnly(['V_KID_L']); while (s.highlight.step(16)) { /* settle */ }
  s.hoverVessel('V_KID_L'); while (s.highlight.step(16)) { /* settle */ }
  assert.ok(infl().every((v) => v === 0), 'a hovered shunt target');
  const k = s.vessels.find((o) => o.edge!.id === 'V_KID_L')!.toon.uniforms.glowK!.value as number;
  assert.ok(k > 1 && k <= 2, 'the hover is a stronger glow: ' + k);
  s.hoverVessel(null); while (s.highlight.step(16)) { /* settle */ }
  assert.equal(s.vessels.find((o) => o.edge!.id === 'V_KID_L')!.toon.uniforms.glowK!.value, 1, 'eases back');
  s.dispose();
});

test('nothing in the highlight writes a vessel\'s `inflate` or widens its line (the pick is a glow and nothing else)', () => {
  const hl = readFileSync('src/scene/highlight.ts', 'utf8');
  assert.doesNotMatch(hl.split('export class OrganPins')[0]!, /uniforms\.inflate|PICK_LIFT/);
});
