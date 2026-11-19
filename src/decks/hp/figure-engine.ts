// What the deck's figure link reads from the engine client: a node's pressure from the newest frame, and a vessel's texel. The talk's own folder (src/ui/deck) never imports the engine
// (tests/ui-text-deck.test.ts); the readings come through here.
import { latest, indexOf } from '../../engine/index.ts';
import { NODES, EDGES } from '../../engine/hales/portal/topology.js';

const NODE_AT = new Map<string, number>((NODES as unknown as ([string] | { id: string })[]).map((n, i) => [Array.isArray(n) ? n[0] : (n as { id: string }).id, i]));

/** The filtered pressure (mmHg) at a topology node in the newest frame, or null before a frame or for an unknown node. */
export function nodePressure(node: string): number | null {
  const f = latest.frame, i = NODE_AT.get(node);
  return f && i !== undefined ? (f.Pf?.[i] ?? null) : null;
}

/** A vessel's index in the engine's edge order (the texel of the vessel data). */
export { indexOf as edgeIndex };

/** The engine's edge ids (the topology's own table). */
export const ENGINE_EDGE_IDS: ReadonlySet<string> = new Set((EDGES as { id: string }[]).map((e) => e.id));

/** The newest frame's metrics (the bedside readings the procedures print), or null before a frame. */
export const latestMetrics = (): unknown => latest.frame?.metrics ?? null;
