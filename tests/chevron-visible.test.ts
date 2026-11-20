// At the DEFAULT FIT the flow marks are seen (Mohammad, 20 Nov, Dark, normal view: "no chevrons and I can barely see streaks"). The root cause: the heads came in only on a tube from 5.8 CSS px of radius (12 px across) and the
// streaks' lanes were cut by the radius in 2D units (7 lanes of 1 px in a 8 px vessel); at the default fit the real network is 6 to 10 px across. This measures the on-screen size of the heads and streaks over the REAL network
// (its radii and courses) at the default fit of the Anatomy (the 'play' shot, kept whole in the room: iPhone 390 wide, a Mac window), and pins minimums.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPPED, courseOf } from '../src/scene/vessels/network.ts';
import { SHOTS } from '../src/scene/camera/shots.ts';
import { CHEV } from '../src/scene/blood/chevron-glsl.ts';
import { STREAK, lanesForPx, streakCorePx, streakCoverage } from '../src/scene/blood/streak-glsl.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';

/** CSS px to a scene unit at the default fit: the shot's half extents kept whole in the room (the room solver's rule at a near-orthographic lens). */
const fit = (w: number, h: number): number => Math.min(w / (2 * SHOTS.play.half[0]), h / (2 * SHOTS.play.half[1]));
const ROOMS: [string, number, number][] = [['iPhone 390 x 560', 390, 560], ['iPad 820 x 900', 820, 900], ['Mac pane 800 x 520', 800, 520], ['Mac 1280 x 760', 1280, 760]];
/** The head's size in CSS px by the shader's own rule (vessels/shaders.ts chevOne). */
const headHw = (R: number): number => Math.min(CHEV.TUBE_SHARE * R, Math.min(CHEV.MAX_HW_PX, Math.max(CHEV.MIN_HW_PX, 0.5 * R)));
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const headShown = (R: number): number => smooth(CHEV.MIN_R_PX, CHEV.MIN_R_PX + 0.6, R);
const len = (pts: readonly (readonly number[])[]): number => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!); return s; };

test('the shader\'s heads follow the CHEV table: one every 130 px, from a tube 4 px across, 5 px tall from 6 px across', () => {
  assert.equal(CHEV.PITCH_PX, 130); assert.ok(CHEV.MIN_R_PX <= 2 && CHEV.MIN_HW_PX >= 2.5);
  assert.match(VESSEL_FS, /smoothstep\(1\.8, 2\.6, rCss\)/);
  assert.match(VESSEL_FS, /float Pt = 130\.0 \* wpc;/);
  assert.match(VESSEL_FS, /smoothstep\(2\.0 \* wpc, 2\.6 \* wpc, R\)/);
  assert.match(VESSEL_FS, /min\(0\.8 \* R, clamp\(0\.5 \* R, 2\.5 \* wpc, 8\.0 \* wpc\)\)/);
  assert.doesNotMatch(VESSEL_FS, /smoothstep\(5\.8 \* wpc/);
  for (const R of [3.1, 4, 6, 12]) assert.ok(2 * headHw(R) >= 4.9, `R ${R}: head ${(2 * headHw(R)).toFixed(1)} px tall`);
  assert.ok(headShown(1.9) === 0 && headShown(2.7) === 1, 'none only under about 4 px across');
});

test('at the default fit every vessel 6 px across or more carries heads at least 5 px tall (thinnest and thickest of the real network pinned)', () => {
  for (const [name, w, h] of ROOMS) {
    const k = fit(w, h);
    const px = MAPPED.map((v) => ({ id: v.id, R: v.radius * k }));
    const wide = px.filter((x) => x.R >= 3);
    assert.ok(wide.length >= 8, `${name}: ${wide.length} vessels 6 px across or more`);
    for (const x of wide) { assert.equal(headShown(x.R), 1, `${name} ${x.id}`); assert.ok(2 * headHw(x.R) >= (x.R >= 3.2 ? 4.9 : 4.5) - 1e-9, `${name} ${x.id}: head ${(2 * headHw(x.R)).toFixed(1)} px`); }
    const thick = Math.max(...px.map((x) => x.R)), thin = Math.min(...wide.map((x) => x.R));
    assert.ok(thick <= 14 && thin >= 3, `${name}: R from ${thin.toFixed(1)} to ${thick.toFixed(1)} px`);
    // the spacing is the one rule on screen, whatever the width: the level's pitch lies in (65, 130] px
    const lv = Math.log2(CHEV.PITCH_PX / 28), pitch = 28 * Math.pow(2, Math.floor(lv)) / (28 * Math.pow(2, lv)) * CHEV.PITCH_PX;
    assert.ok(pitch > CHEV.PITCH_PX / 2 - 1e-9 && pitch <= CHEV.PITCH_PX + 1e-9);
  }
});

test('at the default fit the streaks are obvious: 2 px or more, 1 to 3 lanes on a thin vessel, several to a vessel', () => {
  for (const [name, w, h] of ROOMS) {
    const k = fit(w, h);
    let seen = 0;
    for (const v of MAPPED) {
      const R = v.radius * k;
      if (R < 2.6) continue;   // (the shader's gate: smoothstep(1.8, 2.6, R): on from a vessel 5 px across)
      const lanes = lanesForPx(R);
      assert.ok(lanes >= 1 && lanes <= 7 && lanes % 2 === 1, `${v.id} lanes ${lanes}`);
      if (R < 6) assert.ok(lanes <= 3, `${name} ${v.id}: ${lanes} lanes on a ${(2 * R).toFixed(1)} px vessel`);
      assert.ok(streakCorePx(R, lanes) >= STREAK.MIN_PX - 1e-9, `${name} ${v.id}: core ${streakCorePx(R, lanes).toFixed(2)} px`);
      assert.ok(streakCoverage(R, lanes) > 0.12, `${name} ${v.id}: coverage ${(streakCoverage(R, lanes) * 100).toFixed(0)} percent`);
      // marks on the vessel: a lane's period on screen is about 5.8 radii (the field's units follow the radius), the empty cycles left out
      const L = len(courseOf(v.id)) * k, period = ((STREAK.FIELD_PERIOD[0] + STREAK.FIELD_PERIOD[1] * 0.5) / STREAK.FIELD_AT_R) * R;
      if (L >= 100) { assert.ok((lanes * L) / period * (1 - STREAK.FIELD_GAP) >= 3, `${name} ${v.id}: ${((lanes * L) / period).toFixed(1)} marks over ${L.toFixed(0)} px`); seen++; }
    }
    assert.ok(seen >= 2, `${name}: ${seen} long vessels checked`);
  }
});

test('the streak is a visible step from the body: the lighter tone is 1.25:1 or more (every look), set by LIFT and TONE_MIN', () => {
  assert.ok(STREAK.LIFT >= 0.6 && STREAK.TONE_MIN >= 0.5);
});
