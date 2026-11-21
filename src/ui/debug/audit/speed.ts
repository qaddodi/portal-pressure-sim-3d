// ?audit&speed=N (code review 21 Nov, #10): a faster walk. The page's own clock runs N times faster for the length of the run: `performance.now` is scaled (every tween, the clock, the settle and the
// sampler read it, so a 280 ms fade takes 70 ms of wall time but still measures 280 ms), and every CSS animation and transition is played N times faster by the sampler. The sampler ticks N times
// as often, so its steps stay 33 ms of page time. Layout, words, coverage and pops are judged as before; frame rates, stalls and low-fps are NOT valid at a speed over 1 (the frames do not run faster),
// so the report leaves them out and says so. Debug only: nothing in the app reads it.
export const MAX_SPEED = 20;
/** Above this the page draws a frame every 16.7 ms of wall time, which is 16.7 x N ms of page time: a 280 ms ease gets only a frame or two, so any judge that looks at the eased steps between frames reads a correct ease as a jump. */
export const FRAME_LIMIT_SPEED = 2;
/** Findings that read an ease from frame to frame: not valid above FRAME_LIMIT_SPEED (CSS-driven ones run on the compositor and stay valid, but the sampler's rows are too coarse for these). */
/** (fade-slow: above FRAME_LIMIT_SPEED the sampler ticks every 50 ms of wall time = 1000 ms of page time at 20x, so a fade is only seen at its first and last sample and reads as two ticks, about 2.08 s: the iPhone audit of 21 Nov
 *  had 179 rows, every card on every talk, at 2.04 to 2.12 s, 0 stalls in most. Its real fades are judged at 1x or 2x.) */
export const FRAME_LIMITED_KINDS = new Set(['fade-instant', 'fade-under-stall', 'flash', 'stuck-mid', 'label-slide', 'label-dim-alpha', 'card-pop', 'card-size-snap', 'camera-straight', 'fade-slow', 'generic-pop', 'generic-snap']);
/** The sampler's real interval: 33 ms of page time, but never faster than one frame (16 ms of wall time: a row between frames shows nothing new) and, above FRAME_LIMIT_SPEED, 50 ms: the fade judges are off there,
 *  so the rows only need to be cheap. Each tick reads the layout of every card and label, and a tick every 8 ms (the first version) can take the whole main thread of a busy page: the "lag" a 20x run measured. */
export const sampleRealMs = (sampleMs: number, n: number): number => (n > FRAME_LIMIT_SPEED ? 50 : Math.max(sampleMs / n, 16));
/** The speed asked for: `speed=4` is 4; anything else (missing, 0, junk) is 1, and the most is MAX_SPEED. */
export function speedOf(v: string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 1 ? Math.min(MAX_SPEED, Math.round(n * 100) / 100) : 1;
}
/** Makes `now` run `n` times faster from this moment; returns the scaled reader and a restorer. Pure over its `perf` argument so a Node test can drive it. */
export function scaleTime(n: number, perf: { now(): number }): { restore(): void } {
  if (n <= 1) return { restore() { /* nothing to undo */ } };
  const real = perf.now.bind(perf), t0 = real(), had = Object.prototype.hasOwnProperty.call(perf, 'now'), orig = (perf as { now: () => number }).now;
  (perf as { now: () => number }).now = () => t0 + (real() - t0) * n;
  return { restore() { if (had) (perf as { now: () => number }).now = orig; else delete (perf as { now?: () => number }).now; } };
}
/** Plays every running CSS animation and transition of the document at `n` times its speed (those started since the last call included). */
export function speedAnimations(doc: { getAnimations(): { playbackRate: number; updatePlaybackRate(r: number): void }[] }, n: number): void {
  if (n <= 1) return;
  try { for (const a of doc.getAnimations()) if (a.playbackRate !== n) a.updatePlaybackRate(n); } catch { /* an animation that will not change rate */ }
}

/** A timer's scaled wait: 1/n of it, but a short one (a poll, a retry, a debounce) keeps at least 16 ms, or it becomes a hot loop (a 50 ms poll at 20x would run every 2.5 ms and starve the page). */
export const scaledDelay = (ms: number, n: number): number => (ms <= 0 ? ms : Math.max(ms / n, Math.min(ms, 16)));
/** Makes `setTimeout` wait 1/n of the time for the length of the run, so every timer the app keeps in page time (a frameFor hold, a card's delay, a debounce, the audit's own waits) scales with the clock.
 *  Without it a hold of 950 ms outlives a camera move that now takes 95 ms, and every step waits for it. Returns the restorer. `setInterval` is left alone (the sampler's own). */
export function scaleTimers(n: number, g: { setTimeout: (...a: never[]) => unknown }): { restore(): void } {
  if (n <= 1) return { restore() { /* nothing to undo */ } };
  const orig = g.setTimeout as (fn: unknown, ms?: number, ...a: unknown[]) => unknown;
  (g as { setTimeout: unknown }).setTimeout = (fn: unknown, ms?: number, ...a: unknown[]) => orig.call(g, fn, typeof ms === 'number' ? scaledDelay(ms, n) : ms, ...a);
  return { restore() { (g as { setTimeout: unknown }).setTimeout = orig; } };
}
