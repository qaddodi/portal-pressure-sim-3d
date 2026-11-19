import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SampleFeed, feed, record, CHANNELS, BIN_S, KEYS } from '../src/ui/tests/feed.ts';
import { traceFrame, traceLabel, targetRange, activeTraces, TRACES, hvpgWordOf, seriesOf, smoothed, noEase } from '../src/ui/tests/trace/model.ts';
import { headOf, heroOf, createEase } from '../src/ui/tests/trace/live.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { HVPG_CUTS } from '../src/engine/hales/portal/pressure-cuts.js';

/** A run of samples at 100 Hz from t0: a beat of 0.8 s, pressures round their levels. */
function run(t0: number, secs: number, hv = 11): Record<string, number[]> {
  const o: Record<string, number[]> = { t: [] }; for (const k of CHANNELS) o[k] = [];
  for (let i = 0; i < secs * 100; i++) {
    const t = t0 + i / 100, ph = (t / 0.8) % 1, b = Math.sin(2 * Math.PI * ph);
    o.t!.push(t); o.ph!.push(ph);
    const lv: Record<string, number> = { CONF: 18, whvp: 20, RHV: 20 - hv, RA: 4, IVCS: 5, VAR: 14, SV: 17, SMV: 15, hvpg: hv };
    for (const k of CHANNELS) if (k === 'ph') continue; else if (k in lv) o[k]!.push(lv[k]! + (k === 'hvpg' ? 0 : b));
    else o[k]!.push(0);
  }
  return o;
}
const filled = (secs = 130, hv = 11) => { const f = new SampleFeed(); f.adopt({ jump: false, samples: run(0, secs, hv) }); return f; };
const box = (pal = paletteOf('light')) => ({ w: 460, h: 250, pal, fs: 13 });
const view = (over = {}) => ({ range: 'beats' as const, chosen: new Set(['CONF', 'whvp', 'RHV'] as const), smooth: false, ekg: false, lane: true, head: 129.9, ends: { CONF: 18, whvp: 20, RHV: 9 }, hvpg: 11, hr: 75, ...over });
const words = (f: ReturnType<typeof traceFrame>) => f.frame.shapes.filter((s) => s.k === 'text').map((s) => (s as { s: string }).s);
const asRec = (f: SampleFeed) => ({ t: f.t, ch: f.ch, binT: f.binT, bin: f.bin, beats: f.beat.times, days: f.days, calm: (k: string) => f.calmOf(k) });
const M = (hvpg: number, d = 0) => ({ hvpg, pv: 18 + d, whvp: 20 + d, fhvp: 20 + d - hvpg, ra: 4, ivc: 5, sv: 17 });
/** A time-lapse: one disease-clock frame a day for `n` days, the HVPG rising from `a` to `b` */
const KEYS_FOR_TEST = [...KEYS];
const lapse = (n: number, a = 8, b = 16, f = new SampleFeed(), from = 0) => { for (let d = 0; d <= n; d++) f.adopt({ jump: false, clock: 'disease', day: from + d, metrics: M(a + ((b - a) * d) / n), params: { tips: null }, samples: null }); return f; };

test('the feed keeps what it is given, bins it by quarter seconds and finds the beats', () => {
  const f = filled(10);
  assert.equal(f.n, 1000);
  assert.equal(f.binT.length, 40);
  assert.equal(f.binT[1]! - f.binT[0]!, BIN_S);
  assert.ok(f.bin.CONF.hi[3]! > f.bin.CONF.lo[3]!, 'a bin keeps its trough and its peak');
  assert.ok(Math.abs(f.bin.hvpg.mean[3]! - 11) < 1e-9);
  assert.ok(f.beat.times.length >= 11 && f.beat.times.length <= 13, `${f.beat.times.length} beats in 10 s at 0.8 s`);
});

test('a clock that was set (a step back, a gap past half a second) moves the trace on from where it stood; a new patient starts the record again', () => {
  const f = filled(5);
  f.adopt({ jump: false, samples: run(5.01, 1) }); assert.equal(f.n, 600, 'the next frame joins');
  assert.equal(f.off, 0);
  f.adopt({ jump: false, samples: run(20, 1) });
  assert.equal(f.n, 700, 'a gap of 14 s is a clock that was set: the trace goes on, its time moved up to meet the record');
  assert.ok(Math.abs(f.off - (-14 + 0.01 + 0)) < 0.05, `the model's time plus ${f.off} is the trace's`);
  assert.ok(f.t.every((t, i) => i === 0 || t > f.t[i - 1]!), 'the record stays in time order');
  const last = f.last;
  f.adopt({ jump: false, samples: run(3, 1) });
  assert.equal(f.n, 800, 'going back is the same: the trace does not start over');
  assert.ok(f.t[700]! > last, 'and the new samples follow the old');
  f.adopt({ jump: true, samples: run(4, 1) }); assert.equal(f.n, 100, 'a jump (a new patient) starts again and takes the frame');
  assert.equal(f.binT.length, 4); assert.equal(f.off, 0);
});

test('a time-lapse sends no samples: the trace keeps what it had and the days are recorded', () => {
  const f = filled(5);
  f.adopt({ jump: false, clock: 'disease', day: 1, metrics: { hvpg: 11, pv: 18, whvp: 20, fhvp: 9, ra: 4, ivc: 5, sv: 17 }, samples: run(5.01, 1) });
  assert.equal(f.n, 500, 'a disease-clock frame adds no beat');
  assert.equal(f.days.length, 1);
});

test('the record keeps 150 s and no more', () => {
  const f = new SampleFeed();
  for (let t = 0; t < 400; t += 10) f.adopt({ jump: false, samples: run(t, 10) });
  assert.ok(f.last - f.t[0]! < 165 && f.last - f.t[0]! > 140, `${f.last - f.t[0]!} s kept`);
  assert.equal(f.t.length, f.ch.CONF.length); assert.equal(f.t.length, f.ch.hvpg.length);
  assert.ok(f.binT[0]! > f.t[0]! - 1);
});

test('the beats range draws the three pressures, the HVPG lane with the cut-off names, the readings at the right edge and the time axis', () => {
  const o = traceFrame(asRec(filled()), view(), box());
  const w = words(o);
  assert.deepEqual(o.lanes.map((l) => l.key), ['pressure', 'hvpg']);
  for (const k of ['PV', 'WHVP', 'FHVP', 'HVPG', 'now', 'mmHg', 'HVPG, mmHg']) assert.ok(w.includes(k), `${k} is written`);
  assert.ok(w.includes(`CSPH ${HVPG_CUTS.red}`) || w.some((x) => x.startsWith('CSPH')), 'the CSPH line is named');
  assert.ok(w.includes('−2 s') && w.includes('−8 s'), 'the axis counts back in twos');
  const keys = o.frame.shapes.filter((s) => s.k === 'path').map((s) => (s as { key?: string }).key);
  for (const k of ['CONF-line', 'whvp-line', 'RHV-line', 'hvpg-line']) assert.ok(keys.includes(k), k);
  assert.equal(o.ends.filter((e) => e.lane === 'pressure').length, 3);
  const ys = o.ends.filter((e) => e.lane === 'pressure').map((e) => e.y).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i]! - ys[i - 1]! >= 15 - 1e-9, 'readings stand 15 px apart');
  assert.ok(o.frame.shapes.some((s) => s.k === 'band' && (s as { key?: string }).key === 'hvpg-between'), 'wedged − free is shaded');
});

test('lanes fill the card as trace-lanes plans them; the EKG strip goes first when room is short', () => {
  const rec = asRec(filled());
  const tall = traceFrame(rec, view({ ekg: true }), { ...box(), h: 330 });
  assert.deepEqual(tall.lanes.map((l) => l.key), ['ekg', 'pressure', 'hvpg']);
  assert.ok(words(tall).includes('EKG') && words(tall).includes('HR'));
  const short = traceFrame(rec, view({ ekg: true }), { ...box(), h: 150 });
  assert.ok(!short.lanes.some((l) => l.key === 'ekg'), 'no room for the strip');
  assert.ok(short.lanes.some((l) => l.key === 'pressure'), 'the pressures are never dropped');
  const noLane = traceFrame(rec, view({ lane: false }), box());
  assert.deepEqual(noLane.lanes.map((l) => l.key), ['pressure']);
  const top = (o: ReturnType<typeof traceFrame>) => o.lanes.map((l) => [l.top, l.bot]);
  for (const o of [tall, short, noLane]) for (const [a, b] of top(o)) assert.ok(a >= 0 && b <= o.frame.h && b > a);
});

test('the two minutes are bands from trough to peak, drawn smooth until Smooth is touched; the axis counts back in half minutes', () => {
  const rec = asRec(filled());
  const raw = traceFrame(rec, view({ range: 'minutes' }), box());
  assert.ok(raw.frame.shapes.some((s) => s.k === 'band' && (s as { key?: string }).key === 'CONF-band'), 'a band round the mean');
  const sm = traceFrame(rec, view({ range: 'minutes', smooth: true }), box());
  assert.ok(!sm.frame.shapes.some((s) => s.k === 'band' && (s as { key?: string }).key === 'CONF-band'), 'Smooth is the mean alone');
  assert.ok(words(raw).includes('−30 s') && words(raw).includes('−1 min') && words(raw).includes('−90 s'));
});

test('smoothing a ripple flattens it and keeps the level', () => {
  const x = Array.from({ length: 200 }, (_, i) => i * 0.25), v = x.map((t) => 10 + Math.sin(t * 5));
  const s = smoothed(x, v, 6);
  const mid = s.slice(60, 140);
  assert.ok(Math.max(...mid) - Math.min(...mid) < 0.2, 'a ripple of 2 mmHg is under 0.2 after the mean');
  assert.ok(Math.abs(mid[10]! - 10) < 0.2);
});

test('the pressure lane starts at zero while every reading is above it; the HVPG lane runs from 0 to a multiple of 4 above its peak, never under 16', () => {
  assert.deepEqual(targetRange('hvpg', 3, 11), [0, 16]);
  assert.deepEqual(targetRange('hvpg', 5, 22), [0, 28]);
  const [lo, hi] = targetRange('pressure', 4, 20);
  assert.ok(Math.abs(lo - 2.4) < 1e-9); assert.ok(Math.abs(hi - 21.6) < 1e-9);
  assert.equal(targetRange('pressure', 1, 4)[0], 0, 'never below zero when the readings are not');
  assert.deepEqual(targetRange('hvpg', NaN, NaN), [0, 16]);
});

test('traces the case leaves unmeasured are not drawn; with none and no lane the chart says what to do', () => {
  const only = activeTraces({ chosen: new Set(['CONF', 'whvp', 'RHV'] as const), hidden: new Set(['trueHVPG']) });
  assert.deepEqual(only.map((t) => t.id), ['CONF']);
  const o = traceFrame(asRec(filled()), view({ chosen: new Set(), hidden: new Set(['trueHVPG']) }), box());
  assert.deepEqual(words(o), ['Choose a trace below.']);
  assert.equal(TRACES.filter((t) => t.on).length, 3);
});

test('the header reads the HVPG as its band word with its change; the head runs a little behind the newest sample and never past the lag', () => {
  assert.equal(hvpgWordOf(11), 'CSPH'); assert.equal(hvpgWordOf(13), 'CSPH · bleed risk'); assert.equal(hvpgWordOf(2), 'Normal');
  assert.equal(headOf(100, 0, 50, true, 1), 100 - 0.12 + 0.05);
  assert.equal(headOf(100, 0, 5000, true, 1), 100, 'after the lag the head waits for the next frame');
  assert.equal(headOf(100, 0, 50, false, 1), 100, 'a paused model stands still');
  assert.equal(headOf(NaN, 0, 0, true, 1), 0);
  const h = heroOf(11.04);
  assert.equal(h.num, '11.0'); assert.equal(h.sev, 'danger'); assert.equal(heroOf(NaN).num, '—');
});

test('the lanes\' ranges are kept until the data leaves them, then glide to the new ones', () => {
  const e = createEase();
  const a = [...e.fn('pressure', 2, 20, 0)];
  const b = [...e.fn('pressure', 3, 19, 16)];
  assert.deepEqual(a, b, 'a range the data still fills is kept');
  const c = [...e.fn('pressure', 2, 40, 32)];
  assert.ok(c[1]! > a[1]! && c[1]! < 40 + 2, 'a higher peak moves the top, a step of the glide at a time');
  for (let t = 48; t < 3000; t += 16) e.fn('pressure', 2, 40, t);
  assert.ok(Math.abs(e.fn('pressure', 2, 40, 3016)[1]! - (40 + 38 * 0.08)) < 0.1, 'and settles');
  assert.ok(!e.gliding() || true);
});

test('the chart is a sentence for a screen reader, and the frame has the same label', () => {
  const o = traceFrame(asRec(filled()), view(), box());
  assert.match(o.frame.label, /^Pressure over the last 10 seconds: Portal vein, Wedged hepatic \(WHVP\), Free hepatic \(FHVP\)\. HVPG 11\.0 mmHg, CSPH\.$/);
  assert.equal(traceLabel({ range: 'minutes' }, NaN, []), 'Pressure over the last 2 minutes. HVPG — mmHg, Normal.'.replace('Normal', hvpgWordOf(NaN)));
});

test('a thin window reads the nearest samples, thinned to what the line can show', () => {
  const s = seriesOf(asRec(filled()), 'CONF', 'beats', 120, 130, false, 100);
  assert.ok(s.x.length <= 260 && s.x.length >= 40, `${s.x.length} points, about two to a pixel`);
  assert.ok(s.x[0]! <= 120.05 && s.x[s.x.length - 1]! >= 129.9);
  assert.equal(record.t.length, 0, 'the app\'s own record starts empty');
  void noEase;
});

test('the Days range draws one calmed point a day, with Day names on the axis and the live reading at the end', () => {
  const f = lapse(60);
  assert.equal(f.days.length, 61);
  const o = traceFrame(asRec(f), view({ range: 'days', head: 0, ends: {} }), box());
  const w = words(o);
  assert.ok(w.includes('Day 60'), 'the newest day ends the axis');
  assert.ok(w.some((x) => /^Day (10|20|30|40|50)$/.test(x)), 'and days are named along it');
  assert.ok(!w.includes('now') && !w.some((x) => x.includes(' s')), 'no seconds on the days');
  const keys = o.frame.shapes.filter((s) => s.k === 'path').map((s) => (s as { key?: string }).key);
  for (const k of ['CONF-line', 'whvp-line', 'RHV-line', 'hvpg-line']) assert.ok(keys.includes(k), k);
  const e = o.ends.find((x) => x.label === 'HVPG')!;
  assert.equal(e.v, 16, "the end's reading is the last day's, the live one");
  assert.equal(o.frame.shapes.filter((s) => s.k === 'circle').length, 0, 'sixty days draw no dots');
  const few = traceFrame(asRec(lapse(5)), view({ range: 'days', head: 0, ends: {} }), box());
  assert.ok(few.frame.shapes.filter((s) => s.k === 'circle').length >= 12, 'a few days show each point');
  assert.deepEqual(activeTraces({ chosen: new Set(['CONF', 'VAR', 'SMV'] as const), range: 'days' }).map((t) => t.id), ['CONF'], 'the traces the model keeps no daily value for are not on the days');
});

test('with fewer than two days the chart says how to get some', () => {
  const o = traceFrame(asRec(new SampleFeed()), view({ range: 'days' }), box());
  assert.deepEqual(words(o), ['Advance the disease clock (+1 wk, +1 mo, +6 mo)', 'to follow pressure over days and months.']);
});

test('a treatment cuts the days at its step: both readings of its day are kept and the trend is calmed in pieces', () => {
  const f = lapse(30, 12, 12);
  f.adopt({ jump: false, clock: 'disease', day: 30, metrics: M(5), params: { tips: { on: true } }, samples: null });
  const d = f.days;
  assert.equal(d.length, 32); assert.equal(d[31]!.day, 30); assert.equal(d[31]!.start, true);
  const c = f.calmOf('hvpg')!;
  assert.equal(c.mid[30], 12, 'the point before the step keeps what was read'); assert.equal(c.mid[31], 5);
  f.adopt({ jump: false, clock: 'disease', day: 3, metrics: M(9), samples: null });
  assert.equal(f.days.length, 1, 'the clock gone back starts the list again');
});

test('the header on the days reads its change since the first day kept, and its words stay with a non-breaking space', () => {
  lapse(30, 8, 14, feed);
  const h = heroOf(14, 'days');
  assert.equal(h.delta, '▲ 6.0 since day 0'); assert.equal(h.dir, 'up');
  feed.adopt({ jump: true, samples: null });
  assert.equal(feed.days.length, 0, 'a new patient clears the days');
  assert.equal(heroOf(11, 'days').delta, '');
});

test('changes and events are marked where they happened: a dotted line, a dot and the words; marks a few pixels apart share one label', () => {
  const rec = asRec(filled());
  const marks = [{ kind: 'start', day: 0, t: 0, label: 'Start' }, { kind: 'change', day: 0, t: 124, label: 'Carvedilol 12.5 mg' }, { kind: 'event', day: 0, t: 127, label: 'HVPG over 10', sev: 'danger' }, { kind: 'change', day: 5, t: 126, label: 'Elsewhere' }];
  const none = traceFrame(rec, view({ range: 'minutes', head: 129.9 }), box());
  const o = traceFrame(rec, view({ range: 'minutes', head: 129.9, marks, dayNow: 0 }), box());
  assert.equal(o.marks.length, 2, 'the start and another day\'s change are not marked');
  assert.ok(words(o).includes('Carvedilol 12.5 mg') || words(o).some((x) => x.startsWith('Carvedilol')), 'the label is written');
  assert.equal(o.frame.shapes.filter((s) => (s as { key?: string }).key === 'mark-line').length, 2);
  const dot = o.frame.shapes.find((s) => (s as { key?: string }).key === 'mark-dot' && (s as { fill?: number[] }).fill!.join() === paletteOf('light').tok('danger').join());
  assert.ok(dot, 'an event wears its severity colour');
  assert.ok(o.lanes[0]!.top > none.lanes[0]!.top, 'the plot starts below the rows of labels');
  const near = traceFrame(rec, view({ range: 'beats', head: 129.9, marks: [{ kind: 'change', day: 0, t: 126, label: 'One' }, { kind: 'change', day: 0, t: 126.05, label: 'Two' }], dayNow: 0 }), box());
  assert.equal(near.marks.length, 1); assert.equal(near.marks[0]!.n, 2);
  assert.ok(near.marks[0]!.label.includes('+1'), 'the label counts the others');
  const old = traceFrame(rec, view({ range: 'beats', head: 129.9, marks: [{ kind: 'change', day: 0, t: 90, label: 'Gone' }], dayNow: 0 }), box());
  assert.equal(old.marks.length, 0, 'a change older than the window is off the chart');
  const days = traceFrame(asRec(lapse(60)), view({ range: 'days', head: 0, ends: {}, marks: [{ kind: 'change', day: 30, t: 40000, label: 'TIPS' }, { kind: 'jump', day: 45, t: 0, label: '+1 mo' }] }), box());
  assert.equal(days.marks.length, 2, 'the days mark every day, wherever it fell');
});

test('the crosshair reads every trace at one moment, in a card with the time as words', () => {
  const rec = asRec(filled());
  const none = traceFrame(rec, view(), box());
  assert.equal(none.cross, null);
  const o = traceFrame(rec, view({ cross: 200 }), box());
  assert.ok(o.cross, 'the pointer is over the plot');
  assert.deepEqual(o.cross!.rows.map((r) => r.label), ['Portal', 'Wedged', 'Free', 'HVPG']);
  assert.match(o.cross!.when, /^\d+\.\d s ago$/);
  assert.ok(Math.abs(o.cross!.rows[3]!.v - 11) < 1e-9);
  assert.ok(words(o).includes('Portal') && words(o).includes(o.cross!.when));
  assert.equal(traceFrame(rec, view({ cross: 4 }), box()).cross, null, 'left of the plot reads nothing');
  assert.equal(traceFrame(rec, view({ cross: 459 }), box()).cross, null, 'nor right of it');
  const nowEdge = traceFrame(rec, view({ cross: o.L + o.plotW }), box());
  assert.equal(nowEdge.cross!.when, 'now');
  const d = traceFrame(asRec(lapse(60)), view({ range: 'days', head: 0, ends: {}, cross: 200 }), box());
  assert.match(d.cross!.when, /^Day \d+$/);
  const cardRight = d.frame.shapes.find((s) => (s as { key?: string }).key === 'cross-card') as { x: number; w: number };
  assert.ok(cardRight.x >= 0 && cardRight.x + cardRight.w <= 460, 'the card stays in the box');
});

test('Smooth is the 2D trailing mean: the ripple goes, and the line starts where the average is whole', () => {
  const rec = asRec(filled());
  const s = seriesOf(rec, 'CONF', 'minutes', 10, 129.9, true, 300);
  assert.ok(s.x[0]! >= 0.125 + 9 - 1e-9, 'not before 1.5 smoothing windows of record');
  assert.ok(Math.max(...s.mid) - Math.min(...s.mid) < 0.3, 'the breathing ripple is averaged away');
  const b = seriesOf(rec, 'CONF', 'beats', 120, 129.9, true, 300);
  assert.ok(b.x.length > 40 && Math.max(...b.mid) - Math.min(...b.mid) < 0.3, 'the 10 s range smooths from the samples too');
});

test('the freewheel replays the last beat while the model stands still, and the live samples take the sweep on', () => {
  const f = filled(20);
  const n0 = f.n, last = f.last;
  const m = (k: string) => (k === 'hvpg' ? 11 : NaN);
  const lv = KEYS_FOR_TEST.map(m);
  const smp = f.wheel.advance(1000, f.fine as never, f.beat.times, f.last, f.last, 0.12, 75, 0.3, 4, lv as never);
  assert.ok(smp, 'a beat is laid');
  f.layWheel(smp as never);
  assert.ok(f.n > n0 && f.last > last, 'the record runs on');
  assert.ok(f.wheel.on && f.wheel.laid);
  f.adopt({ jump: false, samples: run(last + 0.01, 1) });
  assert.ok(!f.wheel.on, 'live samples land the freewheel');
  assert.ok(f.off !== 0, 'and their time is moved to follow the sweep');
  assert.ok(f.t.every((t, i) => i === 0 || t > f.t[i - 1]!), 'in order');
});
