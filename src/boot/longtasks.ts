// Long main-thread tasks after the lift (loading plan L2): `PerformanceObserver` 'longtask' (Chromium; Safari has none, and the report says so), each named by what was running then:
// a background slice (`slot:<tag>`, clock/idle.ts) or the phase of a drawn frame (`frame:<phase>`), else `other` (a handler, a timer, the browser itself).
import { clock } from '../clock/frame.ts';
import { slotAround } from '../clock/idle.ts';

export interface ObserverCtor { new (cb: (l: { getEntries(): { startTime: number; duration: number }[] }) => void): { observe(o: object): void; disconnect(): void }; supportedEntryTypes?: readonly string[] }
export interface LongTask { at: number; ms: number; what: string }
const rows: LongTask[] = [];
const KEEP = 40;
let total = 0, on: boolean | null = null, obs: { disconnect(): void } | null = null;

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
/** null: not measured here; otherwise the count since the lift and the slowest rows. */
export const longTaskDigest = (): { measured: boolean; total: number; rows: readonly LongTask[] } => ({ measured: !!on, total, rows });
export const resetLongTasks = (): void => { obs?.disconnect(); obs = null; on = null; rows.length = 0; total = 0; };
