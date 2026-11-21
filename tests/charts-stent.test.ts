import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, dropIn, dropLayout, dropTop, gateIndex, keyCols, printedParts, readStent, sideLayout, stentOutline, stentSpan, stentState, stentTitle, ten, traceFit, traceFor, traceIn, traceLayout, xAt,
} from '../src/ui/charts/stent/model.ts';
import { dropFrame, traceFrame, unitSize } from '../src/ui/charts/stent/frame.ts';
import { tipsFigureFrame } from '../src/ui/tests/ir/tips-figure.ts';
import { stentEntry } from '../src/ui/charts/stent/entry.ts';
import { stentWaist, lossShares, stenosisText, waistText } from '../src/ui/charts/stent/stent-waist.generated.js';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';

// The numbers below were computed once by running the 2D app's own functions (stent-drop-pic.js, stent-trace-pic.js, tool-stent.js, stent-waist.js, lifted out with the DOM stubbed) at the same inputs.
const near = (a: number, b: number, m = '', e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${m}: ${a} vs ${b}`);
const GEO = { len: 8, waist: 3, trans: 1, red: 0.2 };
const FP = { ppg: 11.8, ivc: 4.5, tipsFlow: 1.5, tipsDp: 5.6, tipsG0: 126, tipsG1: 188, tipsG2: 301, tipsTract: 1.1, tipsWall: 0.9, tipsEnds: 1, tipsJet: 2.6, tipsLumen: 5, tipsVel: 301, tipsD: 10, tipsLen: 8, tipsWaistLen: 3, tipsTrans: 1, tipsRed: 0.2, tipsStn: 0.5, tipsStnSite: 'distal' };

test('the rows of the pictures follow the words\' size as the 2D layouts do', () => {
  const S = sideLayout(12);
  assert.deepEqual({ ...S }, { pxCm: 26, pxMm: 3.1, x0: 44, span: 232, stubH: 31, labY: 8.2, dimY: 18.4, siteY: 30.4, cy: 54.4, nameY: 79.5, numY: 86, gateTop: 77.8, capY: 101, keyY: 116, bandY: 66.4, bandH: S.bandH, h: 127.4 });
  near(S.bandH, 26.8, 'bandH', 1e-9);
  const D = dropLayout(12);
  near(D.yT, 18.8, 'yT'); near(D.yB, 68.8, 'yB'); near(D.baseY, 80.6, 'baseY'); near(D.nameY, 100.8, 'nameY'); near(D.valY, 117.4, 'valY'); near(D.totY, 134.2, 'totY'); near(D.h, 144.4, 'h');
  const { lefts, kf } = keyCols(12);
  near(kf, 11.52, 'kf'); near(lefts[0]!, 6); near(lefts[1]!, 68.9824, 'l1'); near(lefts[2]!, 118.1408, 'l2'); near(lefts[3]!, 201.8592, 'l3'); near(lefts[4]!, 271.7536, 'l4'); near(lefts[5]!, 314, 'right edge');
  assert.deepEqual(stentSpan(), [44, 276]);
  assert.deepEqual([dropTop(3), dropTop(8.1), dropTop(50), dropTop(11.8)], [8, 12, 40, 12]);
  assert.deepEqual([gateIndex(1 / 6, 8), gateIndex(0.5, 6), gateIndex(5 / 6, 10)], [50, 80, 113]);
  assert.deepEqual([xAt(-1.5, 8, 44, 276, 24), xAt(4, 8, 44, 276, 24), xAt(9.5, 8, 44, 276, 24)], [34, 160, 296]);
  const T = traceLayout(12);
  near(T.X0, 6 + 12 * 0.6 * 3 + 2, 'X0'); near(T.base, T.top + 92, 'base');
});

test('the printed parts add up to the stent\'s own drop, the lumen outline is the 2D one', () => {
  const t: number[] = [];
  assert.equal(printedParts([1.1, 1, 0.9, 2.6], t), 56); assert.deepEqual(t, [11, 10, 9, 26]);
  const o: number[] = [];
  assert.equal(printedParts([0.333, 0.333, 0.334], o), 10); assert.deepEqual(o, [3, 3, 4], 'the largest remainder gets the leftover tenth');
  const e = stentOutline(44, 232, 80, 31, 0, 0.5, GEO, 5 / 6);
  assert.equal(e.length, 4 * 97);
  near(e[0]!, 44); near(e[1]!, 64.5, 'top at the portal end'); near(e[2 * 48]!, 160); near(e[2 * 48 + 1]!, 67.6, 'top mid stent'); near(e[2 * 96]!, 276); near(e[2 * 96 + 1]!, 64.5);
  near(e[2 * 97 + 1]!, 95.5, 'the bottom edge starts at the hepatic end'); near(e[2 * 144 + 1]!, 92.4, 'bottom, mid stent');
});

test('the trace along the stent is the engine\'s, written where the 2D picture puts it', () => {
  const st = stentState(FP, 'TIPS', null);
  assert.equal(st.have, true);
  near(st.dp, 5.6, 'dp'); near(st.ppg, 11.8, 'ppg'); near(st.out, 6.2, 'out'); assert.deepEqual(st.g, [126, 188, 301]);
  const o = traceFor(traceIn(st));
  near(o.P[0]!, 11.8, 'P at the portal end', 1e-9); near(o.P[80]!, 6.649779922936858, 'P mid', 1e-9); near(o.P[160]!, 0, 'P at the IVC', 1e-9);
  near(o.loss[80]!, 4.361108249002341, 'loss mid'); near(o.loss[160]!, 11.8, 'loss at the end'); near(o.v[80]!, 49.735919716217296, 'v mid');
  assert.deepEqual([...o.sites].map((v) => +v.toFixed(4)), [-1.5125, 0.0625, 6.7125, 7.9375, 9.5125]);
  assert.deepEqual([...o.i], [17, 35, 111, 125, 143]);
  near(o.cJet[160]!, 2.6, 'the jet takes its share'); near(o.cWall[160]!, 0.9, 'the friction takes its share'); near(o.cOut[80]!, 3.1, 'the outside takes half the rest by mid stent');
  const R = traceFit(traceIn(st), st.ivc);
  assert.equal(R.pHi, 20, 'the next multiple of 4 over the PPG plus the IVC pressure'); assert.ok(R.vHi >= 50 && [20, 40, 60, 80, 100, 150, 200, 300, 400, 600].includes(R.vHi) || R.vHi % 100 === 0);
});

test('the staircase: each part\'s mmHg, the PPG\'s word and the scale', () => {
  const st = stentState(FP, 'TIPS', null);
  const a = dropIn(st, { to: 'ppg' });
  assert.deepEqual(a.vals, [6.2, 1.1, 1, 0.9, 2.6]); assert.deepEqual(a.words, ['6.2', '1.1', '1.0', '0.9', '2.6']);
  assert.equal(a.ppgWord, 'PPG 11.8'); assert.equal(a.totWord, 'Across the stent 5.6 mmHg'); assert.equal(a.pHi, 12); assert.equal(a.on, 1);
  const b = dropIn(st, { to: 'stent' });
  assert.equal(b.on, 0); assert.equal(b.vals[0], 0, 'the veins outside are not shown from the stent\'s own drop'); assert.equal(b.ppgWord, 'PPG 5.6'); assert.equal(b.pHi, 8);
  assert.equal(dropIn(st, { max: 20 }).pHi, 20);
  assert.equal(dropIn(st, { max: 2 }).pHi, 6, 'a slide\'s own top is held to 6 to 40 mmHg');
  assert.deepEqual([...COLS], ['out', 'tract', 'ends', 'wall', 'jet']);
});

test('what the card reads: a slide\'s fingerprint, a live frame, and no stent', () => {
  const live = { metrics: { ppg: 10, ivc: 4, tips: { flow: 2, dp: 3, peaks: [100, 140, 120], parts: { tract: 1, wall: 1, entry: 0.5, jet: 0.4, inlet: 0.1 }, dWaist: 9.5, vPeak: 140, d: 10, end: 0, red: 0, site: 'distal', geom: { len: 8, waist: 1, trans: 0 } } } };
  const r = readStent(live, 'TIPS')!;
  assert.equal(r.jet, 0.5, 'the jet and the inlet are one part'); assert.equal(r.ends, 0.5); assert.equal(r.gLen, 8); assert.equal(r.ppg, 10);
  assert.equal(readStent(FP, 'TIPS')!.gWaist, 3);
  assert.equal(readStent({ ppg: 8 }, 'TIPS'), null, 'a fingerprint with no stent in');
  assert.equal(readStent(live, 'DIPS'), null);
  const none = stentState(null, 'DIPS', null);
  assert.equal(none.have, false); assert.equal(none.d, 8);
  assert.equal(stentTitle({ vessel: 'DIPS', show: ['card'] }), 'DIPS, the stent');
  assert.equal(stentTitle({ vessel: 'TIPS', show: ['trace'] }), 'TIPS, along the stent');
  assert.equal(stentTitle({ vessel: 'TIPS', show: ['loss'] }), 'TIPS, where the pressure goes');
  assert.equal(stentTitle(null), 'TIPS, side view');
  assert.equal(ten(3.04), '3.0'); assert.equal(ten(-1), '0.0');
});

test('the waist and the loss shares are the 2D app\'s (copied file)', () => {
  const fn = stentWaist('TIPS', GEO, 0.5, 5 / 6, 40, 300);
  const want = [1, 1, 0.822073479674796, 0.7999999999999999, 0.822073479674796, 0.5, 1, 1];
  [0, 0.1, 0.3, 0.5, 0.7, 0.8333, 0.95, 1].forEach((u, i) => near(fn(u), want[i]!, `waist at ${u}`, 1e-6));
  const o = lossShares({ total: 5.6, entry: 1, jetEnd: 2.6, jetWaist: 0.3, jet: 2.6, inlet: 0 }, GEO, 5 / 6, 1, {});
  near(o.jet, 0.46428571428571436, 'jet'); near(o.at, 0.8958333333333334, 'at'); near(o.jet2, 0.053571428571428575, 'jet2'); near(o.at2, 0.8125, 'at2'); near(o.ends, 0.17857142857142858, 'ends');
  assert.equal(stenosisText({ id: 'TIPS', shunt: 'tips' }, { tips: { d: 10 }, stenosis: { TIPS: 0.5 }, stenosisSite: { TIPS: 'distal' } }), 'Distal stenosis 10.0 to 5.0 mm');
  assert.equal(waistText({ id: 'TIPS', shunt: 'tips' }, { tips: { d: 10 }, stentGeom: { TIPS: GEO } }), 'Waist 10.0 to 8.0 mm × 3.0 cm');
});

test('every look and width: the side view, the traces and the staircase are sound, words 12 px or more', () => {
  const open = stentState(FP, 'TIPS', null), none = stentState(null, 'TIPS', null);
  for (const st of [open, none, stentState({ ...FP, tipsStn: 0, tipsRed: 0 }, 'DIPS', null)]) {
    eachLook((look) => {
      for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [330, 'phone-landscape'], [430, 'tablet-portrait'], [240, 'phone-portrait']] as const) {
        const c = ctxOf(look, w, d);
        const frames = [tipsFigureFrame(st, c, { lens: 'velocity', labels: true, card: true }), tipsFigureFrame(st, c, { lens: 'pressure', labels: true, chart: true, gate: 'mid' }), ...(['pressure', 'energy', 'velocity'] as const).map((pick) => traceFrame(st, c, { pick })), dropFrame(st, c, { to: 'ppg' }), dropFrame(st, c, { to: 'stent', max: 16 })];
        for (const f of frames) { judge(f, look, { onCard: false }); assert.ok(f.h > 30 && f.h < 600, `${look} ${w}: height ${f.h}`); }
      }
    });
  }
  // the words are the 2D words
  const c = ctxOf('light', 330);
  const say = (f: { shapes: readonly { k: string }[] }) => (f.shapes as TextShape[]).filter((s) => s.k === 'text').map((s) => s.s);
  const side = say(tipsFigureFrame(open, c, { lens: 'velocity', labels: true, card: true }));
  for (const s of ['RPV', 'RHV', '126', '188', '301']) assert.ok(side.includes(s), `the stent figure says "${s}": ${side.join(' | ')}`);
  assert.ok(side.some((w) => w.includes('5.0 mm')), 'the figure names the narrowed lumen');
  const drop = say(dropFrame(open, c, { to: 'ppg' }));
  for (const s of ['PPG 11.8', 'Portal vein', 'Stent', 'IVC', 'Outside', 'Tract', 'In and out', 'Friction', 'Jet', '6.2', '2.6', 'Across the stent 5.6 mmHg']) assert.ok(drop.includes(s), `the staircase says "${s}": ${drop.join(' | ')}`);
  const trace = say(traceFrame(open, c, { pick: 'pressure' }));
  for (const s of ['Pressure, mmHg (absolute)', '1 Portal  2 Inlet  3 Waist  4 Outlet  5 IVC', 'IVC 4.5']) assert.ok(trace.includes(s), `the trace says "${s}": ${trace.join(' | ')}`);
  assert.ok(unitSize(ctxOf('light', 240)).fs * (240 / 320) >= 12 - 1e-9, 'a narrow card still sets its words at 12 px');
  assert.equal(stentEntry.status, 'done');
});

test('one stent figure everywhere: the slides\' stent card draws the TIPS card\'s tipsFigureFrame, never a picture of its own', async () => {
  const { readFileSync } = await import('node:fs');
  const card = readFileSync(new URL('../src/ui/charts/stent/StentCard.tsx', import.meta.url), 'utf8');
  assert.match(card, /tipsFigureFrame\(/, 'the stent card draws the shared figure');
  assert.doesNotMatch(card, /sideFrame/, 'no second side view');
  const frame = readFileSync(new URL('../src/ui/charts/stent/frame.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(frame, /export function sideFrame/, 'the old side view is gone');
  // a slide\'s gate band is drawn behind the figure, and only when the slide names a third
  const c = ctxOf('light', 330), open = stentState(FP, 'TIPS', null);
  const bands = (g: 'mid' | null) => tipsFigureFrame(open, c, { lens: 'velocity', labels: true, card: true, gate: g }).shapes.length;
  assert.equal(bands('mid'), bands(null) + 1, 'the Doppler third adds one band');
});
