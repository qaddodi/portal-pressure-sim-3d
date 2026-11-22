// The messages between a page and the simulation host (worker-core.js), typed in one place, beside the host that speaks them.
// The app imports these types from its vendored copy of this file; test/protocol.mjs runs the host and fails when what it posts stops
// matching the shapes in test/protocol-golden.json, so a change to the protocol is made here, on purpose, in both.
// Fields the app does not read are left open (`[k: string]: unknown`) rather than guessed.

/** What a page asks of the host. `reqId` is added for requests that are answered. */
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
  | { type: 'breath'; on: boolean }
  | { type: 'traces'; on: boolean }
  | { type: 'settle' }
  /** jump the disease clock ahead (+1 wk, +1 mo, +6 mo), or run until the next event; the shell's play bar sends it as the 2D timeline does */
  | { type: 'advance'; days?: number; untilEvent?: boolean; restartClock?: boolean }
  | { type: 'preroll'; seconds: number; reqId?: number }
  | { type: 'lapse'; days: number; speed?: number; ramp?: unknown; bedside?: boolean }
  | { type: 'lapseFast'; ms: number }
  | { type: 'action'; action: { kind: string; [k: string]: unknown } }
  | { type: 'snapshot'; reqId?: number }
  | { type: 'restore'; snap: unknown; keepBeat?: boolean }
  | { type: 'morph'; snap: unknown; ms: number }
  | { type: 'explain'; metric: string | string[]; reqId?: number }
  | { type: 'metrics'; reqId?: number }
  | { type: 'presetMetrics'; ids: string[]; reqId?: number }
  | { type: 'healthyProfile'; reqId?: number }
  | { type: 'history'; secs: number; reqId?: number }
  | { type: 'sequence'; steps: unknown[]; base?: unknown; reqId?: number }
  | { type: 'whatIf'; patch: unknown; reqId?: number }
  /** the same question about a snapshot the caller sends: it touches no state of the host, so a second engine can answer it */
  | { type: 'whatIfOf'; snap: unknown; patch: unknown; reqId?: number }
  | { type: 'presets'; reqId?: number }
  /** the patients made from readings on this device ("Yours"): the host knows exactly this list; answered as `presets` */
  | { type: 'yours'; list: unknown[]; reqId?: number }
  | { type: 'perfStats'; reqId?: number };

/** The numbers a card or a tag reads. Everything the engine's `computeMetrics` returns is here; these are the ones the app names. */
export interface Metrics {
  hvpg: number; whvp: number; fhvp: number;
  [k: string]: unknown;
}

/** One engine frame. Arrays are indexed by topology node (P, Pf) or edge (Q, Qf, D, ext), in the order of portal/topology.js. */
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
  /** how many `setParams` messages the host had taken when this frame was made: a page that has sent more drops this frame's `params` as older than its own copy */
  paramsRev: number;
}

/** What the host posts back. */
export type FromWorker =
  | EngineFrame
  | { type: 'presetLoaded'; reqId?: number; id: string; params: unknown }
  | { type: 'presets'; reqId: number; presets: { id: string; label: string; group: string; summary?: string; note?: string; days: number }[] }
  | { type: 'metrics' | 'snapshot' | 'explain' | 'healthy' | 'presetMetrics' | 'history' | 'sequence' | 'prerolled' | 'perfStats' | 'whatIf'; reqId: number; [k: string]: unknown }
  | { type: 'seqStep'; reqId: number; i: number; [k: string]: unknown }
  | { type: 'crash'; message: string }
  | { type: 'error'; reqId?: number; message: string };
