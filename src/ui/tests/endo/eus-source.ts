// The EUS-PPG's monitor, as a source for ir/Monitor.tsx (2D eus-ppg.js on tool-reading.js createReading): the one pressure monitor (monitor.js, copied) on the EUS script
// (reading-scripts.copied.js scripts().eus), following the needle's own clock step by step. Before a reading is taken the numbers are the live veins' (the left portal and left hepatic
// vein, as the figure's callout beside the needle prints them); each reading is a trace with its beat and breath, recorded as the clock passes. The state is kept here, not in a
// component, so the pane coming and going never draws the trace differently. Pure: no scene, no clock (the run is eus-run.ts).
import { latest } from '../../../engine/store.ts';
import { readFrame } from '../slide/reads.ts';
import { NODES } from '../../../engine/hales/portal/topology.js';
import { newWave, syncWave } from '../copied/hvpg-clock.copied.js';
import { scriptOf, phaseOf, takenOf, readingWords } from '../ir/copied/reading-scripts.copied.js';
import { monitorFrame, type MonitorState } from '../ir/monitor.ts';
import type { MonSource } from '../ir/Monitor.tsx';

import { clock } from '../../../clock/frame.ts';
type Obj = Record<string, number>;
type Script = { clock: { now(tk: Obj): number }; vals(fp: unknown, o: Obj): Obj; keys: string[]; marks: number[] };
const NI: Record<string, number> = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));
const r1 = (v: number) => Math.round(v * 10) / 10;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The script the EUS-PPG's monitor is drawn with (2D scriptOf('eus')). */
export const eusScript = (): Script => scriptOf('eus') as Script;
export const EUS_LABEL = 'Pressure tracing, as on the monitor in the procedure room';

/** The kept record of the monitor: the needle's clock (tk), the live veins before a reading is taken (fp), whether a run is on. */
export const M = { run: false, tk: {} as Obj, fp: { lpv: NaN, lhv: NaN, eus: NaN }, key: {} as object, wave: newWave(), take: 0 };
const out: { st: MonitorState; v: Obj } = { st: { ph: 'idle', t: 0, v: null, running: true, wave: null, probing: false }, v: { a: NaN, b: NaN, g: NaN } };

/** The live veins' pressures (2D eus-ppg.js pinLive): the monitor's readings before the needle has taken its own. */
export function pinLive(): void {
  const P = readFrame(latest.frame)?.P;   // (the shown pressures, or the slide's own: the same numbers as the text and the chart, tests/slide/reads.ts)
  M.fp.lpv = P ? r1(P[NI.LPV!]!) : NaN; M.fp.lhv = P ? r1(P[NI.LHV!]!) : NaN; M.fp.eus = r1(M.fp.lpv - M.fp.lhv);
}
/** A new run: the monitor starts afresh, waiting for the needle (2D mon.configure). */
export function resetMonitor(): void { M.tk = {}; M.take++; pinLive(); }
/** The needle's clock (2D mon.procAt): t ms of the sequence. */
export function eusAt(t: number): void { M.tk.eus = t; }

/** What the monitor is handed now (2D createReading draw): the phase, the script's t, the readings, the model's beat and breath. */
export function eusMonitor(): MonitorState {
  const S = eusScript(), st = out.st;
  if (!M.run) pinLive();
  S.vals(M.fp, out.v);
  st.ph = phaseOf(S, M.tk) as MonitorState['ph'];
  const t = S.clock.now(M.tk);
  st.t = fin(t) ? t : 0;
  st.running = true; st.probing = false; st.wave = M.wave; st.v = out.v;
  if (st.ph === 'run') syncWave(M.wave, latest.frame, st.t, clock.now());
  return st;
}
/** The readings said aloud as they are taken (2D createReading's `said`). */
export function eusWords(): string {
  const S = eusScript(), taken = takenOf(S, M.tk) as boolean[];
  eusMonitor();
  return readingWords(S, out.v, taken) as string;
}

export const eusSource: MonSource = {
  id: 'eus-ppg',
  label: () => EUS_LABEL,
  active: () => M.run,
  frame(w, h) { return monitorFrame(M.key, eusScript(), eusMonitor(), w, h, EUS_LABEL); },
};
