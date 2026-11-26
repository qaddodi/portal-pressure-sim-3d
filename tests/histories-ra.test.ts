// The right atrium follows the patient, not the way the course is played (review of capture 0bc14020, clinical 1: the RA drifted to 10 to 19 mmHg in the five courses
// whose daily look ran the beat, and a TIPS seemed to lower the gradient by raising it). The root was the engine: every pause of the beat leaked blood into the veins
// (hales-engine 8608956, lvRelease; its test/beat-pause.mjs pins the blood). The rule here is general, on the baked records the page opens: no course's right atrial
// pressure climbs more than 4 mmHg above the patient it started with (a TIPS adds 1 to 2, a bleed's recovery less), whatever its preset (a failing heart starts high).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from '../src/ui/histories/courses.ts';
import type { Baked } from '../src/ui/histories/types.ts';

const RA_RISE_MAX = 4;
const played = await Promise.all(COURSES.map(async (c) => ({ c, b: (await import(`../src/ui/histories/baked/${c.id}.generated.ts`)).baked as Baked })));

test('no course drifts its right atrial pressure: at most 4 mmHg over Day 0, on every day', () => {
  for (const { c, b } of played) {
    const ra0 = b.days[0]!.v.RA!;
    const top = b.days.reduce((m, d) => (d.v.RA! > m.v.RA! ? d : m));
    assert.ok(top.v.RA! - ra0 <= RA_RISE_MAX, `${c.id}: RA ${ra0} on Day 0, ${top.v.RA} on Day ${top.day}`);
  }
});

test('the courses are played one way: no course holds its daily look still (the beat and the breath run, as on the page)', () => {
  for (const c of COURSES) assert.equal('still' in c, false, `${c.id} sets still`);
});
