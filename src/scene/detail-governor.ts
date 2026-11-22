// N1: the figure's own safety against a stall. Settings > Figure detail is the CEILING the person chose; when the frames that are being drawn run slow for a while (a phone that is
// warm, a big view on a small GPU) the governor takes the figure down one notch of detail, and again if it must, and gives the notch back only after a long calm and never in a way that
// bounces (a drop soon after a raise doubles the wait). It only ever lowers below the ceiling, it never raises above it, and the figure changes size only at rest, so nothing pops.
// Pure: Stage feeds it the clock's frame times and reads `drop`; tests/detail-governor.test.ts drives it with made-up frames.

/** A frame slower than this (under about 40 per second) counts as slow. Frames are judged only while they run back to back: a gap longer than GAP_MS is a pause, not a slow frame. */
export const SLOW_MS = 25;
/** Under this a frame is calm (a steady 60 per second with room to spare). */
export const CALM_MS = 18;
export const GAP_MS = 120;
/** Frames in a judging window, and how many of them decide: half slow takes a notch down; all of them calm (after the hold) gives one back. */
export const WINDOW = 24;
export const MAX_DROP = 2;
export const HOLD_MS = 30_000;
export const MAX_HOLD_MS = 480_000;

export interface Governor { drop: number; slow: number; calm: number; n: number; changedAt: number; hold: number; raisedAt: number }
export const newGovernor = (now = 0): Governor => ({ drop: 0, slow: 0, calm: 0, n: 0, changedAt: now, hold: HOLD_MS, raisedAt: -Infinity });

/** One drawn frame at page time `now`, `dt` ms after the frame before. Returns the notches of detail to take off the ceiling (0 to MAX_DROP). */
export function govern(g: Governor, now: number, dt: number): number {
  if (!(dt > 0) || dt > GAP_MS) { g.slow = g.calm = g.n = 0; return g.drop; }   // (a pause or the first frame: judge a fresh window)
  g.n++; if (dt > SLOW_MS) g.slow++; else if (dt <= CALM_MS) g.calm++;
  if (g.n < WINDOW) return g.drop;
  const slow = g.slow, calm = g.calm;
  g.slow = g.calm = g.n = 0;
  if (slow >= WINDOW / 2 && g.drop < MAX_DROP) {
    if (now - g.raisedAt < HOLD_MS / 2) g.hold = Math.min(MAX_HOLD_MS, g.hold * 2);   // (it came straight back: wait longer before trying again)
    g.drop++; g.changedAt = now;
  } else if (calm === WINDOW && g.drop > 0 && now - g.changedAt >= g.hold) {
    g.drop--; g.changedAt = now; g.raisedAt = now;
  }
  return g.drop;
}
