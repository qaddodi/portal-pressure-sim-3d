// The one pressure monitor as a chart frame: the 2D app's own monitor.js (copied, ir/copied/monitor.copied.js) drawn on a recording context (ctx-frame.ts). Every measurement of the
// IR pane draws on it (the HVPG catheter, the PPG by IR, the PPG through a TIPS); a script says what the tip reads when (hvpg-script.copied.js HVPG_SCRIPT, reading-scripts.copied.js).
import type { Frame } from '../../charts/scene.ts';
import { FrameCtx } from './ctx-frame.ts';
import { drawMonitor } from './copied/monitor.copied.js';

/** What a monitor is handed (monitor.js drawMonitor st): the phase ('idle' no tip yet, 'enter' on its way, 'abort', 'run'), the script's clock t (ms), the readings, the model's beat and breath. */
export interface MonitorState { ph: 'idle' | 'enter' | 'abort' | 'run'; t: number; v: Record<string, number> | null; running: boolean; wave: unknown; probing: boolean }
/** A monitor's keep: the tape it records its trace on (monitor.js keys it by this object, one per monitor's life). */
export type MonitorKey = object;

/** One frame of the monitor in a w × h box. */
export function monitorFrame(key: MonitorKey, script: unknown, st: MonitorState, w: number, h: number, label: string): Frame {
  const fc = new FrameCtx(w, h);
  (drawMonitor as (cv: unknown, g: unknown, S: unknown, st: unknown) => void)(key, fc, script, st);
  return fc.frame(label);
}
