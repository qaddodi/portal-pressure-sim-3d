// A course's own clock in words, for every stop of the case (capture 0bc14020, owner: "show the gestational week on every pregnancy stop"). The days are the model's; a pregnancy is told in weeks.
// The clock is the course's own ramp of `gestation` (courses.ts: weeks eased from a to b over the days from..to), so no stop types a week: move the ramp and every stop's week moves with it.
// Pure: the ramps and a day in, words out.
import type { CaseRamp } from './types.ts';
import { rampValue } from './walk.ts';

const weeks = (n: number): string => `${n} ${n === 1 ? 'week' : 'weeks'}`;

/** "18 weeks" in the pregnancy, "4 weeks after delivery" once it has ended, '' before it or for a course with no such clock. */
export function whenWords(ramps: readonly CaseRamp[] | undefined, day: number): string {
  const r = ramps?.find((x) => x.key === 'gestation');
  if (!r || day < r.from) return '';
  if (day <= r.to) return weeks(Math.round(rampValue(r, day)));
  const n = Math.floor((day - r.to) / 7);
  return n < 1 ? 'Just delivered' : `${weeks(n)} after delivery`;
}
