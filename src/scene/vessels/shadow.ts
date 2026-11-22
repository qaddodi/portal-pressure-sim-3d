// The crossing shadow's join rule (cel-ink.ts SHADOW): a vessel's band fades out over each end that joins another drawn vessel, so no gap shows at a junction, a run-on or a branch's mouth.
// "Joins" is the topology's own adjacency: another drawn vessel has the same node at that end. Nothing is measured from the pictures.
import { NETWORK, type NetVessel } from './network.ts';
import { partOf } from '../../engine/hales/portal/topology.js';
import { shadowEndLen } from './cel-ink.ts';

const drawn = NETWORK.filter((v) => !v.feeder);
const byNode = new Map<string, NetVessel[]>();
for (const v of drawn) for (const n of [v.from, v.to]) { const l = byNode.get(n); if (l) l.push(v); else byNode.set(n, [v]); }

/** The vessels that share the node at `end` (0 start, 1 end) of `v`, v itself excluded. */
export function neighboursAt(v: NetVessel, end: 0 | 1): NetVessel[] {
  return (byNode.get(end ? v.to : v.from) ?? []).filter((o) => o !== v && partOf(o.id) !== partOf(v.id));   // (the next piece of the same vein is a run-on, not a join)
}
/** The fade length at each end of `v`, in its own radii (0: a free end, nothing joins it there). */
export function shadowEndsOf(v: NetVessel): readonly [number, number] {
  const len = (end: 0 | 1): number => shadowEndLen(v.radius, neighboursAt(v, end).map((o) => o.radius));
  return [len(0), len(1)];
}
