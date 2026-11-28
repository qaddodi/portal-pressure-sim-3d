// A recorded frame is arrays in the engine's node and edge order of the day it was recorded. The engine's junction table (27 Nov) added nodes and pieces BETWEEN the old ones, so an old
// frame read with today's indices reads the wrong place. This lays it out again by id: every node and edge the recorded frame has keeps its recorded value; what it cannot have comes from the engine's own frame in today's order `fresh`, the engine's own frame in today's order (scripts/gen-actions-fresh.mjs). tests/fixtures/frame-order-before-junctions.json is the old order.
import { readFileSync } from 'node:fs';
import { EDGES, JUNCTION_PIECES, NODES } from '../src/engine/hales/portal/topology.js';

const old = JSON.parse(readFileSync('tests/fixtures/frame-order-before-junctions.json', 'utf8')) as { nodes: string[]; edges: string[] };
const nodeIds = (NODES as ({ id: string } | [string])[]).map((n) => (Array.isArray(n) ? n[0] : n.id));
const edgeIds = (EDGES as { id: string }[]).map((e) => e.id);

const leadOf = new Map<string, string>();
for (const [host, pieces] of Object.entries(JUNCTION_PIECES as Record<string, readonly string[]>)) for (const p of pieces) leadOf.set(p, host);
// (a piece of a split vein the recorded frame did not have carries the vein's flow, so the blood the vein carries keeps mixing as it did; a node it did not have takes the engine's own pressure)
function lay(arr: ArrayLike<number>, fresh: ArrayLike<number>, from: readonly string[], to: readonly string[], lead: boolean): number[] {
  const at = new Map(from.map((id, i) => [id, i]));
  return to.map((id, j) => { const i = at.get(id) ?? (lead ? at.get(leadOf.get(id) ?? '') : undefined); return i === undefined ? fresh[j]! : arr[i]!; });
}
type Arrays = { P: ArrayLike<number>; Pf?: ArrayLike<number>; Q: ArrayLike<number>; Qf?: ArrayLike<number>; D?: ArrayLike<number> };
/** A recorded frame (the arrays P, Pf over nodes; Q, Qf, D over edges, whichever it has) in today's order. Other fields are kept. */
export function frameByIds<F extends Arrays>(fr: F, fresh: Required<Pick<Arrays, 'P' | 'Pf' | 'Q' | 'Qf' | 'D'>>): F {
  if (fr.P.length === nodeIds.length) return fr;
  const out: Record<string, unknown> = { ...fr };
  for (const k of ['P', 'Pf'] as const) if (out[k]) out[k] = lay(out[k] as ArrayLike<number>, fresh[k], old.nodes, nodeIds, false);
  for (const k of ['Q', 'Qf', 'D'] as const) if (out[k]) out[k] = lay(out[k] as ArrayLike<number>, fresh[k], old.edges, edgeIds, true);
  return out as F;
}
