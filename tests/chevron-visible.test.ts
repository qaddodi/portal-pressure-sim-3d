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
import { LENS_SHARED } from '../src/scene/lenses/tokens.copied.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { PALETTES, contrast } from '../src/scene/palette.ts';
import { celTubeBase } from '../src/scene/vessels/cel-ink.ts';

/** CSS px to a scene unit at the default fit: the shot's half extents kept whole in the window (the room solver's rule at a near-orthographic lens). The smaller rooms are the window less its chrome and cards. */
const fit = (w: number, h: number): number => Math.min(w / (2 * SHOTS.play.half[0]), h / (2 * SHOTS.play.half[1]));
const ROOMS: [string, number, number][] = [['iPhone 390 x 844', 390, 844], ['Mac 800 x 600', 800, 600], ['Mac 1440 x 900', 1440, 900], ['iPhone room 390 x 560', 390, 560], ['Mac pane room 800 x 520', 800, 520]];
/** The head's size in CSS px by the shader's own rule (vessels/shaders.ts chevOne). */
const headHw = (R: number): number => Math.min(CHEV.TUBE_SHARE * R, Math.min(CHEV.MAX_HW_PX, Math.max(CHEV.MIN_HW_PX, 0.5 * R)));
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const headShown = (R: number): number => smooth(CHEV.MIN_R_PX, CHEV.MIN_R_PX + 0.6, R);
const len = (pts: readonly (readonly number[])[]): number => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!); return s; };
const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v * 255))).toString(16).padStart(2, '0')).join('');
const h2 = (s: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255) as [number, number, number];
/** The twin of chevInk (blood/chevron-glsl.ts): dark ink on a lit tone lighter than 0.19 (linear luminance), cream on a darker one. */
const chevCore = (lit: readonly number[]): [number, number, number] => {
  const L = 0.2126 * lit[0]! ** 2.2 + 0.7152 * lit[1]! ** 2.2 + 0.0722 * lit[2]! ** 2.2;
  const dark = h2(LENS_SHARED.chevron), light = h2(LENS_SHARED.chevronLight);
  return L < 0.19 ? light : dark.map((v, i) => v * 0.8 + lit[i]! * 0.3 * 0.2) as [number, number, number];
};

test('the shader\'s heads follow the CHEV table: a spacing of 45 to 89 px, from a tube 3 px across, 6 px tall from 6 px across', () => {
  assert.ok(CHEV.PITCH_PX >= 60 && CHEV.PITCH_PX <= 67 && CHEV.MIN_R_PX <= 1.5 && CHEV.MIN_HW_PX >= 3);
  assert.match(VESSEL_FS, /float Pt = 67\.0 \* wpc;/);
  assert.match(VESSEL_FS, /smoothstep\(1\.5 \* wpc, 2\.1 \* wpc, R\)/);
  assert.match(VESSEL_FS, /min\(1\.0 \* R, clamp\(0\.5 \* R, 3\.0 \* wpc, 8\.0 \* wpc\)\)/);
  assert.match(VESSEL_FS, /chevInk\(celTubeBase\(base\), markDark, markLight\)/, 'the tone follows the tube as drawn');
  assert.doesNotMatch(VESSEL_FS, /smoothstep\(5\.8 \* wpc/);
  for (const R of [3, 4, 6, 12]) assert.ok(2 * headHw(R) >= 6 - 1e-9, `R ${R}: head ${(2 * headHw(R)).toFixed(1)} px tall`);
  for (const R of [1.6, 2, 2.5]) assert.ok(2 * headHw(R) >= 2 * R - 1e-9, `R ${R}: as tall as the tube`);
  assert.ok(headShown(1.4) === 0 && headShown(2.1) === 1, 'none only under 3 px across');
  // the lattice: heads are added at the level's pitch Pt and the finer ones have all left by 1.33 Pt (chevKeep: odd heads keep exp2(1 - f) - 1 of themselves at f of a level, gone from f = 0.585)
  const lo = CHEV.PITCH_PX * Math.pow(2, -0.585), hi = CHEV.PITCH_PX * Math.pow(2, 0.415);
  assert.ok(lo >= 40 && hi <= 90, `spacing ${lo.toFixed(0)} to ${hi.toFixed(0)} px`);
});

test('at the default fit every labelled vessel 4.2 px across or more shows heads, 6 px tall (the tube\'s width on a narrower one), over the real network', () => {
  for (const [name, w, h] of ROOMS) {
    const k = fit(w, h);
    const px = MAPPED.map((v) => ({ id: v.id, label: v.label, R: v.radius * k }));
    const carried = px.filter((x) => x.label && x.R >= 2.1);
    assert.ok(carried.length >= 10, `${name}: ${carried.length} labelled vessels 4.2 px across or more`);
    for (const x of carried) { assert.equal(headShown(x.R), 1, `${name} ${x.id}`); assert.ok(2 * headHw(x.R) >= Math.min(6, 2 * x.R) - 1e-9, `${name} ${x.id}: head ${(2 * headHw(x.R)).toFixed(1)} px in ${(2 * x.R).toFixed(1)}`); }
    for (const x of px.filter((y) => headShown(y.R) < 1)) assert.ok(x.R < 2.1, `${name} ${x.id}: none only on tubes under 3 px across (R ${x.R.toFixed(2)})`);
    const thick = Math.max(...px.map((x) => x.R));
    assert.ok(thick <= 16, `${name}: widest R ${thick.toFixed(1)} px`);
  }
});

test('the head is 3:1 or more against the tube it is drawn on, in every look (the lit tone as drawn; the dark ring adds the edge)', () => {
  for (const id of LOOK_IDS) {
    const p = PALETTES[id], dark = id === 'dark' || id === 'navy' || id === 'black';
    const colours = [p.tones.portal, p.tones.sys, ...(LENS_SHARED.origin as readonly string[])];
    for (const hx of colours) {
      const lit = celTubeBase(h2(hx), dark), core = chevCore(lit);
      const c = contrast(hex(core), hex(lit));
      assert.ok(c >= 3, `${id} ${hx}: head vs the lit tube ${c.toFixed(2)}:1`);
    }
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
