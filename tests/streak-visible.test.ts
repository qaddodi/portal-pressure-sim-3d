// The streaks are SEEN, and sleek (Mohammad, 20 Nov: first "NO streaks visible", then, once they were thick white dashes, "those streaks are horrendous in lobule... more sleek", "much thinner, and variable in colour and not too white", "same for anatomy").
// Both are held here, in the one streak (blood/streak-glsl.ts) every view takes: the Blood streaks switch is on; a streak is a LONG soft lozenge about 1 px thick (1.5 on a wide tube) with a 0.6 px feather; a lane is mostly empty (period 3 x the length);
// 1 lane under 8 px across, 3 to 16 px, 5 above, none under 3.5 px; its tone a subtle seeded tint of the vessel's own, between the body x 1.05 and the body mixed 0.25 toward white (0.3 at most, a little more on a wide tube), never near white.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREAK, STREAK_FIELD_GLSL, lanesForPx, streakCoverage, streakCorePx, streakToneJs, streakWide } from '../src/scene/blood/streak-glsl.ts';
import { DEPTH_DEFAULTS } from '../src/state/settings.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { PALETTES, contrast, hexToRgb255 } from '../src/scene/palette.ts';
import { celTubeBase } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { MICRO_FS } from '../src/scene/micro3d/cel3d.ts';

const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v * 255))).toString(16).padStart(2, '0')).join('');

test('the Blood streaks switch is on by default (the first cause: nothing ran with it off)', () => {
  assert.equal(DEPTH_DEFAULTS.particles, true);
});

test('sleek: a core of 1 px on every tube, a 0.6 px feather, long soft lozenges, feathered over 35 percent, a mostly empty lane', () => {
  assert.ok(STREAK.CORE_PX === 1 && STREAK.CORE_WIDE_PX <= 2 && STREAK.CORE_THIN_MAX_PX <= 1.1 && STREAK.EDGE_FEATHER_PX >= 0.5 && STREAK.EDGE_FEATHER_PX <= 0.7);
  for (const [r, lanes] of [[2, 1], [3.5, 1], [5, 3], [7, 3], [9, 5], [14, 5]] as [number, number][]) {
    assert.ok(streakCorePx(r, lanes, true) >= 0.8 && streakCorePx(r, lanes, false) <= 1.1 + (STREAK.CORE_MAX_PX - 1.1) * streakWide(r) + 1e-9, `r ${r}: core ${streakCorePx(r, lanes, true).toFixed(2)} to ${streakCorePx(r, lanes, false).toFixed(2)} px`);
    const cov = streakCoverage(r, lanes);
    assert.ok(cov > 0.01 && cov < 0.18, `r ${r}px: coverage ${(cov * 100).toFixed(1)} percent of the face: sparse, not a mess`);
  }
  assert.ok(Math.abs(streakCorePx(5, 3, true) - streakCorePx(2, 1, true)) < 1e-9 && streakCorePx(10, 5, true) > streakCorePx(2, 1, true), 'a thin tube\'s streak is 1 px; a wide tube\'s (9 px of radius or more) is thicker, up to 1.8');
  assert.ok(STREAK.FIELD_LEN_R >= 8 && STREAK.FIELD_LEN_R <= 16, 'a streak is 8 to 16 radii long');
  const len = STREAK.FIELD_LEN[0] + STREAK.FIELD_LEN[1] / 2, lenMax = STREAK.FIELD_LEN[0] + STREAK.FIELD_LEN[1], per = STREAK.FIELD_PERIOD[0] + STREAK.FIELD_PERIOD[1] / 2;
  assert.ok(per / len >= 1.5, `period ${per} over a length of ${len}`);
  assert.ok(STREAK.FIELD_PERIOD[0] > lenMax, 'a streak is never over its own period (they never overlap in a lane)');
  assert.ok(len / STREAK.FIELD_AT_R >= 8 && len / STREAK.FIELD_AT_R <= 16, 'the field is 5 units to a radius: 8 to 16 radii');
  assert.ok(STREAK.FEATHER >= 0.33 && STREAK.FEATHER <= 0.4, 'both ends feathered over about 35 percent');
});

test('lanes by the width on screen: 1 under 8 px across, 3 to 12 px, 5 above (20 Nov: 5 from 4.5 px of radius: the 3-lane band covered 8 to 9 percent of the face against 15 percent for 5 lanes, so a branch at the default fit read as a smooth fill), none under 3.5 px; and the shaders cut them so, in the tube\'s own fragment and in the lobule/sinusoid\'s', () => {
  assert.equal(lanesForPx(1.4), 0); assert.equal(lanesForPx(1.5), 1); assert.equal(lanesForPx(1.8), 1); assert.equal(lanesForPx(2.9), 1); assert.equal(lanesForPx(3), 3); assert.equal(lanesForPx(4.4), 3); assert.equal(lanesForPx(4.5), 5); assert.equal(lanesForPx(20), 5);
  assert.equal(STREAK.MIN_R_PX, 1.5); assert.deepEqual([...STREAK.LANE_R_PX], [3, 4.5]);
  // (the Anatomy's tubes draw the dust now, which has no lanes: it opens at the chevrons' gate; the lobule and the sinusoid still draw the lanes)
  for (const fs of [MICRO_FS]) {
    assert.match(fs, /< 3\.0 \? 1\.0 : [a-zA-Z]+ < 4\.5 \? 3\.0 : 5\.0/, 'lanes 1, 3, 5');
    assert.match(fs, /gStreakWide = smoothstep\(5\.5, 9\.0, /);
  }
  assert.match(VESSEL_FS, /smoothstep\(1\.5, 2\.1, rCssD\)/); assert.match(MICRO_FS, /if \(rPx < 1\.5\) return 0\.0;/);
  assert.match(STREAK_FIELD_GLSL, /lanes > 1\.5 \?/, 'one lane has no shear to divide by');
});

test('the tone is a subtle tint of the vessel\'s own, varied per streak: 1.12 to 1.8:1 against the body at the brightest (the darker the body, the larger the ratio of one white mix) (a little more on a wide tube), never near white, every look', () => {
  const white = [1, 1, 1];
  for (const id of LOOK_IDS) {
    const p = PALETTES[id], dark = id === 'dark' || id === 'navy' || id === 'black';
    for (const v of ['portal', 'sys'] as const) {
      const lit = celTubeBase(hexToRgb255(p.tones[v]).map((x) => x / 255) as [number, number, number], dark);
      const shade = lit.map((x) => x * (1 - CEL_STYLE.SHADE));
      for (const [name, body] of [['lit', lit], ['shade', shade]] as const) {
        let best = 0, worst = 99;
        for (let k = 0; k <= 1; k += 0.25) for (let s = 0; s <= 1; s += 0.25) {
          const t = streakToneJs(body, white, k, s), tw = streakToneJs(body, white, k, s, 1);
          for (let i = 0; i < 3; i++) {
            assert.ok(t[i]! >= body[i]! - 1e-9, `${id} ${v} ${name}: never darker than the body`);
            assert.ok(t[i]! <= body[i]! + (1 - body[i]!) * STREAK.WHITE_CAP + 1e-9, `${id} ${v} ${name}: never over ${STREAK.WHITE_CAP} toward white`);
            assert.ok(tw[i]! <= body[i]! + (1 - body[i]!) * STREAK.WHITE_CAP + 1e-9, 'nor on a wide tube');
          }
          const c = contrast(hex(t), hex(body)); best = Math.max(best, c); worst = Math.min(worst, c);
        }
        assert.ok(best >= 1.12 && best <= (name === 'lit' ? 2.2 : 2.5), `${id} ${v} ${name}: brightest ${best.toFixed(2)}:1`);
        assert.ok(worst < best - 0.05, `${id} ${v} ${name}: the streaks differ from one another (${worst.toFixed(2)} to ${best.toFixed(2)})`);
        const wide = contrast(hex(streakToneJs(body, white, 1, 0.5, 1)), hex(body)), thin = contrast(hex(streakToneJs(body, white, 1, 0.5, 0)), hex(body));
        assert.ok(wide >= thin - 1e-9, `${id} ${v} ${name}: a wide tube's tint is the stronger`);
      }
    }
  }
  assert.ok(streakWide(5) === 0 && streakWide(9) === 1);
});
