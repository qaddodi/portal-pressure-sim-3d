// At the DEFAULT FIT the flow marks are seen (Mohammad, 20 Nov, Dark, normal view: "no chevrons and I can barely see streaks"). The root cause: the heads came in only on a tube from 5.8 CSS px of radius (12 px across) and the
// streaks' lanes were cut by the radius in 2D units (7 lanes of 1 px in a 8 px vessel); at the default fit the real network is 6 to 10 px across. This measures the on-screen size of the heads and streaks over the REAL network
// (its radii and courses) at the default fit of the Anatomy (the 'play' shot, kept whole in the room: iPhone 390 wide, a Mac window), and pins minimums.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPPED, courseOf } from '../src/scene/vessels/network.ts';
import { SHOTS } from '../src/scene/camera/shots.ts';
import { CHEV, CHEVRON_GLSL, chevHalfWidthPx } from '../src/scene/blood/chevron-glsl.ts';
import { STREAK, lanesForPx, streakCorePx, streakToneJs } from '../src/scene/blood/streak-glsl.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { LENS_SHARED } from '../src/scene/lenses/tokens.copied.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { PALETTES, contrast } from '../src/scene/palette.ts';
import { celTubeBase } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { MICRO_FS } from '../src/scene/micro3d/cel3d.ts';

/** CSS px to a scene unit at the default fit: the shot's half extents kept whole in the window (the room solver's rule at a near-orthographic lens). The smaller rooms are the window less its chrome and cards. */
const fit = (w: number, h: number): number => Math.min(w / (2 * SHOTS.play.half[0]), h / (2 * SHOTS.play.half[1]));
const ROOMS: [string, number, number][] = [['iPhone 390 x 844', 390, 844], ['Mac 800 x 600', 800, 600], ['Mac 1440 x 900', 1440, 900], ['iPhone room 390 x 560', 390, 560], ['Mac pane room 800 x 520', 800, 520]];
/** The head's size in CSS px by the shader's own rule (vessels/shaders.ts chevOne). */
const headHw = chevHalfWidthPx;
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const headShown = (R: number): number => smooth(CHEV.MIN_R_PX, CHEV.MIN_R_PX + 0.6, R);
const len = (pts: readonly (readonly number[])[]): number => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!); return s; };
const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v * 255))).toString(16).padStart(2, '0')).join('');
const h2 = (s: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255) as [number, number, number];
/** The twin of chevInk (blood/chevron-glsl.ts): near black on a lit tone lighter than 0.26 (linear luminance), cream on a darker one. */
const chevCore = (lit: readonly number[]): [number, number, number] => {
  const L = 0.2126 * lit[0]! ** 2.2 + 0.7152 * lit[1]! ** 2.2 + 0.0722 * lit[2]! ** 2.2;
  const dark = h2(LENS_SHARED.chevron), light = h2(LENS_SHARED.chevronLight);
  void lit; return L < 0.26 ? light : dark.map((v) => v * 0.5) as [number, number, number];
};

test('the heads follow the CHEV table: 55 percent of the lumen wide (4 px at least on a thin tube, never over 60 percent), 1.4 x as long as wide, sharp, centred, from a tube 3 px across', () => {
  assert.ok(CHEV.PITCH_PX >= 55 && CHEV.PITCH_PX <= 65 && CHEV.MIN_R_PX <= 1.5);
  assert.ok(CHEV.SHARE === 0.55 && CHEV.SHARE_MAX === 0.6 && CHEV.MIN_W_PX === 4 && CHEV.LEN_OF_W >= 1.3 && CHEV.LEN_OF_W <= 1.5 && CHEV.EDGE_PX <= 0.7 && CHEV.RING_PX <= 1);
  assert.match(VESSEL_FS, /float Pt = 60\.0 \* wpc;/);
  assert.match(VESSEL_FS, /smoothstep\(1\.5 \* wpc, 2\.1 \* wpc, R\)/);
  assert.match(VESSEL_FS, /float hw = chevHw\(R, wpc\) \* chevSize\(kp\), L = 2\.8 \* hw;/);
  assert.match(CHEVRON_GLSL, /float chevHw\(float R, float wpc\) \{ return min\(0\.6 \* R, max\(0\.55 \* R, 2\.0 \* wpc\)\); \}/);
  assert.match(CHEVRON_GLSL, /float L = 2\.8 \* hw, tip = 0\.55 \* L/);
  assert.match(CHEVRON_GLSL, /float c = 1\.0 - smoothstep\(-0\.35 \* px, 0\.35 \* px, d\);/, 'an edge ramp of 0.7 px');
  assert.match(CHEVRON_GLSL, /float rw = 1\.0 \* px;/, 'a ring of 1 px at most, no halo');
  assert.match(VESSEL_FS, /chevInk\(celTubeBase\(base\), markDark, markLight\)/, 'the tone follows the tube as drawn');
  assert.match(MICRO_FS, /float hw = chevHw\(R, wpc\) \* chevSize\(kp\);/, 'the lobule\'s and the sinusoid\'s micro tubes take the same head');
  assert.match(MICRO_FS, /smoothstep\(1\.5 \* wpc, 2\.1 \* wpc, R\)/);
  for (const R of [1.6, 2, 2.5, 3, 3.3, 3.64, 4.5, 6, 12, 40]) {
    const w = 2 * headHw(R), lumen = 2 * R;
    assert.ok(w <= CHEV.SHARE_MAX * lumen + 1e-9, `R ${R}: ${w.toFixed(2)} px is ${(100 * w / lumen).toFixed(0)} percent of the lumen`);
    assert.ok(w >= Math.min(CHEV.MIN_W_PX, CHEV.SHARE_MAX * lumen) - 1e-9, `R ${R}: ${w.toFixed(2)} px wide`);
    if (R >= 3.64) assert.ok(Math.abs(w - CHEV.SHARE * lumen) < 1e-9, `R ${R}: 55 percent of the lumen`);
    assert.ok(lumen - w >= 0.4 * lumen - 1e-9, `R ${R}: clear blood both sides (at least 20 percent of the lumen each), never touching the ink`);
    const length = CHEV.LEN_OF_W * w;
    assert.ok(length / w >= 1.3 && length / w <= 1.5);
  }
  // the point: half angle atan(hw / L), L = 2.8 hw: 19.7 degrees, an apex of about 39 degrees
  assert.ok(Math.atan(1 / (2 * CHEV.LEN_OF_W)) * 360 / Math.PI < 45);
  assert.ok(headShown(1.4) === 0 && headShown(2.1) === 1, 'none only under 3 px across');
  // the lattice: heads are added at the level's pitch Pt and the finer ones have all left by 1.33 Pt (chevKeep: odd heads keep exp2(1 - f) - 1 of themselves at f of a level, gone from f = 0.585)
  const lo = CHEV.PITCH_PX * Math.pow(2, -0.585), hi = CHEV.PITCH_PX * Math.pow(2, 0.415);
  assert.ok(lo >= 39.9 && hi <= 80.1, `spacing ${lo.toFixed(0)} to ${hi.toFixed(0)} px`);
});

test('at the default fit every labelled vessel 4.2 px across or more shows a head 55 percent of its lumen (4 px at least, 60 percent at most), over the real network', () => {
  for (const [name, w, h] of ROOMS) {
    const k = fit(w, h);
    const px = MAPPED.map((v) => ({ id: v.id, label: v.label, R: v.radius * k }));
    const carried = px.filter((x) => x.label && x.R >= 2.1);
    assert.ok(carried.length >= 10, `${name}: ${carried.length} labelled vessels 4.2 px across or more`);
    for (const x of carried) { assert.equal(headShown(x.R), 1, `${name} ${x.id}`); const wd = 2 * headHw(x.R); assert.ok(wd <= 1.2 * x.R + 1e-9 && wd >= Math.min(4, 1.2 * x.R) - 1e-9, `${name} ${x.id}: head ${wd.toFixed(1)} px in ${(2 * x.R).toFixed(1)}`); }
    for (const x of px.filter((y) => headShown(y.R) < 1)) assert.ok(x.R < 2.1, `${name} ${x.id}: none only on tubes under 3 px across (R ${x.R.toFixed(2)})`);
    const thick = Math.max(...px.map((x) => x.R));
    assert.ok(thick <= 16, `${name}: widest R ${thick.toFixed(1)} px`);
  }
});

test('the head is 3:1 or more against the tube on the lit side and 2.5:1 or more on the shade side, in every look (cream below 0.26 of luminance, near black above; the dark ring adds the edge)', () => {
  for (const id of LOOK_IDS) {
    const p = PALETTES[id], dark = id === 'dark' || id === 'navy' || id === 'black';
    const colours = [p.tones.portal, p.tones.sys, ...(LENS_SHARED.origin as readonly string[])];
    for (const hx of colours) {
      const lit = celTubeBase(h2(hx), dark), core = chevCore(lit), shade = lit.map((x) => x * (1 - CEL_STYLE.SHADE));
      const c = contrast(hex(core), hex(lit)), cs = contrast(hex(core), hex(shade));
      assert.ok(c >= 3, `${id} ${hx}: head vs the lit tube ${c.toFixed(2)}:1`);
      assert.ok(cs >= 2.5, `${id} ${hx}: head vs the shade ${cs.toFixed(2)}:1`);
    }
  }
});

test('at the default fit the streaks are sleek and seen: a core of about 1 px, 24 to 60 px long, 1 lane on a thin vessel, a few to a long vessel, none on a hairline', () => {
  for (const [name, w, h] of ROOMS) {
    const k = fit(w, h);
    let seen = 0;
    for (const v of MAPPED) {
      const R = v.radius * k, lanes = lanesForPx(R);
      if (R < STREAK.MIN_R_PX) { assert.equal(lanes, 0, `${v.id}: none under 3.5 px across`); continue; }
      assert.ok(lanes === 1 || lanes === 3 || lanes === 5, `${v.id} lanes ${lanes}`);
      if (R < 4) assert.equal(lanes, 1, `${name} ${v.id}: ${lanes} lanes on a ${(2 * R).toFixed(1)} px vessel`);
      assert.ok(streakCorePx(R, lanes, true) >= 0.8 && streakCorePx(R, lanes, false) <= (R < STREAK.WIDE_R_PX[0] ? 1.1 : STREAK.CORE_MAX_PX), `${name} ${v.id}: core ${streakCorePx(R, lanes, true).toFixed(2)} px`);
      const meanLen = STREAK.FIELD_LEN_R * R;   // (px: the field's 5 units to a radius)
      if (R >= 2 && R <= 5) assert.ok(meanLen >= 24 && meanLen <= 60, `${name} ${v.id}: a streak ${meanLen.toFixed(0)} px long`);
      const L = len(courseOf(v.id)) * k, period = ((STREAK.FIELD_PERIOD[0] + STREAK.FIELD_PERIOD[1] * 0.5) / STREAK.FIELD_AT_R) * R;
      if (L >= 100) { assert.ok((lanes * L) / period * (1 - STREAK.FIELD_GAP) >= 0.4, `${name} ${v.id}: ${((lanes * L) / period).toFixed(1)} streaks over ${L.toFixed(0)} px`); seen++; }
    }
    assert.ok(seen >= 2, `${name}: ${seen} long vessels checked`);
  }
});

test('on a tube 8 px across there are visibly several streaks along 200 px, with a 1 px core, and the tint is 1.2:1 to 1.5:1 against the lit body at the middle of its range, in Light and Dark', () => {
  const R = 4, lanes = lanesForPx(R), period = ((STREAK.FIELD_PERIOD[0] + STREAK.FIELD_PERIOD[1] * 0.5) / STREAK.FIELD_AT_R) * R;
  assert.equal(lanes, 3);
  assert.ok((lanes * 200) / period * (1 - STREAK.FIELD_GAP) >= 4, `${((lanes * 200) / period).toFixed(1)} streaks over 200 px`);
  assert.ok(streakCorePx(R, lanes, true) >= 0.8 && STREAK.CORE_PX === 1);
  for (const id of ['light', 'dark'] as const) {
    const p = PALETTES[id];
    for (const v of ['portal', 'sys'] as const) {
      const lit = celTubeBase(h2(p.tones[v]), id === 'dark');
      const mid = contrast(hex(streakToneJs(lit, [1, 1, 1], 0.5, 0.5)), hex(lit)), top = contrast(hex(streakToneJs(lit, [1, 1, 1], 1, 0.5)), hex(lit));
      // (20 Nov: the eyes measured the streaks on screen at +8 to +12 percent over the body on the trunk and none on the branches, "only just noticeable"; the target is 15 to 20 percent, so the model's step is a third stronger)
      assert.ok(mid >= 1.2 && mid <= 1.5 && top >= 1.25 && top <= 1.7, `${id} ${v}: ${mid.toFixed(2)} to ${top.toFixed(2)}:1`);
    }
  }
});
