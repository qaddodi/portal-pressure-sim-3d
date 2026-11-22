// ARTERIES BY FORM (S8, Mohammad 22 Nov: "do the S8 as specified"): an artery's line is 1.5 times a vein's of the same width (held to LINE_MAX), its lumen is one tone step lighter,
// a hairline arteriole is unchanged, a vein is byte-for-byte what it was, the artery's width is untouched, and the shaders carry the same numbers as the JS twin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { CEL_TUBE_GLSL, glslNum as F } from '../src/scene/cel-glsl.ts';
import { TAPER_FROM, TAPER_TO, celTubeColor, celTubeLift, inkTaper, inkWidthCss, inkWidthDev } from '../src/scene/vessels/cel-ink.ts';
import { inkPxGlsl } from '../src/scene/vessels/glsl-shared.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS, SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { toOklab } from '../src/scene/lenses/oklab.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { LENS_TOKENS } from '../src/scene/lenses/tokens.copied.ts';
import { hexToRgb01 } from '../src/scene/lenses/oklab.ts';

const { INK_K, LIFT_L } = CEL_STYLE.ARTERY;
const RADII = [0.05, 0.15, 0.4, 0.8, 1.2, 1.6, 2, 3, 5, 10, 40];

test('an artery\'s line is INK_K times a vein\'s from the figure\'s own line up (held to LINE_MAX), easing in with the hairline taper', () => {
  assert.equal(INK_K, 1.5, 'the spec: 1.5 times a vein\'s');
  for (const r of RADII) {
    const v = inkWidthCss(r), a = inkWidthCss(r, true);
    assert.ok(a >= v - 1e-12, `radius ${r}: never thinner than the vein's`);
    assert.ok(a <= CEL_STYLE.LINE_MAX + 1e-12, `radius ${r}: within LINE_MAX`);
    if (r >= TAPER_TO) assert.ok(Math.abs(a - Math.min(CEL_STYLE.LINE_MAX, v * INK_K)) < 1e-9, `radius ${r}: 1.5 times, or LINE_MAX`);
  }
  assert.ok(Math.abs(inkWidthCss(2, true) / inkWidthCss(2) - 1.5) < 1e-9, 'at an ordinary artery (radius 2 CSS px) it is exactly 1.5 times');
  assert.equal(inkWidthCss(40, true), inkWidthCss(40), 'a trunk\'s line is already at the cap: an artery that wide gains nothing, never a rope');
  // it eases: the ratio grows smoothly with the radius, never a step
  let last = 1;
  for (let r = TAPER_FROM + 0.05; r <= TAPER_TO; r += 0.01) { const k = inkWidthCss(r, true) / Math.max(inkWidthCss(r), 1e-9); assert.ok(k >= last - 1e-9 && k - last < 0.05, `ratio eases at ${r.toFixed(2)}`); last = k; }
});

test('a hairline arteriole is unchanged: under the taper\'s start there is no line to thicken, and the tones\' own gate keeps its lumen the base alone', () => {
  assert.equal(inkWidthCss(TAPER_FROM * 0.5, true), inkWidthCss(TAPER_FROM * 0.5));
  assert.equal(inkWidthCss(0.0, true), 0);
  const base: [number, number, number] = [0.8, 0.12, 0.2];
  for (const rDev of [0.2, 0.6, CEL_STYLE.TONES_FROM]) {
    const v = celTubeColor(base, 0.9, 1e-4, rDev), a = celTubeColor(base, 0.9, 1e-4, rDev, false, true);
    assert.deepEqual(a, v, `radius ${rDev} device px: the same colour as a vein's`);
  }
});

test('a vein is exactly what it was: the default arguments change nothing', () => {
  for (const r of RADII) { assert.equal(inkWidthCss(r, false), inkWidthCss(r)); for (const dpr of [1, 2, 3]) assert.equal(inkWidthDev(r * dpr, dpr, false), inkWidthDev(r * dpr, dpr)); }
  const base: [number, number, number] = [0.4, 0.5, 0.9];
  for (const s of [-0.8, 0, 0.3, 0.9]) for (const rDev of [0.5, 1.5, 4, 20]) assert.deepEqual(celTubeColor(base, s, 1e-4, rDev, false, false), celTubeColor(base, s, 1e-4, rDev));
  // the shader's ink for a vein is the old text exactly (the materials' strands and every non-artery program read it)
  assert.equal(inkPxGlsl('r', 't'), `clamp(${F(CEL_STYLE.LINE_R)} * r, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)}) * smoothstep(${F(TAPER_FROM)}, ${F(TAPER_TO)}, t)`);
});

test('the lumen is one tone step lighter: both tones lifted by LIFT_L in OKLab lightness, hue and chroma kept, eased in with the tones\' radius gate', () => {
  assert.ok(LIFT_L > 0.04 && LIFT_L < 0.12, 'a step you can see and not a different colour');
  for (const look of ['light', 'soft', 'dark', 'navy', 'black'] as const) {
    const base = hexToRgb01(LENS_TOKENS[look].artery);
    for (const s of [0.9, -0.6]) {   // lit and shade tone
      const v = celTubeColor(base, s, 1e-4, 6), a = celTubeColor(base, s, 1e-4, 6, false, true);
      const [Lv, av, bv] = toOklab(v), [La, aa, ba] = toOklab(a);
      assert.ok(Math.abs(La - Lv - LIFT_L) < 0.012, `${look} s=${s}: lightness up by ${LIFT_L} (got ${(La - Lv).toFixed(4)})`);
      assert.ok(Math.hypot(aa - av, ba - bv) < 0.03, `${look} s=${s}: hue and chroma kept (${Math.hypot(aa - av, ba - bv).toFixed(4)})`);
    }
    // still a two-tone tube: the lit and the shade differ by the same step as before
    const dv = toOklab(celTubeColor(base, 0.9, 1e-4, 6))[0] - toOklab(celTubeColor(base, -0.6, 1e-4, 6))[0], da = toOklab(celTubeColor(base, 0.9, 1e-4, 6, false, true))[0] - toOklab(celTubeColor(base, -0.6, 1e-4, 6, false, true))[0];
    assert.ok(Math.abs(da - dv) < 0.02, `${look}: the step between the two tones is kept`);
  }
  // it eases with the radius (no pop as the vessel grows into its tones)
  const base = hexToRgb01(LENS_TOKENS.light.artery);
  let last = 0;
  for (let rDev = 0.9; rDev <= 2.1; rDev += 0.05) { const l = toOklab(celTubeColor(base, 0.9, 1e-4, rDev, false, true))[0] - toOklab(celTubeColor(base, 0.9, 1e-4, rDev))[0]; assert.ok(l >= last - 1e-6 && l - last < 0.02, `lift eases at ${rDev.toFixed(2)}`); last = l; }
  const lifted = celTubeLift([0.5, 0.2, 0.3], 0.07), plain = celTubeLift([0.5, 0.2, 0.3], 0);
  assert.ok(toOklab(lifted)[0] > toOklab(plain)[0]);
});

test('the shaders carry the twin: INK_K and LIFT_L from CEL_STYLE, `1.0 - lensUse` as the artery flag, in the tube, the skin and the glow', () => {
  const art = '1.0 - lensUse';
  assert.match(VESSEL_VS, /uniform float lensUse;/, 'the tube\'s vertex stage knows its flag');
  assert.ok(VESSEL_VS.includes(inkPxGlsl('rCssV', 'rCssV / narrowK', art)), 'the tube builds its line for an artery\'s wall');
  assert.ok(VESSEL_FS.includes(inkPxGlsl('rCssG', 'rCssG', art)), 'the glow mask draws the same line');
  assert.ok(VESSEL_FS.includes(`celTubeToneArt(base, mix(sT, 1.0, nbrT), fwSt * (1.0 - nbrT), rDev, ${art})`), 'the tube\'s lumen is lifted for an artery');
  assert.ok(VESSEL_FS.includes(`${F(INK_K - 1)} * (1.0 - lensUse) * smoothstep(${F(TAPER_FROM)}, ${F(TAPER_TO)}, rCss)`), 'the Circuit\'s cap carve takes the same wall');
  // the junction skin blends its arms\' flags by weight: an artery junction is wholly an artery, a join of an artery into a vein is a gradient
  for (const stage of [SKIN_VS, SKIN_FS]) assert.match(stage, /float skinArt = clamp\(1\.0 - \(.*armColor\[\d\]\.a.*\), 0\.0, 1\.0\);/, 'the skin reads the arms\' lens flags');
  assert.ok(SKIN_VS.includes(inkPxGlsl('rCssV', 'rCssV', 'skinArt')));
  assert.ok(SKIN_FS.includes(inkPxGlsl('rCssAx', 'rCssAx', 'skinArt')));
  assert.match(SKIN_FS, /celTubeToneArt\(base, sT, swT, rDev, skinArt\)/);
  assert.match(CEL_TUBE_GLSL, /vec3 celTubeToneArt\(vec3 base, float s, float sw, float rDev, float art\)/);
  assert.ok(CEL_TUBE_GLSL.includes(`art * hw * ${F(LIFT_L)}`), 'the lift in the shader is LIFT_L, gated by the tones\' radius gate');
  assert.match(CEL_TUBE_GLSL, /vec3 celTubeTone\(vec3 base, float s, float sw, float rDev\) \{ return celTubeToneArt\(base, s, sw, rDev, 0\.0\); \}/, 'every other program\'s tone is the vein\'s');
});

test('the shader\'s OKLab constants are the twin\'s (oklab.ts): one set of numbers', () => {
  const src = readFileSync(new URL('../src/scene/lenses/oklab.ts', import.meta.url), 'utf8');
  const lift = CEL_TUBE_GLSL.slice(CEL_TUBE_GLSL.indexOf('vec3 celTubeLift'), CEL_TUBE_GLSL.indexOf('// the fill: TWO flat tones'));
  const nums = lift.match(/-?\d+\.\d{6,}/g) ?? [];
  assert.ok(nums.length >= 30, 'the matrices are in the shader');
  for (const n of nums) assert.ok(src.includes(n.replace(/^-/, '')), `${n} is in oklab.ts`);
});

test('an artery\'s WIDTH is untouched: S8 is the wall, not the calibre (hepatic artery 5 mm: 4.14 map units wide, its arterioles 1.8)', () => {
  const r = (id: string) => NETWORK.find((v) => v.id === id)!.radius * 300;
  assert.ok(Math.abs(r('A_HEP') - 2.07) < 0.02, `A_HEP radius ${r('A_HEP').toFixed(3)} map units`);
  assert.ok(Math.abs(r('A_HR') - 1.45) < 0.03 && Math.abs(r('A_HL') - 1.27) < 0.03, 'the arterioles keep theirs');
  assert.equal(inkTaper(10), 1);
});
