// A time-lapse's trail (the two lines of an Ascites / Ten years card) reads two readings a day. It used to compute every metric every day, among them the liver stiffness, which
// with a beta-blocker on settles a whole twin model (Engine.hvNoBlocker): 1,460 twin settles on Carvedilol 5 and Ten years 5, 12 of their 17 s of loading in node. computeMetrics
// takes `{ noLsm: true }` and the trail passes it unless it names `lsm`; the numbers every slide shows are unchanged (checked on all 558 steps of the 28 decks, 28 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/hales/portal/engine.js';
import { computeMetrics as metricsOf } from '../src/engine/hales/portal/metrics.js';

// (the engine's JS infers `null` for the optional arguments)
const computeMetrics = metricsOf as (e: Engine, out?: object | null, opts?: { noLsm?: boolean } | null) => Record<string, unknown>;
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { sequencer } from '../src/decks/hp/numbers.ts';

const onCarvedilol = (): Engine => {
  const e = new Engine();
  e.loadPreset('cirr-decomp');
  const p = e.params as { drugs?: object };
  e.setParams({ ...p, drugs: { ...p.drugs, carvedilol: true } });
  e.settle();
  return e;
};

test('metrics with noLsm are the metrics but for the stiffness, and ask the twin nothing', () => {
  const a = onCarvedilol(), b = new Engine();
  b.restore(a.snapshot());
  let twin = 0;
  const settle = Engine.prototype.settle;
  Engine.prototype.settle = function (this: Engine, ...x: never[]) { twin++; return (settle as (...y: unknown[]) => unknown).apply(this, x); } as typeof Engine.prototype.settle;
  try {
    computeMetrics(a);
    const withTwin = twin; twin = 0;
    computeMetrics(b, null, { noLsm: true });
    assert.ok(withTwin >= 1, 'a beta-blocker on makes the stiffness settle a twin');
    assert.equal(twin, 0, 'the lean metrics settle nothing');
  } finally { Engine.prototype.settle = settle; }
  const full = JSON.parse(JSON.stringify(computeMetrics(onCarvedilol()))), lean = JSON.parse(JSON.stringify(computeMetrics(onCarvedilol(), null, { noLsm: true })));
  assert.ok(Number.isFinite(full.lsm) && lean.lsm === undefined);
  delete full.lsm; assert.deepEqual(lean, full);
});

const trailOf = async (trail: true | string[], days: number) => {
  const seq = sequencer(1), core = createCore((m: never) => seq.message(m));
  core.handle({ type: 'run', running: false });
  let twin = 0;
  const settle = Engine.prototype.settle;
  Engine.prototype.settle = function (this: Engine, ...x: never[]) { twin++; return (settle as (...y: unknown[]) => unknown).apply(this, x); } as typeof Engine.prototype.settle;
  try {
    await core.handle({ type: 'sequence', steps: [{ preset: 'cirr-decomp', params: { drugs: { carvedilol: true } } }, { days, fine: true, trail }], reqId: 1 });
  } finally { Engine.prototype.settle = settle; core.dispose(); }
  return { twin, trail: (seq.results[1] as unknown as { trail: number[][] }).trail };
};

test('a trail that does not name the stiffness no longer settles a twin a day; one that names it still reads it', async () => {
  const days = 40;
  const lean = await trailOf(['asc', 'varix'], days), withLsm = await trailOf(['asc', 'lsm'], days);
  assert.ok(lean.trail.length >= days && lean.trail.every((r) => r.slice(1).every((v) => Number.isFinite(v))), 'every day has its two numbers');
  assert.ok(withLsm.trail.every((r) => Number.isFinite(r[2])), 'the stiffness column is read when it is asked for');
  assert.ok(withLsm.twin - lean.twin >= days - 2, `lean ${lean.twin} settles, with the stiffness ${withLsm.twin}`);
});
