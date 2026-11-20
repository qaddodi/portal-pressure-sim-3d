// Junction skins, WP1 (spec 4.1 and 4.2): which nodes of the network get a skin, which tubes are its arms, and where its centre is. Computed from the network's own data, never from a list of ids:
// the one literal here is the kind filter (a permanent vessel is a vein, an artery, an arteriole or a liver bed). Nothing is drawn here; the scene reads this once and builds the skins from it.
import { NETWORK, cutEnd, type NetVessel } from '../network.ts';
import { REST, coursesOf, type ShapeState } from '../shape.ts';
import { setSmoothJoins, smoothJoinsOn } from '../join-mode.ts';
import { indexOf } from '../../../engine/vessel-data.ts';
import type { SkinArm, SkinJunction, Vec3 } from './types.ts';

/** The kinds of vessel that are permanent (spec 4.1): a skin is built only where these meet. Collaterals and shunts grow from nothing and keep the fork method (`nbr`, `bury`); feeders are strands of a host. */
export const PERMANENT_KINDS: ReadonlySet<string> = new Set(['vein', 'artery', 'arteriole', 'liver']);
/** How far (in radii of the widest arm) an arm's end may lie from J (spec 4.2, amended): fitEnds puts the branches onto the trunk (within ATTACH_REACH of 1.6), and the one gap the 2D art leaves, CV_R's liver beds at 1.72, is spanned by the skin's hull. */
export const SKIN_REACH = 2.0;
/** A node needs this many permanent ends for a skin, and at most this many (the shader's `armData[4]`). */
export const MIN_ARMS = 3;
export const MAX_ARMS = 4;

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
  for (const [node, ends] of permanentEndsByNode(network)) {
    if (ends.length < MIN_ARMS || ends.length > MAX_ARMS) continue;
    if (ends.some((e) => cutEnd(e.v.id) === e.end)) continue;
    const sorted = ends.map((e, i) => ({ ...e, i })).sort((a, b) => b.v.radius - a.v.radius || a.i - b.i);
    const arms: SkinArm[] = sorted.map(({ v, end }) => ({
      vesselId: v.id, end, courseIndex: 0, dataIndex: indexOf(v.lensId), lensIndex: indexOf(v.lensId), baseD: v.baseD, widthKind: v.widthKind, restR: v.radius,
    }));
    const widest = sorted[0]!;
    out.push({ node, J: endPoint(widest.v, widest.end, state), arms });
  }
  return out;
}

/** The nodes whose skins are built in each phase (spec 4.1, 6): phase 1 the SMV-SV confluence alone, phase 2 every node the table marks 2 (and, spec 10.4, those with an end behind the organs). The liver beds' nodes (SIN_R, SIN_L) are phase 3 and are in neither. */
export const PHASE_1_NODES: ReadonlySet<string> = new Set(['CONF']);
// (the nodes with an end behind the organs, spec 10.4: SVC_E and SVC where the superior cava's pieces meet the epigastric and azygos veins, IVCI where the left renal vein and the iliac run-on meet the cava. IVCS has five arms and joins with the six-arm foundation: MAX_ARMS keeps it out until then)
export const PHASE_2_NODES: ReadonlySet<string> = new Set(['CONF', 'PVT_L', 'SV', 'PVH', 'HA', 'CV_R', 'IVCI', 'SVC_E', 'SVC']);
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
