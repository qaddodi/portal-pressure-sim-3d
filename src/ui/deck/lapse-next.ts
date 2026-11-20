// Next during a time-lapse (2D V-SLIDE-10, presenter.js `next` and `skipLapse`): the first Next runs the days that are left in about 600 ms and stops on the lapse's end; the
// second goes on to the next slide. Back is not here: it leaves the slide (hp/link.ts stops the days as the position changes), as 2D's `go` does.
//
// This file is the seam, with no imports: the lapse player (decks/hp/lapse.ts) registers what it can do while days are running (`setLapseSkip`), and the presenter's move
// (ui/ui-store.ts `move`, which every Next goes through: the keys, the clicker, the bar, a swipe, the presenter view) asks it first, as it asks the HVPG card (ui/talk/tool-step.ts).
// The pure parts of the pace (what day the counter shows, how the rest of the days are run) are here too, so they are tested without an engine.

/** How long Next gives the days that are left (2D: `lapseFast { ms: 600 }`, `run { speed: lapseLeft / 0.6 }`). */
export const SKIP_MS = 600;

/** The days' counter as a straight line in time: at `t0` (ms) it showed `d0` days and runs `rate` days a ms, never past `days`. */
export interface Pace { t0: number; d0: number; rate: number; days: number }

/** The day the counter shows at `now`. */
export const daysAt = (p: Pace, now: number): number => Math.min(p.days, Math.max(0, p.d0 + p.rate * (now - p.t0)));

/** The pace a Next gives a lapse that has run to `d` of its days at `now`: the days left in SKIP_MS, the counter carrying on from `d` (it never jumps). */
export const skipPace = (days: number, d: number, now: number): Pace => ({ t0: now, d0: d, rate: Math.max(0, days - d) / SKIP_MS, days });

/** The engine's clock speed (sim days a second) that runs `left` days in SKIP_MS (2D: at least 1). */
export const skipSpeed = (left: number): number => Math.max(1, left / (SKIP_MS / 1000));

/** 2D's slow push curve (cam-arc.js driftEase): it gathers speed over the first fifth, moves evenly, and settles over the last fifth, so a push of several seconds neither crawls at its ends nor rushes in its middle. */
export function driftEase(u: number, ramp = 0.2): number {
  u = Math.min(1, Math.max(0, u));
  const v = 1 / (1 - ramp);   // (the even speed: the ramps give up half their width each)
  if (u < ramp) return (v * u * u) / (2 * ramp);
  if (u > 1 - ramp) return 1 - (v * (1 - u) ** 2) / (2 * ramp);
  return v * (u - ramp / 2);
}

let skipper: (() => boolean) | null = null;
/** The lapse player sets what Next does while days run (and clears it when they are done or the slide is left). */
export function setLapseSkip(fn: (() => boolean) | null): void { skipper = fn; }

/**
 * Next, asked of a lapse first. True when days were running and Next has run them to their end (the slide stays: the figure and the counter land on the lapse's end, easing the
 * whole way); false when no lapse is running, or the days were already being run out by an earlier Next (the move goes on).
 */
export const lapseNext = (): boolean => !!skipper?.();
