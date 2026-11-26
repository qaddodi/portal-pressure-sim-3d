// The model's newest frame for a pane: read outside React (`latest.frame`), with a hook that re-renders a pane when a new frame lands (the engine's frame counter), never
// more often than the model sends one. The metrics are the engine's own (computeMetrics); typed loosely here because the 2D instruments read many fields.
import { useEngine, latest, shownParams } from '../../engine/index.ts';
import type { EngineFrame } from '../../engine/index.ts';
import { withStopReads } from '../case/stop-read.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type M = any;
/** the metrics of a frame, with the readings a case's stop card names as the card prints them while the case waits at that stop (case/stop-read.ts) */
export const metricsOf = (f: EngineFrame | null): M => withStopReads(f?.metrics ?? null);
/** the patient's parameters, or null before the first patient is loaded */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const paramsNow = (): any => shownParams();

/** The newest frame, and a re-render whenever the model sends another one. */
export function useFrame(): EngineFrame | null {
  useEngine((s) => s.frames);
  return latest.frame;
}
