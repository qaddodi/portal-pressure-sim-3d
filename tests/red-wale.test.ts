// B9 (capture review 26 Nov 2026): a stop was titled "Red wale signs" while the scope's Stigmata read None. Two predicates: the event read the engine's two-breath wall share, the scope's flag the breath's own index.
// The rule pinned here: one predicate (hales-engine wall-read.js isRedWale), read from the same two-breath mean by the event, the metrics flag, the scope's chip and its drawn field, on every day of every course.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from '../src/ui/histories/courses.ts';
import { Worker } from 'node:worker_threads';
import { isRedWale, redWaleCleared, redWaleFlag, RED_WALE_ON, RED_WALE_OFF } from '../src/engine/hales/portal/wall-read.js';
import { readingsOf } from '../src/ui/tests/endo/readings.ts';
import { scopeRatio } from '../src/ui/tests/endo/motion.ts';
import { Engine } from '../src/engine/hales/portal/engine.js';
import { computeMetrics } from '../src/engine/hales/portal/metrics.js';
import { detectEvents } from '../src/engine/hales/portal/events.js';
import { readdirSync } from 'node:fs';
import type { Baked } from '../src/ui/histories/types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface Vx { present: boolean; redWale: boolean; ratio: number; ratioMean: number; d: number; grade: { label: string }; w: number; ptm: number }
interface Day { course: string; day: number; vx: Vx; active: boolean }

// (Playing the 12 courses takes a minute on one core: each is played in a worker of its own, so the file takes what the longest course takes.)
const played = await Promise.all(COURSES.map((c) => new Promise<{ days: Day[]; fired: number[] }>((resolve, reject) => {
  const w = new Worker(new URL('./red-wale-course.worker.ts', import.meta.url), { workerData: c.id });
  w.once('message', resolve); w.once('error', reject);
})));
const days: Day[] = played.flatMap((p, i) => p.days.map((d) => ({ ...d, course: COURSES[i]!.id })));
const fired = played.flatMap((p, i) => p.fired.map((day) => ({ course: COURSES[i]!.id, day })));

test('the predicate is one pair of cuts: on above 0.7, cleared below 0.65', () => {
  assert.equal(RED_WALE_ON, 0.7);
  assert.equal(RED_WALE_OFF, 0.65);
  assert.equal(isRedWale(0.7), false);
  assert.equal(isRedWale(0.701), true);
  assert.equal(redWaleCleared(0.65), false);
  assert.equal(redWaleCleared(0.649), true);
});

test('on every day of every course the scope flag is the event\'s own state, which starts on the shared predicate and clears only below the lower cut', () => {
  assert.ok(days.length > 1000);
  for (const d of days) {
    const where = `${d.course} day ${d.day}: mean ${d.vx.ratioMean.toFixed(3)}`;
    assert.equal(d.vx.redWale, d.active, `${where}: the scope and the event disagree`);
    if (isRedWale(d.vx.ratioMean)) assert.ok(d.active, `${where}: over the cut but the event is off`);
    if (redWaleCleared(d.vx.ratioMean)) assert.ok(!d.active, `${where}: under the clear but the event is on`);
  }
});

test('the flag is the event\'s state once it runs: on between the cuts after it started, off between the cuts before it, the plain cut when the event has not looked', () => {
  assert.equal(redWaleFlag({ active: true }, 0.66), true);
  assert.equal(redWaleFlag({ active: false }, 0.66), false);
  assert.equal(redWaleFlag({ active: false }, 0.9), false);
  assert.equal(redWaleFlag(undefined, 0.71), true);
  assert.equal(redWaleFlag(undefined, 0.66), false);
});

test('a Red wale stop that lands live keeps the scope flag on the event\'s state for every step (every Red wale day of every history, whichever line carries the day\'s snapshot)', async () => {
  let landed = 0;
  for (const f of readdirSync(new URL('../src/ui/histories/baked/', import.meta.url))) {
    const { baked } = await import(`../src/ui/histories/baked/${f}`) as { baked: Baked };
    for (const x of baked.entries.filter((y) => y.evId === 'RED_WALE')) {
      // (a stop keeps the model at the END of its day: the snapshot is on the day's last line, whichever line that is, so the test reads the day's snapshot, never the red wale line's own)
      const end = baked.entries.filter((y) => y.day === x.day && y.snap).at(-1);
      if (!end) continue;
      landed++;
      const e = new Engine() as Any;
      e.restore(end.snap);
      for (let i = 0; i < 100; i++) {
        e.step(0.1); detectEvents(e);
        const v = (computeMetrics(e) as { varix: Vx }).varix;
        assert.equal(v.redWale, !!e.evState.RED_WALE?.active, `${f} day ${x.day} step ${i}: the scope flag left the event's state`);
      }
    }
  }
  assert.ok(landed > 0, 'at least one Red wale day keeps the model');
});

test('every Red wale signs stop reads Stigmata red on the scope that day', () => {
  assert.ok(fired.length > 0);
  for (const f of fired) {
    const d = days.find((x) => x.course === f.course && x.day === f.day)!;
    const r = readingsOf({ bands: 0, metrics: { varix: { ...d.vx, present: true } } })!;
    assert.equal(r.redOn, true, `${f.course} day ${f.day}`);
  }
});

test('the scope\'s field follows the two-breath mean, not the breath\'s own index', () => {
  assert.equal(scopeRatio({ ratio: 0.9, ratioMean: 0.6 }), 0.6);
  assert.equal(scopeRatio({ ratio: 0.9 }), 0.9);
  assert.equal(scopeRatio({ ratio: 0.9, ratioMean: NaN }), 0.9);
});
