// The streaks are SEEN (Mohammad, 20 Nov play-test, Healthy at 2x on the Mac in Light and Dark: "NO laminar streak lanes are visible inside any vessel, only chevrons"). Two causes, both pinned here:
//  1. the "Blood streaks" switch (settings.particles) was off by default, so the streak layer never ran;
//  2. with it on, a mark was a hairline (0.3 of a lane: 1.4 px on a 6 px vessel) in a tone 5 to 28 percent toward white: close to the body's own.
// Now: the switch is on, a mark's core is at least MIN_PX (2) CSS px wherever its lane is wide enough, the lighter tone is 22 to 50 percent toward white, and the coverage is a share of the face worth seeing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREAK, lanesFor, streakCorePx, streakCoverage, streakToneJs } from '../src/scene/blood/streak-glsl.ts';
import { DEPTH_DEFAULTS } from '../src/state/settings.ts';
import { PALETTES, contrast, hexToRgb255 } from '../src/scene/palette.ts';
import { celTubeBase } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';

const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v * 255))).toString(16).padStart(2, '0')).join('');
// typical vessels at the pane's 2x zoom: [radius in CSS px, lanes] (the lumen's own radius picks the lanes: 3, 5 or 7)
const TYPICAL: [number, number][] = [[4, 3], [6, 5], [9, 7], [14, 7]];

test('the Blood streaks switch is on by default (the first cause: nothing ran with it off)', () => {
  assert.equal(DEPTH_DEFAULTS.particles, true);
});

test('a streak is at least 2 CSS px thick wherever its lane allows, in a typical vessel, and the coverage is a visible share of the face (not a mess)', () => {
  assert.ok(STREAK.MIN_PX >= 2);
  for (const [r, lanes] of TYPICAL) {
    const core = streakCorePx(r, lanes), cov = streakCoverage(r, lanes);
    assert.ok(core >= 2 - 1e-9, `r ${r}px, ${lanes} lanes: core ${core.toFixed(2)} px`);
    assert.ok(cov > 0.12 && cov < 0.6, `r ${r}px: coverage ${(cov * 100).toFixed(0)} percent of the face`);
  }
  assert.equal(lanesFor(5), 7); assert.equal(lanesFor(3), 5); assert.equal(lanesFor(1), 3);
  // the shader holds the floor (the pixel rule), with the lumen's radius in CSS px
  assert.match(VESSEL_FS, /gStreakPx = rCss;/);
});

test('the lighter tone is a visible step from the body in Light and Dark: 1.15:1 or more at the faintest streak, 1.4:1 or more at the brightest, for the portal and the systemic vessel, lit side and shade side', () => {
  for (const id of ['light', 'soft', 'dark', 'navy', 'black'] as const) {
    const p = PALETTES[id], dark = id === 'dark' || id === 'navy' || id === 'black';
    for (const v of ['portal', 'sys'] as const) {
      const lit = celTubeBase(hexToRgb255(p.tones[v]).map((x) => x / 255) as [number, number, number], dark);
      const shade = lit.map((x) => x * (1 - CEL_STYLE.SHADE));
      for (const [name, body] of [['lit', lit], ['shade', shade]] as const) {
        const light = body.map((x) => x + (1 - x) * STREAK.LIFT);
        const faint = streakToneJs(body, light, 0, 0.5), bright = streakToneJs(body, light, 1, 0.5);
        const cf = contrast(hex(faint), hex(body)), cb = contrast(hex(bright), hex(body));
        assert.ok(cf >= 1.15, `${id} ${v} ${name}: faintest ${cf.toFixed(2)}:1`);
        assert.ok(cb >= 1.4, `${id} ${v} ${name}: brightest ${cb.toFixed(2)}:1`);
        for (let i = 0; i < 3; i++) assert.ok(bright[i]! <= 1 && faint[i]! >= body[i]! - 1e-9, 'never darker than the body, never past white');
      }
    }
  }
});
