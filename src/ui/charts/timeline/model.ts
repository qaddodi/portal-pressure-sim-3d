// The timeline's one drawn piece (2D: timeline.js, "the day count"): a jump of the disease clock counts the days up over the clock's own words, drawn on the GPU in the
// clock's size, weight and colour (look small.day, chart-looks/small.js). The rest of the timeline (play, speed, History, Compare) is page markup and lives in
// src/ui/timeline and src/ui/shell. Two clocks: the first day is told in minutes and seconds (the model runs in real time), every later moment as a day count.
import { fmtClock } from '../../timeline/model.ts';

export { fmtClock };
/** How long the jump's count runs (2D timeline.js jump(): 900 ms). */
export const JUMP_MS = 900;
/** 2D ease.js easeOut3. */
export const easeOut3 = (u: number) => 1 - (1 - u) ** 3;
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

/** The day a jump has counted to after the share u (0 to 1) of its time: round(d0 + days * easeOut3(u)). */
export const jumpDayNum = (d0: number, days: number, u: number) => Math.round(d0 + days * easeOut3(clamp01(u)));
/** The count's words ("Day 96"). */
export const dayWords = (n: number) => `Day ${n}`;

export interface ClockSpec {
  /** the model's clock: seconds into the first day, and the day */
  t: number; day: number;
  /** a jump under way: where it started (the day), how many days it carries, and how far along it is (0 to 1). Absent: the clock as it stands. */
  jump?: { from: number; days: number; u: number } | null;
  /** the clock's own type (2D reads it from the page's clock: its size and weight) */
  size?: number; weight?: number;
  align?: 'start' | 'middle' | 'end';
}

/** What the clock says: the clock's words, or the count of a jump under way. */
export function clockWords(s: ClockSpec): string {
  if (s.jump) return dayWords(jumpDayNum(s.jump.from, s.jump.days, s.jump.u));
  return fmtClock(s.t, s.day);
}
/** The clock in a sentence for a screen reader (a count in flight is not read out digit by digit: the clock says where the jump lands). */
export function clockLabel(s: ClockSpec): string {
  return s.jump ? `Jumping ahead to ${dayWords(jumpDayNum(s.jump.from, s.jump.days, 1))}` : `Model time ${clockWords(s)}`;
}
