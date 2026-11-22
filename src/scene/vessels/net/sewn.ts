// SEWN ENDS (plan owner, "Rulings on WP3 (9cead907)" and its follow-up, 22 Nov): every arm that is not a permanent vessel (a collateral, a shunt, TIPS, DIPS, REX, a feeder) is not an arm of a fillet. Its end at a node that holds a
// permanent vessel is sewn into that host, as 2D draws it (shunt-ends.ts, fork-joins.copied.js sideEndScale / flareScale): the tube runs on into the host, narrows to nothing past the wall and flares at the heel.
// This is the table: per edge, per end, the host's bone (its live radius is read by the shader's own radius rule, once per frame) and the flags. The collar itself is the shader's (net/shaders.ts `sewnScale`) and its twin the oracle's.
import { NETWORK_BY_ID } from '../network.ts';
import { endProfile, type ShuntEnd } from '../shunt-ends.ts';
import { isPermanent } from '../skin/inventory.ts';
import type { Skeleton } from './types.ts';

/** The drawn network's own name of the node at an end of an edge piece (the first piece has the vessel's start, the last its end), `null` for a piece in the middle of a split host. A sewn end is a free node of its own in the skeleton (22 Nov: it keeps the 2D course), so its host is found by this name. */
export function topoEnd(skel: Skeleton, ei: number, end: 0 | 1): string | null {
  const id = skel.edges[ei]!.id.split('#')[0]!, v = NETWORK_BY_ID.get(id);
  if (!v) return null;
  const mine = skel.edges.map((e, k) => (e.id.split('#')[0] === id ? k : -1)).filter((k) => k >= 0);
  if (end === 0 ? mine[0] !== ei : mine[mine.length - 1] !== ei) return null;
  return `${end ? v.to : v.from}${v.tone === 'artery' ? ':art' : ''}`;
}

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
      const consider = (x: { edge: number; end: 0 | 1 }): void => {
        if (x.edge === ei || !perm[x.edge]) return;
        const he = skel.edges[x.edge]!, bi = he.bones[0] + (x.end === 0 ? 0 : he.bones[1] - 1), r = skel.bones[bi]!.r[0];
        if (r > hostR) { hostR = r; host = bi; }
      };
      node.edges.forEach(consider);
      if (host < 0) {   // (a free sewn end: the permanent vessels that end at the drawn network's node of that name; the widest is the host)
        const name = topoEnd(skel, ei, end);
        if (name) skel.edges.forEach((_, k) => { for (const e of [0, 1] as const) if (perm[k] && topoEnd(skel, k, e) === name) consider({ edge: k, end: e }); });
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

// ---- THE SEWN ENDS AS RAY-MARCHED REGIONS (J3, ?geom=net&junc=sdf, net/junc-sdf.ts): each sewn end is a junction region of its own, so the end grows out of its host through the same smooth union the junctions are drawn with, with no collar.
// A region is the sewn ARM's capsule (first: its end at the host is point 0) and the capsule of the HOST vessel round the landing (and its run-on partner when the landing is at a node that splits the host in two pieces).
// The arm's capsule is BARE: the capsule pass leaves the collar off (`bare`, texel 4.w of the row), because the union does what the collar did. The collar reaches (wall + flare span) host radii along the arm, so the capsule runs on past that (with a margin
// for a host that swells), and the arm's cut plane lies where the tube is plain again, so the tube and the capsule are the same radius at the hand-over. A presence-0 arm has radius 0 and the region stays off (junc-sdf.ts: nothing is marched for it).
import { FLARE_SPAN } from '../fork-joins.copied.js';
import { REGION_CAPS, REGION_PTS, type Region } from './regions.ts';

/** How far the arm's capsule reaches, in host radii: the collar's reach (the wall at 0.6, the flare's span) with a margin for a host that is wider live than at rest. */
export const SEWN_REACH_R = 1.5 * (0.6 + FLARE_SPAN);
/** How far the host's capsule reaches either side of the landing, in host radii (the blend's skirt is some arm radii wide; the arm lands within 1.5 host radii of the axis). */
export const SEWN_HOST_R = 3;

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** REGION_PTS bone indices along `bones` (in order), at even arc steps from `from` to `to` of the running arc (the first bone with at least that arc; the last when none). */
function pick(bones: readonly number[], arc: readonly number[], from: number, to: number): number[] {
  const out: number[] = [];
  for (let q = 0; q < REGION_PTS; q++) {
    const target = from + ((to - from) * q) / (REGION_PTS - 1);
    let k = arc.findIndex((a) => a >= target - 1e-12);
    if (k < 0) k = bones.length - 1;
    out.push(bones[k]!);
  }
  return out;
}

/** The sewn ends of the edges `edges` (skeleton indices) as regions (see above). `Region.hostFrom` is the index of the first host capsule; `Region.bare` the arm capsules (a bit mask). Pure: the skeleton at rest. */
export function sewnRegions(skel: Skeleton, edges: readonly number[], permanentOf?: (edgeId: string) => boolean, table?: ReturnType<typeof sewnEnds>): Region[] {
  const ends = table ?? sewnEnds(skel, permanentOf);
  const perm = skel.edges.map((e) => (permanentOf ?? ((id: string) => { const v = NETWORK_BY_ID.get(baseOf(id)); return !!v && isPermanent(v); }))(e.id));
  const bonesOf = (ei: number): number[] => { const [f, n] = skel.edges[ei]!.bones; return Array.from({ length: n }, (_, i) => f + i); };
  const arcOf = (bs: readonly number[]): number[] => { const a = [0]; for (let i = 1; i < bs.length; i++) a.push(a[i - 1]! + dist(skel.bones[bs[i - 1]!]!.pos[0], skel.bones[bs[i]!]!.pos[0])); return a; };
  const out: Region[] = [];
  for (const ei of edges) {
    const pair = ends[ei];
    if (!pair) continue;
    for (const end of [0, 1] as const) {
      if (!pair[end]) continue;
      const own = bonesOf(ei), line = end === 0 ? own : own.slice().reverse();   // (point 0 is the end at the host)
      const p = skel.bones[line[0]!]!.pos[0];
      // the host: the permanent edge with the bone nearest the landing
      let hb = -1, hd = Infinity;
      skel.edges.forEach((_, k) => { if (!perm[k]) return; for (const b of bonesOf(k)) { const d = dist(skel.bones[b]!.pos[0], p); if (d < hd) { hd = d; hb = b; } } });
      if (hb < 0) continue;
      const he = skel.bones[hb]!.edge, hostR = skel.bones[hb]!.r[0];
      // the arm's capsule: out along the edge to the collar's reach
      const armArc = arcOf(line), armBones = pick(line, armArc, 0, SEWN_REACH_R * hostR);
      // the host's capsule round the landing, and its run-on partner's when the window reaches the end of a split host
      const hostCaps: { bones: number[]; mate: number }[] = [];
      const hostBones = bonesOf(he), hostArc = arcOf(hostBones), at = hostBones.indexOf(hb), s0 = hostArc[at]!, win = SEWN_HOST_R * hostR;
      hostCaps.push({ bones: pick(hostBones, hostArc, Math.max(0, s0 - win), Math.min(hostArc[hostArc.length - 1]!, s0 + win)), mate: -1 });
      for (const hend of [0, 1] as const) {
        const reach = hend === 0 ? s0 : hostArc[hostArc.length - 1]! - s0;
        if (reach >= win) continue;
        const node = skel.nodes.find((n) => n.edges.some((x) => x.edge === he && x.end === hend));
        if (!node?.runOn) continue;
        const [a, b] = node.runOn.map((i) => node.edges[i]!), me = a!.edge === he && a!.end === hend ? b! : b!.edge === he && b!.end === hend ? a! : null;
        if (!me || !perm[me.edge]) continue;
        const pb = bonesOf(me.edge), pl = me.end === 0 ? pb : pb.slice().reverse(), pa = arcOf(pl);
        hostCaps.push({ bones: pick(pl, pa, 0, Math.min(pa[pa.length - 1]!, win - reach)), mate: -1 });
        hostCaps[0]!.mate = hostCaps.length;   // (index among all caps: the arm is 0, the host 1, its partner 2)
        hostCaps[hostCaps.length - 1]!.mate = 1;
        break;   // (one partner: a run-on has two pieces)
      }
      const caps = [{ bones: armBones, mate: -1 }, ...hostCaps];
      if (caps.length > REGION_CAPS) continue;
      out.push({ node: `${skel.edges[ei]!.id}:sewn${end}`, vertStart: 0, vertCount: 0, arms: 1, caps, variant: 0, window: [2, 2], hostFrom: 1, bare: 1 });
    }
  }
  return out;
}
