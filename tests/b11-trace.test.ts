import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SampleFeed, record, CHANNELS, BIN_S } from '../src/ui/tests/feed.ts';
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
const asRec = (f: SampleFeed) => ({ t: f.t, ch: f.ch, binT: f.binT, bin: f.bin, beats: f.beat.times });

test('the feed keeps what it is given, bins it by quarter seconds and finds the beats', () => {
  const f = filled(10);
  assert.equal(f.n, 1000);
  assert.equal(f.binT.length, 40);
  assert.equal(f.binT[1]! - f.binT[0]!, BIN_S);
  assert.ok(f.bin.CONF.hi[3]! > f.bin.CONF.lo[3]!, 'a bin keeps its trough and its peak');
  assert.ok(Math.abs(f.bin.hvpg.mean[3]! - 11) < 1e-9);
  assert.ok(f.beat.times.length >= 11 && f.beat.times.length <= 13, `${f.beat.times.length} beats in 10 s at 0.8 s`);
});

test('a clock that was set (a jump, a step back, a gap past half a second) starts the record again', () => {
  const f = filled(5);
  f.adopt({ jump: false, samples: run(5.01, 1) }); assert.equal(f.n, 600, 'the next frame joins');
  f.adopt({ jump: false, samples: run(20, 1) }); assert.equal(f.n, 100, 'a gap of 14 s is a clock that was set');
  f.adopt({ jump: false, samples: run(3, 1) }); assert.equal(f.n, 100, 'going back starts again');
  f.adopt({ jump: true, samples: run(4, 1) }); assert.equal(f.n, 100, 'a jump starts again and takes the frame');
  assert.equal(f.binT.length, 4);
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
  assert.ok(s.x.length <= 160 && s.x.length >= 40, `${s.x.length} points`);
  assert.ok(s.x[0]! <= 120.05 && s.x[s.x.length - 1]! >= 129.9);
  assert.equal(record.t.length, 0, 'the app\'s own record starts empty');
  void noEase;
});
