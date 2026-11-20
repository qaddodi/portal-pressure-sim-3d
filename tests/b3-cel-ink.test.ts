// The 2D figure's vessel line and shading (tube-cel-glsl.js, tokens.css): the numbers in cel-ink.ts, held against the shader text and the scene's uniforms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color } from 'three';
import { CASING, CASING_2D, CEL, RIM_A, TAPER_TO, celTones, inkTaper, inkWidthDev } from '../src/scene/vessels/cel-ink.ts';
import { LOOK_IDS, PALETTES } from '../src/scene/palette.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { CelScene } from '../src/scene/scene.ts';

test('the outline is 0.14 of the radius held between 1.5 and 3 device px: a hairline keeps a line, the trunk does not grow a rope', () => {
  assert.equal(inkWidthDev(2), 1.5);
  assert.equal(inkWidthDev(10), 1.5);
  assert.ok(Math.abs(inkWidthDev(15) - 2.1) < 1e-9);
  assert.equal(inkWidthDev(60), 3);
  assert.match(VESSEL_VS, /clamp\(0\.14 \* rDev, 1\.5, 3\.0\) \* smoothstep\(0\.3, 1\.5, rDev\) \/ dpr/);
});

test('three tones lit from the top left of the screen: shadow on the far side, lift on the near, nothing on a hairline, and the same wherever the tube lies in the view', () => {
  const side: [number, number] = [1, 0];                     // a vertical tube: its cross axis points right
  const lit = celTones(-1, side, 20), dark = celTones(1, side, 20), mid = celTones(0, side, 20);
  assert.ok(Math.abs(mid.mul - 1) < 1e-9 && mid.lift === 0, 'the middle is the plain fill');
  assert.ok(Math.abs(dark.mul - (1 - CEL.SHADE)) < 1e-9, 'the right side, away from the light, is the shadow tone');
  assert.ok(Math.abs(lit.lift - CEL.LIT) < 1e-9 && lit.mul === 1, 'the left side, toward the light, is lifted');
  const hair = celTones(1, side, 1);
  assert.equal(hair.mul, 1); assert.equal(hair.lift, 0);
  // the tone steps depend on the screen only: a tube the other way round (cross axis flipped, across flipped) is the same picture
  const a = celTones(0.7, side, 20), b = celTones(-0.7, [-1, 0], 20);
  assert.equal(a.mul, b.mul); assert.equal(a.lift, b.lift);
});

test('the shader holds the same numbers, and has no specular and no world-lit band on a vessel', () => {
  assert.match(VESSEL_FS, /vec2\(-0\.70710678, 0\.70710678\)/);
  assert.match(VESSEL_FS, /smoothstep\(-0\.16 - etT, -0\.16 \+ etT, sT\)/);
  assert.match(VESSEL_FS, /smoothstep\(0\.24 - etT, 0\.24 \+ etT, sT\)/);
  assert.match(VESSEL_FS, /hwT \* 0\.17 \* shadowT/);
  assert.match(VESSEL_FS, /0\.15 \* hwT \* litT/);
  assert.ok(!/sp \* 0\.32/.test(VESSEL_FS) && !/rim \* 0\.10/.test(VESSEL_FS), 'no specular dot and no rim lift');
  assert.ok(!/dot\(n, l\) \* 0\.5/.test(VESSEL_FS), 'no world-lit bands');
});

test('every look wears 2D\'s casing: its ink and alpha (the dark look\'s own in the Circuit, by its share, not by a lens being on), a veiled vessel half, and the dark looks\' light rim', () => {
  assert.deepEqual(Object.keys(CASING).sort(), [...LOOK_IDS].sort());
  assert.equal(CASING_2D.light.a, 0.64); assert.equal(CASING_2D.soft.a, 0.66); assert.equal(CASING_2D.dark.a, 0.3); assert.equal(CASING_2D.dark.circ.a, 0.38); assert.deepEqual(CASING.dark.circ.rgb, [0, 0, 0]); assert.equal(CASING_2D.navy.circ.a, 0.34, 'only the dark look changes in the Circuit');
  assert.equal(RIM_A.light, 0); assert.equal(RIM_A.dark, 0.3);
  const s = new CelScene();
  const o = s.vesselObject('PV_TRUNK')!;
  for (const id of LOOK_IDS) {
    o.applyPalette(PALETTES[id]);
    const u = o.toon.uniforms;
    assert.equal(u.casingA!.value, CASING[id].a, id);
    assert.equal(u.casingCircA!.value, CASING[id].circ.a, id);
    const c = u.inkColor!.value as Color;
    assert.ok(Math.abs(c.r - CASING[id].rgb[0] / 255) < 1e-6 && Math.abs(c.b - CASING[id].rgb[2] / 255) < 1e-6, `${id} ink`);
  }
  assert.match(VESSEL_FS, /ca \*= 0\.5;/);
  s.dispose();
});

test('the ink is its own blended draw after the opaque bodies: a material for the body, one for the hull, over the two index ranges', () => {
  const s = new CelScene();
  const o = s.vesselObject('PV_TRUNK')!;
  const mats = o.toonMesh.material as unknown as { transparent: boolean; depthWrite: boolean; uniforms: unknown }[];
  assert.equal(mats.length, 2);
  assert.equal(mats[1]!.transparent, true); assert.equal(mats[1]!.depthWrite, false);
  assert.equal(mats[0]!.transparent, false);
  assert.equal(mats[0]!.uniforms, mats[1]!.uniforms, 'one set of uniforms');
  const g = o.toonMesh.geometry, n = g.getIndex()!.count;
  assert.deepEqual(g.groups.map((x) => [x.start, x.count, x.materialIndex]), [[0, n / 2, 0], [n / 2, n / 2, 1]]);
  s.dispose();
});

test('a sub-pixel lumen keeps its colour: the line thins under 1.5 device px of radius, so at 0.5 px the lumen is most of the width, and from 1.5 px up it is the 2D line', () => {
  const share = (r: number) => (2 * r) / (2 * r + 2 * inkWidthDev(r));   // colour's share of the outer width
  assert.ok(share(0.5) > 0.8, `0.5 px radius: ${share(0.5)} (was 0.25 with the 1.5 px floor)`);
  assert.ok(share(0.3) > 0.99, 'a lumen of 0.3 px radius is all colour');
  assert.equal(inkTaper(TAPER_TO), 1); assert.equal(inkWidthDev(TAPER_TO), 1.5);
  assert.equal(inkWidthDev(2), 1.5, 'the 2D line from there on');
  let last = 0; for (let r = 0; r <= 4; r += 0.1) { const w = inkWidthDev(r); assert.ok(w >= last - 1e-12, 'the line never thins as the vessel widens'); last = w; }
});

test('the vessel shader holds the same taper and leaves the picked ring alone', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  assert.match(src, /clamp\(0\.14 \* rDev, 1\.5, 3\.0\) \* smoothstep\(0\.3, 1\.5, rDev\) \/ dpr/);
  assert.match(src, /\(inkPx \+ hiPx \* vHi\)/);
});

test('one outline round the union: the hull marks the stencil once per pixel, the stencil is asked for and cleared with the depth, and a strand\'s ink shares it (2D tube-joint.js)', async () => {
  const { readFileSync } = await import('node:fs');
  const { NotEqualStencilFunc, ReplaceStencilOp } = await import('three');
  const s = new CelScene();
  const o = s.vesselObject('PV_TRUNK')!;
  const mats = (o.toonMesh.material as import('three').ShaderMaterial[]);
  const hull = mats[1]!;
  assert.ok(hull.stencilWrite && hull.stencilRef === 1 && hull.stencilFunc === NotEqualStencilFunc && hull.stencilZPass === ReplaceStencilOp, 'the hull inks a pixel once');
  assert.ok(!mats[0]!.stencilWrite, 'the body does not touch the stencil');
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.match(read('../src/scene/Stage.tsx'), /stencil: true/);
  assert.match(read('../src/scene/scene.ts'), /gl\.clearDepth\(\); gl\.clearStencil\(\)/);
  const st = (s.disease.strands as unknown as { strands: { obj: { ink: import('three').ShaderMaterial; toon: import('three').ShaderMaterial } | null }[] });
  assert.ok(st.strands.length > 0);
  s.dispose();
});

test('a strand has the tube tones, so a varix beside its vein shades as the vein does', async () => {
  const { presetState } = await import('./b4-presets.ts');
  const s = new CelScene(); const d = s.disease;
  d.feed((await presetState('cirr-decomp')).frame as never, {}, null, { instant: true, presence: () => 1, recruit: () => 1 }, true); d.update(1000);
  const drawn = (d.strands as unknown as { strands: { obj: { toon: import('three').ShaderMaterial; ink: import('three').ShaderMaterial; group: { visible: boolean } } | null }[] }).strands.filter((x) => x.obj?.group.visible);
  assert.ok(drawn.length > 4);
  for (const x of drawn) { assert.ok('TUBE_TONES' in (x.obj!.toon.defines ?? {})); assert.ok(x.obj!.ink.stencilWrite, 'its ink is inked once'); }
  s.dispose();
});
