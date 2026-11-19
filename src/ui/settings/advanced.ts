// Advanced physiology: the 2D panel's controls (advanced.generated.ts: chart.js advanced() and inspector.js CONTROLS, never retyped) read and written on the patient's
// settings exactly as 2D's getters and setters do: one leaf of the params each (`path`). Pure: no DOM, no engine; Advanced.tsx draws it and tests/advanced.test.ts runs
// every control through the engine against the 2D app's own numbers.
import { ADV_CONTROLS, ADV_SECTIONS, ADV_ACTS, type AdvControl, type AdvSlider } from './advanced.generated.ts';

export { ADV_CONTROLS, ADV_SECTIONS, ADV_ACTS };
export type { AdvControl, AdvSlider };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = any;

const leaf = (p: Params, path: readonly string[]): unknown => path.reduce((x, k) => (x == null ? undefined : x[k]), p);
/** What the control shows for these settings: a slider's number, a switch's on or off. */
export function advGet(c: AdvControl, p: Params): number | boolean {
  const v = leaf(p, c.path);
  if (c.type === 'slider') return typeof v === 'number' ? v : (c.def ?? c.min);
  return c.absentOn ? v !== false : !!v;
}
/** Write the control's value into the settings (in place, as the 2D setters do). */
export function advSet(c: AdvControl, p: Params, v: number | boolean): void {
  let x = p;
  for (const k of c.path.slice(0, -1)) x = (x[k] ??= {});
  x[c.path[c.path.length - 1]] = v;
}
/** A slider is "changed" when it is off its default (the 2D `.ctl.changed`: the value in the accent, the reset button shown). */
export const advChanged = (c: AdvSlider, v: number): boolean => c.def != null && Math.abs(v - c.def) > 1e-9;
/** The History label of a change, as the 2D inspector words it. */
export const advLabel = (c: AdvControl, v: number | boolean, reset = false): string => (c.type === 'toggle' ? `${c.label} ${v ? 'on' : 'off'}` : reset ? `Reset ${c.label}` : c.label);
/** Where the green normal band sits on the track, on the thumb's own scale (2D inspector.js slider). */
export function normalBand(c: AdvSlider): { left: string; width: string } | null {
  if (!c.normal) return null;
  const span = c.max - c.min;
  return { left: `calc(var(--tw) / 2 + (100% - var(--tw)) * ${(c.normal[0] - c.min) / span})`, width: `calc((100% - var(--tw)) * ${(c.normal[1] - c.normal[0]) / span})` };
}
