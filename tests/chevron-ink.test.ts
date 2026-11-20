// External review, 20 Nov: "chevron ink flips dark/cream at a hard luminance threshold" (and Mohammad: nothing pops). The head's tone is now the vessel's own LATCHED, EASED value (lenses/chevron-ink.ts), read by the vessel shader from the
// fifth row of the lens colour texture; where a vessel has none (the stream lenses' lanes, the plain anatomy) it is a short eased step on the drawn luminance. Held here: the latch's hysteresis, the ease, the texture row, the shader's reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHEV_INK, CHEV_INK_ROW, CHEVRON_GLSL, chevCreamSoftJs, chevLatchJs, chevLum } from '../src/scene/blood/chevron-glsl.ts';
import { ChevronInk, INK_ROW, drawnLuminance } from '../src/scene/lenses/chevron-ink.ts';
import { GRAD_ROWS, LENS_EDGE_COUNT, newLensData, type LensData } from '../src/scene/lenses/model.ts';
import { LensField } from '../src/scene/lenses/field.ts';
import { celTubeBase } from '../src/scene/vessels/cel-ink.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';

const NE = LENS_EDGE_COUNT;
/** A lens that colours edge `k` one flat colour (all four rows). */
function flat(k: number, rgb: [number, number, number], into: LensData = newLensData()): LensData {
  into.mode = 1;
  for (let row = 0; row < 4; row++) { const i = (row * NE + k) * 4; into.grad[i] = rgb[0]; into.grad[i + 1] = rgb[1]; into.grad[i + 2] = rgb[2]; into.grad[i + 3] = 1; }
  return into;
}
/** A grey whose DRAWN (celTubeBase) linear luminance is `L`, found by bisection, so the tests speak in the shader's own measure. */
function greyAt(L: number, dark = false): [number, number, number] {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; (chevLum(celTubeBase([m, m, m], dark)) < L ? (lo = m) : (hi = m)); }
  return [lo, lo, lo];
}

test('the table: 2D\'s step is the middle, the latch is a clear dead zone either side of it, and the fallback band is narrower than 2D\'s old blur', () => {
  assert.equal(CHEV_INK.AT, 0.26);
  assert.ok(CHEV_INK.HYST >= 0.03 && CHEV_INK.AT - CHEV_INK.HYST > 0.15 && CHEV_INK.AT + CHEV_INK.HYST < 0.4);
  assert.ok(CHEV_INK.BAND <= CHEV_INK.HYST / 2, 'the eased step is inside the dead zone');
  assert.ok(CHEV_INK.EASE_MS >= 120 && CHEV_INK.EASE_MS <= 320, 'a short ease');
  assert.equal(CHEV_INK_ROW, 4); assert.equal(INK_ROW, 4); assert.equal(GRAD_ROWS, 5);
});

test('the latch is a Schmitt trigger: cream under AT - HYST, dark over AT + HYST, and what it was between them', () => {
  const lo = CHEV_INK.AT - CHEV_INK.HYST, hi = CHEV_INK.AT + CHEV_INK.HYST;
  assert.equal(chevLatchJs(false, lo - 0.01), true); assert.equal(chevLatchJs(true, hi + 0.01), false);
  for (const was of [true, false]) for (const L of [lo + 0.001, CHEV_INK.AT, hi - 0.001]) assert.equal(chevLatchJs(was, L), was, `${was} at ${L}: unchanged`);
  // a luminance that wobbles about the old hard threshold flips the old step on every wobble and the latch not at all
  let hard = 0, soft = 0, was = false, prevHard = false;
  for (let i = 0; i < 200; i++) {
    const L = CHEV_INK.AT + 0.025 * Math.sin(i * 1.3);
    const h = L < CHEV_INK.AT; if (h !== prevHard) hard++; prevHard = h;
    const n = chevLatchJs(was, L); if (n !== was) soft++; was = n;
  }
  assert.ok(hard > 50, `the hard step flipped ${hard} times`); assert.ok(soft <= 1, `the latch changed ${soft} times`);
});

test('the fallback step is eased and short: whole at each end, a smooth ramp only between AT +- BAND', () => {
  assert.equal(chevCreamSoftJs(CHEV_INK.AT - CHEV_INK.BAND - 1e-6), 1); assert.equal(chevCreamSoftJs(CHEV_INK.AT + CHEV_INK.BAND + 1e-6), 0);
  assert.ok(Math.abs(chevCreamSoftJs(CHEV_INK.AT) - 0.5) < 1e-9);
  let last = 1; for (let L = 0.2; L <= 0.32; L += 0.002) { const v = chevCreamSoftJs(L); assert.ok(v <= last + 1e-12, 'never rises with the luminance'); last = v; }
});

test('a vessel is seen once: its first decision is immediate (nothing is changing), and a colour inside the dead zone later changes nothing', () => {
  const ci = new ChevronInk(), k = 7;
  ci.decide(flat(k, greyAt(0.15)), 'light');   // dark tube: cream heads, at once
  assert.equal(ci.creamOf(k), true); assert.equal(ci.valueOf(k), 1); assert.equal(ci.moving, false);
  assert.equal(ci.decide(flat(k, greyAt(CHEV_INK.AT + 0.01)), 'light'), false, 'over 2D\'s step but inside the dead zone: still cream');
  assert.equal(ci.creamOf(k), true); assert.equal(ci.moving, false);
  assert.equal(ci.decide(flat(k, greyAt(CHEV_INK.AT + CHEV_INK.HYST + 0.02)), 'light'), true, 'past the dead zone: dark ink');
  assert.equal(ci.creamOf(k), false);
});

test('a change eases over EASE_MS: no step, monotone, ends exactly at the latch, and reduced motion lands it at once', () => {
  const ci = new ChevronInk(), k = 3;
  ci.decide(flat(k, greyAt(0.1)), 'light'); ci.decide(flat(k, greyAt(0.5)), 'light');
  assert.equal(ci.creamOf(k), false);
  const seen: number[] = [ci.valueOf(k)];
  for (let t = 0; t < CHEV_INK.EASE_MS * 2; t += 16) { ci.step(16); seen.push(ci.valueOf(k)); }
  assert.equal(seen[0], 1); assert.equal(seen.at(-1), 0);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i]! <= seen[i - 1]! + 1e-9, 'never turns back');
  const steps = seen.filter((v) => v > 0 && v < 1).length;
  assert.ok(steps >= CHEV_INK.EASE_MS / 16 - 2, `${steps} in-between frames: it glides`);
  assert.ok(Math.max(...seen.slice(1).map((v, i) => seen[i]! - v)) <= 16 / CHEV_INK.EASE_MS + 1e-6, 'no frame moves more than its share');
  const r = new ChevronInk(); r.instant = true;
  r.decide(flat(k, greyAt(0.1)), 'light'); r.decide(flat(k, greyAt(0.5)), 'light'); assert.equal(r.step(16), false); assert.equal(r.valueOf(k), 0);
});

test('the dark looks are judged on the brighter tube they are drawn in, and a vessel the lens does not colour has no ink of its own', () => {
  const g: [number, number, number] = [0.7, 0.8, 0.95];   // (a pale lens colour: the light looks cap it at LCAP, the dark looks at the brighter LCAP_DARK)
  const light = drawnLuminance(flat(1, g), 1, 'light')!, dark = drawnLuminance(flat(1, g), 1, 'dark')!;
  assert.ok(light > 0 && dark > light, 'celTubeBase\'s caps differ by look: the dark looks draw it brighter');
  assert.equal(drawnLuminance(flat(1, g), 2, 'light'), null, 'an edge the lens does not colour');
  const lanes = flat(1, g); lanes.mode = 2;
  assert.equal(drawnLuminance(lanes, 1, 'light'), null, 'lanes have no single colour: the shader\'s short eased step takes them');
});

test('the ink is written to the fifth row of the colour texture, with the vessel flagged, and the field eases it on its own clock', () => {
  const ci = new ChevronInk(), k = 11, g = newLensData().grad;
  ci.decide(flat(k, greyAt(0.1)), 'light'); ci.write(g);
  assert.equal(g[(INK_ROW * NE + k) * 4], 1); assert.equal(g[(INK_ROW * NE + k) * 4 + 3], 1);
  assert.equal(g[(INK_ROW * NE + k + 1) * 4 + 3], 0, 'a vessel never seen is not flagged');
  assert.equal(newLensData().grad.length, NE * 4 * GRAD_ROWS);
  const f = new LensField();
  assert.equal(f.data.grad.length, NE * 4 * GRAD_ROWS);
});

test('the vessel shader reads the vessel\'s own ink for each lens set, mixes the two sets by the lens crossfade, and eases the stored value', () => {
  assert.match(VESSEL_FS, /float chevCreamOf\(vec4 la, sampler2D grad, float mode\) \{/);
  assert.match(VESSEL_FS, new RegExp(`texelFetch\\(grad, ivec2\\(int\\(lensIndex\\), ${CHEV_INK_ROW}\\), 0\\)\\.r`), 'the fifth row');
  assert.match(VESSEL_FS, /if \(la\.a > 0\.5 && mode < 1\.5\) return smoothstep\(0\.0, 1\.0, /, 'only where the lens runs colours along the vessel, and the stored value is smoothed');
  assert.match(VESSEL_FS, /float cream = mix\(chevCreamOf\(la, lensGradA, lensModeA\), chevCreamOf\(lb, lensGradB, lensModeB\), lensMix\);/);
  assert.match(VESSEL_FS, /chevInk\(cream, markDark, markLight\)/);
  assert.doesNotMatch(VESSEL_FS, /step\(0\.26/, 'no hard step on the luminance is left');
  assert.doesNotMatch(CHEVRON_GLSL, /step\(0\.26/);
  assert.match(CHEVRON_GLSL, new RegExp(`smoothstep\\(${(CHEV_INK.AT - CHEV_INK.BAND).toFixed(3)}, ${(CHEV_INK.AT + CHEV_INK.BAND).toFixed(3)}, chevLum\\(drawn\\)\\)`), 'the fallback band is the table\'s');
});
