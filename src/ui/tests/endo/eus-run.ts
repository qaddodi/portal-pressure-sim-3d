// What the EUS-PPG does while the needle plays (2D eus-ppg.js play / paint, monitor-takeover.js): the figure's own procedure (sceneApi.procedure, the 2D choreography), the readings taken as the
// needle reaches each vein, the monitor's clock, and the takeover (idle > run > hold > idle: the monitor takes the scope's place for the run and the result's few seconds, a tap on the held result
// takes it away sooner). The phase lives in `useScope` (the scene's devices read it); a word that changes bumps `useEus`, so nothing re-renders per frame.
import { create } from 'zustand';
import { clock } from '../../../clock/frame.ts';
import { latest } from '../../../engine/index.ts';
import { sceneApi } from '../../../scene/api.ts';
import { READS, markAt, specOf } from '../../../scene/procedures/copied/proc-anim.js';
import { useShell } from '../../shell/store.ts';
import { createTakeover } from '../copied/monitor-takeover.copied.js';
import { EUS, type Reads } from './eus-words.ts';
import { ENDO_WORDS as W } from '../copied/endo-words.copied.js';
import { useScope } from './scope-state.ts';
import { M, eusAt, pinLive, resetMonitor } from './eus-source.ts';

const readsRef = READS as unknown as { eus: Reads };
/** The three readings as the needle has taken them (NaN until each is). */
export const reads = (): Reads => ({ ...readsRef.eus });

/** The kept record of a run (2D eus-ppg.js: run, step, done, playT). */
export const E = { run: false, step: -1, done: false, got: -1, playT: 0, stop: null as (() => void) | null };
/** Bumps when a word on the card changes: a reading taken, a step, a phase. */
export const useEus = create<{ n: number }>(() => ({ n: 0 }));
const bump = () => useEus.setState((s) => ({ n: s.n + 1 }));

/** The takeover's clock (monitor-takeover.js): its phase is the scope store's `eus`. */
export const tk = createTakeover({ onChange: (p: string) => { const ph = p as 'idle' | 'run' | 'hold'; useScope.getState().setEus(ph, ph === 'run' ? E.step : -1); bump(); } }) as {
  phase(): 'idle' | 'run' | 'hold'; shown(): boolean; start(): void; finish(done: boolean): void; close(): void; reset(): void; dispose(): void;
};

let hold: { release(): void } | null = null;
const wake = () => { hold ||= clock.hold('eus-ppg'); };
const sleep = () => { hold?.release(); hold = null; };

/** Measure › EUS-PPG (2D eus-ppg.js play): the needle on the anatomy, the monitor taking the scope's place. */
export function playEus(): void {
  if (performance.now() - E.playT < 600 || E.run) return;
  E.playT = performance.now();
  if (sceneApi.procedure.playing) { useShell.getState().say(W.eusBusy); return; }
  for (const k of Object.keys(readsRef.eus)) (readsRef.eus as unknown as Record<string, number>)[k] = NaN;
  E.run = true; E.step = 0; E.done = false; E.got = -1; M.run = true;
  tk.start();
  resetMonitor();   // (a new run: the monitor starts afresh, waiting for the needle)
  wake(); bump();
  const spec = specOf('eus') as { capture(i: number, rd: unknown, f: unknown): void };
  sceneApi.procedure.play('eus', {
    onFrame: (r) => {
      const t = sceneApi.procedure.playing?.t ?? 0;
      eusAt(t);
      if (r.step !== E.step && r.step >= 0) { E.step = r.step; useScope.getState().setEus('run', r.step); bump(); }
      // each reading is taken once its callout has come (the needle has reached the vein and the pressure has settled): the model's frame then
      const mk = r.step < 0 ? -1 : t >= markAt('eus', r.step) ? r.step : r.step - 1;
      for (let i = E.got + 1; i <= mk; i++) { spec.capture(i, readsRef.eus, latest.frame); E.got = i; bump(); }
      if (t >= EUS.T.end - 1) E.done = true;
    },
    onEnd: () => { E.run = false; M.run = false; E.step = -1; tk.finish(E.done); pinLive(); sleep(); bump(); },
  });
}

/** The card going away, or a new patient: stop what plays and give the scope back (2D dispose / tk.reset). */
export function resetEus(): void {
  if (sceneApi.procedure.playing?.kind === 'eus') sceneApi.procedure.stop();
  E.run = false; M.run = false; E.step = -1; E.done = false;
  tk.reset(); sleep(); bump();
}
