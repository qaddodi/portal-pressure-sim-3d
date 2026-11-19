// B11, the Doppler pane: the reading and its words are the 2D app's (copied: createReading, interpret), the record is read from the page's kept samples, the spectrum is a chart frame,
// and the probe's state is readable outside the pane (for the figure's ultrasound probe). Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SampleFeed } from '../src/ui/tests/feed.ts';
import { DopplerModel } from '../src/ui/tests/doppler/model.ts';
import { PROBES, SEGS, SETTINGS, probeName } from '../src/ui/tests/doppler/copied/doppler-tables.copied.js';
import { DOPPLER_MODES, THETA } from '../src/ui/tests/doppler/copied/doppler-colours.copied.js';
import { useDopplerProbe, dopplerProbeId, dopplerOpen } from '../src/ui/tests/doppler/probe-state.ts';
import { useTests } from '../src/ui/tests/store.ts';
import { BUILT_PANES } from '../src/ui/tests/panes.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { defaultParams } from '../src/engine/hales/portal/scenario.js';
import { setParams } from '../src/engine/store.ts';
import { SPECTRUM_FS, SPECTRUM_VS, SPECTRUM_JOINED, spectrumUnder } from '../src/ui/tests/doppler/spectrum-gl.ts';

const EN = (EDGES as unknown[]).length;
/** The record of a probe for `secs` seconds, at 50 samples a second, a beat every 0.8 s: v(t) = mean + amp * a beat's shape. */
function record(rec: SampleFeed, probe: string, t0: number, secs: number, mean: number, amp: number) {
  const n = Math.round(secs * 50), t: number[] = [], vel: number[] = [], ph: number[] = [];
  for (let i = 0; i < n; i++) { const tt = t0 + i / 50, p = (tt / 0.8) % 1; t.push(tt); ph.push(p); vel.push(mean + amp * Math.sin(2 * Math.PI * p)); }
  rec.adopt({ jump: false, probe, samples: { t, vel, ph } } as never);
}
const frame = () => ({ clock: 'hemo', running: true, speed: 1, settling: false, D: new Float32Array(EN).fill(12), Q: new Float32Array(EN), metrics: {} });

test('the Doppler tab is built and the tables are the 2D probes, named as 2D names them', () => {
  assert.ok(BUILT_PANES.includes('doppler'));
  const ids = (PROBES as { id: string }[]).map((p) => p.id);
  assert.deepEqual(ids.slice(0, 3), ['PV_TRUNK', 'PVH_R', 'PVH_L']);
  assert.equal((PROBES as { short: string }[])[0]!.short, 'MPV');
  assert.equal(probeName((PROBES as never[])[7]), 'RHV');
  assert.ok(/^TIPS /.test(probeName((PROBES as never[]).find((p: { id: string }) => p.id === 'TIPS') as never)), 'a stent names its course');
  assert.deepEqual((DOPPLER_MODES as { id: string }[]).map((m) => m.id), ['spectrum', 'velocity', 'variance']);
  assert.equal(THETA, 50);
  assert.deepEqual((SEGS as string[][]).map((s) => s[1]), ['Proximal', 'Mid', 'Distal']);
  assert.equal((SETTINGS as string[][][][])[0]![4]![0]![3], 'PW  ·  θ 50°  ·  SV 4 mm  ·  6 s', 'the strip names the mode, the angle, the sample volume and the sweep');
});

test('the reading of a healthy portal vein: hepatopetal, in its usual range, the 2D tiles; the spectrum is a frame of the 2D words', () => {
  const rec = new SampleFeed();
  useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
  record(rec, 'PV_TRUNK', 0, 8, 18, 3);
  const m = new DopplerModel();
  m.ingest(frame(), rec);
  const r = m.report();
  assert.equal(r.acquiring, false);
  assert.equal(r.dir, 'Hepatopetal');
  assert.equal(r.kind, 'portal');
  assert.ok(Math.abs(Number(r.vel) - 18 / 0.57) < 4, `the scanner reads the peak of the spectrum (mean / 0.57): ${r.vel}`);
  const names = r.tiles.filter((t) => t.show).map((t) => t.label);
  assert.deepEqual(names, ['Speed', 'Max', 'Trough', 'Pulsatility', 'CI'], 'a portal trunk has the congestion index and no stent gates');
  assert.ok(r.gauge && !r.gauge.out, 'inside the usual range');
  const f = m.frameFor(400, 190, 1000, r.aria);
  assert.equal(f.w, 400);
  assert.ok(f.shapes.filter((s) => s.k === 'rect').length > 100, 'the spectrum is a band of lines');
  const words = f.shapes.filter((s) => s.k === 'text').map((s) => (s as { s: string }).s);
  assert.ok(words.includes('cm/s') && words.includes('0'), 'the unit and the baseline');
  assert.ok(words.includes('MPV'), 'the vessel is named at the top');
  assert.ok(/PW/.test(words.join(' ')), 'the settings are the 2D strip: PW · θ 50° · SV mm · sweep');
});

test('a hepatic vein is judged as one (forward flow is away from the probe: the trace is below the baseline), and a new vessel starts the record over', () => {
  const rec = new SampleFeed();
  useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
  record(rec, 'PV_TRUNK', 0, 6, 18, 3);
  const m = new DopplerModel();
  m.ingest(frame(), rec);
  assert.equal(m.report().kind, 'portal');
  useDopplerProbe.setState({ probe: 'RHV_IVC' });
  m.ingest(frame(), rec);
  assert.equal(m.report().acquiring, true, 'a new vessel acquires again');
  record(rec, 'RHV_IVC', 6.02, 6, 12, 6);
  m.ingest(frame(), rec);
  const r = m.report();
  assert.equal(r.kind, 'hepatic');
  assert.ok(['Toward the heart', 'Reversed'].includes(r.dir), r.dir);
  assert.equal(m.rd.pol(), -1, 'a hepatic vein drains away from the probe: below the baseline');
});

test('the figure\'s probe can read the Doppler\'s vessel and whether it is the instrument on show', () => {
  useDopplerProbe.setState({ probe: 'SV_CONF' });
  assert.equal(dopplerProbeId(), 'SV_CONF');
  useTests.setState({ open: false, pane: 'profile' });
  assert.equal(dopplerOpen(), false);
  useTests.getState().show('doppler');
  assert.equal(dopplerOpen(), true);
  useTests.getState().close();
  assert.equal(dopplerOpen(), false);
});

test('the copied files are the 2D app\'s (checked where a 2D checkout is named)', () => {
  const from = process.env.PPS_2D_REPO;
  if (!from || !existsSync(`${from}/src/ui/doppler.js`)) return;
  execFileSync('node', ['scripts/copy-b11-doppler.mjs', '--from', from, '--check'], { stdio: 'pipe' });
});

test('the pane keeps to the shared chart drawer: no canvas or context of its own', () => {
  for (const f of ['DopplerPane.tsx', 'model.ts', 'probe-state.ts', 'spectrum-gl.ts']) {
    const t = readFileSync(new URL(`../src/ui/tests/doppler/${f}`, import.meta.url), 'utf8');
    assert.ok(!/getContext\(|createElement\(\s*['"]canvas|OffscreenCanvas|requestAnimationFrame/.test(t), `${f} draws through the chart drawer and the one clock`);
  }
});

test('a TIPS is sampled at its gates: three segment tiles in place of Trough and Pulsatility, the gate chosen by the learner, and the words judge the stent', () => {
  const p = defaultParams() as { tips: { on: boolean; d: number } };
  p.tips = { ...p.tips, on: true, d: 8 };
  setParams(p);
  const rec = new SampleFeed();
  useDopplerProbe.setState({ probe: 'TIPS', gate: null });
  record(rec, 'TIPS', 0, 8, 90, 10);
  const m = new DopplerModel();
  const f = frame();
  (f.D as Float32Array)[(EDGES as { id: string }[]).findIndex((e) => e.id === 'TIPS')] = 8;
  m.ingest(f, rec);
  let r = m.report();
  assert.equal(r.kind, 'tips');
  assert.deepEqual(r.tiles.filter((t) => t.show).map((t) => t.label), ['Speed', 'Max', 'Proximal', 'Mid', 'Distal']);
  assert.equal(r.tiles.filter((t) => t.here).length, 1, 'one gate is sampled');
  useDopplerProbe.getState().setGate('distal');
  record(rec, 'TIPS', 8.02, 4, 90, 10);
  m.ingest(f, rec);
  r = m.report();
  assert.equal(r.tiles.find((t) => t.here)?.label, 'Distal');
  assert.ok(/^Portal → (hepatic vein|IVC)$|^Reversed$|^No flow$/.test(r.dir), r.dir);
  useDopplerProbe.setState({ gate: null });
});

// ── the grain: 2D's line shader and display pass, joined, drawn under the chart's shapes ──
test('the spectrum shader is 2D\'s own: the line shader\'s speckle and the display pass\'s noise floor and wall filter in one program, with no ring', () => {
  assert.ok(SPECTRUM_JOINED, 'both of 2D\'s shaders were found and joined');
  assert.match(SPECTRUM_FS, /float speckle\(uint c, uint bin\)/, 'the exponential grain of the line shader');
  assert.match(SPECTRUM_FS, /vec3 floorAt\(ivec2 t\)/, 'the noise floor of the display pass');
  assert.match(SPECTRUM_FS, /synthMain\(lx, ly\)/, 'a pixel asks the line shader for its own line');
  assert.ok(!/texelFetch\(ring/.test(SPECTRUM_FS), 'no ring texture: a line is read by its screen column');
  assert.equal((SPECTRUM_FS.match(/void main\(\)/g) ?? []).length, 1);
  assert.match(SPECTRUM_VS, /^#version 300 es/);
});

test('with the GPU\'s picture the model gives each device pixel its own line, the grain\'s numbers scroll with the trace, and no band of shapes is laid', () => {
  const rec = new SampleFeed();
  useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
  record(rec, 'PV_TRUNK', 0, 8, 18, 3);
  const m = new DopplerModel();
  m.gpu = true; m.dpr = 2;
  m.ingest(frame(), rec);
  const f = m.frameFor(400, 190, 1000, 'x');
  assert.ok(m.spec, 'the frame has its trace');
  const W = 400 - 12 - 46, sp = m.spec!;
  assert.equal(sp.RW, W * 2, 'a line is one device pixel wide (2D: one line to a pixel of the ring)');
  assert.equal(sp.spkMix, 0.5, 'the grain\'s width for a 2x screen, as 2D sets it');
  assert.ok(sp.spkPx >= 2 && sp.nBin >= 3 && sp.nRun === 2 && sp.noiseA === 1 && sp.mode === 0);
  assert.equal(f.shapes.filter((s) => s.k === 'rect').length, 0, 'no plate and no band of rects: the picture under the shapes is the trace');
  const lit = (a: Float32Array, b: Float32Array) => { let n = 0; for (let j = 0; j < sp.RW; j++) if (b[j * 4 + 2]! % 2 === 1 && a[j * 4]! > 0) n++; return n; };
  assert.ok(lit(sp.colA, sp.colB) > sp.RW * 0.9, 'nearly every line has a band');
  const cn0 = sp.colB[3]!, cn1 = sp.colB[7]!;
  assert.equal((cn1 - cn0 + 1048576) % 1048576, 1, 'consecutive lines have consecutive numbers: the grain is a hash of the number');
  const first = sp.colA.slice(0, 40);
  // the same moment again gives the same lines (nothing random kept between frames: the grain holds still)
  m.frameFor(400, 190, 1000, 'x');
  assert.deepEqual([...m.spec!.colA.slice(0, 40)], [...first]);
  // colour modes carry the variance and the colour maps' alpha floor
  m.mode = 'variance';
  m.frameFor(400, 190, 1000, 'x');
  assert.equal(m.spec!.mode, 2); assert.equal(m.spec!.noiseA, 0.3);
  assert.ok(Array.from({ length: m.spec!.RW }, (_, j) => m.spec!.colB[j * 4 + 1]!).some((v) => v > 0), 'a line carries its variance');
  // without the GPU the shapes lay the spectrum again, as before
  const m2 = new DopplerModel(); m2.ingest(frame(), rec);
  assert.ok(m2.frameFor(400, 190, 1000, 'x').shapes.filter((s) => s.k === 'rect').length > 100);
});

test('the picture under the shapes draws with 2D\'s uniforms on the drawer\'s context, and a program that will not build is reported once, the shapes taking over', () => {
  const rec = new SampleFeed();
  useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
  record(rec, 'PV_TRUNK', 0, 8, 18, 3);
  const m = new DopplerModel(); m.gpu = true; m.ingest(frame(), rec); m.frameFor(300, 160, 0, 'x');
  const calls: string[] = [];
  const gl = new Proxy({} as Record<string, unknown>, { get: (_t, k: string) => (k === 'getShaderParameter' || k === 'getProgramParameter' ? () => true : k === 'getUniformLocation' ? (_p: unknown, n: string) => n : (...a: unknown[]) => { calls.push(`${k}:${a.length}`); return typeof k === 'string' && /^(create|get)/.test(k) ? {} : undefined; }) }) as unknown as WebGL2RenderingContext;
  let failed = 0;
  const under = spectrumUnder(() => m.spec, () => failed++, () => 0);
  under(gl, 600, 320, 1);
  assert.equal(failed, 0);
  assert.ok(calls.some((c) => c.startsWith('drawArrays')) && calls.some((c) => c.startsWith('viewport')) && calls.some((c) => c.startsWith('uniform1ui')), 'one quad drawn over the trace\'s rectangle with the seed');
  const bad = new Proxy({} as Record<string, unknown>, { get: (_t, k: string) => (k === 'getShaderParameter' ? () => false : k === 'getShaderInfoLog' ? () => 'ERROR' : () => ({})) }) as unknown as WebGL2RenderingContext;
  const under2 = spectrumUnder(() => m.spec, () => failed++, () => 0);
  const warn = console.warn; console.warn = () => undefined;
  try { under2(bad, 600, 320, 1); under2(bad, 600, 320, 1); } finally { console.warn = warn; }
  assert.equal(failed, 1, 'reported once');
});

// ── the time lapse: the trace keeps scrolling from the last beats ──
test('in a time lapse the trace is replayed from the last beats, its mean easing to the vessel\'s now; the bedside samples follow on when it ends', () => {
  const rec = new SampleFeed();
  useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
  record(rec, 'PV_TRUNK', 0, 8, 18, 3);
  const m = new DopplerModel();
  m.ingest(frame(), rec);
  const tEnd = m.buf[m.buf.length - 1]![0]!, n0 = m.buf.length;
  const lapse = (vel: number, resp = true) => ({ ...frame(), clock: 'disease', running: true, resp, samples: { t: [999], vel: [vel] } });
  m.ingest(lapse(10), rec);
  assert.equal(m.live, true, 'a running lapse scrolls the trace');
  for (let i = 0; i < 6; i++) { (m as unknown as { synth: { wall: number } }).synth.wall -= 200; m.ingest(lapse(10), rec); }
  assert.ok(m.buf.length > n0 + 20 && m.buf[m.buf.length - 1]![0]! > tEnd + 0.5, 'samples are added at bedside speed');
  const r = m.report();
  assert.equal(r.acquiring, false);
  assert.notEqual(r.dir, 'Not available during time lapse', 'the reading goes on from the replay');
  const mean = (x: number[][]) => x.slice(-100).reduce((a, q) => a + q[1]!, 0) / 100;
  const before = mean(m.buf);
  for (let i = 0; i < 40; i++) { (m as unknown as { synth: { wall: number } }).synth.wall -= 250; m.ingest(lapse(10), rec); }
  assert.ok(Math.abs(mean(m.buf) - 10) < Math.abs(before - 10), 'the replay\'s mean eases toward the vessel\'s velocity');
  // breathing stops: the swings go flat
  m.ingest(lapse(10, false), rec);
  assert.equal(m.buf[m.buf.length - 1]![1], m.buf[m.buf.length - 2]![1], 'a lapse without respiration draws a flat trace');
  // the bedside clock returns with its own times (a new record, earlier than the replay): its samples follow the replay
  const tEnd2 = m.buf[m.buf.length - 1]![0]!;
  const rec2 = new SampleFeed();
  record(rec2, 'PV_TRUNK', 0, 2, 10, 1);
  m.ingest(frame(), rec2);
  assert.ok(m.buf[m.buf.length - 1]![0]! > tEnd2, 'the trace carries on from where it is, not from the start');
  const ts = m.buf.map((q) => q[0]!);
  assert.ok(ts.every((t, i) => i === 0 || t > ts[i - 1]!), 'times only go forward');
});

test('the Speed tile is there only for a vessel with a usual range (a collateral has none)', () => {
  const rec = new SampleFeed();
  useDopplerProbe.setState({ probe: 'C1b', gate: null });
  record(rec, 'C1b', 0, 6, 8, 2);
  const m = new DopplerModel();
  m.ingest(frame(), rec);
  const r = m.report();
  assert.equal(r.kind, 'collateral');
  assert.equal(r.tiles.find((t) => t.k === 'Speed')!.show, false);
  assert.equal(r.gauge, null);
});

test('the Doppler\'s CSS: the dock card\'s own rules re-scoped to the Tests card, and the markup is 2D\'s (the usual-range gauge in its caps, the switches, the clock)', () => {
  const css = readFileSync(new URL('../src/ui/tests/doppler/copied/doppler-2d.copied.css', import.meta.url), 'utf8');
  assert.match(css, /\.t-card\.t-card \.dop-stats > div:not\(\[hidden\]\)/, 'the float card\'s figures with a hairline between');
  assert.match(css, /\.t-card \.dop-speed \.dop-range \{ display: block/, 'the Speed tile carries its usual range');
  assert.ok(!/instrument-workspace|\.side\b|#app/.test(css.split('\n').slice(1).join('\n')), 'nothing of the dock\'s own layout');
  const pane = readFileSync(new URL('../src/ui/tests/doppler/DopplerPane.tsx', import.meta.url), 'utf8');
  for (const w of ['dop-band dop-band-caps', 'dop-bm', 'dop-bc', 'dop-g-zero', 'dop-g-lo', 'dop-g-hi', 'chart-box dark dop-box', 'dop-lbl', 'I n="clock"']) assert.ok(pane.includes(w), `the pane has 2D's ${w}`);
  assert.ok(!/t-seg/.test(pane), 'the display switch is 2D\'s text switch, not the Tests card\'s pill');
});
