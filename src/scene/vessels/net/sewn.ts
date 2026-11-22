// SEWN ENDS (plan owner, "Rulings on WP3 (9cead907)" and its follow-up, 22 Nov): every arm that is not a permanent vessel (a collateral, a shunt, TIPS, DIPS, REX, a feeder) is not an arm of a fillet. Its end at a node that holds a
// permanent vessel is sewn into that host, as 2D draws it (shunt-ends.ts, fork-joins.copied.js sideEndScale / flareScale): the tube runs on into the host, narrows to nothing past the wall and flares at the heel.
// This is the table: per edge, per end, the host's bone (its live radius is read by the shader's own radius rule, once per frame) and the flags. The collar itself is the shader's (net/shaders.ts `sewnScale`) and its twin the oracle's.
import { NETWORK_BY_ID } from '../network.ts';
import { endProfile, type ShuntEnd } from '../shunt-ends.ts';
import { isPermanent } from '../skin/inventory.ts';
import type { Skeleton } from './types.ts';

/** bits of a sewn end's flags: it lies inside its host (narrows past the wall), it is a SINK (narrowed, not reduced further), it flares at the heel, its flare is capped at the host's radius (a generated end). Nothing set = not sewn. */
export const SEWN_INSIDE = 1, SEWN_SINK = 2, SEWN_FLARE = 4, SEWN_CAPPED = 8;
export interface SewnEnd { /** the host's bone (index in Skeleton.bones) at that node: its live lumen is the collar's host radius */ host: number; flags: number }
const baseOf = (id: string): string => id.split('#')[0]!;

const flagsOf = (e: ShuntEnd | null): number => (e ? (e.inside ? SEWN_INSIDE : 0) | (e.sink ? SEWN_SINK : 0) | (e.flare ? SEWN_FLARE : 0) | (e.capped ? SEWN_CAPPED : 0) : SEWN_INSIDE | SEWN_FLARE | SEWN_CAPPED);

/** Per edge: [end 0, end 1], each a SewnEnd or null. An end is sewn when its edge is not a permanent vessel and its node holds a permanent one (the widest is the host). A vessel's own table row (shunt-ends.ts) gives the flags where it has one; the rest are inside and flared, as `sewnEndAt` makes them. */
export function sewnEnds(skel: Skeleton, permanentOf: (edgeId: string) => boolean = (id) => { const v = NETWORK_BY_ID.get(baseOf(id)); return !!v && isPermanent(v); }): readonly (readonly [SewnEnd | null, SewnEnd | null])[] {
  const perm = skel.edges.map((e) => permanentOf(e.id));
  const pieces = new Map<string, number[]>(); skel.edges.forEach((e, i) => { const b = baseOf(e.id); (pieces.get(b) ?? pieces.set(b, []).get(b)!).push(i); });
  return skel.edges.map((ed, ei): readonly [SewnEnd | null, SewnEnd | null] => {
    if (perm[ei]) return [null, null];
    const ends: (SewnEnd | null)[] = [null, null];
    for (const end of [0, 1] as const) {
      const node = skel.nodes.find((n) => n.id === (end === 0 ? ed.from : ed.to));
      if (!node) continue;
      let host = -1, hostR = 0;
      for (const x of node.edges) {
        if (x.edge === ei || !perm[x.edge]) continue;
        const he = skel.edges[x.edge]!, bi = he.bones[0] + (x.end === 0 ? 0 : he.bones[1] - 1), r = skel.bones[bi]!.r[0];
        if (r > hostR) { hostR = r; host = bi; }
      }
      if (host < 0) continue;
      // the vessel's own end (a piece of it in the middle has none): its row of shunt-ends.ts
      const group = pieces.get(baseOf(ed.id))!, first = group[0] === ei, last = group[group.length - 1] === ei;
      const own = end === 0 && first ? endProfile(baseOf(ed.id), 0) : end === 1 && last ? endProfile(baseOf(ed.id), 1) : null;
      ends[end] = { host, flags: flagsOf(own) };
    }
    return [ends[0]!, ends[1]!];
  });
}
