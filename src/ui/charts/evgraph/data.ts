// What the procedure's graph reads from the 3D engine, as 2D's presenter gives it (presenter-case.js evStart / evRun, presenter.js liveSet, presenter-cards.js liveFp):
//  - where its lines start (the state the slide opened on, or the slide's own `before` state) and where they are expected to end (the slide's settled state);
//  - each live reading, from the moment the procedure changes the patient, taken from the engine's frame as the tiles take theirs, toward the settled numbers at the end.
// Pure apart from `feedFrame`'s reading of a frame; the presenter owns when the change happens (it calls run.start(), then feeds each frame it polls, every 100 ms).
import { fingerprintOf } from '../../../engine/hales/portal/fingerprint.js';
import type { EngineFrame } from '../../../engine/hales/host/protocol.d.ts';
import { EVENT_S, EvRun, evSample, type EvSpec } from './model.ts';

export type Fp = Readonly<Record<string, number | null | undefined>>;

/** The numbers the tiles print for a live engine frame (presenter-cards.js liveFp: the network as it stands in the same poll). */
export const liveFp = (fr: Pick<EngineFrame, 'metrics' | 'P' | 'Pf' | 'Q' | 'Qf' | 'D'>, params: unknown = null): Fp =>
  fingerprintOf(fr.metrics, { P: fr.Pf || fr.P, Q: fr.Qf || fr.Q, D: fr.D, params }) as unknown as Fp;

/** A slide's state for the graph: its fingerprint, and the state before the change it makes at once (when it has one). */
export interface EvState { fp: Fp; before?: { fp: Fp } | null }

/** Where the lines start and are expected to end. `opened`: the fingerprint of the state the slide opened on (the live model when the slide is stepped onto); `own`: the slide's own state,
 *  when the slide shows its own patient (its `before` state, if it has had a change, is where the lines start and the state itself where they end); null: the scale holds the start alone. */
export function evBounds(spec: EvSpec, opened: Fp | null, own: EvState | null = null): { before: [number, number]; end: [number, number] | null } | null {
  const [a, b] = spec.lines, had = !!own?.before, from = (had ? own!.before!.fp : opened) || null;
  if (!from) return null;
  const to = had ? own!.fp : null;
  return { before: [from[a] as number, from[b] as number], end: to ? [to[a] as number, to[b] as number] : null };
}

/** Feeds a run the engine's reading `t` model seconds after the change (t: frame.t less the frame's time at the change). Returns true once the graph's seconds have run (the poll stops). */
export function feedRun(run: EvRun, spec: EvSpec, t: number, fp: Fp, settled: Fp | null): boolean {
  const [v0, v1] = evSample(spec, t, fp, settled);
  run.push(t, v0, v1);
  return t >= EVENT_S;
}

/** A poll of the live engine for the graph: remember the model's clock at the change, give each frame to the run. `settled`: the slide's own state, read at the end. */
export function evFeeder(run: EvRun, spec: EvSpec, settled: Fp | null, params: unknown = null) {
  let m0: number | null = null;
  return {
    /** The change has happened now (the engine's clock at that moment). */
    start(frameT: number) { m0 = frameT; run.start(); },
    /** One polled frame; true when the graph's seconds have run. */
    frame(fr: EngineFrame): boolean {
      if (m0 == null || !fr?.metrics || !Number.isFinite(fr.t)) return false;
      return feedRun(run, spec, fr.t - m0, liveFp(fr, params), settled);
    },
  };
}
