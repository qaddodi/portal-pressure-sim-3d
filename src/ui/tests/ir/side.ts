// What the HVPG pane says besides the tracing, as a pure function of the measurement's moment (2D hvpg-proc.js paintSide): the three readings with their words and bands, which of the four steps
// is done or on now, and the caption. A test reads it without a browser.
import { T } from '../copied/hvpg-clock.copied.js';
import { fmt } from '../../charts/fmt.ts';
import { STEPS, TB, ABORT_CAP, RESULT_CAP, sevOf, sevOfRead, NOT_SHOWN, NOT_MEASURABLE } from './hvpg.ts';
import type { Readings } from './run.ts';

export type Ph = 'idle' | 'enter' | 'free' | 'wedge' | 'result' | 'abort';
export interface SideIn {
  ph: Ph; t: number; /** a measurement has begun (t0 set) */ started: boolean; blocked: boolean; /** the vein cannot be catheterized (Budd–Chiari) now */ blockedNow: boolean;
  v: Readings; /** the model has a frame */ hasFrame: boolean;
}
export interface Side {
  texts: Record<keyof Readings, string>; shown: Record<keyof Readings, boolean>; nm: Record<keyof Readings, boolean>; sev: Record<keyof Readings, string>;
  /** '', 'done' or 'now' for each of the four steps */
  steps: string[]; caption: string; open: boolean; cur: number;
}
export const IDLE_CAPTION = 'Via the right internal jugular vein, a balloon catheter records free, then wedged, hepatic venous pressure.';
export const NOTE = 'The same numbers as the HVPG tile.';

/** The pane at the moment `i` describes. With no measurement under way (the pane idle) the three read live, as the bar reads them: the free and wedged pressures and the HVPG as their difference. */
export function sideOf(i: SideIn): Side {
  const { ph, t } = i;
  const open = ph === 'idle' && i.hasFrame && !i.blockedNow;
  let v = i.v;
  if (open) { const f1 = Math.round(v.fhvp * 10) / 10, w1 = Math.round(v.whvp * 10) / 10; v = { fhvp: f1, whvp: w1, hvpg: Math.round((w1 - f1) * 10) / 10 }; }
  const shown = open ? { fhvp: true, whvp: true, hvpg: true }
    : { fhvp: ph !== 'idle' && ph !== 'enter' && ph !== 'abort', whvp: ph === 'result' || (ph === 'wedge' && t >= T.callout), hvpg: ph === 'result' && (!i.started || t >= T.sum) };
  const keys: (keyof Readings)[] = ['fhvp', 'whvp', 'hvpg'];
  const texts = {} as Side['texts'], nm = {} as Side['nm'], sev = {} as Side['sev'];
  for (const k of keys) {
    nm[k] = !shown[k] && i.blockedNow;
    texts[k] = shown[k] ? fmt(v[k], 1) : nm[k] ? NOT_MEASURABLE : NOT_SHOWN;
    sev[k] = !shown[k] ? '' : k === 'hvpg' ? sevOf(v.hvpg) : sevOfRead(k, v[k]);
  }
  let cur = 1;
  if (ph !== 'abort') { cur = -1; for (let s = 0; s < STEPS.length; s++) if (STEPS[s]![0] === ph) { cur = s; break; } }
  const steps = STEPS.map((_, s) => (ph === 'idle' ? '' : ph === 'abort' ? (s === 0 ? 'done' : '') : s < cur || ph === 'result' ? 'done' : s === cur ? 'now' : ''));
  const caption = ph === 'idle' ? IDLE_CAPTION
    : ph === 'abort' ? ABORT_CAP
    : i.blocked && t >= TB.probe0 ? 'The tip is at the hepatic vein ostium, but the vein is thrombosed: the catheter cannot be advanced.'
    : ph === 'result' ? RESULT_CAP[sevOf(v.hvpg)] : String(STEPS[cur]![2]);
  return { texts, shown, nm, sev, steps, caption, open, cur };
}
