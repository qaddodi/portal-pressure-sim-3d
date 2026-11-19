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
  for (const f of ['DopplerPane.tsx', 'model.ts', 'probe-state.ts']) {
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
