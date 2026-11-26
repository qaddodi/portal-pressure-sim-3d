// B9 (capture review 26 Nov 2026): a stop was titled "Red wale signs" while the scope's Stigmata read None. Two predicates: the event read the engine's two-breath wall share, the scope's flag the breath's own index.
// The rule pinned here: one predicate (hales-engine wall-read.js isRedWale), read from the same two-breath mean by the event, the metrics flag, the scope's chip and its drawn field, on every day of every course.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from '../src/ui/histories/courses.ts';
import { playCourse } from '../src/ui/histories/play.ts';
import { isRedWale, redWaleCleared, RED_WALE_ON, RED_WALE_OFF } from '../src/engine/hales/portal/wall-read.js';
import { readingsOf } from '../src/ui/tests/endo/readings.ts';
import { scopeRatio } from '../src/ui/tests/endo/motion.ts';
import { Engine } from '../src/engine/hales/portal/engine.js';
import { computeMetrics } from '../src/engine/hales/portal/metrics.js';
import { detectEvents } from '../src/engine/hales/portal/events.js';
import { baked } from '../src/ui/histories/baked/hist-pregnancy.generated.ts';
import type { Baked } from '../src/ui/histories/types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface Vx { present: boolean; redWale: boolean; ratio: number; ratioMean: number; d: number; grade: { label: string }; w: number; ptm: number }
interface Day { course: string; day: number; vx: Vx; active: boolean }

const days: Day[] = [];
const fired: { course: string; day: number }[] = [];
for (const c of COURSES) {
  const b = playCourse(c, (e, m, day) => days.push({ course: c.id, day, vx: (m as { varix: Vx }).varix, active: !!(e as { evState?: { RED_WALE?: { active: boolean } } }).evState?.RED_WALE?.active }));
  for (const x of b.entries) if (x.evId === 'RED_WALE') fired.push({ course: c.id, day: x.day });
}

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

test('a Red wale stop that lands live keeps the scope red while the event is on (the mean settles under 0.7 within seconds of landing; the stop is not contradicted)', () => {
  const b = baked as Baked;
  const ent = b.entries.find((x) => x.evId === 'RED_WALE' && x.snap)!;
  const e = new Engine() as Any;
  e.restore(ent.snap);
  let settledUnderCut = false, wrong = 0;
  for (let i = 0; i < 600; i++) {
    e.step(0.1); detectEvents(e);
    const v = (computeMetrics(e) as { varix: Vx }).varix, on = !!e.evState.RED_WALE?.active;
    if (!isRedWale(v.ratioMean)) settledUnderCut = true;
    if (v.redWale !== on) wrong++;
  }
  assert.ok(settledUnderCut, 'the case this pins: the mean really does come down under the cut after landing');
  assert.equal(wrong, 0, 'the scope flag followed the event on every step');
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
