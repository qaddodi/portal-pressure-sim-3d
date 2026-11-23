// Mohammad, 23 Nov: on slide 1 of "Doppler of the portal system" the main portal vein trace broke off: the velocity ramped to about 40 cm/s and dropped straight to 18. Root cause: a slide's
// replay (DopplerModel.startSynth / runSynth) loops the last whole beats of the record, matched to the record only in the beat's phase. The breath is not whole in 6 s of whole beats, so where the
// replay began after the live record, and where its template looped, the value jumped by whatever the breath had done (here 7.4 cm/s in one 20 ms sample; in a patient who breathes deeply, 20).
// Now the replay enters its template at the point whose beat phase, value and slope match, and eases what is left over 1 s. Node only: a record with deep breathing, the model through the handoff, 50 s
// of loops, and the end of a time lapse (a replay followed by bedside samples).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SampleFeed } from '../src/ui/tests/feed.ts';
import { DopplerModel } from '../src/ui/tests/doppler/model.ts';
import { useDopplerProbe } from '../src/ui/tests/doppler/probe-state.ts';
import { setSlidePin } from '../src/ui/tests/slide/pin.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { EI } from '../src/ui/tests/doppler/copied/doppler-tables.copied.js';
import { clock } from '../src/clock/frame.ts';
import { createCore } from '../src/engine/hales/host/worker-core.js';

const EN = (EDGES as unknown[]).length;
const frame = (c = 'hemo') => ({ clock: c, running: true, speed: 1, settling: false, D: new Float32Array(EN).fill(12), Q: new Float32Array(EN), metrics: {} });
const bump = (ph: number, at: number, w: number, h: number) => h * Math.exp(-(((ph - at) / w) ** 2));
/** A portal vein record: 0.8 s beats, a breath of `br` s and `amp` cm/s, from time t0 to t1, 50 samples a second. */
function record(t0: number, t1: number, mean: number, amp: number, br: number, drift = 0) {
  const t: number[] = [], v: number[] = [], ph: number[] = [];
  for (let tt = t0; tt < t1 - 1e-9; tt += 0.02) { const p = (tt / 0.8) % 1; t.push(tt); ph.push(p); v.push(mean + drift * tt + amp * Math.sin((2 * Math.PI * tt) / br) + 4 * bump(p, 0.3, 0.15, 1) - 2 * bump(p, 0.7, 0.1, 1)); }
  return { jump: false, probe: 'PV_TRUNK', samples: { t, vel: v, ph, pvVel: v.map(() => NaN), hvVel: v.map(() => NaN) } } as never;
}
const worstStep = (b: number[][], from = 0) => { let w = 0, at = 0; for (let i = Math.max(1, from); i < b.length; i++) { const d = Math.abs(b[i]![1]! - b[i - 1]![1]!); if (d > w) { w = d; at = b[i]![0]!; } } return { w, at }; };

for (const [br, amp, drift] of [[4, 8, 0], [3.7, 14, 0], [5.3, 10, 0], [4, 0, 0], [4, 5, -2.5]] as const) {
  test(`a slide's replay never steps: breath ${br} s, swing ${amp} cm/s, the live patient drifting ${drift} cm/s a second (the model part-way through its eased change)`, () => {
    const k = (EI as Record<string, number>).PV_TRUNK!;
    const D = new Float32Array(EN).fill(12), Q = new Float32Array(EN); Q[k] = 12;
    setSlidePin({ at: { Q, D } } as never);
    useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
    const rec = new SampleFeed(); rec.adopt(record(0, 9, 30, amp, br, drift));
    const live = worstStep(rec.t.map((t, i) => [t, rec.ch.vel[i]!]));
    const m = new DopplerModel(); m.slide = true;
    let now = 1000; (clock as unknown as { now: () => number }).now = () => now;
    m.ingest(frame(), rec);
    // (every sample the replay lays is checked as it is laid: the buffer keeps 16 s, so the handoff and the early loops are gone from it by the end)
    let w = 0, at = 0, seen = 0;
    for (let f = 0; f < 3200; f++) {
      now += 16; m.ingest(frame(), rec);
      if (f === 400) assert.ok(m.pinned && (m as unknown as { synth: unknown }).synth, 'the replay is standing');
      const b = m.buf, last = b[b.length - 1]![0]!;
      for (let i = Math.max(1, b.length - 40); i < b.length; i++) { if (b[i]![0]! <= seen) continue; const d = Math.abs(b[i]![1]! - b[i - 1]![1]!); if (d > w) { w = d; at = b[i]![0]!; } }
      seen = last;
    }
    const b = m.buf, mean = b.reduce((a, q) => a + q[1]!, 0) / b.length;
    // (the record's own steepest sample step is the beat's rise; the replay is scaled to the pin, so compare in the replay's own units)
    const ownRise = live.w * (mean / 30);
    assert.ok(w <= ownRise * 1.6 + 0.3, `the replay's steepest step is ${w.toFixed(2)} cm/s at t=${at.toFixed(2)}; the record's own is ${ownRise.toFixed(2)} (mean ${mean.toFixed(1)})`);
    setSlidePin(null);
  });
}

test('the end of a time lapse: the bedside record follows the replay without a step', () => {
  setSlidePin(null);
  useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
  const rec = new SampleFeed(); rec.adopt(record(0, 9, 20, 8, 4));
  const m = new DopplerModel();
  let now = 1000; (clock as unknown as { now: () => number }).now = () => now;
  m.ingest(frame(), rec);   // (the bedside record is read, then the lapse starts)
  for (let f = 0; f < 400; f++) { now += 16; m.ingest(frame('disease'), rec); }
  assert.ok((m as unknown as { synth: unknown }).synth, 'the replay is standing');
  const tEnd = m.buf[m.buf.length - 1]![0]!;
  rec.adopt(record(9, 20, 30, 8, 4));   // (the bedside again, at another level)
  for (let f = 0; f < 200; f++) { now += 16; m.ingest(frame(), rec); }
  const n0 = m.buf.findIndex((q) => q[0]! > tEnd);
  assert.ok(n0 > 0 && m.buf.length > n0 + 100, `the bedside samples were taken (${n0} of ${m.buf.length})`);
  const { w, at } = worstStep(m.buf, n0 - 5);
  assert.ok(w <= 1.5, `the join steps ${w.toFixed(2)} cm/s at t=${at.toFixed(2)}`);
});

/** The engine's own record of a vessel, 8 s of the bedside clock, as the page's feed takes it (tests/doppler-hv-waves.test.ts). */
async function engineRecord(preset: string, vessel: string) {
  const out: { type: string; samples?: Record<string, ArrayLike<number>> }[] = [];
  const core = createCore((m: never) => out.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: preset, reqId: 1 });
  await core.handle({ type: 'probe', id: vessel });
  await core.handle({ type: 'history', secs: 8, reqId: 9 });
  for (let q = 0; q < 400 && !out.find((m) => m.type === 'history'); q++) await new Promise((r) => setTimeout(r, 25));
  const s = out.find((m) => m.type === 'history')?.samples;
  core.dispose();
  assert.ok(s?.t?.length, `${preset}: the engine gave a record`);
  return s!;
}

for (const preset of ['healthy', 'cirr-decomp']) {
  test(`the main portal vein of the ${preset} patient, from the engine's own record: the slide's replay never steps (6 s window, 60 s of loops)`, async () => {
    const s = await engineRecord(preset, 'PV_TRUNK');
    const KEYS = ['t', 'ph', 'vel', 'pvVel', 'hvVel'] as const;
    const rec = Object.fromEntries(KEYS.map((k) => [k, Array.from(s[k]!).filter((_, i) => i % 5 === 0)])) as Record<string, number[]>;
    const k = (EI as Record<string, number>).PV_TRUNK!;
    const D = new Float32Array(EN).fill(12), Q = new Float32Array(EN); Q[k] = 12;
    setSlidePin({ at: { Q, D } } as never);
    useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
    const feed = new SampleFeed(), m = new DopplerModel(); m.slide = true;
    let now = 1000; (clock as unknown as { now: () => number }).now = () => now;
    // (the record grows half a second at a time, as frames bring it)
    const n = rec.t!.length, per = 25;
    for (let i = 0; i < n; i += per) { feed.adopt({ jump: false, probe: 'PV_TRUNK', samples: Object.fromEntries(KEYS.map((q) => [q, rec[q]!.slice(i, i + per)])) } as never); m.ingest(frame(), feed); }
    let steps = 0, w = 0, at = 0, seen = -Infinity, ownMax = 0;
    for (let i = 1; i < rec.vel!.length; i++) ownMax = Math.max(ownMax, Math.abs(rec.vel![i]! - rec.vel![i - 1]!));
    const mean = rec.vel!.reduce((a, q) => a + q, 0) / rec.vel!.length;
    for (let f = 0; f < 3750; f++) {
      now += 16; m.ingest(frame(), feed);
      const b = m.buf;
      for (let i = Math.max(1, b.length - 40); i < b.length; i++) { if (b[i]![0]! <= seen) continue; steps++; const d = Math.abs(b[i]![1]! - b[i - 1]![1]!); if (d > w) { w = d; at = b[i]![0]!; } }
      seen = b[b.length - 1]![0]!;
    }
    assert.ok(steps > 2500 && (m as unknown as { synth: unknown }).synth, 'the replay ran');
    const bm = m.buf.reduce((a, q) => a + q[1]!, 0) / m.buf.length;
    const rise = ownMax * Math.abs(bm / mean);
    assert.ok(w <= rise * 1.6 + 0.3, `${preset}: steepest replay step ${w.toFixed(2)} cm/s at t=${at.toFixed(2)}, the record's own ${rise.toFixed(2)}`);
    setSlidePin(null);
  });
}
