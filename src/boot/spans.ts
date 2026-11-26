import { clock } from '../clock/frame.ts';
import { setSlotFinishedSink } from '../clock/idle.ts';
// Startup spans (release review 21 Nov #8): how long asset decode, skin/organ construction, shader compile and the first draw of each view take, so a long first frame
// can be told apart (a build, a driver compile, a decode) instead of guessed. Each span is a User Timing measure (`pps:<name>`, visible in a browser trace) and a row in `window.ppsSpans`
// (name, start, ms); `?perf`'s Copy appends them. Nothing here draws, reads layout or allocates per frame: a span is two `clock.now()` calls.
export interface Span { name: string; at: number; ms: number }
const rows: Span[] = [];
const MAX = 200;
export const spans = (): readonly Span[] => rows;

function note(name: string, at: number): number { return noteSpan(name, at, clock.now() - at); }
/** A span whose time was summed by the caller (work spread over many tasks, such as one phase of the sliced scene build): `ms` of it, from `at`. */
export function noteSpan(name: string, at: number, ms: number): number {
  if (rows.length < MAX) rows.push({ name, at: Math.round(at), ms: Math.round(ms * 10) / 10 });
  try { performance.measure(`pps:${name}`, { start: at, duration: ms }); } catch { /* an old engine without the options form */ }
  (globalThis as { ppsSpans?: Span[] }).ppsSpans = rows;
  return ms;
}
// (a background job that has finished leaves one `slot:<tag>` row: its busy time in all, at the moment it finished)
setSlotFinishedSink((s) => { if (rows.length < MAX) rows.push({ name: `slot:${s.tag}`, at: Math.round(clock.now()), ms: Math.round(s.totalMs * 10) / 10 }); });
/** Time a synchronous piece of work. */
export function span<T>(name: string, fn: () => T): T { const at = clock.now(); try { return fn(); } finally { note(name, at); } }
/** Time an async piece of work (until its promise settles). */
export async function spanAsync<T>(name: string, fn: () => Promise<T>): Promise<T> { const at = clock.now(); try { return await fn(); } finally { note(name, at); } }
/** Time a view's first drawn frame once: call with the view name every frame, only the first for each is timed. */
const drawn = new Set<string>();
export function firstDraw<T>(view: string, fn: () => T): T { if (drawn.has(view)) return fn(); drawn.add(view); return span(`first-draw:${view}`, fn); }
/** Test helper. */
export function resetSpans(): void { rows.length = 0; drawn.clear(); }
