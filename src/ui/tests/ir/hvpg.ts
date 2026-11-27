// The HVPG catheter's pure parts, typed (copied from the 2D app's hvpg-proc.js by scripts/copy-b11-ir.mjs): its words, its steps, its abort clock, the band words and the monitor's script.
import type { Frame } from '../../charts/scene.ts';
import { FrameCtx } from './ctx-frame.ts';
import * as C from './copied/hvpg-script.copied.js';
import { hvpgBlockedBy } from '../../../engine/hv-flag.ts';

type Sev = 'ok' | 'caution' | 'danger';
export const HVPG_SCRIPT = C.HVPG_SCRIPT as unknown;
export const STEPS = C.STEPS as readonly (readonly string[])[];
export const TB = C.TB as { probe0: number; probe1: number; abort: number; back: number; end: number };
export const ABORT_MSG = C.ABORT_MSG as string;
export const ABORT_CAP = C.ABORT_CAP as string;
export const RESULT_CAP = C.RESULT_CAP as Record<Sev, string>;
export const measureLabel = C.measureLabel as (running: boolean, hasResult: boolean) => string;
export const sevOf = C.sevOf as (v: number) => Sev;
export const sevOfRead = C.sevOfRead as (k: 'fhvp' | 'whvp', v: number) => Sev | '';
export const hvBlocked = hvpgBlockedBy;
export const NOT_SHOWN = C.NOT_SHOWN as string;
export const NOT_MEASURABLE = C.NOT_MEASURABLE as string;
export const drawTrace = C.drawTrace as unknown;

/** What the HVPG tracing is handed (2D hvpg-proc.js drawSt): the phase, the procedure's clock, the readings, whether the vein is blocked, whether it is sweeping, the model's beat and breath. */
export interface TraceSt { ph: string; t: number; v: unknown; blocked: boolean; running: boolean; wave: unknown }
/** One frame of the HVPG catheter's tracing (the 2D monitor on the HVPG script) in a w × h box. */
export function hvpgFrame(key: object, st: TraceSt, w: number, h: number, label: string): Frame {
  const fc = new FrameCtx(w, h);
  (drawTrace as (cv: unknown, st: unknown, g: unknown) => void)(key, st, fc);
  return fc.frame(label);
}
