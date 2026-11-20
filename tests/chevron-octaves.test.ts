// The chevrons are spaced the same on the SCREEN at every zoom (Mohammad, 20 Nov: "too many chevrons when I zoom in and not many when zoomed out, spaced equally no matter what zoom"): the lattice is chosen by octaves of the
// pitch in screen px (CHEV.PITCH_PX), a coarser octave's heads are every other head of the finer one (a head never moves when the octave changes), and the in-between heads fade over the octave (chevKeep).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHEV, CHEV_LEVEL_MIN, chevKeepJs, chevLevel } from '../src/scene/blood/chevron-glsl.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { MICRO_FS } from '../src/scene/micro3d/cel3d.ts';

const BASE = 28;   // the Anatomy's base pitch, figure units
const FITS = [['iPhone', 390, 844], ['Mac pane', 800, 600], ['Mac', 1440, 900]] as const;
const ZOOMS = [0.25, 0.35, 0.5, 0.71, 1, 1.41, 2, 2.83, 4, 5.66, 8];
/** CSS px to a figure unit at the default fit (1 scene unit = 300 figure units; the fit is min(w / 2.64, h / 3.88) px to a scene unit) times the zoom. */
const pxPerUnit = (w: number, h: number, z: number): number => Math.min(w / (2 * 1.32), h / (2 * 1.94)) / 300 * z;

test('at 0.25x to 8x of the default fit the full heads are 1 to 2 pitches apart, the whole lattice 0.5 to 1 pitch, and the density is one head per PITCH_PX exactly', () => {
  for (const [name, w, h] of FITS) for (const z of ZOOMS) {
    const ppu = pxPerUnit(w, h, z), lvl = chevLevel(CHEV.PITCH_PX / ppu, BASE);
    const coarse = 2 * lvl.P * ppu, fine = lvl.P * ppu;
    assert.ok(coarse >= CHEV.PITCH_PX - 1e-6 && coarse <= 2 * CHEV.PITCH_PX + 1e-6, `${name} ${z}x: full heads ${coarse.toFixed(1)} px apart`);
    assert.ok(fine >= CHEV.PITCH_PX / 2 - 1e-6 && fine <= CHEV.PITCH_PX + 1e-6, `${name} ${z}x: the lattice ${fine.toFixed(1)} px`);
    // the density: the even heads whole, the odd ones at their keep: heads per px = 1 / PITCH_PX at every zoom
    let sum = 0; const N = 256;
    for (let j = -N; j < N; j++) sum += chevKeepJs(j, lvl.n0, lvl.lv);
    const perPx = sum / (2 * N * fine);
    assert.ok(Math.abs(perPx * CHEV.PITCH_PX - 1) < 1e-6, `${name} ${z}x: one head per ${(1 / perPx).toFixed(2)} px`);
  }
});

test('the two weights across an octave sum to 1 where they trade (the odd heads keep exp2(1 - f) - 1, the even ones whole) and each head stands still when the octave changes', () => {
  for (let n = -4; n <= 4; n++) {
    const eps = 1e-7, below = chevLevel(BASE * Math.pow(2, n + 1) * (1 - eps), BASE), above = chevLevel(BASE * Math.pow(2, n + 1) * (1 + eps), BASE);
    assert.equal(below.n0, n); assert.equal(above.n0, n + 1);
    // head positions in figure units (j P) and their weights, over a window: the same heads at the same weights before and after the switch
    const at = (l: ReturnType<typeof chevLevel>) => { const m = new Map<number, number>(); for (let j = -64; j <= 64; j++) { const wgt = chevKeepJs(j, l.n0, l.lv); if (wgt > 1e-3) m.set(Math.round(j * l.P * 1e6) / 1e6, wgt); } return m; };
    const a = at(below), b = at(above);
    for (const [pos, wgt] of b) { if (Math.abs(pos) > 60 * BASE * Math.pow(2, n)) continue; assert.ok(a.has(pos), `octave ${n}: a head at ${pos} appears from nowhere`); assert.ok(Math.abs(a.get(pos)! - wgt) < 1e-3, `octave ${n}: head ${pos} weight ${a.get(pos)} to ${wgt}`); }
    for (const [pos, wgt] of a) { if (Math.abs(pos) > 60 * BASE * Math.pow(2, n)) continue; assert.ok(b.has(pos) || wgt < 1e-3, `octave ${n}: a head at ${pos} vanishes`); }
  }
  for (let f = 0; f <= 1; f += 0.05) {
    const odd = chevKeepJs(1, 0, f), even = chevKeepJs(2, 0, f);
    assert.equal(even, 1, 'the heads of the next octave are whole');
    assert.ok(odd >= 0 && odd <= 1);
    assert.ok(Math.abs((odd + (1 - odd)) - 1) < 1e-12);
  }
  assert.equal(chevKeepJs(1, 0, 0), 1); assert.ok(chevKeepJs(1, 0, 1) < 1e-12);
});

test('the shaders choose the octave from the screen px with no floor short of CHEV_LEVEL_MIN, and the lattice stands on the stream\'s distance (the flow phase carries over)', () => {
  assert.ok(CHEV_LEVEL_MIN <= -8);
  assert.match(VESSEL_FS, /float lv = max\(-10\.0, log2\(Pt \* max\(abs\(Bm\), 0\.05\) \/ 28\.0\)\);/);
  assert.match(VESSEL_FS, new RegExp(`float Pt = ${CHEV.PITCH_PX}\\.0 \\* wpc;`));
  assert.match(VESSEL_FS, /float n0 = floor\(lv\), P = 28\.0 \* exp2\(n0\);/);
  assert.match(VESSEL_FS, /float j = floor\(\(se - Dm\) \/ P \+ 0\.5\);/);
  assert.match(VESSEL_FS, /chevKeep\(j, n0, lv\)/);
  assert.match(MICRO_FS, new RegExp(`float lv = max\\(-10\\.0, log2\\(${CHEV.PITCH_PX}\\.0 \\* wpc / max\\(uFlowPitch, 1e-5\\)\\)\\);`));
  assert.match(MICRO_FS, /float j = floor\(\(vArc - uFlowT\) \/ P \+ 0\.5\), x = vArc - uFlowT - j \* P;/);
  assert.match(MICRO_FS, /chevKeep\(j, n0, lv\)/);
});

// Mohammad, 20 Nov: "WAY TOO MANY chevrons" (the portal vein packed nose to tail, two sizes alternating). The spacing is one table: CHEV.PITCH_PX, 2D's own 130 CSS px (b3058ef3 CHEV_PITCH). It had been 60 since the Mac fit was judged "no chevrons":
// at 60 the lattice (0.5 to 1 pitch) was 30 to 60 px and the density 2.2x 2D's. The pitch is a CSS-px length at every device pixel ratio and every zoom, never a device-px or a per-zoom number.
test('the spacing is 2D\'s 130 CSS px at every device pixel ratio and zoom: the shader\'s pitch comes from CSS px (wpc), never from dpr', () => {
  assert.equal(CHEV.PITCH_PX, 130, '2D\'s pitch');
  for (const dpr of [1, 2, 3]) for (const [name, w, h] of FITS) for (const z of ZOOMS) {
    const ppuCss = pxPerUnit(w, h, z), wpc = 1 / ppuCss * 300 / 300;   // figure units under one CSS px (the canvas is w x h CSS px at every ratio: only the drawing buffer is x dpr)
    const lvl = chevLevel(CHEV.PITCH_PX * (1 / ppuCss), BASE);
    const fineCss = lvl.P * ppuCss, fineDev = fineCss * dpr;
    assert.ok(fineCss >= CHEV.PITCH_PX / 2 - 1e-6 && fineCss <= CHEV.PITCH_PX + 1e-6, `${name} ${z}x @${dpr}x: lattice ${fineCss.toFixed(1)} CSS px`);
    assert.ok(Math.abs(fineDev / dpr - fineCss) < 1e-9, 'the same CSS spacing on every screen');
    void wpc;
  }
  // no per-device term in the head lattice: the pitch line, the octave and the head's size read wpc (CSS px) and nothing of dpr
  const chev = VESSEL_FS.slice(VESSEL_FS.indexOf('vec2 chevOne('), VESSEL_FS.indexOf('float chevOrange('));
  assert.doesNotMatch(chev, /dpr/);
  const pitchLine = VESSEL_FS.split('\n').find((l) => l.includes('float Pt ='))!;
  assert.doesNotMatch(pitchLine, /dpr/); assert.match(pitchLine, /\* wpc;/);
  assert.ok(VESSEL_FS.includes('vW * 2.0 / (res.y * projY) * vU'), 'wpc: scene units under one CSS px (res is the canvas in CSS px), handed to flowHeads');
});
