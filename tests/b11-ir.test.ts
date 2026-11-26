// The IR pane (Tests > IR): the 2D app's monitor, copied whole and drawn on a recording context, reads what 2D's does at each moment of the HVPG catheter's clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monitorFrame, type MonitorState } from '../src/ui/tests/ir/monitor.ts';
import { HVPG_SCRIPT, STEPS, TB, measureLabel } from '../src/ui/tests/ir/hvpg.ts';
import { T, newWave } from '../src/ui/tests/copied/hvpg-clock.copied.js';
import type { TextShape } from '../src/ui/charts/scene.ts';

const V = { fhvp: 8.2, whvp: 22.6, hvpg: 14.4 };
const words = (f: { shapes: readonly { k: string }[] }) => (f.shapes.filter((s) => s.k === 'text') as TextShape[]).map((s) => s.s);
const st = (ph: MonitorState['ph'], t: number): MonitorState => ({ ph, t, v: V, running: true, wave: newWave(), probing: false });

test('the monitor before the tip is in says so, with the 2D words', () => {
  const key = {};
  const f = monitorFrame(key, HVPG_SCRIPT, st('idle', 0), 460, 240, 'x');
  const w = words(f);
  assert.ok(w.includes('Ready'), w.join('|'));
  assert.ok(w.some((s) => /tracing starts once the tip is in the hepatic vein/i.test(s)), w.join('|'));
});

test('the free sweep reads FHVP, then the balloon and the wedge, then HVPG with its band, as the 2D monitor does', () => {
  const key = {};
  // the tape records as the clock passes: step through the run the way a frame loop would
  let f = monitorFrame(key, HVPG_SCRIPT, st('run', T.free), 460, 240, 'x');
  for (let t = T.free; t <= T.sum + 1200; t += 50) {
    f = monitorFrame(key, HVPG_SCRIPT, st('run', t), 460, 240, 'x');
    if (t === Math.floor((T.inflate - 100) / 50) * 50) assert.ok(words(f).includes('FHVP'), `free at ${t}: ${words(f).join('|')}`);
  }
  const w = words(f);
  assert.ok(w.includes('HVPG'), w.join('|'));
  assert.ok(w.includes('14.4'), `the HVPG number: ${w.join('|')}`);
  assert.ok(w.includes('8.2') && w.includes('22.6'), `both levels' tags: ${w.join('|')}`);
  assert.ok(f.shapes.some((s) => s.k === 'path'), 'the trace is a line');
  assert.ok(f.shapes.length < 1500, `the frame stays small (${f.shapes.length} shapes)`);
});

test('a thrombosed hepatic vein aborts: the probe and the abort words', () => {
  const f = monitorFrame({}, HVPG_SCRIPT, { ...st('abort', TB.abort), probing: true }, 460, 240, 'x');
  assert.ok(words(f).some((s) => /Unable to cannulate/.test(s)), words(f).join('|'));
  assert.ok(words(f).includes('Aborted'));
});

test('the steps are the 2D four; the button says what is happening', () => {
  assert.deepEqual(STEPS.map((s) => s[3]), ['Catheter', 'Free', 'Wedged', 'HVPG']);
  assert.equal(measureLabel(false, false), 'Measure HVPG');
  assert.equal(measureLabel(true, false), 'Measuring…');
  assert.equal(measureLabel(true, true), 'Withdrawing the catheter…');
  assert.equal(measureLabel(false, true), 'Measure again');
});

test('the side words: idle says the 2D line; a finished measurement prints the three readings', async () => {
  const { sideOf, IDLE_CAPTION } = await import('../src/ui/tests/ir/side.ts');
  const v = { fhvp: 4, whvp: 16, hvpg: 12 };
  const idle = sideOf({ ph: 'idle', t: 0, started: false, blocked: false, blockedNow: false, v, hasFrame: true });
  assert.equal(idle.caption, IDLE_CAPTION);
  const done = sideOf({ ph: 'result', t: T.end, started: true, blocked: false, blockedNow: false, v, hasFrame: true });
  assert.ok(done.texts.hvpg.includes('12'), done.texts.hvpg);
});

// The monitor's WHVP−FHVP callout, 2D's result bar: an arrowed bar from the FHVP line to the WHVP line, with the "HVPG x.x" pill on it, tinted by the band.
test('the trace\'s subtraction: the bar grows from the FHVP line to the WHVP line at T.result, the HVPG pill follows, tinted by the band, the two readings dropped as dots', () => {
  const play = (v: { fhvp: number; whvp: number; hvpg: number }, to: number) => {
    const key = {}; let f = monitorFrame(key, HVPG_SCRIPT, { ph: 'run', t: T.free, v, running: true, wave: newWave(), probing: false }, 460, 240, 'x');
    for (let t = T.free; t <= to; t += 50) f = monitorFrame(key, HVPG_SCRIPT, { ph: 'run', t, v, running: true, wave: newWave(), probing: false }, 460, 240, 'x');
    return f;
  };
  const bar = (f: { shapes: readonly { k: string }[] }) => f.shapes.filter((s) => s.k === 'rect' && Math.abs((s as unknown as { w: number }).w - 1.6) < 1e-6) as unknown as { x: number; y: number; h: number; fill: number[] }[];
  const before = play(V, T.result - 450);
  assert.equal(bar(before).length, 0, 'no bar before it is due');
  assert.ok(!words(before).includes('HVPG 14.4'));
  const after = play(V, T.sum + 1200), b = bar(after);
  assert.equal(b.length, 1, 'one bar');
  assert.ok(b[0].h > 20, `the bar spans the two levels (${b[0].h}px)`);
  assert.ok(words(after).includes('HVPG 14.4'), 'the pill reads the gradient');
  assert.ok(after.shapes.filter((s) => s.k === 'path').length >= 3, 'an arrowhead at each end');
  assert.ok(after.shapes.filter((s) => s.k === 'circle').length >= 2, 'a dot where each reading is taken');
  const low = play({ fhvp: 4, whvp: 8, hvpg: 4 }, T.sum + 1200), hi = bar(after)[0].fill, lo = bar(low)[0].fill;
  assert.notDeepEqual(hi, lo, 'the bar takes the band: red over 10, not the normal colour under 5');
});

// ── the TIPS view (2D ir-tips.js, tips-figure.js, ir-compare.js, ir-curves.js) ──
const FP = { ppg: 11.8, ivc: 4.5, tipsFlow: 1.5, tipsDp: 5.6, tipsG0: 126, tipsG1: 188, tipsG2: 301, tipsTract: 1.1, tipsWall: 0.9, tipsEnds: 1, tipsJet: 2.6, tipsLumen: 5, tipsVel: 301, tipsD: 10, tipsLen: 8, tipsWaistLen: 3, tipsTrans: 1, tipsRed: 0.2, tipsStn: 0.5, tipsStnSite: 'distal' };

test('the figure\'s rows are the 2D layout: the stent to scale, the words\' rows, the chart under it', async () => {
  const { figLayout, xOf, vTop, pTop, sampleAt, VEIN_CM, REF_CM, GUTTER } = await import('../src/ui/tests/ir/copied/figure-parts.copied.js');
  const L = figLayout(320, { labels: true, chart: true }) as Record<string, number>;
  assert.equal(L.pxCm, 320 / (REF_CM + 2 * VEIN_CM));
  assert.equal(L.x0, VEIN_CM * L.pxCm);
  assert.equal(L.x1, 320 - VEIN_CM * L.pxCm);
  assert.equal(L.chH, 140, 'a narrow card: the 140 px chart; wide: 150');
  assert.equal((figLayout(500, { labels: true, chart: true }) as { chH: number }).chH, 150);
  assert.equal((figLayout(320, { labels: false, chart: false }) as { h: number }).h, (figLayout(320, { labels: false }) as { heroH: number }).heroH);
  assert.equal(xOf(0, 8, L, GUTTER), L.x0);
  assert.equal(xOf(8, 8, L, GUTTER), L.x1);
  assert.equal(xOf(4, 8, L, GUTTER), (L.x0 + L.x1) / 2);
  const N = (await import('../src/engine/hales/portal/stent-trace.js')).TRACE_N;
  assert.equal(sampleAt(L.x0, 8, L), Math.round((N * 3) / 14), 'the stent\'s start is the sample three cm into the trace of 14');
  assert.equal(vTop(100), 150); assert.equal(vTop(270), 300); assert.equal(vTop(280), 600); assert.equal(pTop(11.8), 18); assert.equal(pTop(1), 12);
});

test('the TIPS figure draws every look and width: words 12 px or more, inside the box, the lens crossfades by strength with the same pieces', async () => {
  const { tipsFigureFrame, axesOf, subPaths } = await import('../src/ui/tests/ir/tips-figure.ts');
  const { stentState } = await import('../src/ui/charts/stent/model.ts');
  const { ctxOf, eachLook, judge } = await import('./charts-helpers.ts');
  const open = stentState(FP, 'TIPS', null), none = stentState(null, 'TIPS', null), dips = stentState({ ...FP, tipsStn: 0, tipsRed: 0 }, 'DIPS', null);
  for (const st of [open, none, dips]) {
    eachLook((look) => {
      for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [460, 'tablet-portrait'], [240, 'phone-portrait']] as const) {
        const c = ctxOf(look, w, d);
        for (const lens of ['velocity', 'pressure'] as const) {
          const f = tipsFigureFrame(st, c, { lens, labels: true, chart: true });
          judge(f, look, { onCard: false, slack: 6 });
          assert.ok(f.h > 150 && f.h < 600, `${look} ${w}: height ${f.h}`);
        }
        const bare = tipsFigureFrame(st, c, { lens: 'velocity', labels: false, chart: false });
        assert.ok(bare.h < tipsFigureFrame(st, c, { lens: 'velocity', chart: true }).h, 'the vessel card\'s picture is the stent alone');
      }
    });
  }
  // the words: the three gates' numbers in the velocity lens, the pressure at the same places in the pressure lens, each at its own strength
  const c = ctxOf('light', 330);
  const alphaOf = (f: { shapes: readonly { k: string }[] }, s: string) => (f.shapes as { k: string; s?: string; alpha?: number }[]).filter((x) => x.k === 'text' && x.s === s).map((x) => x.alpha);
  const fv = tipsFigureFrame(open, c, { lens: 'velocity', chart: true }), fp = tipsFigureFrame(open, c, { lens: 'pressure', chart: true });
  assert.equal(fv.shapes.length, fp.shapes.length, 'the lenses draw the same pieces, so a Chart glides from one to the other');
  assert.deepEqual(alphaOf(fv, 'Peak velocity, cm/s'), [1]); assert.deepEqual(alphaOf(fp, 'Peak velocity, cm/s'), [0]);
  assert.deepEqual(alphaOf(fv, 'Pressure, mmHg'), [0]); assert.deepEqual(alphaOf(fp, 'Pressure, mmHg'), [1]);
  assert.deepEqual(alphaOf(fv, '126'), [1], 'the first gate\'s velocity (the 2D card\'s own number)'); assert.deepEqual(alphaOf(fp, '126'), [0]);
  assert.ok(alphaOf(fp, 'PPG 11.8')[0] === 1 && alphaOf(fv, 'PPG 11.8')[0] === 0, 'the PPG bracket\'s words show in the pressure lens only');
  assert.ok(alphaOf(fp, 'Across stent 5.6')[0] === 1, 'the stent\'s own drop');
  assert.ok(fv.shapes.some((s) => s.k === 'text' && (s as { s: string }).s === 'RPV') && tipsFigureFrame(dips, c, { lens: 'velocity' }).shapes.some((s) => s.k === 'text' && (s as { s: string }).s === 'PV'), 'the veins\' names: RPV and RHV for the TIPS, PV and IVC for the DIPS');
  // no stent: nothing shows (every piece at strength 0)
  const nf = tipsFigureFrame(none, c, { lens: 'velocity', chart: true });
  assert.ok((nf.shapes.filter((s) => s.k === 'text') as { alpha?: number }[]).every((t) => (t.alpha ?? 1) === 0), 'a stent taken away fades its words');
  // the axes are round tops
  const ax = axesOf(open);
  assert.ok([150, 300, 600, 900, 1200, 1800, 2400, 3000, 4500].includes(ax.vHi) && ax.pHi % 6 === 0, JSON.stringify(ax));
  // the device's paths become polylines, one for each sub path
  assert.deepEqual(subPaths('M1 2 L3 4 L5 6 M7 8 L9 10 Z').map((p) => [p.pts.length, p.closed]), [[6, false], [4, true]]);
});

test('Compare: the 2D rows, Then | Now | Change, a dash for what was not there, the pin\'s words', async () => {
  const { compareRows, compareNote, compareHeads, NOTHING_PINNED, DASH } = await import('../src/ui/tests/ir/compare-model.ts');
  const tips = (flow: number, d: number, red = 0) => ({ flow, dp: 5, d, end: 0, red, dWaist: d * (1 - red), vPeak: 200, geom: { waist: 3, trans: 1 } });
  const rows = compareRows({ then: { ppg: 14, tips: tips(1.2, 8) }, now: { ppg: 11.8, tips: tips(1.5, 10, 0.2) }, which: 'TIPS' });
  assert.deepEqual(rows.map((r) => r.name), ['PPG', 'Stent flow', 'Across stent', 'Open diameter', 'End narrowing', 'Waist narrowing', 'Narrowest lumen', 'Waist length', 'Taper, each end', 'Stent peak velocity']);
  const by = Object.fromEntries(rows.map((r) => [r.k, r]));
  assert.equal(by.ppg!.a, '14.0'); assert.equal(by.ppg!.b, '11.8'); assert.equal(by.ppg!.cls, 'd down'); assert.equal(by.ppg!.tri, '▼'); assert.equal(by.ppg!.txt, '−2.2');
  assert.equal(by.flow!.cls, 'd up'); assert.equal(by.flow!.txt, '+0.3');
  assert.equal(by.dp!.cls, 'd same'); assert.equal(by.dp!.txt, DASH);
  assert.equal(by.waist!.a, DASH, 'a stent with no waist has no waist length: a dash'); assert.equal(by.waist!.b, '3.0');
  // a stent that was not there then; nothing pinned
  const gone = compareRows({ then: { ppg: 14 }, now: { ppg: 11.8, tips: tips(1.5, 10) }, which: 'TIPS' });
  assert.equal(gone[1]!.a, DASH); assert.equal(gone[1]!.txt, DASH);
  assert.ok(compareRows({ then: null, now: { ppg: 11.8, tips: tips(1.5, 10) }, which: 'TIPS' }).every((r) => r.a === DASH && r.cls === 'd same'));
  assert.equal(compareRows({ then: null, now: null, which: 'DIPS' })[1]!.name, 'DIPS flow');
  assert.equal(compareNote(null), NOTHING_PINNED); assert.equal(compareNote({ when: 'Day 142' }), 'Compared with Day 142. A stent that was not there then shows a dash.');
  assert.deepEqual(compareHeads(null), ['Then', 'Now']); assert.deepEqual(compareHeads({ names: ['Before', 'After'] }), ['Before', 'After']);
});

test('Tube vs patient: the four settings, the curve tool the 2D file asks the deck\'s chart for, the sweep\'s key and its live setting', async () => {
  const { SWEEPS, LABEL, curveToolOf, sweepMatters, NO_WAIST, SETTLE_MS } = await import('../src/ui/tests/ir/copied/curves-parts.copied.js');
  const { sweepKey, liveParams, ringFp, paramsId } = await import('../src/ui/tests/ir/curves-model.ts');
  assert.deepEqual(SWEEPS, ['diameter', 'end', 'waist', 'length']);
  assert.deepEqual(SWEEPS.map((k: string) => (LABEL as Record<string, string>)[k]), ['Diameter', 'End narrowing', 'Waist length', 'Stent length (idealized)']);
  assert.equal(SETTLE_MS, 450); assert.match(NO_WAIST, /no waist/);
  const d = curveToolOf('TIPS', 'diameter'), dd = curveToolOf('DIPS', 'end');
  assert.deepEqual([d.kind, d.param, d.from, d.to, d.step, d.unit, d.lines], ['curve', 'tips.d', 6, 12, 1, 'mm', ['tipsFlow', 'tipsBench']]);
  assert.equal(dd.param, 'stenosis.DIPS'); assert.deepEqual(dd.lines, ['dipsFlow', 'dipsBench']);
  assert.equal(curveToolOf('TIPS', 'waist').param, 'stentGeom.TIPS.waist'); assert.equal(curveToolOf('TIPS', 'length').param, 'stentGeom.TIPS.len');
  assert.ok(sweepMatters('diameter', null) && !sweepMatters('waist', { red: 0 }) && sweepMatters('waist', { red: 0.2 }));
  // the tool is one the deck's curve chart reads: its series' steps are the setting's range, one for each step
  const P = await import('../src/ui/charts/curve/curve-pure.generated.js');
  assert.ok(P.curveSteps(d).length >= 7, 'six to twelve millimetres in ones');
  assert.equal(sweepKey('TIPS', 'end', { clock: 'disease', day: 41.7 }), 'TIPS|end|41'); assert.equal(sweepKey('DIPS', 'end', { clock: 'hemo', day: 9 }), 'DIPS|end|0');
  const p = { tips: { d: 10 }, stentGeom: {} };
  assert.equal(liveParams(p, { geom: { waist: 3 } }, 'waist', 'TIPS').stentGeom.TIPS.waist, 3, 'the engine\'s own waist fills where the parameters leave it unset');
  assert.equal(liveParams(p, { geom: { waist: 3 } }, 'diameter', 'TIPS'), p);
  const q = { stentGeom: { TIPS: { waist: 2 } } }; assert.equal(liveParams(q, { geom: { waist: 3 } }, 'waist', 'TIPS'), q);
  assert.deepEqual(ringFp({ flow: 1.5, bench: 2.5 }, 'TIPS'), { tipsFlow: 1.5, tipsBench: 2.5 });
  assert.equal(paramsId(p), paramsId({ tips: { d: 10 }, stentGeom: {} })); assert.notEqual(paramsId(p), paramsId({ tips: { d: 9 }, stentGeom: {} }));
});

test('the TIPS view\'s own parts are the 2D file\'s: the numbers, the menu\'s views, the line under the chip', async () => {
  const { KEYS, SUBS, stentLine, stentIds, NO_STENT_WHY } = await import('../src/ui/tests/ir/copied/tips-parts.copied.js');
  assert.deepEqual(KEYS.map((k: { id: string; k: string }) => [k.id, k.k]), [['ppg', 'PPG'], ['dp', 'Across stent'], ['flow', 'Flow']]);
  assert.deepEqual(SUBS, [['inside', 'Inside the stent'], ['curves', 'Tube vs patient'], ['compare', 'Compare']]);
  assert.deepEqual(stentIds({ tips: { on: true }, dips: { on: true } }), ['TIPS', 'DIPS']);
  assert.equal(stentLine(null), 'No stent'); assert.match(NO_STENT_WHY, /Place one from Treat/);
  const { useIr } = await import('../src/ui/tests/ir/store.ts');
  useIr.getState().setSub('compare');
  assert.equal(useIr.getState().sub, 'compare');
});

test('the monitor draws no pill: a level\'s tag and the gradient\'s are words with a halo, never a rounded box (owner, 22 Nov: no pill, chip or badge)', () => {
  const key = {};
  let f = monitorFrame(key, HVPG_SCRIPT, st('run', T.free), 460, 240, 'x');
  for (let t = T.free; t <= T.sum + 1800; t += 50) f = monitorFrame(key, HVPG_SCRIPT, st('run', t), 460, 240, 'x');
  const caps = f.shapes.filter((s) => s.k === 'rect' && (s as { r?: number }).r !== undefined && (s as { h: number }).h >= 8 && (s as { r: number }).r >= (s as { h: number }).h / 2 - 0.01);
  assert.equal(caps.length, 0, 'a capsule is drawn round words');
  const texts = f.shapes.filter((s) => s.k === 'text') as TextShape[];
  for (const w of ['8.2', '22.6']) assert.ok(texts.some((s) => s.s === w && s.halo), `${w} stands on a halo`);
  assert.ok(texts.some((s) => /^HVPG\s+14\.4$/.test(s.s) && s.halo), `the gradient's words stand on a halo: ${texts.map((s) => s.s).join('|')}`);
});
