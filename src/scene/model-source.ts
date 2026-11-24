// Where a scene reads the patient from. The page's one scene reads the engine's shared state (`liveSource`); the split orbit's second figure (a healthy liver beside the slide's
// patient, docs/approved/split-orbit.md) reads its own frame, so two scenes never share one patient. Nothing here draws or keeps time.
import { latest, live, patient, shownParams } from '../engine/store.ts';
import type { EngineFrame } from '../engine/hales/host/protocol.d.ts';
import type { HealthyRef } from '../engine/store.ts';

export interface ModelSource {
  /** The frame the figure shows (a held moment's, else the live one). */
  frame(): EngineFrame | null;
  /** The newest frame the model made, whatever is shown (the flow's Pause and Play read its `running`). */
  liveFrame(): EngineFrame | null;
  /** The healthy reference the flows and congestion are measured against. */
  reference(): HealthyRef | null;
  /** The parameters of the moment shown. */
  shown(): unknown;
  /** The patient's own parameters (an edit's target). */
  params(): unknown;
}

/** The page's patient: the engine store as the one scene has always read it. */
export const liveSource: ModelSource = {
  frame: () => latest.frame,
  liveFrame: () => live.frame,
  reference: () => patient.reference,
  shown: () => shownParams(),
  params: () => patient.params,
};

/** A patient held fixed: one frame, its parameters and the reference. `set` swaps the frame (a newer version of the same patient). */
export function fixedSource(frame: EngineFrame | null, params: unknown, reference: HealthyRef | null): ModelSource & { set(f: EngineFrame | null, p?: unknown): void } {
  let f = frame, p = params;
  return { frame: () => f, liveFrame: () => f, reference: () => reference, shown: () => p, params: () => p, set(nf, np) { f = nf; if (np !== undefined) p = np; } };
}
