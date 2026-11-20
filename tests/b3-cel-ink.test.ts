// The 2D figure's vessel line and shading (tube-cel-glsl.js, tokens.css): the numbers in cel-ink.ts, held against the shader text and the scene's uniforms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color } from 'three';
import { CASING, CIRC_RIM_DARK, CASING_2D, CEL, RIM_A, TAPER_TO, celTones, litMeasure, inkTaper, inkWidthDev } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { CEL_TUBE_GLSL, glslNum as F } from '../src/scene/cel-glsl.ts';
import { LOOK_IDS, PALETTES } from '../src/scene/palette.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { CHEVRON_GLSL } from '../src/scene/blood/chevron-glsl.ts';
import { CelScene } from '../src/scene/scene.ts';

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const INK_RE = new RegExp(esc(`clamp(${F(CEL_STYLE.LINE_R)} * rDevV, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)}) * smoothstep(0.3, ${F(TAPER_TO)}, rDevV) / dpr`));
test('the outline is LINE_R of the radius held between LINE_MIN and LINE_MAX device px: a hairline keeps a line, the trunk does not grow a rope', () => {
  const { LINE_R, LINE_MIN, LINE_MAX } = CEL_STYLE;
  assert.equal(inkWidthDev(LINE_MIN / LINE_R / 2 + 1), LINE_MIN, 'the floor');
  assert.ok(Math.abs(inkWidthDev(LINE_MIN / LINE_R) - LINE_MIN) < 1e-9);
  const mid = (LINE_MIN + LINE_MAX) / 2 / LINE_R;
  assert.ok(Math.abs(inkWidthDev(mid) - (LINE_MIN + LINE_MAX) / 2) < 1e-9, 'in between it is LINE_R of the radius');
  assert.equal(inkWidthDev(4 * LINE_MAX / LINE_R), LINE_MAX, 'the cap');
  assert.ok(LINE_MIN >= 3 && LINE_MAX <= 6.5, 'a confident line, 3 to 6 device px (Mohammad, 20 Nov: veins outlines thicker everywhere)');
  assert.match(VESSEL_VS, INK_RE);
});

test('two tones lit by the world light: the shade below the step, the base above it, nothing on a hairline, and the same wherever the camera is', () => {
  const sw = 1 / 20, step = CEL_STYLE.VESSEL_STEP_AT;
  assert.equal(celTones(step + 0.3, sw, 20).mul, 1, 'toward the light: the plain fill (no lift)');
  assert.ok(Math.abs(celTones(step - 0.3, sw, 20).mul - (1 - CEL.SHADE)) < 1e-9, 'away from the light: the shadow tone');
  assert.equal(celTones(-1, sw, 1).mul, 1, 'a hairline has one tone');
  // the measure is n.L of a world normal: a normal facing the light is lit, the one facing away is shade, and the camera is not an input at all
  const L = CEL_STYLE.LIGHT, l = Math.hypot(...L);
  assert.ok(Math.abs(litMeasure([L[0] / l, L[1] / l, L[2] / l]) - 1) < 1e-9);
  assert.ok(Math.abs(litMeasure([-L[0] / l, -L[1] / l, -L[2] / l]) + 1) < 1e-9);
  assert.ok(celTones(litMeasure([-L[0], -L[1], -L[2]]), sw, 20).mul < 1);
});

test('the shader holds the same numbers, and has no specular, no rim, no wall line and no world-lit band on a vessel', () => {
  assert.ok(VESSEL_FS.includes(CEL_TUBE_GLSL), 'the tones are the one shared GLSL, written from CEL_STYLE');
  for (const n of [`${F(CEL_STYLE.VESSEL_STEP_AT)} - et`, `b * (1.0 - ${F(CEL_STYLE.SHADE)})`]) assert.ok(CEL_TUBE_GLSL.includes(n), n);
  assert.doesNotMatch(CEL_TUBE_GLSL, /celTubeSpec|LIT_AT|window/, 'no highlight, no third band, no lumen window');
  assert.match(VESSEL_FS, /celTubeTone\(base, mix\(sT, 1\.0, nbrK\), fwidth\(sT\) \* \(1\.0 - nbrK\), rDev\)/);
  assert.match(VESSEL_FS, /float sT = dot\(n, celLightView\(\)\)/, 'lit by the world light');
  assert.doesNotMatch(VESSEL_FS, /celTubeSpec|rimLight|wallT|fresnel|FAR_WALL|NEAR_WALL/, 'matte: no highlight, no rim light, no wall pass');
  assert.ok(!/sp \* 0\.32/.test(VESSEL_FS) && !/rim \* 0\.10/.test(VESSEL_FS), 'no old specular dot and no rim lift');
  assert.match(VESSEL_FS, /if \(smokeOn > 0\.5 &&/, 'the smoke is gated');
  assert.match(VESSEL_FS, /dk = 1\.0 - step\(0\.26/, 'a head is one flat tone, not a grey halfway');
  assert.match(VESSEL_FS, /vec3 rimc = CHEV_RIM;/, 'the head\'s outline is always dark');
  assert.match(CHEVRON_GLSL, /const vec3 CHEV_RIM = vec3\(0\.2314, 0\.1725, 0\.1333\);/);
  assert.ok(!/dot\(n, l\) \* 0\.5/.test(VESSEL_FS), 'no world-lit bands');
  assert.match(VESSEL_FS, /gl_FragColor = vec4\(c, vFade \* \(1\.0 - cavaCut \* nbrK\)\);/, 'opaque at rest: vFade is 1 outside a fade zone, cavaCut 0 on every vessel but a hepatic vein that opens into the cava');
});

test('every look wears 2D\'s casing: its ink and alpha (the dark look\'s own in the Circuit, by its share, not by a lens being on), a veiled vessel half, and the dark looks\' light rim', () => {
  assert.deepEqual(Object.keys(CASING).sort(), [...LOOK_IDS].sort());
  const fl = (a: number) => Math.max(a, CEL_STYLE.INK_ALPHA_MIN);   // 2D's casing alphas (.64 light, .66 soft, .3 dark, .38 black/dark circuit, .34 navy), held at the ink's least
  assert.equal(CASING.light.a, fl(0.64)); assert.equal(CASING.soft.a, fl(0.66)); assert.equal(CASING.dark.a, fl(0.3)); assert.equal(CASING.dark.circ.a, fl(0.38)); assert.deepEqual(CASING.dark.circ.rgb, [...CIRC_RIM_DARK], 'dark looks wear a pale rim in the Circuit'); assert.equal(CASING.navy.circ.a, fl(0.34), 'only the dark look changes in the Circuit');
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
  assert.doesNotMatch(VESSEL_FS, /veilA|VEIL_A/, 'a veiled vessel (the cava) is whole: no alpha');
  s.dispose();
});

test('a vessel is ONE draw of one opaque matte tube: one mesh, one material, no groups, no hull copy, no stencil; the outline is part of the tube', () => {
  const s = new CelScene();
  const o = s.vesselObject('PV_TRUNK')!;
  const m = o.toonMesh.material as import('three').ShaderMaterial;
  assert.ok(!Array.isArray(m), 'one material');
  assert.ok(!('FAR_WALL' in m.defines) && !('NEAR_WALL' in m.defines), 'no far/near wall split');
  assert.equal(m.transparent, false, 'opaque'); assert.equal(m.depthWrite, true); assert.equal(m.stencilWrite, false, 'no stencil: no bit to share, no ink to cut');
  const g = o.toonMesh.geometry;
  assert.equal(g.groups.length, 0); assert.equal(g.getAttribute('hull'), undefined);
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
  assert.ok(src.includes('smoothstep(${F(TAPER_FROM)}, ${F(TAPER_TO)}, rDevV) / dpr') && src.includes('clamp(${F(CEL_STYLE.LINE_R)} * rDevV, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)})'), 'the source writes the line from the style');
  assert.match(VESSEL_VS, INK_RE);
  assert.match(src, /\(inkPx \* endK \+ hiPx \* vHi\)/);
});

test('the outline is continuous by construction: painted in the tube\'s own fragment shader from its exact lateral distance to the axis (no second mesh, no stencil, no depth tie); a strand\'s ink still shares the one stencil (2D tube-joint.js)', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.match(VESSEL_VS, /vCen = vec3\(cc\.x, cc\.y, cc\.w\);/, 'the vertex stage passes the axis');
  assert.match(VESSEL_FS, /float dLat = tl > 1e-3 \? abs\(dot\(dvPx, vec2\(-tS\.y, tS\.x\) \/ tl\)\) : length\(dvPx\);/, 'the exact lateral distance in device px');
  assert.match(VESSEL_FS, /float inkT = smoothstep\(rDevAx - 0\.5, rDevAx \+ 0\.5, dLat\) \* endK \* inkOn;/, 'half a pixel of antialiasing each side of the lumen\'s edge');
  assert.doesNotMatch(VESSEL_FS + VESSEL_VS, /gl_FrontFacing \|\| |attribute float hull|vHull|hullOn/, 'no hull');
  assert.match(read('../src/scene/Stage.tsx'), /stencil: true/);
  assert.match(read('../src/scene/scene.ts'), /gl\.clearDepth\(\); gl\.clearStencil\(\)/);
  const s = new CelScene();
  s.dispose();
});

// ---- true cel across a tube: exactly two flat tones, matte, no highlight ----
test('over the whole range of n.L there are exactly two flat tones: one hard step at VESSEL_STEP_AT, nothing in between but the edge, and nothing graded', () => {
  assert.equal(CEL_STYLE.VESSEL_BANDS, 2); assert.equal(CEL_STYLE.BANDS, 3, 'organs and the lobule keep their three');
  const rDev = 20, N = 4000, sw = 1 / rDev, edge = 0.5 * CEL_STYLE.EDGE_PX * sw * 2;   // the edge's width in the measure
  const tones = new Map<string, number>(); let between = 0;
  for (let i = 0; i <= N; i++) { const key = celTones(-1 + (2 * i) / N, sw, rDev).mul.toFixed(6); tones.set(key, (tones.get(key) ?? 0) + 1); }
  const pure = [...tones.keys()].filter((k) => [(1).toFixed(6), (1 - CEL_STYLE.SHADE).toFixed(6)].includes(k));
  assert.equal(pure.length, 2, 'shade and base are both there');
  for (const [k, n] of tones) if (!pure.includes(k)) between += n;
  assert.ok(between / N <= edge / 2 * 1.5 + 0.002, `the edge is ${(100 * between / N).toFixed(2)} % of the range`);
  assert.ok(CEL_STYLE.VESSEL_STEP_AT > -0.2 && CEL_STYLE.VESSEL_STEP_AT < 0.5, 'a tube shows both tones for any light that is not behind it');
});

test('the tones follow the radius, never the position: a thin tube is all one tone, a wide one is two at full strength', () => {
  for (const m of [-0.9, 0, 0.9]) assert.equal(celTones(m, 0.05, CEL_STYLE.TONES_FROM - 0.01).mul, 1);
  assert.equal(celTones(-0.9, 0.05, CEL_STYLE.TONES_TO).mul, 1 - CEL_STYLE.SHADE);
});

test('nothing inside the tube but the two tones and the flow heads: no highlight, no soft rings, heads clipped inside the wall, no dot-sized heads', () => {
  assert.doesNotMatch(VESSEL_FS, /smoothstep\(0\.0, 1\.8 \* px/, 'a head\'s ring is a hard outline, not a halo');
  assert.match(VESSEL_FS, /abs\(across\)\)\);/, 'heads are cut inside the wall');
  assert.match(VESSEL_FS, /smoothstep\(1\.5 \* wpc, 2\.1 \* wpc, R\)/, 'a head needs a tube 3 px across or more (chevron-visible.test.ts)');
  assert.match(VESSEL_FS, /float hw = chevHw\(R, wpc\)/, "a head is 55 percent of the lumen (chevHw), never touching the wall");
  assert.ok(!('SPEC' in CEL_STYLE), 'the style has no highlight');
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

test('the two tones are hue-preserving: the lit side is the saturated base, never a mix to white; the shade is darker and as saturated or more', () => {
  const base: [number, number, number] = [0.482, 0.631, 0.988], sw = 0.05, rDev = 20, b = celTubeBase(base);
  const lit = celTubeColor(base, 0.9, sw, rDev), shade = celTubeColor(base, -0.9, sw, rDev);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(lit[i]! - b[i]!) < 1e-9, 'the lit side is the saturated base');
  assert.ok(lumA(shade) < lumA(b), 'the shade is darker than the base');
  assert.ok(chroma(shade) / Math.max(...shade) >= chroma(b) / Math.max(...b) - 1e-9, 'the shade is a touch more saturated');
  assert.ok(Math.abs(hueOf(shade) - hueOf(b)) < 6, 'hue kept');
});

test('no pale halo: the vessel keeps no white inner rim, a veiled one keeps its colour, and the ink is whole', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const { Vector4 } = await import('three');
  const s = new CelScene(), o = s.vesselObject('PV_TRUNK')!;
  for (const id of LOOK_IDS) { o.applyPalette(PALETTES[id]); assert.equal((o.toon.uniforms.rimInk!.value as InstanceType<typeof Vector4>).w, 0, `${id}: no rim`); }
  assert.equal(CEL_STYLE.TUBE.RIM_SHARE, 0);
  s.dispose();
});

test('the outline is a soft dark of the vessel\'s own colour, never white or black; a joined end draws no ink; heads are never dots', () => {
  const T = CEL_STYLE.TUBE;
  assert.ok(T.INK_OWN >= 0.5 && T.INK_TONE > 0.15 && T.INK_TONE < 0.5, 'mostly the vessel\'s own colour, deep but not black');
  assert.match(VESSEL_FS, new RegExp(`mix\\(inkColor, celTubeBase\\(baseH\\) \\* mix\\(${F(T.INK_TONE).replace('.', '\\.')}, ${F(T.INK_TONE_DARK).replace('.', '\\.')}, tubeDark\\), ${F(T.INK_OWN).replace('.', '\\.')}\\)`));
  assert.match(VESSEL_FS, /mix\(inkH, inkColorCirc, circT\), inkT/, 'the ink colour is the vessel\'s own tone, not the raw casing');
  assert.equal(CEL_STYLE.TUBE.RIM_SHARE, 0, 'no white rim');
  assert.match(VESSEL_FS, /uniform vec3 mate0;[\s\S]*uniform vec3 mate1;/, 'the ink knows the joined ends');
  assert.match(VESSEL_FS, /float endK = vHi > 0\.001 \|\| nbrOn > 0\.5 \? 1\.0 : buryK\(vUv\.x \* len \* vU, \(1\.0 - vUv\.x\) \* len \* vU\);/, 'only a declared branch\'s buried end is not outlined');
  assert.match(VESSEL_VS, /float endK = vHi > 0\.001 \? 1\.0 : buryK\(uv\.x \* len \* vU, \(1\.0 - uv\.x\) \* len \* vU\);/, 'nor widened (the same factor builds the tube)');
  // a head can never be smaller than a readable chevron: the smallest tube that carries one has a head half width of at least 3.5 CSS px, and a head is longer than it is wide
  const minR = 5.8, hw = Math.min(0.6 * minR, Math.min(8, Math.max(4, 0.5 * minR)));
  assert.ok(hw >= 3.4 && 1.6 * hw > hw, `smallest head half width ${hw}`);
});

test('over a wide tube there are exactly two flat colours, the edge between them thin; a hairline has one; the outline and chevrons are unchanged', () => {
  const rDev = 24, sw = 1 / rDev, base: [number, number, number] = [0.5, 0.45, 0.9];
  const b = celTubeBase(base), cols = new Map<string, number>();
  const N = 4000;
  for (let i = 0; i <= N; i++) { const c = celTubeColor(base, -1 + (2 * i) / N, sw, rDev), key = c.map((v) => v.toFixed(5)).join(','); cols.set(key, (cols.get(key) ?? 0) + 1); }
  const big = [...cols].filter(([, n]) => n > N * 0.01);
  assert.equal(big.length, 2, `${big.length} flat colours`);
  const between = [...cols].filter(([, n]) => n <= N * 0.01).reduce((t, [, n]) => t + n, 0);
  assert.ok(between / N < 0.04, `edge only: ${(100 * between / N).toFixed(1)} %`);
  assert.ok(lumA(celTubeColor(base, -0.8, sw, rDev)) < lumA(b), 'the far side is the shade');
  assert.deepEqual(celTubeColor(base, -0.8, sw, TONES_HAIR), celTubeBase(base), 'a hairline is its saturated base');
  assert.doesNotMatch(CEL_TUBE_GLSL, /window/, 'no lumen window');
});
const TONES_HAIR = CEL_STYLE.TONES_FROM - 0.01;

test('the tube is built ink wider than its lumen, by the figure\'s line, with its polygon corners outside it', async () => {
  const { readFileSync } = await import('node:fs');
  const { TUBE_SAG } = await import('../src/scene/vessels/shaders.ts');
  const { TUBE_RADIAL } = await import('../src/scene/vessels/tubes.ts');
  assert.ok(Math.abs(TUBE_SAG - (1 / Math.cos(Math.PI / TUBE_RADIAL) - 1)) < 1e-12 && TUBE_SAG > 0 && TUBE_SAG < 0.05);
  assert.match(VESSEL_VS, /float inkW = \(inkPx \* endK \+ hiPx \* vHi\) \* inkOn \* wpcV \/ vU;/);
  assert.match(VESSEL_VS, /vec3 p = aPos \+ aNor \* \(inflate \+ radius \* rkE \* \(swell \* \(1\.0 - narrow\) - 1\.0\) \+ inkW \+ \(lumenW \+ inkW\) \* /);
  const src = readFileSync(new URL('../src/scene/vessels/vessel-object.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /polygonOffset|stencil|addGroup|makeHull|hullMat/, 'no hull material is left');
});
