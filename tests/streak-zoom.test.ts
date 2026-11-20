// Streaks are thin and long in SCREEN px at every zoom (Mohammad, 20 Nov: "the streaks are insanely thick when zoomed out... sleek"): the core is CORE_PX to CORE_MAX_PX of a CSS px whatever the tube's width,
// the feather and the lanes are cut in px, and a streak is 24 px or more long (the pattern scales with the radius only between LEN_R_PX).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREAK, lanesForPx, streakCorePx, streakLenK, streakLenPx, streakWide } from '../src/scene/blood/streak-glsl.ts';
import { STREAK_FIELD_GLSL } from '../src/scene/blood/streak-glsl.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { MICRO_FS } from '../src/scene/micro3d/cel3d.ts';
import { MAPPED } from '../src/scene/vessels/network.ts';

const fit = (w: number, h: number): number => Math.min(w / (2 * 1.32), h / (2 * 1.94));   // px per scene unit at the default fit (SHOTS.play.half)
const ZOOMS = [0.5, 1, 2, 4];
const FITS: [string, number, number][] = [['iPhone', 390, 844], ['Mac pane', 800, 600], ['Mac', 1440, 900]];

const coreMax = (r: number): number => 1.1 + (STREAK.CORE_MAX_PX - 1.1) * streakWide(r);

test('at 0.5x, 1x, 2x and 4x of the default fit every streak core is 0.8 to 1.1 px on a thin tube, growing to 2 px on a wide one (a tube 9 px of radius or more), a 0.6 px feather', () => {
  for (const [name, w, h] of FITS) for (const z of ZOOMS) {
    for (const v of MAPPED) {
      const r = v.radius * fit(w, h) * z;
      if (lanesForPx(r) === 0) continue;
      const lanes = lanesForPx(r), thin = streakCorePx(r, lanes, true), thick = streakCorePx(r, lanes, false);
      assert.ok(thin >= 0.8 && thick <= coreMax(r) + 1e-9, `${name} ${z}x ${v.id} (R ${r.toFixed(1)} px): core ${thin.toFixed(2)} to ${thick.toFixed(2)} px`);
    }
  }
  for (let r = STREAK.MIN_R_PX; r <= 60; r += 0.25) assert.ok(streakCorePx(r, 0, true) >= 0.8 && streakCorePx(r, 0, false) <= coreMax(r) + 1e-9, `R ${r}`);
});

test('at every zoom a streak is 24 px or more long and 96 px or less, a tube under 3.5 px across none', () => {
  for (const [name, w, h] of FITS) for (const z of ZOOMS) {
    for (const v of MAPPED) {
      const r = v.radius * fit(w, h) * z;
      if (lanesForPx(r) === 0) continue;
      const lo = streakLenPx(r, STREAK.FIELD_LEN[0]), hi = streakLenPx(r, STREAK.FIELD_LEN[0] + STREAK.FIELD_LEN[1]);
      assert.ok(lo >= 24 - 1e-9 && hi <= 96 + 1e-9, `${name} ${z}x ${v.id} (R ${r.toFixed(1)} px): ${lo.toFixed(0)} to ${hi.toFixed(0)} px`);
    }
  }
  // the zoom never hands a tube a different pattern in between: the scale is continuous in the radius (no jump at either clamp)
  for (const edge of STREAK.LEN_R_PX) assert.ok(Math.abs(streakLenK(edge - 1e-6) - streakLenK(edge + 1e-6)) < 1e-4);
  assert.equal(streakLenK(4.5), 1, 'between the clamps the pattern scales with the tube, as the geometry does');
});

test('the shaders cut the core, the feather and the lanes in CSS px and scale the pattern by the same clamp as the twin', () => {
  assert.match(STREAK_FIELD_GLSL, /float W = min\(mix\(1\.1, 2\.0, gStreakWide\), mix\(1\.0, 1\.8, gStreakWide\) \* jit\);/);
  assert.match(STREAK_FIELD_GLSL, /float cov = streakBox\(y, W, pw\);/, 'the exact area of the pixel the filament covers');
  assert.match(VESSEL_FS, /float sc = 5\.0 \/ rFix \* rCss \/ clamp\(rCss, 3\.0, 6\.0\);/);
  assert.match(VESSEL_FS, /gStreakPx = rCss;/);
  assert.match(MICRO_FS, /float s = [0-9.]+ \/ R \* rPx \/ clamp\(rPx, 3\.0, 6\.0\);/);
  assert.match(MICRO_FS, /gStreakPx = rPx;/);
  assert.ok(STREAK.CORE_THIN_MAX_PX === 1.1 && STREAK.CORE_MAX_PX === 2 && STREAK.CORE_PX === 1 && STREAK.CORE_WIDE_PX === 1.8);
});
