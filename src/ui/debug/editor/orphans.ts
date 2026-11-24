// Edits that name something that is not there (the editor only). Root cause of "an edit silently stops working": overrides name junctions, vessels and organs by the engine's ids, and the apply seams
// ignore an id they do not know, so a rename or removal in hales-engine regressed the picture with no message. This lists them, on load and as the draft changes (the panel counts them, the console
// warns), and a unit test holds the committed file to the ids the build has.
import { EDGES } from '../../../engine/hales/portal/topology.js';
import { NETWORK } from '../../../scene/vessels/network.ts';
import { ORGAN_IDS } from '../../../scene/organs/meshes.ts';
import type { Overrides } from '../../../editor/types.ts';

export interface Known { nodes: ReadonlySet<string>; vessels: ReadonlySet<string>; organs: ReadonlySet<string> }
export interface Orphans { nodes: string[]; vessels: string[]; organs: string[] }

/** The ids this build has: the engine's edges and their ends, the network's pieces, the organ meshes (and the caudate lobe, which is made live). */
export function knownIds(): Known {
  const edges = EDGES as { id: string; from: string; to: string }[];
  return {
    nodes: new Set([...edges.flatMap((e) => [e.from, e.to]), ...NETWORK.flatMap((v) => [v.from, v.to])].filter(Boolean)),
    vessels: new Set([...edges.map((e) => e.id), ...NETWORK.map((v) => v.id)]),
    organs: new Set([...ORGAN_IDS, 'caudate']),
  };
}
export function orphansOf(o: Overrides, k: Known = knownIds()): Orphans {
  const miss = (have: Record<string, unknown> | undefined, set: ReadonlySet<string>): string[] => Object.keys(have ?? {}).filter((id) => !set.has(id));
  return { nodes: miss(o.nodes, k.nodes), vessels: miss(o.vessels, k.vessels), organs: miss(o.organs, k.organs) };
}
export const orphanCount = (r: Orphans): number => r.nodes.length + r.vessels.length + r.organs.length;
export const orphanText = (r: Orphans): string => [...r.nodes.map((i) => `junction ${i}`), ...r.vessels.map((i) => `vessel ${i}`), ...r.organs.map((i) => `organ ${i}`)].join(', ');
/** The draft without the ids that are not there (the panel's "Drop them"). */
export function withoutOrphans(o: Overrides, k: Known = knownIds()): Overrides {
  const keep = <T>(have: Record<string, T> | undefined, set: ReadonlySet<string>): Record<string, T> | undefined => { if (!have) return undefined; const out = Object.fromEntries(Object.entries(have).filter(([id]) => set.has(id))); return Object.keys(out).length ? out : undefined; };
  const nodes = keep(o.nodes, k.nodes), vessels = keep(o.vessels, k.vessels), organs = keep(o.organs, k.organs);
  return { version: 1, ...(nodes ? { nodes } : {}), ...(vessels ? { vessels } : {}), ...(organs ? { organs } : {}) };
}
