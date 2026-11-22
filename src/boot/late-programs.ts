// The late-compile sentinel (loading plan L2). Zero stalls needs a detector that names the cause on the device: a shader program that is first built AFTER the splash has lifted is a frame stall
// on a driver without KHR_parallel_shader_compile, and today it shows only as one slow frame. From the lift on, each frame whose renderer holds more programs than the frame before logs a row: which
// programs (three's own names), in which view, and how long the draw took. ?perf lists them, the audit's LAGS section repeats them, Copy carries them.
import { renderer } from '../debug/gl-ref.ts';

export interface ProgramLike { name?: string }
export interface LateRow { frame: number; at: number; ms: number; view: string; names: string[]; count: number }

const rows: LateRow[] = [];
const KEEP = 40;
let armed = false, base = -1, total = 0, frames = 0;

/** The splash has lifted: programs built from here on are late. The renderer's count now is the baseline (unknown yet: the next frame's own count is). */
export function armLateWatch(): void {
  armed = true; frames = 0;
  const n = renderer()?.info?.programs?.length;
  base = typeof n === 'number' ? n : -1;
}
/** After a lost context the warm-up runs again: what it builds is not late. The next frame's count becomes the baseline. */
export function rebaseLateWatch(): void { base = -1; }

/** Call once per drawn frame with the renderer's program list, the view and the draw's own ms. Returns the row when programs were added since the last frame. */
export function lateProgramCheck(programs: readonly ProgramLike[] | null | undefined, view: string, ms: number, at: number): LateRow | null {
  if (!armed || !programs) return null;
  frames++;
  const n = programs.length;
  if (base < 0 || n < base) { base = n; return null; }   // (first look, or programs were freed: not a late build)
  if (n === base) return null;
  const names = programs.slice(base).map((p) => p.name || 'program');
  base = n; total += names.length;
  const row: LateRow = { frame: frames, at: Math.round(at), ms: Math.round(ms * 10) / 10, view, names: names.slice(0, 6), count: names.length };
  rows.push(row); if (rows.length > KEEP) rows.shift();
  return row;
}
export const lateRows = (): readonly LateRow[] => rows;
/** Programs built after the lift, in all. */
export const lateTotal = (): number => total;
export const resetLateWatch = (): void => { rows.length = 0; armed = false; base = -1; total = 0; frames = 0; };
