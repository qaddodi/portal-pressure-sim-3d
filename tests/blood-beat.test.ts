// The blood in the sinusoid and the lobule pulses with the heart again (Mohammad, 25 Nov 2026: "the sinusoid view, the blood used to pulse with pulsatile issues, cardiac issues and stuff").
// Root cause: on 23 Nov (fbb2df82) the lobule and sinusoid were fed from the shown, beat-averaged flows (Qf) so no number would shake, and the blood's speed, which read the same flow, lost its beat
// with them. The speed now reads the live beat (Q) through its own channel; every colour, width and reading stays on the shown numbers. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as host from '../src/engine/hales/host/worker-core.js';
import { Engine } from '../src/engine/hales/portal/engine.js';
import { PRESETS } from '../src/engine/hales/portal/scenario.js';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { type HealthyRef, bloodBeat, bloodSpeed, lobuleModel, sinusoidTargets } from '../src/scene/lobule/model.ts';

const atBedside = (host as unknown as { atBedside(e: unknown): void }).atBedside;

/** A preset settled at the bedside with its heart beating, stepped a beat at a time: the engine's own Q (beat by beat) and Qf (the shown mean) at each step. */
let healthyRef: HealthyRef | null = null;
function run(id: string, secs: number): { e: Engine; healthy: HealthyRef; Q: Float32Array[]; Qf: Float32Array[]; P: Float32Array[]; Pf: Float32Array[] } {
  if (!healthyRef) {
    const h = new Engine();
    { const g = h.loadPresetSteps('healthy', {}); while (!g.next().done); atBedside(h); for (let i = 0; i < 300; i++) h.step(0.008); }
    healthyRef = { P: Float32Array.from(h.Pf || h.P), Q: Float32Array.from(h.Qf || h.Q) };
  }
  const healthy = healthyRef;
  const e = new Engine();
  const g = e.loadPresetSteps(id, {});
  while (!g.next().done);
  atBedside(e);
  for (let i = 0; i < 300; i++) e.step(0.008);
  const out = { e, healthy, Q: [] as Float32Array[], Qf: [] as Float32Array[], P: [] as Float32Array[], Pf: [] as Float32Array[] };
  for (let i = 0; i < secs / 0.008; i++) {
    e.step(0.008);
    out.Q.push(Float32Array.from(e.Q)); out.Qf.push(Float32Array.from(e.Qf || e.Q)); out.P.push(Float32Array.from(e.P)); out.Pf.push(Float32Array.from(e.Pf || e.P));
  }
  return out;
}
const speeds = (r: ReturnType<typeof run>, zoneSin = 1): number[] => r.Q.map((q) => { const b = bloodBeat(q, r.healthy); return bloodSpeed(b.flow, b.rev, zoneSin); });
const swing = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);

test('the shown flow has no beat in it and the live one does: the cause of the lost pulse, and the cure reads the live one', () => {
  const r = run('rhf', 3);
  const live = speeds(r), shown = r.Qf.map((q) => { const b = bloodBeat(q, r.healthy); return bloodSpeed(b.flow, b.rev, 1); });
  assert.ok(swing(shown) < 0.1, `the shown blood speed stands still (swing ${swing(shown).toFixed(3)})`);
  assert.ok(swing(live) > 1, `the live blood speed beats (swing ${swing(live).toFixed(2)})`);
});

test('the cardiac presets pulse hard (right heart failure with TR runs backwards in the beat, constriction nearly stops and rushes), every preset has a beat, and the mean stays the shown speed', () => {
  const want: Record<string, number> = { rhf: 1.5, constrictive: 0.8 };
  for (const p of PRESETS as { id: string }[]) {
    const r = run(p.id, 2), live = speeds(r), shownV = r.Qf.map((q) => { const b = bloodBeat(q, r.healthy); return bloodSpeed(b.flow, b.rev, 1); });
    assert.ok(swing(live) > Math.max(0.02, want[p.id] ?? 0), `${p.id}: the blood's beat swings ${swing(live).toFixed(2)}`);
    const mean = live.reduce((a, b) => a + b, 0) / live.length, shown = shownV.reduce((a, b) => a + b, 0) / shownV.length;
    assert.ok(Math.abs(mean - shown) < 0.2 * Math.max(0.3, Math.abs(shown)) + 0.1, `${p.id}: the beat's mean ${mean.toFixed(2)} is the shown ${shown.toFixed(2)}`);
  }
});

test('sinusoidTargets keeps its blood speed rule (one rule for the shown and the live speed)', () => {
  const r = run('cirr-decomp', 0.5), Q = r.Qf[0]!, P = r.Pf[0]!;
  const m = lobuleModel({ P, Q, params: r.e.paramsTarget() }, r.healthy, r.e.paramsTarget());
  const b = bloodBeat(Q, r.healthy);
  assert.equal(sinusoidTargets(m).v, bloodSpeed(b.flow, b.rev, m.zone.sin));
});

test('the sinusoid view runs its blood at the live speed while its end arrows, names and every reading hold the shown direction and speed', () => {
  const v = new SinusoidView(createShared());
  const m = lobuleModel({ P: new Float32Array(60).fill(8), Q: new Float32Array(120).fill(1) }, null, {});
  const t = sinusoidTargets(m);
  v.setVisible(true); v.snapTargets({ ...t, v: 1 }, -1.2); v.update(0);
  const x0 = v.flowRun;
  for (let i = 1; i <= 20; i++) v.update(i * 33);
  assert.ok(v.flowRun < x0 - 5, `the blood ran backwards in a backward beat (${x0.toFixed(1)} to ${v.flowRun.toFixed(1)} µm)`);
  assert.equal(v.flowDir, 1, 'the end arrows keep the shown direction');
  assert.equal(v.state.v, 1, 'the shown speed is the state\'s');
  v.setTargets({ ...t, v: 1 }, 1.5);
  for (let i = 21; i <= 80; i++) v.update(i * 33);
  const x1 = v.flowRun;
  for (let i = 81; i <= 100; i++) v.update(i * 33);
  assert.ok(v.flowRun > x1 + 10, 'and forward in a forward one, eased between the two');
  assert.equal(v.flowDir, 1);
});

test('with no live speed the blood runs at the shown one (a held moment, a clock that is stopped), and a hidden view asks for nothing', () => {
  const v = new SinusoidView(createShared());
  const t = sinusoidTargets(lobuleModel({ P: new Float32Array(60).fill(8), Q: new Float32Array(120).fill(1) }, null, {}));
  v.setVisible(true); v.snapTargets({ ...t, v: 1 }); v.update(0);
  const x0 = v.flowRun;
  for (let i = 1; i <= 20; i++) v.update(i * 33);
  assert.ok(v.flowRun > x0 + 5);
  v.setVisible(false);
  assert.equal(v.update(1e6), false);
});

test('the lobule view\'s blood follows the live beat in its flow, the model it keeps is the shown one', () => {
  const v = new LobuleView(createShared());
  const m = lobuleModel({ P: new Float32Array(60).fill(8), Q: new Float32Array(120).fill(1) }, null, {});
  v.setVisible(true);
  v.snapModel(m, { flow: 2, rev: false }); assert.equal(v.cur.flow, 2);
  v.snapModel(m, { flow: 0.4, rev: true }); assert.equal(v.cur.flow, -0.4);
  v.snapModel(m); assert.equal(v.cur.flow, Math.abs(m.flow), 'no beat: the shown mean');
});
