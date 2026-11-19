// The two monitors of the IR pane as sources for Monitor.tsx: the HVPG catheter's tracing (2D hvpg-proc.js draw) and the PPG by IR's (2D ir-ppg.js on tool-reading.js's script). Each keeps its own
// recorded tape (monitor.js keys it by the source's key) and its own beat and breath.
import { latest } from '../../../engine/index.ts';
import { newWave, syncWave } from '../copied/hvpg-clock.copied.js';
import type { MonSource } from './Monitor.tsx';
import { hvpgFrame, type TraceSt } from './hvpg.ts';
import { monitorFrame, type MonitorState } from './monitor.ts';
import { R, phase, values, hvpgRunning, ppgMonitor, ppgScript } from './run.ts';

const hvKey = {}, hvWave = newWave();
const hvSt: TraceSt = { ph: 'idle', t: 0, v: null, blocked: false, running: false, wave: hvWave };
export const hvpgSource: MonSource = {
  id: 'ir-hvpg',
  label: () => 'HVPG measurement: catheter pressure tracing',
  active: hvpgRunning,
  frame(w, h, sweeping) {
    hvSt.ph = phase(); hvSt.t = R.t; hvSt.v = values(); hvSt.blocked = R.blocked; hvSt.running = R.t0 != null;
    // the waves follow the model's clock only while the sweep runs; at rest, a resize redraws the trace with the waves it was last drawn with
    if (sweeping || !hvWave.on) syncWave(hvWave, latest.frame, R.t, performance.now());
    return hvpgFrame(hvKey, hvSt, w, h, this.label());
  },
};

const ppgKey = {};
const ppgOut: { st: MonitorState; v: Record<string, number> } = { st: { ph: 'idle', t: 0, v: null, running: true, wave: null, probing: false }, v: {} };
export const ppgSource: MonSource = {
  id: 'ir-ppg',
  label: () => 'Pressure tracing, as on the monitor in the procedure room',
  active: () => R.ppg.run,
  frame(w, h) { return monitorFrame(ppgKey, ppgScript(), ppgMonitor(ppgOut), w, h, this.label()); },
};
