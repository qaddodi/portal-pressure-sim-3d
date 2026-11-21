// Junction skins, WP1 (spec 4.1 and 4.2): which nodes of the network get a skin, which tubes are its arms, and where its centre is. Computed from the network's own data, never from a list of ids:
// the one literal here is the kind filter (a permanent vessel is a vein, an artery, an arteriole or a liver bed). Nothing is drawn here; the scene reads this once and builds the skins from it.
import { NETWORK, NETWORK_BY_ID, cutEnd, type NetVessel } from '../network.ts';
import { REST, coursesOf, type ShapeState } from '../shape.ts';
import { centrelineOf } from '../centreline.ts';
import { setSmoothJoins, smoothJoinsOn } from '../join-mode.ts';
import { indexOf } from '../../../engine/vessel-data.ts';
import { braidRootEnds } from './braid-arm.ts';
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
export function permanentEndsByNode(network: readonly NetVessel[]): Map<string, { v: NetVessel; end: 0 | 1 }[]> {
  const at = new Map<string, { v: NetVessel; end: 0 | 1 }[]>();
  for (const v of network) {
    if (!isPermanent(v) && !joinsNode(v)) continue;   // (a liver branch that leaves its host near a node is an arm of that node)
    // (a branch's own node end is the one at its host: the other end is the tip it fades out at)
    const ends: readonly (readonly [string, 0 | 1])[] = isLiverBranch(v) ? [[branchEndOf(v) ? v.to : v.from, branchEndOf(v)]] : [[v.from, 0], [v.to, 1]];
    for (const [node, end] of ends) { const a = at.get(node) ?? []; a.push({ v, end }); at.set(node, a); }
  }
  return at;
}

/** The ends of the growing vessels at each node, the widest first (ties keep the network's order). With `braids` the root ends of the braided collaterals (braid-arm.ts: the ends where their strands leave the node as ONE bundle) are growing arms too, the body's skins' only:
 *  the Circuit draws a braid as its own course and keeps them out. */
export function growerEndsByNode(network: readonly NetVessel[], braids = false): Map<string, { v: NetVessel; end: 0 | 1 }[]> {
  const at = new Map<string, { v: NetVessel; end: 0 | 1 }[]>();
  for (const v of network) {
    const roots = braids && !v.feeder && !v.id.includes('~F') && GROWER_KINDS.has(v.kind) ? braidRootEnds(v) : [];
    if (!isGrower(v) && !roots.length) continue;
    for (const [node, end] of [[v.from, 0], [v.to, 1]] as const) { if (!isGrower(v) && !roots.includes(end)) continue; const a = at.get(node) ?? []; a.push({ v, end }); at.set(node, a); }
  }
  for (const [n, a] of at) at.set(n, a.map((e, i) => ({ e, i })).sort((x, y) => y.e.v.radius - x.e.v.radius || x.i - y.i).map((x) => x.e));
  return at;
}

/** The point where a vessel's main course meets its node: its first or last point (smooth vessel joins on, a branch's end has been moved onto its trunk, shape.ts fitEnds). */
function endPoint(v: NetVessel, end: 0 | 1, state: ShapeState): Vec3 {
  const pts = coursesOf(v, state)[0]!.pts;
  return pts[end ? pts.length - 1 : 0]!;
}

/** An end lies on a host's SIDE (spec 10.1) when it is within this many of the host's radii of the host's axis: it is inside the host's wall, so the host runs on past it and the junction is on its side, not at a node. */
export const SIDE_TOL_R = 1.5;
/** An end that is more than this many radii (of the widest arm) from J is not at the node's centre: it is a candidate for a side-wall attachment or for another node (shape.ts ATTACH_REACH is 1.6). */
export const NEAR_R = 1.6;
/** A side-wall point is not at a host's end: within this share of its length of either end the host is a plain end arm, not a side one. */
export const SIDE_EDGE = 0.02;

/** The nearest point of a polyline to `p`: its distance, its share of the polyline's length (0..1) and the point. */
export function nearestOnPolyline(pts: readonly Vec3[], p: Vec3): { d: number; u: number; at: Vec3 } {
  let total = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]); cum.push(total); }
  let best = Infinity, bu = 0, bat: Vec3 = pts[0]!;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!, ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const, l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2)) : 0;
    const q: Vec3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t], d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (d < best) { best = d; bat = q; bu = total > 0 ? (cum[i]! + t * (cum[i + 1]! - cum[i]!)) / total : 0; }
  }
  return { d: best, u: bu, at: bat };
}

/** The point at share `u` of a polyline's length. */
export function pointAtShare(pts: readonly Vec3[], u: number): Vec3 {
  let total = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]); cum.push(total); }
  const d = u * total;
  let i = 0;
  while (i < pts.length - 2 && cum[i + 1]! < d) i++;
  const a = pts[i]!, b = pts[i + 1]!, l = cum[i + 1]! - cum[i]!, t = l > 0 ? Math.min(1, Math.max(0, (d - cum[i]!) / l)) : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * The SIDE-WALL rule (spec 10.1) on one node's arms. An arm whose end is not at the node's centre (more than `NEAR_R` radii of the widest from J) but INSIDE another arm's wall (within `SIDE_TOL_R` radii of that arm's axis, not at its ends) lands on that arm's
 * side: the hepatic veins open into the cava's side, 0.4 to 0.6 radii from its axis and 1.7 to 7.1 radii down it from the cava's node IVCS. When every such end lands on ONE host, the host arm becomes a side arm
 * (`side: { u, dir }`, u the mean of the attachments' places along it) and the junction's centre is that point of the host's axis: a junction in the middle of the cava, not at its end. Nothing changes otherwise (arms keep their ends, the skin's capsules bridge the gaps).
 */
function hostSides(arms: SkinArm[], pts: readonly (readonly Vec3[])[], J: Vec3): { arms: SkinArm[]; J: Vec3 } {
  const R0 = arms[0]!.restR;
  // only a node the art spreads beyond SKIN_REACH needs it (an end 1.6 radii out that lands in its host's wall is a plain arm of a node: its bridge is the skin's own, and nothing else about the node changes)
  const far = arms.some((a, i) => { if (a.grow) return false; const p = pts[i]![a.end ? pts[i]!.length - 1 : 0]!; return Math.hypot(p[0] - J[0], p[1] - J[1], p[2] - J[2]) / R0 > SKIN_REACH; });
  if (!far) return { arms, J };
  const landing = new Map<number, number[]>();   // host arm -> the places along it the others land on
  for (let e = 0; e < arms.length; e++) {
    const a = arms[e]!, p = pts[e]![a.end ? pts[e]!.length - 1 : 0]!;
    if (a.grow) continue;   // (a growing arm that lands on a wall is left out of the skin by dropFarGrowers, it is never the landing of a side-wall node)
    if (Math.hypot(p[0] - J[0], p[1] - J[1], p[2] - J[2]) / R0 <= NEAR_R) continue;
    let host = -1, hu = 0, hd = Infinity;
    for (let h = 0; h < arms.length; h++) {
      if (h === e || arms[h]!.grow) continue;
      const r = nearestOnPolyline(pts[h]!, p);
      if (r.d <= SIDE_TOL_R * arms[h]!.restR && r.u > SIDE_EDGE && r.u < 1 - SIDE_EDGE && r.d < hd) { host = h; hu = r.u; hd = r.d; }
    }
    if (host < 0) return { arms, J };   // (an end that lands on no side: the node is not a side-wall junction as a whole)
    landing.set(host, [...(landing.get(host) ?? []), hu]);
  }
  if (landing.size !== 1) return { arms, J };
  const [[h, us]] = [...landing.entries()] as [[number, number[]]];
  const arm = arms[h]!, u = us.reduce((s, x) => s + x, 0) / us.length;
  // the host's share runs from its start (0) to its end (1) in the course's own order; end 1 means the node is at u = 1, so the part below u is the arm (dir -1)
  const out = arms.map((a, i) => (i === h ? { ...arm, side: { u, dir: (arm.end ? -1 : 1) as -1 | 1 } } : a));
  return { arms: out, J: pointAtShare(pts[h]!, u) };
}

/** Each arm with the tube's radius where it meets the junction (types.ts `jointR`): at its end (u 0 or 1), or at `side.u` on the wall of a host. The blend width is a share of the NARROWEST of these, not of the vessels' nominal radii: a branch tapers to a third of its radius in places. */
export function withJointR(arms: SkinArm[], state: ShapeState = REST): SkinArm[] {
  return arms.map((a) => {
    const c = centrelineOf(a.vesselId, state);
    return c ? { ...a, jointR: c.radiusAt(a.side ? a.side.u : a.end) } : a;
  });
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
  const growers = growerEndsByNode(network, true), byId = new Map(network.map((v) => [v.id, v]));
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
    const side = hostSides(arms, arms.map((a) => coursesOf(byId.get(a.vesselId)!, state)[0]!.pts as readonly Vec3[]), endPoint(widest.v, widest.end, state));
    out.push({ node, J: side.J, arms: side.arms });
  }
  out.push(...liverBranchJunctions(network, state));
  return out;
}

/** A liver branch's own tube: a branching vein is one through-tube (liver-branches.ts), its second branch a feeder tube `<host>~F:b` whose join end lies ON the host's centreline, a few radii from the host's end at the child's node. */
export const isLiverBranch = (v: NetVessel): boolean => !!v.feeder && v.feeder.when === null && v.id.endsWith('~F:b');

/** The end of a liver branch that lies on its host (the feeder's `join`). */
const branchEndOf = (v: NetVessel): 0 | 1 => ((v.plan?.kind === 'feeder' ? v.plan.list[0]?.join : 0) ?? 0) as 0 | 1;

/** Where a liver branch meets its host: the host, the branch's end at the host, the point of the host's axis nearest to it, its share `u` of the host and its distance along the host from the host's end at the branch's node (in the host's radii). */
function branchMeet(v: NetVessel, state: ShapeState): { host: NetVessel; end: 0 | 1; at: Vec3; u: number; fromNodeR: number } | null {
  const host = NETWORK_BY_ID.get(v.feeder!.host), item = v.plan?.kind === 'feeder' ? v.plan.list[0] : undefined;
  if (!host || !item) return null;
  const hp = coursesOf(host, state)[0]!.pts as readonly Vec3[], cp = coursesOf(v, state)[0]!.pts as readonly Vec3[];
  const end = (item.join ?? 0) as 0 | 1, near = nearestOnPolyline(hp, cp[end ? cp.length - 1 : 0]!);
  if (near.u <= SIDE_EDGE || near.u >= 1 - SIDE_EDGE) return null;
  // (the host's end at the branch's node: the end whose node the branch names for its own join end)
  const node = end ? v.to : v.from, hostEnd = host.from === node ? 0 : host.to === node ? 1 : -1;
  if (hostEnd < 0) return { host, end, at: near.at, u: near.u, fromNodeR: Infinity };
  let total = 0, upTo = 0;
  for (let i = 1; i < hp.length; i++) total += Math.hypot(hp[i]![0] - hp[i - 1]![0], hp[i]![1] - hp[i - 1]![1], hp[i]![2] - hp[i - 1]![2]);
  upTo = hostEnd ? (1 - near.u) * total : near.u * total;
  return { host, end, at: near.at, u: near.u, fromNodeR: upTo / host.radius };
}
/** A liver branch that leaves its host within `SKIN_REACH` radii of the host's end at their node is one more arm of that node's skin (the right portal vein's second branch at RPV_T, the left's at LPV_A): its end lies inside the host's wall, bridged to J like any arm. */
export const joinsNode = (v: NetVessel, state: ShapeState = REST): boolean => { const m = isLiverBranch(v) ? branchMeet(v, state) : null; return !!m && m.fromNodeR <= SKIN_REACH; };

/**
 * The junctions in the middle of a liver vein (Mohammad, 20 Nov: "how about the hepatic vein and portal vein branches?", "everything"): a branch that leaves its host farther from the host's ends than a skin reaches (the right hepatic vein's child, 8.6 radii from the cava end) has no
 * node of the figure to be an arm of. It is a side-wall junction with no node (spec 10.1, "a virtual node mid-host"): the host's two sides (`side { u, dir -1 }` below the branch and `dir +1` above it, which together leave a HOLE in the host's tube) and the branch, J the point of the host's
 * axis nearest the branch's end. The node's name is the branch's id.
 */
export function liverBranchJunctions(network: readonly NetVessel[] = NETWORK, state: ShapeState = REST): SkinJunction[] {
  const out: SkinJunction[] = [];
  for (const v of network) {
    const m = isLiverBranch(v) ? branchMeet(v, state) : null;
    if (!m || m.fromNodeR <= SKIN_REACH) continue;
    const arm = (o: NetVessel, e: 0 | 1, side?: SkinArm['side']): SkinArm => ({ vesselId: o.id, end: e, courseIndex: 0, dataIndex: indexOf(o.lensId), lensIndex: indexOf(o.lensId), baseD: o.baseD, widthKind: o.widthKind, restR: o.radius, ...(side ? { side } : {}) });
    out.push({ node: v.id, J: m.at, arms: withJointR([arm(m.host, 1, { u: m.u, dir: -1 }), arm(m.host, 0, { u: m.u, dir: 1 }), arm(v, m.end)], state) });
  }
  return out;
}

/** How far (in radii of the widest arm) a growing arm's end may lie from J (the bridge of spec 10.5 spans it with the arm's own width): a shunt or a collateral that lands a few radii down a host's side is not at the node but on the wall, the side-wall arms of spec 10.1.
 *  Measured on the network (20 Nov): the ends at their nodes lie within 2.0 radii (the gastrorenal collateral C5 at the left renal vein, 2.0, is the farthest that builds), the landings on a wall from 2.3 (DIPS on the cava) to 8.9. */
export const GROW_REACH = 2.2;
/** A growing end that lands within this many radii (of the junction's widest arm) of an existing junction's centre is an arm of THAT junction, whatever node the network names for it (S_MC lands 1.5 radii from IVCI's centre, on the iliac vein's end). wall.ts re-exports it. */
export const ATTACH_NEAR_R = 2.6;
/** The junction without the growing arms that end farther than `GROW_REACH` radii from J (a side-wall landing, spec 10.1: left to the side-wall arms), and which they were. The permanent arms decide whether the NODE is a junction (`nodesBeyondReach`); a far collateral or shunt is
 *  only left out of it, and keeps today's fork method. */
export function dropFarGrowers(j: SkinJunction, network: readonly NetVessel[] = NETWORK, state: ShapeState = REST): { junction: SkinJunction; far: string[]; farArms: SkinArm[] } {
  // a node the growing arm alone makes a junction (two permanent arms that run on, and the collateral or shunt that ends on them: DIPS at IVC_D, 2.29 radii out) is not left to a wall landing on the run-on's stub, which has no ring to cut: a growing end that near is the node's own arm, the reach wall.ts attachNear already allows
  const limit = j.arms.filter((a) => !a.grow).length < MIN_ARMS ? ATTACH_NEAR_R : GROW_REACH;
  const reach = armReach(j, network, state), farArms = j.arms.filter((a, i) => a.grow && reach[i]! > limit), far = farArms.map((a) => a.vesselId);
  return far.length ? { junction: { ...j, arms: j.arms.filter((a) => !far.includes(a.vesselId)) }, far, farArms } : { junction: j, far, farArms };
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
    if (a.side) return 0;   // (a side-wall arm runs through the junction's centre: J is a point of its axis)
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
