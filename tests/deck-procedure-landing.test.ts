// A slide that plays a procedure lands on the state BEFORE it (2D presenter.js `pre`), so the run's `apply` is the only thing that gives the result: no balloon dropped and played again, no stent
// flashing out and in. And the procedure's graph follows the live model from that change on (ui/charts/evgraph/live.ts), in every deck. Node only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import type { CopiedDeck } from '../src/decks/hp/types.ts';
import { landsDone, opensBefore } from '../src/decks/hp/slide-motion.ts';
import { changes, stepOf } from '../src/decks/hp/numbers.ts';
import { specFor } from '../src/ui/deck/procs-plan.ts';
import { procPlanOf } from '../src/ui/deck/procs-plan.ts';
import { eventGraphOf, EVENT_S } from '../src/ui/charts/evgraph/model.ts';
import { evRunFor, leaveEvRun, resetEvRun, restoreEvRun, startEvRun, FEED_DT, type FrameSource } from '../src/ui/charts/evgraph/live.ts';

test('only Back from the slide after lands a procedure slide done; any other way in lands before the procedure', () => {
  assert.equal(landsDone(5, 4), true);
  assert.equal(landsDone(3, 4), false, 'forward');
  assert.equal(landsDone(9, 4), false, 'a jump back opens before, as 2D');
  assert.equal(landsDone(-1, 0), false, 'the first arrival');
  const s = { procedure: 'tips' as never };
  assert.equal(opensBefore(s, true, false), true);
  assert.equal(opensBefore(s, true, true), false, 'done');
  assert.equal(opensBefore(s, false, false), false, 'no before state: the slide shows its own');
  assert.equal(opensBefore({}, true, false), false, 'no procedure');
  assert.equal(opensBefore(s, true, false, true), false, 'a time-lapse has its own way in');
  assert.equal(opensBefore({ ...s, lapse: {} as never }, true, false), false);
});

test('every slide of every deck that plays a procedure and changes the patient keeps a before state, so it can land before the procedure', async () => {
  const decks: CopiedDeck[] = [];
  for (const id of AG_IDS) decks.push((await loadAgDeck(id)) as never);
  for (const id of RW_IDS) decks.push((await RW_LOADERS[id]!()) as never);
  for (const id of HP_IDS) decks.push(await loadHpDeck(id));
  let n = 0;
  for (const d of decks) d.slides.forEach((s, i) => {
    const plan = procPlanOf(s);
    if (!plan || !changes(s) || (i === 0 && !s.vignette && !s.lapse && !s.ramp)) return;   // (the first slide's own changes belong to the outline step)
    assert.ok(specFor(plan.kind), `${d.id}/${s.id}: a procedure spec`);
    const morph = !!(specFor(plan.kind) as { morph?: boolean }).morph;
    assert.ok(stepOf(s).before || (morph && i > 0), `${d.id}/${s.id}: ${plan.kind} slide has no before state, so it would land on its result`);
    n++;
  });
  assert.ok(n > 10, `only ${n} procedure slides changed the patient`);
});

test('hp/link.ts lands on the before state, procs-link takes the done landing from the same rule', () => {
  const link = readFileSync(new URL('../src/decks/hp/link.ts', import.meta.url), 'utf8');
  assert.match(link, /opensBefore\(cs0, true, landsDone\(from, pos\.stop\)\) \? before : own/);
  assert.match(link, /morph && i > 0 \? res\?\.\[i - 1\]\?\.snap/);
  const pl = readFileSync(new URL('../src/ui/deck/procs-link.ts', import.meta.url), 'utf8');
  assert.match(pl, /landsDone\(prevStop, pos\.stop\)/);
  assert.doesNotMatch(pl, /dir < 0/, 'the done landing is the shared rule, not the direction of the last move');
  assert.doesNotMatch(pl, /c\.original/, 'a rewind leaves the slide as it landed (before), it never puts the result back');
});

// ── the live graph ──
const TIPS = eventGraphOf({ procedure: 'tips', tiles: ['ppg', 'liver'] })!;
// (a real engine frame, from the worker core as the app's own host runs it, with the model's clock set)
const real = await (async () => {
  const { createCore } = await import('../src/engine/hales/host/worker-core.js');
  const out: { type: string }[] = [], core = createCore((m: { type: string }) => { out.push(m); });
  await core.handle({ type: 'init' }); await core.handle({ type: 'preset', id: 'cirr-decomp', reqId: 1 }); await core.handle({ type: 'run', running: true });
  core.dispose();
  return out.find((m) => m.type === 'frame') as Record<string, unknown>;
})();
const frame = (t: number) => ({ ...real, t }) as never;
function source() {
  const taps = new Set<(f: never) => void>();
  let now: unknown = frame(100);
  const src: FrameSource = { now: () => now as never, on: (fn) => { taps.add(fn as never); return () => { taps.delete(fn as never); }; } };
  return { src, push: (t: number) => { now = frame(t); taps.forEach((f) => f(frame(t))); }, taps };
}

test('the graph starts at the change and takes the live frames after it, every 0.1 s of the model, until its seconds have run', () => {
  const { src, push, taps } = source();
  const run = evRunFor('d/s1', TIPS);
  assert.equal(run.on, false);
  startEvRun('d/s1', TIPS, { ppg: 11, liver: 32 }, null, src);
  assert.equal(run.on, true);
  assert.equal(taps.size, 1);
  push(100 + FEED_DT / 4);   // a frame less than a step after the last
  const n0 = run.n;
  for (let t = 1; t <= 5; t += 0.5) push(100 + t);
  assert.ok(run.n > n0, 'frames after the change grow the run');
  push(100 + EVENT_S + 1);
  assert.equal(taps.size, 0, 'the feed stops once the graph\'s seconds have run');
  const kept = run.n;
  assert.ok(kept >= 5);
  leaveEvRun('d/s1');
  assert.equal(run.on, false, 'leaving the slide clears the graph');
  restoreEvRun('d/s1', TIPS);
  assert.equal(evRunFor('d/s1', TIPS).n, kept, 'Back onto the played slide shows the line whole');
});

test('going back past the change, or replaying, resets the run and stops its feed', () => {
  const { src, push, taps } = source();
  const run = evRunFor('d/s2', TIPS);
  startEvRun('d/s2', TIPS, null, null, src);
  push(102); push(103);
  assert.ok(run.n > 0);
  resetEvRun('d/s2');
  assert.equal(run.n, 0); assert.equal(run.on, false); assert.equal(taps.size, 0);
  startEvRun('d/s2', TIPS, null, null, src);
  startEvRun('d/s2', TIPS, null, null, src);
  assert.equal(taps.size, 1, 'a second start never leaves two feeds');
});

test('the procedure link starts and resets the run at the change, and the card reads the same run', () => {
  const pl = readFileSync(new URL('../src/ui/deck/procs-link.ts', import.meta.url), 'utf8');
  assert.match(pl, /const change = \(on: boolean\): void => \{ evChange\(kind, on\);/);
  assert.match(pl, /startEvRun\(key, spec, fp, currentParams\(\), engineFrames\)/);
  const card = readFileSync(new URL('../src/ui/talk/ToolCardBody.tsx', import.meta.url), 'utf8');
  assert.match(card, /<EvGraphCard spec=\{spec\} before=\{b\.before\} end=\{b\.end\} run=\{run\} \/>/);
});
