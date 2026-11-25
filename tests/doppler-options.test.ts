// A slide's own Doppler options (2D doppler.js configure, V20 to V29): the fixed velocity scale, the calipers with the index in the strip, the paired trace, the hepatic vein's waves named, the
// display mode that resets with the next slide, and the earlier reading shown faint beside the instrument. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SampleFeed } from '../src/ui/tests/feed.ts';
import { DopplerModel } from '../src/ui/tests/doppler/model.ts';
import { hvWaves } from '../src/ui/tests/doppler/waves.ts';
import { useDopplerProbe } from '../src/ui/tests/doppler/probe-state.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { ghostOf } from '../src/ui/talk/ghost.ts';
import type { TextShape, Shape } from '../src/ui/charts/scene.ts';

const EN = (EDGES as unknown[]).length;
const frame = () => ({ clock: 'hemo', running: true, speed: 1, settling: false, D: new Float32Array(EN).fill(12), Q: new Float32Array(EN), metrics: {} });
const bump = (ph: number, at: number, w: number, h: number) => h * Math.exp(-(((ph - at) / w) ** 2));
/** A triphasic hepatic vein as the display draws it (y: the a-wave above the baseline, the S and D troughs below it), one beat every 0.8 s. */
const triphasic = (ph: number) => bump(ph, 0.02, 0.03, 12) + bump(ph, 0.27, 0.06, -34) + bump(ph, 0.5, 0.05, -6) + bump(ph, 0.68, 0.05, -22);
function record(rec: SampleFeed, probe: string, secs: number, vel: (t: number, ph: number) => number, pair?: (t: number, ph: number) => number) {
  const n = Math.round(secs * 50), t: number[] = [], v: number[] = [], ph: number[] = [], pv: number[] = [];
  for (let i = 0; i < n; i++) { const tt = i / 50, p = (tt / 0.8) % 1; t.push(tt); ph.push(p); v.push(vel(tt, p)); pv.push(pair ? pair(tt, p) : NaN); }
  rec.adopt({ jump: false, probe, samples: { t, vel: v, ph, pvVel: pv, hvVel: pv } } as never);
}
const words = (shapes: readonly Shape[]) => shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s);
const keys = (shapes: readonly Shape[]) => shapes.map((s) => (s as { key?: string }).key).filter(Boolean) as string[];

test('the hepatic vein\'s waves: the newest settled whole beat is named a, S, v, D in time order, none on a trace with no reversal', () => {
  const buf: number[][] = [];
  for (let i = 0; i < 400; i++) { const t = i / 50; buf.push([t, triphasic((t / 0.8) % 1)]); }
  const w = hvWaves(buf, 0, 8, 1)!;
  assert.ok(w, 'a triphasic trace is named');
  assert.deepEqual(w.map((x) => x[2]), ['a', 'S', 'v', 'D']);
  assert.ok(w[0][0] < w[1][0] && w[1][0] < w[2][0] && w[2][0] < w[3][0], 'in the order of the beat');
  assert.ok(w[0][1] > 0 && w[1][1] < -20 && w[3][1] < -10, 'the reversal above the baseline, the two forward waves below it');
  assert.ok(w[3][0] < 8 - 0.35, 'a beat is named once its closing a-wave has settled');
  assert.equal(hvWaves(buf.map(([t]) => [t, -15 + 3 * Math.sin(t * 8)]), 0, 8, 1), null, 'no reversal, no letters');
  assert.equal(hvWaves(buf.slice(0, 5), 0, 0.1, 1), null, 'too little record');
});

test('a fixed scale is the Nyquist limit: ± that many cm/s with the baseline where the slide puts it; no scale, the display fits itself', () => {
  const rec = new SampleFeed(); useDopplerProbe.setState({ probe: 'TIPS', gate: 'mid' });
  record(rec, 'TIPS', 8, (_t, p) => 90 + 20 * Math.sin(2 * Math.PI * p));
  const m = new DopplerModel(); m.ingest(frame(), rec);
  const ticks = (o?: Parameters<DopplerModel['configure']>[0]) => { m.configure(o); return words(m.frameFor(420, 200, 1000, '').shapes).filter((s) => /^\d+$/.test(s)).map(Number); };
  const fit = ticks({});
  const fixed = ticks({ scale: 150 });
  assert.ok(Math.max(...fixed) <= 150 && Math.max(...fixed) >= 100, `the 150 cm/s limit sets the top of the trace: ${fixed}`);
  assert.notDeepEqual(fixed, fit);
  assert.deepEqual(ticks({ scale: 150 }), fixed, 'the same slide draws the same scale');
  assert.deepEqual(ticks({}), fit, 'the next slide fits itself again');
});

test('calipers: a dashed line at the highest and lowest velocity, an upright between them, the index in the strip; the next slide has none', () => {
  const rec = new SampleFeed(); useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
  record(rec, 'PV_TRUNK', 9, (_t, p) => 20 + 8 * Math.sin(2 * Math.PI * p));
  const m = new DopplerModel(); m.ingest(frame(), rec);
  m.configure({ calipers: true });
  const on = m.frameFor(420, 200, 1000, '');
  assert.ok(on.shapes.filter((s) => s.k === 'line' && (s as { pen: { dash?: number[] } }).pen.dash).length >= 4, 'two dashed levels, each on a dark edge');
  assert.ok(words(on.shapes).some((s) => /^PI \d\.\d\d$/.test(s)), 'the pulsatility index is in the strip');
  assert.ok(keys(on.shapes).includes('cal-hi') && keys(on.shapes).includes('cal-lo'), 'the two speeds beside the upright');
  m.configure({});
  assert.ok(!words(m.frameFor(420, 200, 1100, '').shapes).some((s) => /^PI /.test(s)));
});

test('the paired trace takes a band under the main one, named by its vessel, with its own scale; the main trace is shorter, the card the same size', () => {
  const rec = new SampleFeed(); useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
  record(rec, 'PV_TRUNK', 9, (_t, p) => 20 + 6 * Math.sin(2 * Math.PI * p), (_t, p) => -15 + 10 * Math.sin(2 * Math.PI * p));
  const m = new DopplerModel(); m.ingest(frame(), rec);
  const base = m.frameFor(420, 260, 1000, '');
  m.configure({ pair: true });
  const f = m.frameFor(420, 260, 1000, '');
  assert.equal(f.h, base.h);
  assert.ok(words(f.shapes).includes('RHV'), 'a portal vein is paired with the right hepatic vein');
  assert.ok(keys(f.shapes).includes('pair-line') && keys(f.shapes).includes('pair-plate'));
  assert.ok(!keys(base.shapes).includes('pair-plate'));
  const baseline = (x: typeof f) => (x.shapes.find((q) => q.k === 'text' && (q as TextShape).key === 'tick0') as TextShape).y;
  assert.ok(baseline(f) < baseline(base), 'the main trace is shorter: its baseline sits higher');
});

test('the display mode is the slide\'s: a slide that names colour opens on it and the next returns to Spectrum', () => {
  const m = new DopplerModel();
  m.configure({ mode: 'color' }); assert.equal(m.mode, 'velocity');
  m.configure({ mode: 'variance' }); assert.equal(m.mode, 'variance');
  m.configure({}); assert.equal(m.mode, 'spectrum');
});

test('the earlier reading, faint beside the instrument: the main portal vein\'s velocity, the stiffness of the liver or the spleen; none when a tile already gives it', () => {
  const slides = [{ id: 'a', kicker: 'Baseline' }, { id: 'before', kicker: 'Before' }, { id: 'now', kicker: 'After' }];
  const fps: Record<string, Record<string, number>> = { a: { pvVel: 14.4 }, before: { pvVel: 12, lsm: 21.3, ssm: 40 }, now: { pvVel: 25 } };
  const fpOf = (id: string) => fps[id] ?? null, st = [0, 1, 2];
  assert.deepEqual(ghostOf({ tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'before' } }, 2, slides, fpOf, st), { label: 'Before', value: '12 cm/s' });
  assert.deepEqual(ghostOf({ tool: { kind: 'doppler' }, delta: true }, 2, slides, fpOf, st), { label: 'Before', value: '12 cm/s' }, 'delta: true counts from the slide before');
  assert.deepEqual(ghostOf({ tool: { kind: 'doppler', delta: 'a', deltaLabel: 'Day 0' } }, 2, slides, fpOf, st), { label: 'Day 0', value: '14 cm/s' });
  assert.deepEqual(ghostOf({ tool: { kind: 'fibroscan', delta: 'before' } }, 2, slides, fpOf, st), { label: 'Before', value: '21.3 kPa' });
  assert.deepEqual(ghostOf({ tool: { kind: 'fibroscan', organ: 'spleen', delta: 'before' } }, 2, slides, fpOf, st), { label: 'Before', value: '40.0 kPa' });
  assert.equal(ghostOf({ tool: { kind: 'doppler', vessel: 'TIPS', delta: 'before' } }, 2, slides, fpOf, st), null, 'only the main portal vein');
  assert.equal(ghostOf({ tool: { kind: 'doppler', delta: 'before' }, tiles: ['pvVel'] }, 2, slides, fpOf, st), null, 'a tile already gives the change');
  assert.equal(ghostOf({ tool: { kind: 'doppler' } }, 2, slides, fpOf, st), null, 'no delta, no ghost');
  assert.equal(ghostOf({ tool: { kind: 'doppler', delta: 'missing' } }, 2, slides, fpOf, st), null);
});

test('on a slide\'s data card the report sits over the monitor\'s top strip: the trace starts under it and the vessel and settings run along the foot (2D --dop-ov); with no strip (ovTop null: a card laid out with no --dop-ov) they stay above', () => {
  const rec = new SampleFeed(); useDopplerProbe.setState({ probe: 'TIPS', gate: 'mid' });
  record(rec, 'TIPS', 8, (_t, p) => 90 + 20 * Math.sin(2 * Math.PI * p));
  const m = new DopplerModel(); m.ingest(frame(), rec);
  const ys = (shapes: readonly Shape[], key: string) => (shapes.find((s) => (s as { key?: string }).key === key) as TextShape | undefined)?.y;
  const card = m.frameFor(420, 226, 1000, '').shapes;
  assert.equal(ys(card, 'name'), 13, 'no strip: the vessel above the trace');
  m.ovTop = 44;
  const slide = m.frameFor(420, 226, 1000, '').shapes;
  assert.equal(ys(slide, 'name'), 226 - 11, 'the slide card: the vessel along the foot of the panel, whatever its height');
  assert.equal(ys(slide, 'unit'), 226 - 11, 'and the unit with it');
  const base = slide.find((s) => s.k === 'line' && (s as { pen?: { w: number } }).pen?.w === 1 && (s as { x1: number }).x1 < 80) as { y1: number } | undefined;
  assert.ok(!base || base.y1 > 44, 'nothing of the trace above the strip');
});

test('the Doppler\'s clock draw reads the box\'s height from a ref (it is registered once: a captured height drew the trace at the first render\'s size)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/tests/doppler/DopplerPane.tsx', import.meta.url), 'utf8');
  assert.match(src, /frameFor\(c\.w, hRef\.current,/);
  const draw = src.match(/const draw = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.ok(draw.includes('hRef.current') && !/frameFor\(c\.w, h,/.test(draw), 'draw uses the ref');
});

test('the report takes the top strip wherever 2D\'s stylesheet sets --dop-ov (the side Tests card, a phone\'s sheet, a slide), not on slides only: root cause of the settings line printing over the velocity readout (20 Nov)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/tests/doppler/DopplerPane.tsx', import.meta.url), 'utf8');
  assert.match(src, /getPropertyValue\('--dop-ov'\)/, 'the pane reads --dop-ov as doppler.js does');
  assert.match(src, /m\.ovTop = ovTop;/, 'the model gets the strip from the measurement, not from p.slide');
  assert.doesNotMatch(src, /m\.ovTop = p\.slide/);
  const css = readFileSync(new URL('../src/ui/styles/app-10-thumb-dock.css', import.meta.url), 'utf8');
  assert.match(css, /\.instrument-workspace\.side \.instrument-view\.dop \.dop-box \{ --dop-ov: 1;/, 'the side card sets it, as in 2D');
});
