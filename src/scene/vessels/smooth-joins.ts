// "Smooth vessel joins" (Settings > Figure depth): where the tubes of the network meet, what makes the meeting one clean piece of geometry rather than separate tubes that touch.
// Built once from the network's own rules (network.ts: the run-on pairs, the forks), nothing here is drawn per frame, and nothing here is read unless the switch is on (join-mode.ts).
//
//   * Run-on pairs (two vessels that carry on into one another): the two tubes share the join's ring (same centre, same radius: both ease to the mean width over the last 30 %,
//     including pairs of different caliber that the 2D rule leaves with a step), have no cap there, and the vertex shader eases their live engine widths to one as well (`mate`),
//     so no ring or step shows when the engine widens one and not the other.
//   * Branch ends (a vessel that ends on a trunk without carrying on into it): the end is moved onto the trunk's centreline (`attach`, shape.ts `fitEnds`) and its collar and cap kept
//     inside the trunk, so there is no gap between the branch's last ring and the trunk's wall and no cap standing out of the far side.
//   * Free ends (the end of a vessel nothing meets, with no alpha fade of its own): the tube tapers to a point (`free`) instead of ending in a round cap.
//   * The cava ends in the right atrium where the approved placement puts the atrium (placed-network.ts): the 2D figure's slope to its back wall (NODE_RISE) went with the cut-over.
import { IVC_EDGES } from '../anatomy/source.ts';
import { NETWORK, RUN_ONS, meetRadius, type NetVessel } from './network.ts';
import { runsInto } from './starts.ts';

export interface SmoothEnds {
  /** radius at each end as a share of `radius` (a run-on pair eases to the mean of the two) */
  taper?: readonly [number, number];
  /** the share of the course each end's taper eases over: 0.3 (the 2D tubes' own) except a wide vein narrowing into a thin bed, which funnels over the whole of it */
  span: readonly [number, number];
  /** the end carries on into another tube: no cap */
  joined: readonly [boolean, boolean];
  /** the vessel this end carries on into (whose live width it eases to) */
  mate: readonly [string | null, string | null];
  /** the vessels this end may end on: a branch's end is moved onto the nearest one's centreline (shape.ts) */
  attach: readonly [readonly string[] | null, readonly string[] | null];
  /** the radius of the widest trunk (a run-on pair there) this end ends on, for a collar that must never be wider than it (a collateral or shunt keeps its own course, which is not moved) */
  hostR: readonly [number | null, number | null];
  /** nothing meets this end: it tapers to a point (unless the vessel has an alpha fade of its own, which shape.ts checks) */
  free: readonly [boolean, boolean];
}

/** How close a branch's end has to be to a trunk (in the trunk's radii) to be moved onto its centreline: nearer than this is a drawing gap or stub, farther is the 2D art's own placing. */
export const ATTACH_REACH = 1.6;
/** The share of a trunk's radius a branch's end collar and cap may take while buried in it (so they never stand out of its far wall). */
export const BURY = 0.8;
/** The widest a fork's collar may be, as a share of the trunk's radius: a fillet blends the branch into the trunk, it is never a bulb wider than the trunk. */
export const CEIL = 0.9;
/** The share of a course (first or last) over which a moved end eases back to the course, as the depth does at a node (shape.ts `to3`). */
export const END_SHARE = 0.25;

/** Radii further apart than this share: the pair is a trunk narrowing into a thin vessel (a vein into a liver bed), not two stretches of one vein. */
export const UNEQUAL = 1.25;
const isCollateral = (v: NetVessel) => v.kind === 'collateral';
/** A vessel whose course is its own plain path: no coils, no strands (a collateral braids along its path and keeps it). */
export const isPlain = (v: NetVessel): boolean => !v.feeder && v.plan?.kind === 'coil' && !v.plan.coils && !v.plan.strands && v.kind !== 'shunt';

function build(): ReadonlyMap<string, SmoothEnds> {
  const mains = NETWORK.filter((v) => !v.feeder);
  const byId = new Map(mains.map((v) => [v.id, v]));
  const info = new Map<string, { taper: [number, number]; joined: [boolean, boolean]; mate: [string | null, string | null]; attach: [string[] | null, string[] | null]; free: [boolean, boolean]; span: [number, number]; hostR: [number | null, number | null]; paired: boolean }>();
  const get = (v: NetVessel) => { let i = info.get(v.id); if (!i) { i = { taper: [1, 1], joined: [false, false], mate: [null, null], attach: [null, null], free: [false, false], span: [0.3, 0.3], hostR: [null, null], paired: false }; info.set(v.id, i); } return i; };
  const outward = (v: NetVessel, end: 0 | 1): [number, number, number] | null => {
    const p = v.pts, n = p.length, a = end ? p[n - 1]! : p[0]!, b = end ? p[n - 4 >= 0 ? n - 4 : 0]! : p[3 < n ? 3 : n - 1]!;
    const d: [number, number, number] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], l = Math.hypot(d[0], d[1], d[2]);
    return l > 1e-9 ? [d[0] / l, d[1] / l, d[2] / l] : null;
  };
  const taken = new Set<string>();
  const pair = (a: { v: NetVessel; end: 0 | 1 }, b: { v: NetVessel; end: 0 | 1 }) => {
    if (a.v === b.v || (a.v.tone === 'artery') !== (b.v.tone === 'artery')) return;
    if (taken.has(`${a.v.id}|${a.end}`) || taken.has(`${b.v.id}|${b.end}`)) return;
    // A COLLATERAL THAT CARRIES ON A VESSEL (the 2D rule's run-on: the coronary vein into the varices) is one tube with it: no cap at the join and the live widths eased to one, so a dilated vein never ends in a round cap against the thin
    // strands it feeds (Mohammad, 20 Nov: "this junction should be smooth. I thought you smoothened every junction"). Only the live width and the cap: a collateral keeps its own end radius (shape.ts narrowTo, the strands' own taper), so
    // no `taper`, no funnel here.
    if (isCollateral(a.v) || isCollateral(b.v)) {
      // (two collaterals the 2D rule runs on into one another are one vessel at that node: the coronary vein and the varices' drain to the azygos, the fundal varices into the gastrorenal shunt)
      taken.add(`${a.v.id}|${a.end}`); taken.add(`${b.v.id}|${b.end}`);
      const da = outward(a.v, a.end), db = outward(b.v, b.end);
      const straight = !!da && !!db && da[0] * db[0] + da[1] * db[1] + da[2] * db[2] < -0.9;
      // (they ease to one width too, over a length (shape.ts lengthSpans): the coronary vein into the varices met them at 0.64 of their width, a step; Mohammad, 24 Nov)
      const m = meetRadius(a.v, b.v);
      for (const [x, y] of [[a, b], [b, a]] as const) { const i = get(x.v); i.mate[x.end] = y.v.id; if (straight) i.joined[x.end] = true; i.taper[x.end] = m / x.v.radius; i.paired = true; }
      return;
    }
    taken.add(`${a.v.id}|${a.end}`); taken.add(`${b.v.id}|${b.end}`);
    // the two ease to their meeting width (network.ts meetRadius): a vein and its bed share the change by length, the bed alone could not take it in its few hundredths
    const m = meetRadius(a.v, b.v);
    const da = outward(a.v, a.end), db = outward(b.v, b.end);
    const straight = !!da && !!db && da[0] * db[0] + da[1] * db[1] + da[2] * db[2] < -0.9;
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const i = get(x.v);
      i.taper[x.end] = m / x.v.radius; i.mate[x.end] = y.v.id; i.paired = true;
      if (straight) i.joined[x.end] = true;
    }
  };
  const at = new Map<string, { v: NetVessel; end: 0 | 1 }[]>();
  for (const v of mains) for (const [n, end] of [[v.from, 0], [v.to, 1]] as const) { const a = at.get(n) ?? []; a.push({ v, end }); at.set(n, a); }
  // the 2D rule's own run-on pairs first (they pick the pair at a fork), then the nodes of exactly two
  for (const r of RUN_ONS) { const a = byId.get(r.a), b = byId.get(r.b); if (a && b) pair({ v: a, end: r.ia }, { v: b, end: r.ib }); }
  // a vessel that runs on into another's START (starts.ts RUNS_INTO: the ascending lumbar vein into the azygos, Plan 16D) is one tube with it: the raw 2D courses do not meet there, so the pair is made here
  for (const v of mains) { const into = runsInto(v.id), b = into ? byId.get(into) : undefined; if (b) pair({ v, end: 1 }, { v: b, end: 0 }); }
  for (const list of at.values()) if (list.length === 2) pair(list[0]!, list[1]!);
  // the ends of what is left: a branch on a trunk, or nothing at all
  const art = (v: NetVessel) => (v.tone === 'artery' ? 1 : 0);
  for (const v of mains) {
    const i = get(v);
    for (const end of [0, 1] as const) {
      if (taken.has(`${v.id}|${end}`)) continue;
      const node = end ? v.to : v.from;
      const others = (at.get(node) ?? []).filter((e) => e.v !== v && art(e.v) === art(v));
      if (!others.length) { if (!isCollateral(v) && v.kind !== 'shunt') i.free[end] = true; continue; }
      if (IVC_EDGES.has(v.id)) continue;
      const trunks = others.filter((e) => !isCollateral(e.v) && e.v.kind !== 'shunt' && !IVC_EDGES.has(e.v.id) && get(e.v).mate[e.end]);
      if (trunks.length) i.hostR[end] = Math.max(...trunks.map((e) => e.v.radius));
      // (a collateral or a shunt is never a branch of a trunk: its end keeps its course and its own take-off, anatomy/placed-network.ts. The width rule below let the spontaneous splenorenal shunt,
      //  once thinned to 0.65 of its width, count as a branch of the splenic vein and have its end moved onto the trunk's axis, 27 Nov)
      if (!isPlain(v) || isCollateral(v) || v.kind === 'shunt') continue;
      // a trunk it can end on is one that carries on through the node (a run-on pair there): a vessel that only ends at the node is another branch, not a wall
      const hosts = others.filter((e) => !isCollateral(e.v) && e.v.kind !== 'shunt' && !IVC_EDGES.has(e.v.id) && e.v.radius >= 0.9 * v.radius && get(e.v).mate[e.end]).flatMap((e) => [e.v.id, get(e.v).mate[e.end]!]);
      if (hosts.length) i.attach[end] = [...new Set(hosts)];
    }
  }
  const out = new Map<string, SmoothEnds>();
  for (const [id, i] of info) out.set(id, { taper: i.paired ? i.taper : undefined, joined: i.joined, mate: i.mate, attach: i.attach, free: i.free, span: i.span, hostR: i.hostR });
  return out;
}

/** Per vessel (by id): how its ends are drawn with smooth joins on. */
export const SMOOTH: ReadonlyMap<string, SmoothEnds> = build();

/** Both of a pair's widths at the join, the mean of the two as the geometry has it (`taper`), for the shader's live width: the same easing as tubes.ts `factorAt`, so a width the engine changes
 *  moves the join's ring by the same share on both sides. `own` and `mate` are the two vessels' live swells (the engine's diameter against the one the tube was built at), `u` the place along
 *  this vessel (0 to 1), `end` the end the mate is at. Mirrors the vertex shader's `joinSwell`. */
export function joinSwell(own: number, mate: number, u: number, end: 0 | 1, cut: number = end): number {
  // (`cut`: where the easing is whole, the tube's own end by default, the skin's cut where a skin takes the end over)
  const t = end ? (u - (cut - 0.3)) / 0.3 : 1 - (u - cut) / 0.3;
  const k = Math.min(1, Math.max(0, t)), w = k * k * (3 - 2 * k);
  return own + w * ((own + mate) / 2 - own);
}
