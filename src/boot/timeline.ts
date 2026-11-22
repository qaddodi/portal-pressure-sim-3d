// The boot timeline (loading plan L2): one line of ?perf's Copy naming when each stage of the start finished, in ms since the page began, so a slow cold open says WHICH stage was slow.
// Each stage is stamped once, by the code that knows it happened (the first stamp wins); a stage that never happened reads "–". Pure apart from the one table: a test stamps and reads it.
import { clock } from '../clock/frame.ts';

/** In the order they happen. `first-byte` is not stamped: it is the navigation timing's responseStart, read when the line is built. */
export const STAGES = [
  ['first-byte', 'first byte'], ['engine', 'engine ready'], ['scene', 'scene built'], ['compile', 'compile done'], ['first-draw', 'first draw'],
  ['labels', 'labels in'], ['lift', 'lift'], ['micro', 'micro primed'], ['instruments', 'instruments warm'], ['fill', 'fill done'],
] as const;
export type Stage = (typeof STAGES)[number][0];

const at: Partial<Record<Stage, number>> = {};
/** Note that `stage` has finished (only the first call counts). */
export function stamp(stage: Stage): void {
  if (at[stage] !== undefined) return;
  at[stage] = Math.round(clock.now());
  (globalThis as { ppsBootStage?: (s: string) => void }).ppsBootStage?.(stage);   // (the cover's bar moves a share further with each stage: index.html, splash plan A1)
}
export const stamps = (): Readonly<Partial<Record<Stage, number>>> => at;
export const resetTimeline = (): void => { for (const k of Object.keys(at)) delete at[k as Stage]; };

/** First byte of the page, from the browser's navigation timing (ms since the navigation began), or undefined where it has none. */
export function firstByteMs(): number | undefined {
  try { const n = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined; return n && n.responseStart > 0 ? Math.round(n.responseStart) : undefined; } catch { return undefined; }
}

/** `boot timeline (ms since the page began): first byte 120 → engine ready 480 → … → fill done –` */
export function timelineLine(s: Readonly<Partial<Record<Stage, number>>>, firstByte?: number): string {
  const v = (k: Stage) => (k === 'first-byte' ? firstByte : s[k]);
  return `boot timeline (ms since the page began): ${STAGES.map(([k, label]) => `${label} ${v(k) ?? '–'}`).join(' → ')}`;
}
