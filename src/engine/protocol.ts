// The messages between the page and the simulation worker, as the 2D app's host (host/worker-core.js) speaks them.
// Typed for what the 3D app uses; unlisted fields are left out on purpose (add one here when the app reads it).
// Later this file is generated from hales-engine's own protocol types.

/** What the page asks of the worker. `reqId` is added by the client for requests that are answered. */
export type ToWorker =
  | { type: 'init'; params?: unknown }
  | { type: 'preset'; id: string; days?: number; reqId?: number }
  | { type: 'reset' }
  | { type: 'setParams'; params: unknown; settle?: boolean; ease?: number }
  | { type: 'run'; running?: boolean; speed?: number; clock?: 'hemo' | 'disease' }
  | { type: 'visibility'; visible: boolean }
  | { type: 'ackPaint'; on: boolean }
  | { type: 'painted' }
  | { type: 'probe'; id: string }
  | { type: 'beat'; on: boolean }
  | { type: 'settle' }
  | { type: 'action'; action: { kind: string; [k: string]: unknown } }
  | { type: 'snapshot'; reqId?: number }
  | { type: 'restore'; snap: unknown }
  | { type: 'morph'; snap: unknown; ms: number }
  | { type: 'explain'; metric: string; reqId?: number }
  | { type: 'metrics'; reqId?: number }
  | { type: 'presetMetrics'; ids: string[]; reqId?: number }
  | { type: 'healthyProfile'; reqId?: number }
  | { type: 'history'; secs: number; reqId?: number }
  | { type: 'sequence'; steps: unknown[]; base?: unknown; reqId?: number }
  | { type: 'presets'; reqId?: number }
  | { type: 'perfStats'; reqId?: number };

/** The numbers a card or a tag reads. Everything the engine's `computeMetrics` returns is here; these are the ones the slice names. */
export interface Metrics {
  hvpg: number; whvp: number; fhvp: number;
  [k: string]: unknown;
}

/** One engine frame. Arrays are indexed by topology node (P, Pf) or edge (Q, Qf, D, ext), in the order of hales/portal/topology.js. */
export interface EngineFrame {
  type: 'frame';
  changed: boolean; gen: number;
  /** the model jumped (a new patient, a restore): nothing shown may blend across it */
  jump: boolean;
  t: number; day: number; running: boolean; speed: number; clock: 'hemo' | 'disease';
  pulsing: boolean; morphing: boolean; settling: boolean; phase: number;
  /** node pressures (mmHg): beat by beat, and eased (Pf) */
  P: Float32Array; Pf: Float32Array;
  /** edge flows (mL/s) beat by beat, and eased (Qf) */
  Q: Float32Array; Qf: Float32Array;
  ext: Float32Array;
  /** edge diameters (mm) */
  D: Float32Array;
  metrics: Metrics;
  events: unknown[];
  params?: unknown;
}

/** What the worker posts back. */
export type FromWorker =
  | EngineFrame
  | { type: 'presetLoaded'; reqId?: number; id: string; params: unknown }
  | { type: 'presets'; reqId: number; presets: { id: string; label: string; group: string; summary?: string; note?: string; days: number }[] }
  | { type: 'metrics' | 'snapshot' | 'explain' | 'healthy' | 'presetMetrics' | 'history' | 'sequence' | 'prerolled' | 'perfStats'; reqId: number; [k: string]: unknown }
  | { type: 'seqStep'; reqId: number; i: number; [k: string]: unknown }
  | { type: 'crash'; message: string }
  | { type: 'error'; reqId?: number; message: string };
