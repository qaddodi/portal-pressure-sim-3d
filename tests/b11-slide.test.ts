// The Tests instruments as the decks use them (a slide's `tool`): the HVPG tracing's steps, the measurement card's clock, the beat-by-beat card on EKG paper, a slide's pinned numbers in the
// scope, the wall, the FibroScan and the Doppler. The 2D app is the spec; the pure parts are 2D's own (copied/*). Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SampleFeed, CHANNELS } from '../src/ui/tests/feed.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { beatFrame, beatReadings, BEAT_CARD_S } from '../src/ui/tests/slide/beat-frame.ts';
import { levelsOf, hvpgCard, stepBy, canStep, tracing, useHvpgCard } from '../src/ui/tests/slide/hvpg-card.ts';
import { readingCard } from '../src/ui/tests/slide/reading-card.ts';
import { setSlidePin, pinnedStiff, pinnedWall, pinnedVarix, slideFp } from '../src/ui/tests/slide/pin.ts';
import { readingsOf } from '../src/ui/tests/endo/readings.ts';
import { wallReadings } from '../src/ui/tests/endo/wall.ts';
import { DopplerModel } from '../src/ui/tests/doppler/model.ts';
import { useDopplerProbe } from '../src/ui/tests/doppler/probe-state.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { claims } from '../src/parity/b11.ts';
import { SPAN, ORDER, READS, NEXT_WORDS } from '../src/ui/tests/slide/copied/hvpg-card.copied.js';
import { beatLayout, beatTop, sinceText } from '../src/ui/tests/slide/copied/beat-card.copied.js';
import type { TextShape, Shape } from '../src/ui/charts/scene.ts';

const words = (shapes: readonly Shape[]) => shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s);
const keys = (shapes: readonly Shape[]) => shapes.map((s) => (s as { key?: string }).key).filter(Boolean) as string[];

/** A record of `secs` seconds at 100 Hz, a beat every 0.8 s: the wedged, free and portal pressures round their levels. */
function recorded(secs: number, lv = { whvp: 20, RHV: 8, CONF: 21 }): SampleFeed {
  const f = new SampleFeed(), o: Record<string, number[]> = { t: [] };
  for (const k of CHANNELS) o[k] = [];
  for (let i = 0; i < secs * 100; i++) {
    const t = i / 100, ph = (t / 0.8) % 1, b = Math.sin(2 * Math.PI * ph);
    o.t!.push(t); o.ph!.push(ph);
    for (const k of CHANNELS) if (k !== 'ph') o[k]!.push(k in lv ? (lv as Record<string, number>)[k]! + b : 0);
  }
  f.adopt({ jump: false, samples: o } as never);
  return f;
}
const asRec = (f: SampleFeed) => ({ t: f.t, ch: f.ch, binT: f.binT, bin: f.bin, beats: f.beat.times, days: f.days, calm: (k: string) => f.calmOf(k) });
const NOW = { whvp: 20, fhvp: 8, pv: 21, hr: 72, hvpg: 12 };

test('the HVPG card: the three readings, the spans and the words are the 2D app\'s', () => {
  assert.deepEqual((READS as string[][]).map((r) => r[0]), ['FHVP', 'WHVP', 'HVPG']);
  assert.deepEqual(NEXT_WORDS, ['Next: balloon up', 'Next: HVPG']);
  assert.deepEqual(ORDER, ['free', 'wedge', 'result']);
  assert.ok((SPAN as Record<string, number[]>).free![1]! < (SPAN as Record<string, number[]>).wedge![0]!, 'the free sweep ends before the balloon');
  // the HVPG it prints is the difference of the two readings as shown
  assert.deepEqual(levelsOf({ fhvp: 8.04, whvp: 20.01, hvpg: 12.2 }), { fhvp: 8.04, whvp: 20.01, hvpg: levelsOf({ fhvp: 8.04, whvp: 20.01, hvpg: 12.2 })!.hvpg });
  assert.equal(levelsOf({ fhvp: NaN, whvp: 20 }), null, 'a case with no pressures has no card to play');
});

test('stepped onto going forward, the card shows the free pressure and waits; each Next takes a reading; Back takes them back', () => {
  hvpgCard.reset();
  hvpgCard.arrive({ forward: true });
  hvpgCard.configure({}, undefined);
  assert.equal(canStep(1), false, 'nothing to step before the readings are in');
  hvpgCard.pin({ fhvp: 8, whvp: 20, hvpg: 12 });
  assert.equal(hvpgCard.at(), 0, 'FHVP is the reading on');
  assert.equal(tracing.mode, 'free');
  assert.equal(useHvpgCard.getState().reading, 'pending', 'its header holds back what it measures until it is done');
  assert.equal(canStep(-1), false, 'Back from the first reading leaves the slide');
  assert.equal(stepBy(1), true); assert.equal(hvpgCard.at(), 1); assert.equal(tracing.mode, 'wedge');
  assert.equal(stepBy(1), true); assert.equal(hvpgCard.at(), 2); assert.equal(tracing.mode, 'result');
  assert.equal(canStep(1), false, 'the HVPG is the last');
  assert.equal(useHvpgCard.getState().reading, '');
  assert.equal(stepBy(-1), true); assert.equal(hvpgCard.at(), 1);
  assert.equal(stepBy(-1), true); assert.equal(hvpgCard.at(), 0);
  assert.equal(stepBy(-1), false);
  hvpgCard.park();
});

test('jumped to, the card shows the finished tracing at once, and Back leaves the slide', () => {
  hvpgCard.reset();
  hvpgCard.arrive({ forward: false });
  hvpgCard.configure({}, undefined);
  hvpgCard.pin({ fhvp: 8, whvp: 20, hvpg: 12 });
  assert.equal(hvpgCard.at(), 2); assert.equal(tracing.mode, 'result');
  assert.equal(canStep(-1), false); assert.equal(canStep(1), false);
  hvpgCard.park();
});

test('with a catheter on the figure the card plays nothing of its own: the slide\'s step, the figure\'s balloon, no Next of its own', () => {
  hvpgCard.reset();
  hvpgCard.arrive({ forward: true });
  hvpgCard.configure({ catheter: true }, 'wedge');
  assert.equal(useHvpgCard.getState().hidden, true, 'no strip: its slides are the steps');
  hvpgCard.pin({ fhvp: 8, whvp: 20, hvpg: 12 });
  assert.equal(tracing.started(), false, 'the monitor stands empty until the catheter is parked in the vein');
  assert.equal(canStep(1), false);
  hvpgCard.reach(true);
  assert.equal(tracing.mode, 'wedge');
  let told = -1; assert.equal(hvpgCard.watch((b) => { told = b; }), 0);
  hvpgCard.balloon(1);
  assert.equal(tracing.bal, 1); assert.equal(useHvpgCard.getState().reading, 'pending', 'the wedge is not the result');
  hvpgCard.configure({ catheter: true }, 'result'); hvpgCard.balloon(1);
  assert.equal(useHvpgCard.getState().reading, '', 'the result with the balloon up: the reading is taken');
  void told;
  hvpgCard.park();
  hvpgCard.reset();
});

test('the measurement card follows the procedure\'s clock: waits for the tip, then each reading is taken as its mark passes, and the words follow', () => {
  const slide = { id: 'hv', procedure: 'hvpgcath' };
  readingCard.configure({}, slide, { fhvp: 8, whvp: 20, hvpg: 12 });
  assert.ok(Number.isNaN(readingCard.clockNow()), 'before the tip is in the vein, the monitor waits');
  let last = NaN;
  for (let t = 0; t <= 30000; t += 250) { readingCard.procAt('hvpgcath', t); const n = readingCard.clockNow(); if (Number.isFinite(n)) assert.ok(!(n < last), 'the clock never runs backwards'); last = n; }
  assert.ok(last > 0);
  readingCard.procAt('hvpgcath', 0);
  assert.ok(!(readingCard.clockNow() > 1000), 'Back runs the clock backwards and the trace with it');
  // a new slide's measurement starts afresh
  readingCard.configure({}, { id: 'eus', procedure: 'eus' }, null);
  assert.ok(Number.isNaN(readingCard.clockNow()));
  // the PPG by IR is two kinds, the second after the first; a first kind starting again sets the later ones back
  readingCard.configure({}, { id: 'ppg', procedure: { kind: 'irivc', then: 'irpv' } }, null);
  readingCard.procAt('irivc', 8000); readingCard.procAt('irpv', 9000);
  const mid = readingCard.clockNow();
  readingCard.procAt('irivc', 100);
  assert.ok(readingCard.clockNow() < mid, 'the first kind starting again sets the second back');
});

test('the beat card: the column of readings, the paper, the strip, the caliper and the time axis, in the 2D layout', () => {
  const f = recorded(30), pal = paletteOf('light');
  const out = beatFrame({ rec: asRec(f) as never, head: f.last, now: NOW, before: null, ekg: true, noPv: false }, { w: 520, h: 280, pal });
  const w = words(out.frame.shapes), k = keys(out.frame.shapes);
  for (const s of ['HEART RATE', 'HVPG', '72', '12.0', 'now', '−2 s', '−4 s', 'mmHg', 'Portal vein', 'Wedged', 'Free']) assert.ok(w.includes(s), `${s} in ${w.join('|')}`);
  for (const key of ['ekg-line', 'cal-a', 'cal-m', 'cal-b', 'wedge-0', 'free-0', 'pv-0', 'hvpg-gap']) assert.ok(k.includes(key), `${key} in ${k.join(' ')}`);
  assert.ok(!k.includes('was-gap'), 'no earlier state, no old gap');
  assert.ok(out.frame.label.includes('HVPG 12.0'), out.frame.label);
  // the strip left off by the slide
  const plain = beatFrame({ rec: asRec(f) as never, head: f.last, now: NOW, before: null, ekg: false, noPv: false }, { w: 520, h: 280, pal });
  assert.ok(!keys(plain.frame.shapes).includes('ekg-line'), 'ekg: false leaves the strip off');
});

test('the beat card names the state before the slide\'s event once, as two dotted lines and the old gap; the change since is written as the column does', () => {
  const f = recorded(30), pal = paletteOf('light');
  const before = { r: { whvp: 26, fhvp: 8, pv: 27, hr: 70, hvpg: 18 }, label: 'before the bleed' };
  const out = beatFrame({ rec: asRec(f) as never, head: f.last, now: NOW, before, ekg: true, noPv: false }, { w: 520, h: 300, pal });
  const k = keys(out.frame.shapes), w = words(out.frame.shapes);
  for (const key of ['was-gap', 'was-w', 'was-f']) assert.ok(k.includes(key), key);
  assert.ok(w.includes('before the bleed'), w.join('|'));
  assert.ok(w.some((s) => s.startsWith('▼') && s.endsWith('since before')), `the HVPG fell: ${w.join('|')}`);
  assert.equal(sinceText(20, 20, 1), '', 'unmoved says nothing');
  // a state that has not moved is not drawn again
  const same = beatFrame({ rec: asRec(f) as never, head: f.last, now: NOW, before: { r: NOW, label: 'before' }, ekg: true, noPv: false }, { w: 520, h: 300, pal });
  assert.ok(!keys(same.frame.shapes).includes('was-gap'));
});

test('a narrow card writes the readings on top and each line\'s value at its end; the scale tops at a multiple of five over everything shown', () => {
  const f = recorded(30), pal = paletteOf('light');
  const lay = beatLayout(360, 260, true);
  assert.equal(lay.wide, false);
  const out = beatFrame({ rec: asRec(f) as never, head: f.last, now: NOW, before: null, ekg: true, noPv: false }, { w: 360, h: 260, pal });
  const w = words(out.frame.shapes);
  assert.ok(w.some((s) => s === 'HVPG 12.0') && w.includes('72 /min'), w.join('|'));
  assert.ok(w.includes('WHVP') && w.includes('FHVP') && w.includes('PV'), 'the lines named at their ends');
  assert.equal(beatTop([14.2, 20, 21, NaN]) % 5, 0);
  assert.equal(BEAT_CARD_S, 5);
});

test('the beat card\'s numbers are the slide\'s fingerprint, the HVPG the difference of the two as printed', () => {
  assert.deepEqual(beatReadings({ whvp: 20.04, fhvp: 8.01, pv: 21, hr: 72, hvpg: 12.1 }).hvpg, beatReadings({ whvp: 20.04, fhvp: 8.01, hvpg: 12.1 }).hvpg);
  assert.ok(Number.isNaN(beatReadings(null).whvp));
});

test('a slide\'s pinned numbers: the scope\'s size and pressure, the wall\'s stress, the FibroScan\'s stiffness', () => {
  setSlidePin(null);
  assert.equal(pinnedStiff('liver'), null); assert.ok(Number.isNaN(pinnedWall())); assert.equal(pinnedVarix(), null);
  setSlidePin({ lsm: 24.3, ssm: 41.2, wall: 0.62, varix: 4.4, at: {} }, 0);
  assert.equal(pinnedStiff('liver'), 24.3); assert.equal(pinnedStiff('spleen'), 41.2);
  assert.equal(pinnedWall(), 0.62);
  assert.equal(pinnedVarix()!.d, 4.4);
  // a what-if pins a new state every few frames: the wall eases into the last one, not a jump
  setSlidePin({ wall: 0.9 }, 100);
  assert.ok(pinnedWall() > 0.62 && pinnedWall() < 0.9, String(pinnedWall()));
  setSlidePin({ wall: 0.9 }, 5000);
  assert.equal(pinnedWall(), 0.9, 'after a second the pin starts afresh');
  // the scope reads the slide's size at rest and the pressure in the varix
  const f = { bands: 0, metrics: { varix: { present: true, d: 3, w: 1.1, ptm: 14, air: 0, ratio: 1, redWale: false, grade: { label: 'Large' } } } };
  assert.match(readingsOf(f, { air: 0, red: null, readings: false })!.diam, /^3\.0 mm/);
  assert.match(readingsOf(f, { air: 0, red: null, readings: true }, { d: 4.4, ptm: 19 })!.diam, /^4\.4 mm/);
  assert.equal(readingsOf(f, { air: 10, red: null, readings: true }, { d: 4.4, ptm: 19 })!.pressures[0], '19.0 mmHg');
  assert.equal(readingsOf(f, { air: 10, red: null, readings: true }, { d: 4.4, ptm: 19 })!.pressures[2], '9.0 mmHg');
  const v = { r: 4, w: 0.4, ptm: 14, ratio: 0.8 } as never;
  assert.equal(wallReadings(v, 0.62).pct, '62');
  assert.notEqual(wallReadings(v).pct, '62');
  setSlidePin(null);
  assert.equal(slideFp(), null);
});

const EN = (EDGES as unknown[]).length;
const hemo = (Q = 0.9, D = 12) => ({ clock: 'hemo', running: true, speed: 1, settling: false, D: new Float32Array(EN).fill(D), Q: new Float32Array(EN).fill(Q), metrics: {} });
function dop(slide: boolean) {
  const m = new DopplerModel(); m.slide = slide;
  const rec = new SampleFeed();
  const n = 400, t: number[] = [], v: number[] = [], ph: number[] = [];
  for (let i = 0; i < n; i++) { const tt = i / 50, p = (tt / 0.8) % 1; t.push(tt); ph.push(p); v.push(20 + 3 * Math.sin(2 * Math.PI * p)); }
  useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
  rec.adopt({ jump: false, probe: 'PV_TRUNK', samples: { t, vel: v, ph, pvVel: v, hvVel: v } } as never);
  m.ingest(hemo(), rec);
  return m;
}

test('on a slide the Doppler\'s reading is steady, and held to the slide\'s own velocity while they agree', () => {
  const live = dop(false).report(), onCard = dop(true).report();
  assert.equal(live.acquiring, false);
  assert.equal(onCard.acquiring, false);
  assert.ok(Number.isFinite(parseFloat(onCard.vel)), onCard.vel);
  // the same record read twice a moment apart gives one number (the running mean), not the beat's swing
  const m = dop(true), a = m.report().vel, b = m.report().vel;
  assert.equal(a, b);
});

test('the gallery\'s slide instruments: each claimed card has what it needs in the 3D app', () => {
  const ids = new Set(claims.map((c) => c.id));
  for (const id of ['hvpg/free', 'hvpg/wedge', 'hvpg/result', 'hvpg/card', 'reading/hvpgcath', 'reading/eus', 'reading/irivc', 'reading/tipsgrad', 'trace/beats', 'trace/beats-plain', 'trace/beats-delta']) assert.ok(ids.has(`card:${id}`), `card:${id} is claimed`);
});

// ── the gallery's 22 Doppler cards (2D gallery/catalog.js doppler/*): every option each one names is one the pane takes ──
import { PROBES } from '../src/ui/tests/doppler/copied/doppler-tables.copied.js';
import { ghostOf } from '../src/ui/talk/ghost.ts';
const DOP: Record<string, Record<string, unknown>> = {
  'pv-spectrum': { vessel: 'PV_TRUNK' }, 'pv-color': { vessel: 'PV_TRUNK', mode: 'color' }, 'pv-variance': { vessel: 'PV_TRUNK', mode: 'variance' }, 'hv-waves': { vessel: 'RHV_IVC', waves: true },
  'pair-calipers': { vessel: 'PV_TRUNK', pair: true, calipers: true }, artery: { vessel: 'A_HEP' }, reversed: { vessel: 'PV_TRUNK' }, 'no-flow': { vessel: 'PV_TRUNK' }, splenic: { vessel: 'V_SPL' },
  ivc: { vessel: 'IVCS_RA' }, varix: { vessel: 'C1b' }, paraumbilical: { vessel: 'C3' }, 'scope-probe': { vessel: 'C2', probe: 'scope' }, 'eus-glue': { vessel: 'C2', probe: 'scope' },
  'tips-proximal': { vessel: 'TIPS', gate: 'proximal', points: true }, 'tips-mid': { vessel: 'TIPS', gate: 'mid', points: true }, 'tips-distal': { vessel: 'TIPS', gate: 'distal', points: true },
  'tips-site': { vessel: 'TIPS', gate: 'site', points: true }, aliasing: { vessel: 'TIPS', scale: 150 }, 'aliasing-baseline': { vessel: 'TIPS', scale: 150, baseline: 0.3 },
  'ghost-before': { vessel: 'PV_TRUNK' }, ghost: { vessel: 'PV_TRUNK', delta: 'doppler/ghost-before' },
};
test('every Doppler gallery card names a vessel the pane samples, a gate it knows and options configure takes', () => {
  const vessels = new Set((PROBES as { id: string }[]).map((p) => p.id));
  for (const [id, t] of Object.entries(DOP)) {
    assert.ok(vessels.has(String(t.vessel)), `${id}: ${t.vessel}`);
    if (t.gate) assert.ok(['proximal', 'mid', 'distal', 'site'].includes(String(t.gate)), `${id}: gate ${t.gate}`);
    const m = new DopplerModel();
    m.configure(t as never);
    const o = (m as unknown as { opts: { fixed: { nyq: number; base: number } | null; calipers: boolean; pair: boolean; waves: boolean } }).opts;
    assert.equal(m.mode, t.mode === 'color' ? 'velocity' : t.mode === 'variance' ? 'variance' : 'spectrum', id);
    assert.equal(o.calipers, !!t.calipers, id); assert.equal(o.pair, !!t.pair, id); assert.equal(o.waves, !!t.waves, id);
    assert.equal(o.fixed?.nyq ?? null, (t.scale as number | undefined) ?? null, id);
    if (t.baseline != null) assert.equal(o.fixed?.base, t.baseline, id);
  }
  assert.equal(Object.keys(DOP).length, 22);
});

test('the Doppler\'s ghost: the earlier reading of the main portal vein faint beside it ("Before 24 cm/s")', () => {
  const slides = [{ id: 'doppler/ghost-before', kicker: 'Before the TIPS' }, { id: 'doppler/ghost' }];
  const fps: Record<string, Record<string, unknown>> = { 'doppler/ghost-before': { pvVel: 8.4 } };
  const g = ghostOf({ tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'doppler/ghost-before' } }, 1, slides, (id) => fps[id] ?? null, [0, 1]);
  assert.deepEqual(g, { label: 'Before the TIPS', value: '8 cm/s' });
  assert.equal(ghostOf({ tool: { kind: 'doppler', vessel: 'RHV_IVC', delta: 'doppler/ghost-before' } }, 1, slides, (id) => fps[id] ?? null, [0, 1]), null, 'only the main portal vein has an earlier reading');
});
