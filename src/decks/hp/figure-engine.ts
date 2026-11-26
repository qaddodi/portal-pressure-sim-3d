// What the deck's figure link reads from the engine client: a node's pressure from the newest frame, and a vessel's texel. The talk's own folder (src/ui/deck) never imports the engine
// (tests/ui-text-deck.test.ts); the readings come through here.
import { latest, indexOf, patient, engine, onFrame } from '../../engine/index.ts';
import { fingerprintOf } from '../../engine/hales/portal/fingerprint.js';
import { NODES, EDGES } from '../../engine/hales/portal/topology.js';

const NODE_AT = new Map<string, number>((NODES as unknown as ([string] | { id: string })[]).map((n, i) => [Array.isArray(n) ? n[0] : (n as { id: string }).id, i]));


/** A vessel's index in the engine's edge order (the texel of the vessel data). */
export { indexOf as edgeIndex };

/** The engine's edge ids (the topology's own table). */
export const ENGINE_EDGE_IDS: ReadonlySet<string> = new Set((EDGES as { id: string }[]).map((e) => e.id));

/** The newest frame's metrics (the bedside readings the procedures print), or null before a frame. */
export const latestMetrics = (): unknown => latest.frame?.metrics ?? null;

/** The live model's numbers in the fingerprint's terms (2D presenter-cards.js liveFp: the same function the second engine builds a slide's state with): a time-lapse plays on the live figure and its tiles read this.
 *  Null before a frame. The lymph's overflow, take-back and net stay unset (the engine's starling() is the worker's), as in 2D. */
export function liveFp(): Record<string, number | null | undefined> | null {
  const f = latest.frame;
  if (!f?.metrics) return null;
  return fingerprintOf(f.metrics, { P: f.Pf || f.P, Q: f.Qf || f.Q, D: f.D, params: patient.params }) as unknown as Record<string, number | null | undefined>;
}

/** Tells the engine something (the procedures that are engine actions: a morph to a slide's state or back). The talk's folder sends through here, as it reads through here. */
export const engineSend = (m: Parameters<ReturnType<typeof engine>['send']>[0]): void => { engine().send(m); };

/** The newest engine frame, and a tap on each new one (the procedure graph's live run reads the model through these, ui/charts/evgraph/live.ts). */
export const engineFrames = { now: () => latest.frame, on: onFrame, run: () => { engine().send({ type: 'run', running: true, clock: 'hemo', speed: 1 }); } };
