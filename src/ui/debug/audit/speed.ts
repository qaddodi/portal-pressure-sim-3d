// ?audit&speed=N (code review 21 Nov, #10): a faster walk. The page's own clock runs N times faster for the length of the run: `performance.now` is scaled (every tween, the clock, the settle and the
// sampler read it, so a 280 ms fade takes 70 ms of wall time but still measures 280 ms), and every CSS animation and transition is played N times faster by the sampler. The sampler ticks N times
// as often, so its steps stay 33 ms of page time. Layout, words, coverage and pops are judged as before; frame rates, stalls and low-fps are NOT valid at a speed over 1 (the frames do not run faster),
// so the report leaves them out and says so. Debug only: nothing in the app reads it.
export const MAX_SPEED = 4;
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
