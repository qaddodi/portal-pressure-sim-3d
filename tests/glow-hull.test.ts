// The selection glow takes the vessel's own shape and fades at its ends (Mohammad, 20 Nov: "selecting a blood vessel still sucks; i hate the outline, glow is ok but even the glow should take the shape of the vessel (and fade at the ends)").
// ROOT CAUSE of the flat slabs and boxes on a picked portal vein with a stenosis: the glow was a separate ribbon laid on the BUILT course at the BUILT radius, one per piece of the vein, so it knew nothing of the live width, the
// stenosis waist, the smooth joins or the junction skin, and every piece ended square across. The glow is now the vessel's own hull (the `GLOW` program of the tube and of the skin), so it has the vessel's silhouette by
// construction. These tests pin that: no separate ribbon geometry exists, the hull is the tube's own geometry and uniforms, its reach follows the LIVE radius, and both ends of a vein (and the Circuit) fade it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { CelScene } from '../src/scene/scene.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS, SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { glowAlphaGlsl, glowReachGlsl } from '../src/scene/vessels/glsl-shared.ts';
import * as GLOW from '../src/scene/glow.ts';
import { outlineStrength, computeHighlight } from '../src/scene/highlight.ts';

test('there is no glow ribbon of its own any more: nothing in the glow module lays geometry on a course', () => {
  const keys = Object.keys(GLOW);
  assert.ok(!keys.some((k) => /ribbon|build|Glow$/i.test(k) && !/^glow(Reach|Alpha)$/.test(k) && !/^GLOW_/.test(k)), keys.join());
  const src = readFileSync('src/scene/glow.ts', 'utf8');
  assert.doesNotMatch(src, /BufferGeometry|Float32BufferAttribute|MeshBasicMaterial/, 'no mesh of its own to get out of step with the vessel');
  const hl = readFileSync('src/scene/highlight.ts', 'utf8');
  assert.doesNotMatch(hl, /VesselGlow|courseOf|CourseOf/, 'the highlight takes no course: the vessel draws its own halo');
});

test('the tube\'s GLOW program grows its hull from the LIVE radius here (so a stenosis waist, the engine\'s diameter and a smooth join set the halo\'s width) and by the pick\'s weight (nothing at the ends)', () => {
  assert.match(VESSEL_VS, /#ifdef GLOW\s*float hiReach = [^;]*rCssV[^;]*;/, 'the reach is measured on the lumen\'s live radius in CSS px');
  assert.ok(VESSEL_VS.includes(glowReachGlsl('rCssV')));
  assert.match(VESSEL_VS, /float inkW = \(inkPx \* endK \+ hiReach \* vHi\)/, 'weighted by vHi');
  assert.match(VESSEL_FS, /#ifdef GLOW[\s\S]*gl_FragColor = vec4\([^;]*, aG\);\s*return;/, 'a halo outside the line, nothing over the body');
  assert.ok(VESSEL_FS.includes(glowAlphaGlsl('sG', glowReachGlsl('rCssG') + ' * vHi', 'vHi')), 'alpha and reach both follow the pick\'s weight');
  assert.match(VESSEL_FS, /float sG = dLat \/ dpr - rCssG - lineG;/, 'measured from the line\'s outer edge by the exact lateral distance to the axis');
});

test('the junction skin\'s GLOW program is the same rule on the arms\' blended pick weight, so a welded junction is covered with no seam', () => {
  assert.match(SKIN_VS, /#ifdef GLOW\s*float hiReach = [^;]*rCssV[^;]*;/);
  assert.match(SKIN_VS, /float inkW = \(inkPx \+ hiReach \* hi\)/);
  assert.ok(SKIN_FS.includes(glowAlphaGlsl('sG', glowReachGlsl('rCssAx') + ' * hi', 'hi')));
  assert.match(SKIN_FS, /float hi = [^;]*armAF[^;]*\.z/, 'hi is the arms\' pick weight at their seams');
  assert.match(SKIN_FS, /#ifdef GLOW[\s\S]*gl_FragColor = vec4\([^;]*, aG\);\s*return;/);
});

test('the glow mesh of a vessel is its own geometry and its own uniforms through the GLOW program, in the vessels\' pass, drawn over what is behind', () => {
  const s = new CelScene();
  const pv = s.vessels.find((o) => o.edge?.id === 'PV_TRUNK')!;
  const g = pv.glowMesh!;
  assert.ok(g, 'every vessel has one');
  assert.equal(g.geometry, pv.toonMesh.geometry, 'the very same geometry: its silhouette is the vessel\'s');
  const m = g.material as unknown as { uniforms: unknown; defines: Record<string, number>; transparent: boolean; depthWrite: boolean };
  assert.equal(m.uniforms, pv.toon.uniforms, 'the very same uniforms: the live width, the waist, the fade and the pick weight are the tube\'s own');
  assert.equal(m.defines.GLOW, 1);
  assert.ok(m.transparent && !m.depthWrite);
  assert.equal(g.visible, false, 'hidden until a pick');
  s.dispose();
});

test('the halo is nothing inside the line, brightest at its edge, thins to nothing at its reach, and is nothing where the pick has no weight (the vein\'s ends)', () => {
  const reach = GLOW.glowReach(10);
  assert.ok(GLOW.glowAlpha(-3, reach, 1) < 1e-9, 'nothing over the lumen and the line');
  const edge = GLOW.glowAlpha(0.5, reach, 1), mid = GLOW.glowAlpha(reach * 0.4, reach, 1);
  assert.ok(edge > mid && mid > GLOW.glowAlpha(reach * 0.8, reach, 1) && GLOW.glowAlpha(reach, reach, 1) < 1e-9, 'a bright rim and a long soft tail');
  assert.equal(GLOW.glowAlpha(1, reach, 0), 0, 'no pick weight, no halo');
  let last = 0;
  for (let h = 0; h <= 1.0001; h += 0.05) { const a = GLOW.glowAlpha(1, GLOW.glowReach(10) * h, h); assert.ok(a >= last - 1e-12, 'grows smoothly with the weight'); assert.ok(a - last < 0.1, 'no step'); last = a; }
  assert.ok(GLOW.glowReach(30) > GLOW.glowReach(3), 'a narrower stretch has a narrower halo');
});

test('the pick\'s weight along a vein: nothing at its two outer ends and full in the middle, so the glow fades out at both ends and runs through a joint between two pieces', () => {
  const edges = [{ id: 'A', from: 'n0', to: 'n1', length: 1 }, { id: 'B', from: 'n1', to: 'n2', length: 1 }];
  const spec = computeHighlight(['A', 'B'], edges);
  const a = spec.get('A')!, b = spec.get('B')!;
  assert.equal(outlineStrength(a, 0, 1), 0, 'the vein\'s start');
  assert.equal(outlineStrength(b, 1, 1), 0, 'the vein\'s end');
  assert.ok(Math.abs(outlineStrength(a, 1, 1) - outlineStrength(b, 0, 1)) < 1e-9, 'continuous through the joint: no square end at a piece\'s boundary');
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
