// The procedure graph's live run, kept apart from the card and the link that feed it (2D presenter-case.js evStart / evRun, 100 ms poll). One run per slide key: the card (ToolCardBody EvGraph)
// asks for it with `evRunFor`, the procedure link (ui/deck/procs-link.ts) starts it when the procedure changes the patient (`startEvRun`), resets it going back past that moment, and stashes it when
// the slide is left so Back onto the played slide shows the line whole (`leaveEvRun` / `restoreEvRun`). The engine is not imported here: the caller hands in where the frames come from.
import type { EngineFrame } from '../../../engine/hales/host/protocol.d.ts';
import { evFeeder, type Fp } from './data.ts';
import { EvRun, type EvSpec } from './model.ts';

/** Where the frames come from: the newest one, and a tap on each new one. */
/** `run`: sets the model going on its own clock at real time (2D liveSet's LIVE_RUN): a paused model, or one on the disease clock, gives no seconds after the change. */
export interface FrameSource { now(): EngineFrame | null; on(fn: (f: EngineFrame) => void): () => void; run(): void }
/** One reading per this many model seconds (2D polled every 100 ms of the model's own clock). */
export const FEED_DT = 0.1;

let key = '';
let run: EvRun | null = null;
let stash: ReturnType<EvRun['kept']> = null;
let stashKey = '';
let off: (() => void) | null = null;

const stopFeed = (): void => { off?.(); off = null; };

/** The slide's run (made on first ask; the card and the link get the same one while the slide stands). */
export function evRunFor(k: string, spec: Pick<EvSpec, 'lines'>): EvRun {
  if (k !== key || !run) { stopFeed(); run?.reset(); key = k; run = new EvRun(spec.lines); }
  return run;
}

/** The procedure has changed the patient: the run starts at this moment and takes each frame of the live model after it. Does nothing twice for a run already going. */
export function startEvRun(k: string, spec: EvSpec, settled: Fp | null, params: unknown, src: FrameSource): void {
  const r = evRunFor(k, spec);
  stopFeed();
  src.run();   // (before the change's moment is read: the seconds the graph counts are the model's own, so the model must be running)
  const feeder = evFeeder(r, spec, settled, params), f0 = src.now();
  feeder.start(f0?.t ?? 0);
  let last = -Infinity;
  off = src.on((fr) => {
    if (!Number.isFinite(fr.t) || fr.t - last < FEED_DT) return;
    last = fr.t;
    if (feeder.frame(fr)) stopFeed();   // (the graph's seconds have run: the line stands as drawn)
  });
}

/** Back before the change: what was drawn after it goes. */
export function resetEvRun(k: string): void {
  if (k !== key || !run) return;
  stopFeed(); run.reset();
}

/** The slide is left: its run is kept (when it ran) for Back, and the graph's feed stops. */
export function leaveEvRun(k: string): void {
  if (k !== key || !run) return;
  stopFeed();
  const kept = run.kept();
  if (kept) { stash = kept; stashKey = k; }
  run.reset();
}

/** Back onto a slide played through: its line comes back whole. */
export function restoreEvRun(k: string, spec: Pick<EvSpec, 'lines'>): void {
  if (!stash || stashKey !== k) return;
  evRunFor(k, spec).restore(stash);
}
