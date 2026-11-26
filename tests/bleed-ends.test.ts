// A bleed ends (the BRTO case, 26 Nov: "the stomach stays full of blood for 220 days"). The model has no act that ends a gastric varix bleed for good (a band closes only an esophageal
// one), so a course that never said so left bleed.active on to the last day, and the scene's pool (poolFill of the blood lost, driven only while a bleed is active) stood full in every
// stop of the case. The rule, for every course with a bleed: it is over within BLEED_END_DAYS of its rupture, and nothing the case keeps after that has one going.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from '../src/ui/histories/courses.ts';
import { playCourse, BLEED_END_DAYS } from '../src/ui/histories/play.ts';
import type { Course } from '../src/ui/histories/types.ts';

const bleeds = COURSES.filter((c) => c.steps.some((s) => s.act === 'bleed'));
const active = (snap: { [k: string]: unknown } | undefined): boolean => !!(snap?.bleed as { active?: boolean } | undefined)?.active;

test('there are courses with a bleed to check (a gastric one among them)', () => {
  assert.ok(bleeds.length >= 4);
  assert.ok(bleeds.some((c) => c.steps.some((s) => s.act === 'bleed' && s.site === 'GV')));
});

test('every bleed is stopped within a few days of its rupture, and no kept model after that has one going', () => {
  for (const c of bleeds) {
    const b = playCourse(c);
    for (const r of b.entries.filter((e) => e.evId === 'VARIX_RUPTURE')) {
      const stop = b.entries.find((e) => e.evId === 'BLEED_STOPPED' && e.day >= r.day);
      assert.ok(stop, `${c.id}: the bleed of Day ${r.day} is never stopped`);
      assert.ok(stop.day - r.day <= BLEED_END_DAYS, `${c.id}: the bleed of Day ${r.day} stops only on Day ${stop.day}`);
      for (const e of b.entries) if (e.snap && e.day >= r.day + BLEED_END_DAYS) assert.equal(active(e.snap), false, `${c.id}: Day ${e.day} keeps a model that is still bleeding`);
    }
    assert.equal(active(b.snap), false, `${c.id}: today's model is still bleeding`);
  }
});

test('a course whose bleed nothing ends is an error the generator stops on, never a stomach full of blood', () => {
  const brto = COURSES.find((c) => c.id === 'hist-brto')!;
  const noEnd: Course = { ...brto, steps: brto.steps.map((s) => { const { stopsBleed: _, ...rest } = s; return rest; }) };
  assert.throws(() => playCourse(noEnd), /still going on/);
});
