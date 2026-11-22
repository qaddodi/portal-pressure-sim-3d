// Long main-thread tasks after the lift (loading plan L2): `PerformanceObserver` 'longtask' (Chromium; Safari has none, and the report says so), each named by what was running then:
// a background slice (`slot:<tag>`, clock/idle.ts) or the phase of a drawn frame (`frame:<phase>`), else `other` (a handler, a timer, the browser itself).
import { clock } from '../clock/frame.ts';
import { slotAround } from '../clock/idle.ts';
import { watchBlocks } from '../clock/blocks.ts';

export interface ObserverCtor { new (cb: (l: { getEntries(): { startTime: number; duration: number }[] }) => void): { observe(o: object): void; disconnect(): void }; supportedEntryTypes?: readonly string[] }
export interface LongTask { at: number; ms: number; what: string }
const rows: LongTask[] = [];
const KEEP = 120;
let total = 0, on: boolean | null = null, by: 'observer' | 'timer' = 'observer', obs: { disconnect(): void } | null = null;

/** What ran in real time [t0, t1]. */
export function whatRan(t0: number, t1: number, slot: (a: number, b: number) => string | null = slotAround, frame: (a: number, b: number) => { phase: string } | null = (a, b) => clock.frameAround(a, b)): string {
  const s = slot(t0, t1); if (s) return `slot:${s}`;
  const f = frame(t0, t1); if (f) return `frame:${f.phase}`;
  return 'other';
}
/** Record one long task (an entry's startTime and duration, real ms). */
export function noteLongTask(start: number, duration: number, what: string): void {
  total++;
  rows.push({ at: Math.round(start), ms: Math.round(duration), what });
  if (rows.length > KEEP) rows.shift();
}

/** Start counting, from the lift on. `PO` is injectable for tests. Returns false (and the report says "not measured") where the browser has no long-task observer. */
export function startLongTasks(PO: ObserverCtor | undefined = (globalThis as { PerformanceObserver?: ObserverCtor }).PerformanceObserver): boolean {
  if (on !== null) return on;
  if (!PO || !PO.supportedEntryTypes?.includes('longtask')) return (on = false);
  try {
    const o = new PO((list) => { for (const e of list.getEntries()) noteLongTask(e.startTime, e.duration, whatRan(e.startTime, e.startTime + e.duration)); });
    o.observe({ type: 'longtask', buffered: false });
    obs = o; on = true;
  } catch { on = false; }
  return on;
}
/** Where there is no long-task observer (Safari), the block timer (clock/blocks.ts) stands in: started by a debug page (?audit, ?perf), never for a phone in someone's hand. Each block is named by what ran (a slice, a frame phase,
 *  or `other`) and by the marks the app left inside it (`talk:open-deck@+3 > deck-ui:layout@+84`; `^name` is the last mark before it). Returns whether anything now measures. */
export function startBlockWatch(): boolean {
  if (on === true) return true;
  by = 'timer'; on = true;
  obs = { disconnect: watchBlocks((b) => noteLongTask(b.at, b.ms, `${whatRan(b.at, b.at + b.ms)}${b.marks.length ? ' · ' + b.marks.join(' > ') : ''}`)) };
  return true;
}
/** null: not measured here; otherwise the count since the lift and the slowest rows. */
export const longTaskDigest = (): { measured: boolean; by: 'observer' | 'timer'; total: number; rows: readonly LongTask[] } => ({ measured: !!on, by, total, rows });
export const resetLongTasks = (): void => { obs?.disconnect(); obs = null; on = null; by = 'observer'; rows.length = 0; total = 0; };
