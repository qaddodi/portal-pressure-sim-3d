// Junction skins, WP1 (spec 4.1 and 4.2): which nodes of the network get a skin, which tubes are its arms, and where its centre is. Computed from the network's own data, never from a list of ids:
// the one literal here is the kind filter (a permanent vessel is a vein, an artery, an arteriole or a liver bed). Nothing is drawn here; the scene reads this once and builds the skins from it.
import { NETWORK, cutEnd, type NetVessel } from '../network.ts';
import { REST, coursesOf, type ShapeState } from '../shape.ts';
import { setSmoothJoins, smoothJoinsOn } from '../join-mode.ts';
import { indexOf } from '../../../engine/vessel-data.ts';
import { SKIN_GROWERS, type SkinArm, type SkinJunction, type Vec3 } from './types.ts';

/** The kinds of vessel that are permanent (spec 4.1): a skin is built only where these meet. Collaterals and shunts grow from nothing and keep the fork method (`nbr`, `bury`); feeders are strands of a host. */
export const PERMANENT_KINDS: ReadonlySet<string> = new Set(['vein', 'artery', 'arteriole', 'liver']);
/** How far (in radii of the widest arm) an arm's end may lie from J (spec 4.2, amended): fitEnds puts the branches onto the trunk (within ATTACH_REACH of 1.6), and the one gap the 2D art leaves, CV_R's liver beds at 1.72, is spanned by the skin's hull. */
export const SKIN_REACH = 6;
/** The nodes whose arms the art leaves further apart than `SKIN_REACH` (spec 10.5, 10.6): not a junction but the art's own spacing, so they keep the old join. Named, never hidden: tests/skin-inventory.test.ts pins this list. */
export function nodesBeyondReach(js: readonly SkinJunction[], network: readonly NetVessel[] = NETWORK, state: ShapeState = REST): string[] {
  return js.filter((j) => Math.max(...armReach(j, network, state)) > SKIN_REACH).map((j) => j.node);
}
/** The kinds of vessel that GROW (spec 10.2): a collateral opens with pressure and a shunt is there while a procedure gives it a diameter. They are arms of a skin too, but arms that come and go: the skin carries a second shape with them closed and eases between the two. */
export const GROWER_KINDS: ReadonlySet<string> = new Set(['collateral', 'shunt']);
/** Whether a vessel is a growing one: a collateral or a shunt that is ONE tube (course 0 is what is drawn), never a feeder strand (`~F:`, a fan of tributaries on a side wall: those are the side-wall arms of spec 10.1), and never a braid:
 *  a collateral that is drawn as strands (C1a the varices, C2, C4, C7, C8 the cavernoma: `plan.strands`) has no tube of its own, its three or six strands part from the node over the first half of the vessel and each ends at the trunk's width, so at the node they are a bundle
 *  of identical overlapping tubes, not a branch. They keep today's fork method (`nbr`, `bury`) and are named in tests/skin-grow.test.ts, never hidden. */
export const isGrower = (v: NetVessel): boolean => !v.feeder && !v.id.includes('~F') && GROWER_KINDS.has(v.kind) && !(v.plan?.kind === 'coil' && v.plan.strands);
/** A node needs this many permanent ends for a skin, and at most this many (the shader's `armData[4]`). */
export const MIN_ARMS = 3;
export const MAX_ARMS = 6;

/** Whether a vessel is a permanent tube: one of the kinds above and not a feeder strand (`~F:`). */
export const isPermanent = (v: NetVessel): boolean => !v.feeder && !v.id.includes('~F') && PERMANENT_KINDS.has(v.kind);

/** The end of a permanent vessel that sits at `node`, as listed by the network: 0 its start, 1 its end (a vessel with both ends on one node counts twice). */
function permanentEndsByNode(network: readonly NetVessel[]): Map<string, { v: NetVessel; end: 0 | 1 }[]> {
  const at = new Map<string, { v: NetVessel; end: 0 | 1 }[]>();
  for (const v of network) {
    if (!isPermanent(v)) continue;
    for (const [node, end] of [[v.from, 0], [v.to, 1]] as const) { const a = at.get(node) ?? []; a.push({ v, end }); at.set(node, a); }
  }
  return at;
}

/** The ends of the growing vessels at each node, the widest first (ties keep the network's order). */
function growerEndsByNode(network: readonly NetVessel[]): Map<string, { v: NetVessel; end: 0 | 1 }[]> {
  const at = new Map<string, { v: NetVessel; end: 0 | 1 }[]>();
  for (const v of network) {
    if (!isGrower(v)) continue;
    for (const [node, end] of [[v.from, 0], [v.to, 1]] as const) { const a = at.get(node) ?? []; a.push({ v, end }); at.set(node, a); }
  }
  for (const [n, a] of at) at.set(n, a.map((e, i) => ({ e, i })).sort((x, y) => y.e.v.radius - x.e.v.radius || x.i - y.i).map((x) => x.e));
  return at;
}

/** The point where a vessel's main course meets its node: its first or last point (smooth vessel joins on, a branch's end has been moved onto its trunk, shape.ts fitEnds). */
function endPoint(v: NetVessel, end: 0 | 1, state: ShapeState): Vec3 {
  const pts = coursesOf(v, state)[0]!.pts;
  return pts[end ? pts.length - 1 : 0]!;
}

/**
 * Every junction that gets a skin, in the network's order of nodes (spec 4.1). A node gets one when 3 or 4 permanent tube ends meet there, except:
 *   - (a node with an end drawn behind the organs (BACK_EDGES: the cava and its run-ons, the SVC's pieces) used to be left out, because one mesh on the vessel layer cannot be half behind an organ. Spec 10.4, Mohammad 20 Nov "all the junctions":
 *     it is in now, and the skin is drawn the way the tubes are, as three COPIES of one geometry (front, solid, veil: skin-object.ts), each weighted by the arms' own shares of those copies, so a skin is never visible where its arms are not);
 *   - a vein that branches is one through-tube to the tip of its through branch (liver-branches.ts `cutEnd`): that end is not a node of the figure.
 * The arms are the main courses of those tubes, widest first (ties keep the network's order). `J` is the end point of the widest arm's course (4.2).
 * Read with Smooth vessel joins on (the scene builds skins only then): off, the branch ends are the 2D rule's own and lie where the art put them.
 */
export function findSkinJunctions(network: readonly NetVessel[] = NETWORK, state: ShapeState = REST): SkinJunction[] {
  const out: SkinJunction[] = [];
  const growers = growerEndsByNode(network);
  const armOf = ({ v, end }: { v: NetVessel; end: 0 | 1 }, grow: boolean): SkinArm => ({
    vesselId: v.id, end, courseIndex: 0, dataIndex: indexOf(v.lensId), lensIndex: indexOf(v.lensId), baseD: v.baseD, widthKind: v.widthKind, restR: v.radius, ...(grow ? { grow: true } : {}),
  });
  for (const [node, ends] of permanentEndsByNode(network)) {
    if (ends.some((e) => cutEnd(e.v.id) === e.end)) continue;
    // the growing vessels that land here (spec 10.2): up to SKIN_GROWERS of them, the widest, as long as the skin keeps its six arms; the others keep today's fork method (nbr, bury)
    const slots = Math.max(0, Math.min(SKIN_GROWERS, MAX_ARMS - ends.length));
    const grow = (growers.get(node) ?? []).slice(0, slots);
    // a node of 3 to 6 permanent ends is a junction as it stands; a node of two (a run-on pair) is one only where a growing vessel lands on it: with that vessel closed, the skin is the run-on
    if (!(ends.length >= MIN_ARMS && ends.length <= MAX_ARMS) && !(ends.length === 2 && grow.length > 0)) continue;
    const sorted = ends.map((e, i) => ({ ...e, i })).sort((a, b) => b.v.radius - a.v.radius || a.i - b.i);
    // the permanent arms first, widest first (J is the widest's end), then the growing ones, widest first
    const arms: SkinArm[] = [...sorted.map((e) => armOf(e, false)), ...grow.map((e) => armOf(e, true))];
    const widest = sorted[0]!;
    out.push({ node, J: endPoint(widest.v, widest.end, state), arms });
  }
  return out;
}

/** How far (in radii of the widest arm) a growing arm's end may lie from J (the bridge of spec 10.5 spans it with the arm's own width): a shunt or a collateral that lands a few radii down a host's side is not at the node but on the wall, the side-wall arms of spec 10.1.
 *  Measured on the network (20 Nov): the ends at their nodes lie within 2.0 radii (the gastrorenal collateral C5 at the left renal vein, 2.0, is the farthest that builds), the landings on a wall from 2.3 (DIPS on the cava) to 8.9. */
export const GROW_REACH = 2.2;
/** The junction without the growing arms that end farther than `GROW_REACH` radii from J (a side-wall landing, spec 10.1: left to the side-wall arms), and which they were. The permanent arms decide whether the NODE is a junction (`nodesBeyondReach`); a far collateral or shunt is
 *  only left out of it, and keeps today's fork method. */
export function dropFarGrowers(j: SkinJunction, network: readonly NetVessel[] = NETWORK, state: ShapeState = REST): { junction: SkinJunction; far: string[] } {
  const reach = armReach(j, network, state), far = j.arms.filter((a, i) => a.grow && reach[i]! > GROW_REACH).map((a) => a.vesselId);
  return far.length ? { junction: { ...j, arms: j.arms.filter((a) => !far.includes(a.vesselId)) }, far } : { junction: j, far };
}

/** The same junction without its growing arms (what the scene falls back to when the skin cannot be built with them), or null when fewer than MIN_ARMS permanent arms are left (a run-on pair needs no skin). */
export function withoutGrowers(j: SkinJunction): SkinJunction | null {
  const arms = j.arms.filter((a) => !a.grow);
  if (arms.length === j.arms.length) return j;
  return arms.length >= MIN_ARMS ? { ...j, arms } : null;
}

/** The nodes whose skins are built in each phase (spec 4.1, 6, 10): phase 1 the SMV-SV confluence alone, phase 2 every node the table marks 2, those with an end behind the organs (spec 10.4) and the liver beds' nodes (SIN_R, SIN_L, spec 10.5: the node's far arm decides whether it is a junction, `SKIN_REACH`, below). */
export const PHASE_1_NODES: ReadonlySet<string> = new Set(['CONF']);
// (the nodes with an end behind the organs, spec 10.4: SVC_E and SVC where the superior cava's pieces meet the epigastric and azygos veins, IVCI where the left renal vein and the iliac run-on meet the cava, IVCS with its five arms)
export const PHASE_2_NODES: ReadonlySet<string> = new Set(['CONF', 'PVT_L', 'SV', 'PVH', 'HA', 'CV_R', 'SIN_R', 'SIN_L', 'IVCI', 'SVC_E', 'SVC', 'IVCS']);
export function skinNodesForPhase(phase: 1 | 2): ReadonlySet<string> {
  return phase === 1 ? PHASE_1_NODES : PHASE_2_NODES;
}

/** How far each arm's end lies from the junction centre, in radii of the widest arm: spec 4.2 says with smooth joins on every one is within `ATTACH_REACH` (shape.ts fitEnds has moved the branch onto the trunk). */
export function armReach(j: SkinJunction, network: readonly NetVessel[] = NETWORK, state: ShapeState = REST): number[] {
  const byId = new Map(network.map((v) => [v.id, v]));
  return j.arms.map((a) => {
    const e = endPoint(byId.get(a.vesselId)!, a.end, state);
    return Math.hypot(e[0] - j.J[0], e[1] - j.J[1], e[2] - j.J[2]) / j.arms[0]!.restR;
  });
}

/** How far apart in depth the arms' tiers are at the node (scene units), read on the 2D rule's own courses: a vessel's depth eases to its node's (shape.ts `to3`), so arms of different tiers still meet at one depth, and this is
 *  0 unless a vessel's course does not ease there. (Smooth joins' tuck, a branch ending a little behind its trunk's axis, is deliberate and is not counted.) The skin's screen-space ink (spec 4.7) is exact only when this is 0. */
export function tierSpread(j: SkinJunction, network: readonly NetVessel[] = NETWORK, state: ShapeState = REST): number {
  const was = smoothJoinsOn();
  setSmoothJoins(false);
  try {
    const byId = new Map(network.map((v) => [v.id, v]));
    const zs = j.arms.map((a) => endPoint(byId.get(a.vesselId)!, a.end, state)[2]);
    return Math.max(...zs) - Math.min(...zs);
  } finally { setSmoothJoins(was); }
}
/** The most the arms' depths may differ for them to count as one tier (scene units): rounding only. */
export const TIER_EPS = 1e-4;
/** Whether every arm of a junction meets it at one depth (spec 8). The scene skips a node where this fails and keeps today's method there. */
export const armsShareTier = (j: SkinJunction, network: readonly NetVessel[] = NETWORK, state: ShapeState = REST): boolean => tierSpread(j, network, state) <= TIER_EPS;
