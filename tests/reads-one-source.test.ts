// HVPG deck review 1 (23 Nov 2026): the EUS slide's text and chart said EUS-PPG 14.9 while the live tracing read 14.1, and the lobule's portal venule read 19.5 on one slide and 18.9 on
// another for the same patient. Root cause: a measurement (the needle, the monitor, the callouts) and the lobule read `frame.P`, the engine's beat-by-beat pressures at one instant, while the text,
// the tiles, the chart and every other label read the SHOWN pressures (`Pf`, the mean over one breath and one beat) the slide's own state is made of. A measurement now reads `readFrame`
// (tests/slide/reads.ts): the shown pressures, or the pinned slide's own. Node only: the slide's patient through the engine, the live model beating on it, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { loadHpDeck } from '../src/decks/hp/index.ts';
import { chainOf, sequencer } from '../src/decks/hp/numbers.ts';
import { NODES } from '../src/engine/hales/portal/topology.js';
import { specOf } from '../src/scene/procedures/copied/proc-anim.js';
import '../src/scene/procedures/instrument-specs.ts';
import { readFrame } from '../src/ui/tests/slide/reads.ts';
import { setSlidePin } from '../src/ui/tests/slide/pin.ts';

const NI: Record<string, number> = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));

test('the EUS-PPG the needle reads is the number the slide, the text and the chart print, at any instant of the beat', async () => {
  const d = await loadHpDeck('hvpg');
  const at = d.slides.findIndex((s) => s.id === 'eus');
  assert.ok(at > 0);
  const seq = sequencer(1);
  const core = createCore((m: never) => seq.message(m));
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(d.slides.slice(0, at + 1)), reqId: 1 });
  const res = seq.results[at + 1]!, fp = res.fp as Record<string, unknown> & { eus: number; pv: number; ppg: number; at: { P: Float32Array; Q: Float32Array } };
  const e = core.engine() as { restore(s: unknown): void; step(dt: number): void; quiet: boolean; beat: boolean; P: Float64Array; Pf: Float64Array; Q: Float64Array; Qf: Float64Array };
  e.restore(res.snap); e.quiet = false; e.beat = true;
  const spec = specOf('eus') as { capture(i: number, rd: Record<string, number>, f: unknown): void };
  let widest = 0, checked = 0;
  for (let t = 0; t < 36; t += 0.004) {
    e.step(0.004);
    if (t < 30 || Math.round(t * 250) % 20) continue;   // (every 80 ms of the last 6 s: a breath and a half)
    const frame = { P: Float32Array.from(e.P), Pf: Float32Array.from(e.Pf), Q: Float32Array.from(e.Q), Qf: Float32Array.from(e.Qf), metrics: {} };
    widest = Math.max(widest, Math.abs(frame.P[NI.LPV!]! - frame.P[NI.LHV!]! - fp.eus));
    for (const pinned of [false, true]) {
      setSlidePin(pinned ? fp : null);
      const rd: Record<string, number> = { pv: NaN, hv: NaN, ppg: NaN };
      spec.capture(1, rd, readFrame(frame)); spec.capture(2, rd, readFrame(frame));
      // (pinned: exactly the slide's; unpinned: the shown gap, within the dead band of the slide's own)
      assert.ok(Math.abs(rd.ppg! - fp.eus) <= (pinned ? 0 : 0.15), `${pinned ? 'pinned' : 'shown'} EUS-PPG ${rd.ppg} against the slide's ${fp.eus} at t=${t.toFixed(2)}`);
      checked++;
    }
    // (the old reading, `frame.P` as it was: the proof the instant is NOT the slide's number)
  }
  setSlidePin(null);
  assert.ok(checked > 60);
  assert.ok(widest > 0.4, `the instant's gap strays ${widest.toFixed(2)} mmHg from the slide's: the old source disagreed with the text`);
  core.dispose();
});

test('a reading frame is the same object while the frame and the pin are the same, and carries the pinned slide\'s pressures and readings', () => {
  const P = Float32Array.from([1, 2, 3]), Pf = Float32Array.from([4, 5, 6]), frame = { P, Pf, Q: Float32Array.from([1]), Qf: Float32Array.from([2]), metrics: { pv: 1, ivc: 1 } };
  setSlidePin(null);
  const a = readFrame(frame);
  assert.equal(a.P, Pf); assert.equal(a.Q, frame.Qf); assert.equal(readFrame(frame), a);
  const fp = { pv: 20.6, ivc: 5, at: { P: Float32Array.from([9, 9, 9]), Q: Float32Array.from([3]) } };
  setSlidePin(fp);
  const b = readFrame(frame);
  assert.equal(b.P, fp.at.P); assert.equal((b.metrics as { pv: number }).pv, 20.6); assert.equal((b.metrics as { ivc: number }).ivc, 5);
  setSlidePin(null);
  assert.equal(readFrame(null), null);
});

test('the lobule and the procedures are fed the shown pressures and flows, never the instant\'s', () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  for (const p of ['src/scene/scene.ts', 'src/ui/action/read.ts']) assert.ok(!/lobuleModel\(\{ P: f\.P\b/.test(read(p)), `${p} feeds the lobule the instant's pressures`);
  assert.ok(/readFrame\(latest\.frame\)/.test(read('src/ui/tests/endo/eus-run.ts')) && /readFrame\(latest\.frame\)/.test(read('src/ui/tests/ir/run.ts')) && /readFrame\(live0/.test(read('src/scene/labels/proc-cards.ts')));
  assert.ok(/readFrame\(latest\.frame\)/.test(read('src/ui/tests/ir/ir-shims.js')) && /readFrame\(latest\.frame\)\?\.P/.test(read('src/ui/tests/endo/eus-source.ts')));
});

test('the EUS-PPG scope stands at the vein of its step: portal vein, then hepatic vein, and the result step stays in the hepatic vein where the needle read last', async () => {
  const { eusStationOf } = await import('../src/ui/deck/procs-plan.ts');
  const { specOf: spec } = await import('../src/scene/procedures/copied/proc-anim.js');
  const ids = (spec('eus') as { steps: unknown[][] }).steps.map((s) => String(s[0]));
  assert.deepEqual(ids, ['enter', 'pv', 'hv', 'done']);
  assert.deepEqual(ids.map(eusStationOf), ['pv', 'pv', 'hv', 'hv']);
});
