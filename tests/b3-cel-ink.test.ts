// The 2D figure's vessel line and shading (tube-cel-glsl.js, tokens.css): the numbers in cel-ink.ts, held against the shader text and the scene's uniforms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color } from 'three';
import { CASING, CASING_2D, CEL, RIM_A, TAPER_TO, celSpec, celTones, inkTaper, inkWidthDev } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { CEL_TUBE_GLSL, glslNum as F } from '../src/scene/cel-glsl.ts';
import { LOOK_IDS, PALETTES } from '../src/scene/palette.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { CelScene } from '../src/scene/scene.ts';

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const INK_RE = new RegExp(esc(`clamp(${F(CEL_STYLE.LINE_R)} * rDev, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)}) * smoothstep(0.3, ${F(TAPER_TO)}, rDev) / dpr`));
test('the outline is LINE_R of the radius held between LINE_MIN and LINE_MAX device px: a hairline keeps a line, the trunk does not grow a rope', () => {
  const { LINE_R, LINE_MIN, LINE_MAX } = CEL_STYLE;
  assert.equal(inkWidthDev(LINE_MIN / LINE_R / 2 + 1), LINE_MIN, 'the floor');
  assert.equal(inkWidthDev(LINE_MIN / LINE_R), LINE_MIN);
  const mid = (LINE_MIN + LINE_MAX) / 2 / LINE_R;
  assert.ok(Math.abs(inkWidthDev(mid) - (LINE_MIN + LINE_MAX) / 2) < 1e-9, 'in between it is LINE_R of the radius');
  assert.equal(inkWidthDev(4 * LINE_MAX / LINE_R), LINE_MAX, 'the cap');
  assert.ok(LINE_MIN >= 2 && LINE_MAX <= 3, 'a bold line, 2 to 3 device px');
  assert.match(VESSEL_VS, INK_RE);
});

test('three tones lit from the top left of the screen: shadow on the far side, lift on the near, nothing on a hairline, and the same wherever the tube lies in the view', () => {
  const side: [number, number] = [1, 0];                     // a vertical tube: its cross axis points right
  const lit = celTones(-1, side, 20), dark = celTones(1, side, 20), mid = celTones(0, side, 20);
  assert.ok(Math.abs(mid.mul - 1) < 1e-9 && mid.lift === 0, 'the middle is the plain fill');
  assert.ok(Math.abs(dark.mul - (1 - CEL.SHADE)) < 1e-9, 'the right side, away from the light, is the shadow tone');
  assert.ok(Math.abs(lit.lift - CEL_STYLE.TUBE.LIT_K) < 1e-9 && lit.mul === 1, 'the left side, toward the light, is lifted');
  const hair = celTones(1, side, 1);
  assert.equal(hair.mul, 1); assert.equal(hair.lift, 0);
  // the tone steps depend on the screen only: a tube the other way round (cross axis flipped, across flipped) is the same picture
  const a = celTones(0.7, side, 20), b = celTones(-0.7, [-1, 0], 20);
  assert.equal(a.mul, b.mul); assert.equal(a.lift, b.lift);
});

test('the shader holds the same numbers, and has no specular and no world-lit band on a vessel', () => {
  assert.ok(VESSEL_FS.includes(CEL_TUBE_GLSL), 'the tones are the one shared GLSL, written from CEL_STYLE');
  for (const n of [`vec2(${F(CEL_STYLE.DIR[0])}, ${F(CEL_STYLE.DIR[1])})`, `${F(CEL_STYLE.SHADE_AT)} - et`, `${F(CEL_STYLE.LIT_AT)} - et`, `b * (1.0 - ${F(CEL_STYLE.SHADE)})`, `b * (1.0 + ${F(CEL_STYLE.TUBE.LIT_K)})`]) assert.ok(CEL_TUBE_GLSL.includes(n), n);
  assert.match(VESSEL_FS, /celTubeTone\(base, across, kT, rDev\)/);
  assert.match(VESSEL_FS, /celTubeSpec\(/, 'the one hard highlight');
  assert.ok(!/sp \* 0\.32/.test(VESSEL_FS) && !/rim \* 0\.10/.test(VESSEL_FS), 'no old specular dot and no rim lift');
  assert.match(VESSEL_FS, /if \(smokeOn > 0\.5 &&/, 'the smoke is gated');
  assert.match(VESSEL_FS, /dk = 1\.0 - step\(0\.19/, 'a head is one flat tone, not a grey halfway');
  assert.match(VESSEL_FS, /vec3 rimc = vec3\(0\.2314, 0\.1725, 0\.1333\);/, 'the head\'s outline is always dark');
  assert.ok(!/dot\(n, l\) \* 0\.5/.test(VESSEL_FS), 'no world-lit bands');
});

test('every look wears 2D\'s casing: its ink and alpha (the dark look\'s own in the Circuit, by its share, not by a lens being on), a veiled vessel half, and the dark looks\' light rim', () => {
  assert.deepEqual(Object.keys(CASING).sort(), [...LOOK_IDS].sort());
  const fl = (a: number) => Math.max(a, CEL_STYLE.INK_ALPHA_MIN);   // 2D's casing alphas (.64 light, .66 soft, .3 dark, .38 black/dark circuit, .34 navy), held at the ink's least
  assert.equal(CASING.light.a, fl(0.64)); assert.equal(CASING.soft.a, fl(0.66)); assert.equal(CASING.dark.a, fl(0.3)); assert.equal(CASING.dark.circ.a, fl(0.38)); assert.deepEqual(CASING.dark.circ.rgb, [0, 0, 0]); assert.equal(CASING.navy.circ.a, fl(0.34), 'only the dark look changes in the Circuit');
  for (const id of LOOK_IDS) assert.ok(CASING[id].a >= CEL_STYLE.INK_ALPHA_MIN && CASING[id].circ.a >= CEL_STYLE.INK_ALPHA_MIN, `${id}: ink, not a faint line`);
  assert.equal(CASING_2D.light.a, 0.64); assert.equal(CASING_2D.dark.a, 0.3); assert.equal(CASING_2D.dark.circ.a, 0.38); assert.equal(CASING_2D.navy.circ.a, 0.34, '2D\'s own casing alphas are kept as CASING_2D');
  assert.equal(RIM_A.light, 0); assert.equal(RIM_A.dark, 0.3);
  const s = new CelScene();
  const o = s.vesselObject('PV_TRUNK')!;
  assert.equal(o.toon.uniforms.smokeOn!.value, 0, 'no smoke blobs by default');
  for (const id of LOOK_IDS) {
    o.applyPalette(PALETTES[id]);
    const u = o.toon.uniforms;
    assert.equal(u.casingA!.value, CASING[id].a, id);
    assert.equal(u.casingCircA!.value, CASING[id].circ.a, id);
    const c = u.inkColor!.value as Color;
    assert.ok(Math.abs(c.r - CASING[id].rgb[0] / 255) < 1e-6 && Math.abs(c.b - CASING[id].rgb[2] / 255) < 1e-6, `${id} ink`);
  }
  assert.doesNotMatch(VESSEL_FS, /ca \*= 0\.5;/, 'the ink is whole behind an organ too');
  assert.match(VESSEL_FS, new RegExp(`max\\(veilA, ${F(CEL_STYLE.TUBE.VEIL_FLOOR).replace('.', '\\.')}\\)`), 'a veiled vessel keeps its colour');
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

test('a sub-pixel lumen keeps its colour: the line thins under LINE_MIN device px of radius, so at 0.5 px the lumen is most of the width, and from there up it is the figure\'s line', () => {
  const share = (r: number) => (2 * r) / (2 * r + 2 * inkWidthDev(r));   // colour's share of the outer width
  assert.equal(TAPER_TO, CEL_STYLE.LINE_MIN, 'the taper ends where the line\'s floor starts');
  assert.ok(share(0.5) > 0.8, `0.5 px radius: ${share(0.5)} (a bare ${CEL_STYLE.LINE_MIN} px floor would leave ${(1 / (1 + CEL_STYLE.LINE_MIN)).toFixed(2)})`);
  assert.ok(share(0.3) > 0.99, 'a lumen of 0.3 px radius is all colour');
  assert.equal(inkTaper(TAPER_TO), 1); assert.equal(inkWidthDev(TAPER_TO), CEL_STYLE.LINE_MIN);
  assert.equal(inkWidthDev(TAPER_TO + 0.5), CEL_STYLE.LINE_MIN, 'the figure\'s line from there on');
  let last = 0; for (let r = 0; r <= 4; r += 0.1) { const w = inkWidthDev(r); assert.ok(w >= last - 1e-12, 'the line never thins as the vessel widens'); last = w; }
});

test('the vessel shader holds the same taper and leaves the picked ring alone', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('smoothstep(${F(TAPER_FROM)}, ${F(TAPER_TO)}, rDev) / dpr') && src.includes('clamp(${F(CEL_STYLE.LINE_R)} * rDev, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)})'), 'the source writes the line from the style');
  assert.match(VESSEL_VS, INK_RE);
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

// ---- true cel across a tube: exactly three flat tones, and one small hard highlight ----
const SIDES: [number, number][] = [[1, 0], [-1, 0], [0.8, 0.6], [0.6, -0.8], [-0.6, 0.8]];   // cross axes within 45 degrees of the light's cross reach all three tones; the others fewer

test('across a tube there are exactly three flat tones: a hard step at SHADE_AT and LIT_AT, nothing in between but the edge, and nothing graded', () => {
  const rDev = 20, N = 4000, edgeAcross = 0.5 * CEL_STYLE.EDGE_PX / rDev * 2;   // the edge's width across the tube, in `across` units
  const side: [number, number] = [1, 0];   // a vertical tube: its cross axis points right (to the light's cross: all three tones)
  const tones = new Map<string, number>(); let between = 0;
  for (let i = 0; i <= N; i++) {
    const t = celTones(-1 + (2 * i) / N, side, rDev);
    const key = `${t.mul.toFixed(6)}/${t.lift.toFixed(6)}`;
    tones.set(key, (tones.get(key) ?? 0) + 1);
  }
  const pure = [...tones.entries()].filter(([k]) => ['1.000000/0.000000', `${(1 - CEL_STYLE.SHADE).toFixed(6)}/0.000000`, `1.000000/${CEL_STYLE.TUBE.LIT_K.toFixed(6)}`].includes(k));
  assert.equal(pure.length, 3, 'shade, base and lit are all there');
  for (const [k, n] of tones) if (!pure.some(([p]) => p === k)) between += n;
  // what is not one of the three is the two edges: each EDGE_PX device px wide of a tube 2 x rDev px across
  assert.ok(between / N <= (2 * edgeAcross) / 2 * 1.5 + 0.002, `edges are ${(100 * between / N).toFixed(2)} % of the width, EDGE_PX ${CEL_STYLE.EDGE_PX} px of ${2 * rDev} each`);
  // the order across: the left (toward the light) is lit, the middle base, the right shade
  assert.deepEqual([-0.95, 0, 0.9].map((a) => celTones(a, side, rDev)).map((t) => (t.lift > 0 ? 'lit' : t.mul < 1 ? 'shade' : 'base')), ['lit', 'base', 'shade']);
  // the same for a diagonal tube: its three tones too (the lean), and none is a gradient
  for (const sd of SIDES.filter(([x, y]) => Math.abs(x * CEL_STYLE.DIR[0] + y * CEL_STYLE.DIR[1]) >= 0.7)) {
    const ks = new Set<string>();
    for (let i = 0; i <= 400; i++) { const t = celTones(-1 + i / 200, sd, rDev); if (Math.abs(t.mul - 1) < 1e-9 || Math.abs(t.mul - (1 - CEL_STYLE.SHADE)) < 1e-9) ks.add(`${t.mul.toFixed(5)}/${t.lift.toFixed(5)}`); }
    assert.ok(ks.size >= 2, `a tube ${sd} shows its tones`);
  }
});

test('the tones follow the radius, never the position: a thin tube is all one tone, a wide one is three at full strength', () => {
  const side: [number, number] = [1, 0];
  for (const a of [-0.9, 0, 0.9]) { const t = celTones(a, side, CEL_STYLE.TONES_FROM - 0.01); assert.equal(t.mul, 1); assert.equal(t.lift, 0); }
  assert.equal(celTones(0.9, side, CEL_STYLE.TONES_TO).mul, 1 - CEL_STYLE.SHADE);
  assert.ok(Math.abs(celTones(-0.9, side, CEL_STYLE.TONES_TO).lift - CEL_STYLE.TUBE.LIT_K) < 1e-9);
});

test('the highlight is small, flat, hard-edged, on the lit side, absent on a hairline', () => {
  const S = CEL_STYLE.SPEC, side: [number, number] = [1, 0], rDev = 20;
  const at = (across: number, along = 0, r = rDev) => celSpec(across, side, r, along);
  const aLit = -S.AT;   // the lit side of a vertical tube is its left
  assert.equal(at(aLit), S.ALPHA, 'at the streak: ALPHA toward white, flat');
  assert.equal(at(-aLit), 0, 'none on the shade side'); assert.equal(at(0), 0, 'none in the middle');
  assert.equal(at(aLit, S.LEN + S.SIZE + 0.5), 0, 'a short streak: none further along than its length');
  // hard: of 2000 samples across the tube, all but its two edges (EDGE_PX across each) are 0 or ALPHA exactly
  let soft = 0; const N = 2000;
  for (let i = 0; i < N; i++) { const v = at(-1 + (2 * i) / N); if (v !== 0 && v !== S.ALPHA) soft++; }
  assert.ok(soft / N <= (2 * CEL_STYLE.EDGE_PX / (2 * rDev)) * 1.2, `${soft} of ${N} samples are in an edge (two edges, EDGE_PX across each, of ${2 * rDev} px)`);
  // small: well under a quarter of the tube's width across, ALPHA stays a share
  let width = 0; for (let i = 0; i < N; i++) if (at(-1 + (2 * i) / N) > 0) width++;
  assert.ok(width / N < 0.25, `${(100 * width / N).toFixed(0)} % of the width`);
  // hairlines: none under MIN_PX, whole from MIN_PX + 1
  for (const r of [0.5, 1.5, S.MIN_PX - 0.01]) assert.equal(at(aLit, 0, r), 0, `radius ${r}`);
  assert.equal(at(aLit, 0, S.MIN_PX + 1), S.ALPHA);
  assert.ok(S.AT > CEL_STYLE.LIT_AT, 'it sits inside the lit band');
  // the shader writes it from the style, fades with the radius and is skipped on a dotted collateral
  assert.ok(CEL_TUBE_GLSL.includes(`smoothstep(${F(S.MIN_PX)}, ${F(S.MIN_PX + 1)}, rDev)`) && CEL_TUBE_GLSL.includes(F(S.ALPHA)));
  assert.match(VESSEL_FS, /dotted > 0\.5 \? 0\.0 : 1\.0/);
});

test('nothing inside the tube but the three tones, the hard highlight and the flow heads: no soft rings, heads clipped inside the wall, no dot-sized heads', () => {
  assert.doesNotMatch(VESSEL_FS, /smoothstep\(0\.0, 1\.8 \* px/, 'a head\'s ring is a hard outline, not a halo');
  assert.match(VESSEL_FS, /abs\(across\)\)\);/, 'heads are cut inside the wall');
  assert.match(VESSEL_FS, /smoothstep\(5\.8 \* wpc, 7\.0 \* wpc, R\)/, 'a head needs a tube wide enough to read as one');
  assert.match(VESSEL_FS, /float hw = min\(0\.6 \* R/, 'a head and its ring stay inside the lumen');
});

// ---- saturated, deep, hue-kept: the vessels are never pale or washed out ----
import { celTubeBase, celTubeColor } from '../src/scene/vessels/cel-ink.ts';
const hueOf = (c: readonly number[]) => { const [r, g, b] = c as [number, number, number], mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn || 1e-9; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const chroma = (c: readonly number[]) => Math.max(...c) - Math.min(...c);
const lumA = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;

test('a pale lens colour (the ramp\'s icy end) becomes a deeper, more saturated one of the same hue, and none is lighter than LCAP', () => {
  for (const hex of [[0.843, 0.906, 0.957], [0.722, 0.835, 0.929], [0.616, 0.788, 0.969], [0.482, 0.631, 0.988], [0.627, 0.455, 0.957]] as const) {
    const b = celTubeBase(hex);
    assert.ok(lumA(b) <= CEL_STYLE.TUBE.LCAP + 1e-9, `luminance ${lumA(b).toFixed(2)}`);
    assert.ok(chroma(b) / Math.max(...b) > chroma(hex) / Math.max(...hex) - 1e-9, 'more saturated (chroma over value)');
    assert.ok(Math.abs(hueOf(b) - hueOf(hex)) < 8, `hue kept: ${hueOf(hex).toFixed(0)} to ${hueOf(b).toFixed(0)}`);
  }
});

test('the tones are hue-preserving lightness steps: the lit is lighter than the base but is not a mix to white, the shade is darker and as saturated or more', () => {
  const base: [number, number, number] = [0.482, 0.631, 0.988], side: [number, number] = [1, 0], rDev = 20, b = celTubeBase(base);
  const lit = celTubeColor(base, -0.95, side, rDev), mid = celTubeColor(base, 0, side, rDev), shade = celTubeColor(base, 0.9, side, rDev);
  assert.deepEqual(mid, b, 'the middle is the saturated base');
  assert.ok(lumA(lit) > lumA(mid) && lumA(shade) < lumA(mid));
  assert.ok(chroma(lit) >= chroma(mid) - 1e-9, 'the lit tone does not wash toward white');
  assert.ok(chroma(shade) / Math.max(...shade) >= chroma(mid) / Math.max(...mid) - 1e-9, 'the shade is a touch more saturated');
  for (const c of [lit, shade]) assert.ok(Math.abs(hueOf(c) - hueOf(mid)) < 6, 'hue kept');
});

test('no pale halo: the vessel keeps no white inner rim, a veiled one keeps its colour, and the ink is whole', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const { Vector4 } = await import('three');
  const s = new CelScene(), o = s.vesselObject('PV_TRUNK')!;
  for (const id of LOOK_IDS) { o.applyPalette(PALETTES[id]); assert.equal((o.toon.uniforms.rimInk!.value as InstanceType<typeof Vector4>).w, 0, `${id}: no rim`); }
  assert.equal(CEL_STYLE.TUBE.RIM_SHARE, 0); assert.ok(CEL_STYLE.TUBE.VEIL_FLOOR >= 0.6);
  s.dispose();
});
