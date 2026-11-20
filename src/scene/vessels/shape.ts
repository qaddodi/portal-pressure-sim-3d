// A vessel's tubes at its present shape: its own course (coiled as it opens), the strands of a braided collateral, or a fan of tributaries. Built from the 2D
// figure's own courses and rules (coil.ts, coil.copied.ts); the scene rewrites a vessel's positions in place when the shape moves (VesselObject.reshape).
import type { Vec3 } from '../anatomy/vessels.ts';
import { len3, x3, y3 } from '../frame2d.ts';
import { TIER_Z } from '../frame2d.ts';
import { coilCourses } from './coil.ts';
import { NETWORK_BY_ID, NODE_Z, type NetVessel } from './network.ts';
import { CAV, cavChannels, cavGrowth } from './cav.ts';
import { BEAD_LAMBDA_FUNDAL, BEAD_SITE, beadLambda } from './varix-bead.copied.js';
import { STRAND_FROM_2D } from './coil.copied.ts';
import { setSmoothJoins, smoothJoinsOn } from './join-mode.ts';
import { ATTACH_REACH, BURY, CEIL, END_SHARE, SMOOTH, endDepth, isPlain } from './smooth-joins.ts';
import { fadeOf } from './fades.ts';

const len2d = (pts: readonly (readonly [number, number])[]): number => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]); return l; };
/** the vessels the bands strangle (topology code C1: the coronary vein to the varices, and the varices to the azygos) */
const BANDED = new Set(['C1a', 'C1b']);
/** whether a vessel beads (varix-bead.js BEAD_SITE): its strands do, and the gastrorenal shunt itself does */
export const beadsOn = (id: string): boolean => !!(BEAD_SITE as Record<string, string>)[id];
import { type Buried, type Course, tubularFor } from './tubes.ts';

export interface ShapeState { wig: number; spr: number; /** how far the collaterals are recruited, 0 to 1 (the cavernoma's channels grow with it) */ rec: number; /** the varix's beading, 0 to 0.35 (varix-bead.js) */ bead: number; /** the bands on the esophageal varices, eased (band-ease.js) */ bands: number; /** strands drawn (a closed, dotted collateral has none) */ strandsOn: boolean; /** a feeder group's 0 to 1 live share */ live: number }
export const REST: ShapeState = { wig: 0, spr: 1, rec: 1, bead: 0, bands: 0, strandsOn: true, live: 1 };

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** The course in the scene: x and y by the one linear map; depth is the vessel's tier between, easing over its first and last quarter to the depth of the node it meets, so
 *  joined vessels meet at one depth (a vessel in front and one behind it would otherwise stand apart in a turned view). */
const to3 = (pts: readonly (readonly [number, number])[], z: number, from?: number, to?: number, shareFrom = 0.25, shareTo = 0.25, through = false): Vec3[] => pts.map(([x, y], i, a): Vec3 => {
  const u = i / Math.max(1, a.length - 1);
  // (`through`: smooth joins, a vessel that ends in the right atrium: no level of its own, one gentle slope from the depth it starts at to the atrium's)
  if (through && to != null) { const z0 = from ?? z; return [x3(x), y3(y), z0 + (to - z0) * smooth(u)]; }
  const zz = z + (from == null ? 0 : (from - z) * (1 - smooth(u / shareFrom))) + (to == null ? 0 : (to - z) * (1 - smooth((1 - u) / shareTo)));
  return [x3(x), y3(y), zz];
});

/** Smooth joins: the depth each end eases to. Most nodes are the network's own (NODE_Z, a quarter of the course); a vessel that ends in the right atrium (smooth-joins.ts NODE_RISE) runs on a
 *  single slope to the atrium's back wall, so the cava and the SVC meet the heart at one depth and, turned, enter it (`through`). */
function depthEnds(v: NetVessel): { zf: number | undefined; zt: number | undefined; sf: number; st: number; through: boolean } {
  let zf = NODE_Z.get(v.from), zt = NODE_Z.get(v.to), through = false;
  if (smoothJoinsOn()) { const r = endDepth(v.to, zt); if (r.rise) { zt = r.z; through = true; } }
  return { zf, zt, sf: END_SHARE, st: END_SHARE, through };
}

/** The 3D course of an edge with every end's depth, before any end is fitted to a trunk: what a branch ends on (smooth joins). */
const baseCache = new Map<string, Vec3[]>();
function baseCourse(v: NetVessel): Vec3[] {
  let c = baseCache.get(v.id);
  if (!c) {
    const plan = v.plan!;
    const base = plan.kind === 'coil' ? plan.base : [];
    const d = depthEnds(v);
    c = to3(base, TIER_Z[v.tier], d.zf, d.zt, d.sf, d.st, d.through);
    baseCache.set(v.id, c);
  }
  return c;
}
const nearestOn = (p: Vec3, poly: readonly Vec3[]): { at: Vec3; d: number } => {
  let best = Infinity, at: Vec3 = poly[0]!;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!, b = poly[i]!;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / (ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2 || 1)));
    const q: Vec3 = [a[0] + t * ab[0]!, a[1] + t * ab[1]!, a[2] + t * ab[2]!], d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (d < best) { best = d; at = q; }
  }
  return { at, d: best };
};

/** What a branch's end is fitted to: where it ends, and the trunk's radius, so the tube's collar and cap stay inside it. */
export type { Buried } from './tubes.ts';
/** Smooth joins: a branch's end moves onto the centreline of the trunk it ends on (the nearest of its candidates, if within `ATTACH_REACH` of that trunk's radii), easing back to its course over
 *  its first or last quarter, so no gap shows between its last ring and the trunk's wall; the radius its collar and cap may take is returned, so they never stand out of the trunk's far side. */
export function fitEnds(v: NetVessel, pts: Vec3[]): { pts: Vec3[]; buried: readonly [Buried | null, Buried | null] } {
  const sm = SMOOTH.get(v.id), buried: [Buried | null, Buried | null] = [null, null];
  if (!sm) return { pts, buried };
  if (!isPlain(v)) {
    // a collateral or a shunt keeps its own course (its strands braid along it), but its fillet is never wider than the trunk it ends on
    for (const end of [0, 1] as const) { const r = sm.hostR[end]; if (r && v.flare?.[end]) buried[end] = { max: CEIL * r, d0: 0.5 * r, d1: 0.85 * r, ceil: CEIL * r }; }
    return { pts, buried };
  }
  const out = pts.map((p): Vec3 => [p[0], p[1], p[2]]), n = out.length;
  for (const end of [0, 1] as const) {
    const cands = sm.attach[end];
    if (!cands) continue;
    const p = end ? out[n - 1]! : out[0]!;
    let best: { at: Vec3; d: number; r: number } | null = null;
    for (const id of cands) {
      const h = NETWORK_BY_ID.get(id);
      if (!h || !isPlain(h)) continue;
      const hit = nearestOn(p, baseCourse(h));
      if (!best || hit.d / h.radius < best.d / best.r) best = { at: hit.at, d: hit.d, r: h.radius };
    }
    if (!best || best.d > ATTACH_REACH * best.r) continue;
    const delta = [best.at[0] - p[0], best.at[1] - p[1], best.at[2] - p[2]];
    for (let i = 0; i < n; i++) {
      const u = end ? (n - 1 - i) / Math.max(1, n - 1) : i / Math.max(1, n - 1), w = 1 - smooth(u / END_SHARE);
      if (w <= 0) continue;
      out[i]![0] += delta[0]! * w; out[i]![1] += delta[1]! * w; out[i]![2] += delta[2]! * w;
    }
    buried[end] = { max: BURY * best.r, d0: 0.5 * best.r, d1: 0.85 * best.r, ceil: CEIL * best.r };
  }
  return { pts: out, buried };
}
const minR = len3(0.35);

/** The courses (the vessel's own first) at `s`. */
export function coursesOf(v: NetVessel, s: ShapeState): Course[] {
  const plan = v.plan!, z = TIER_Z[v.tier];
  if (plan.kind === 'coil') {
    const coiled = coilCourses(v.id, plan.base as [number, number][], plan.coils, s.wig, s.spr);
    const { main } = coiled;
    let { strands } = coiled;
    if (v.id === 'C8') {
      // the cavernoma: channels in the frame of the clotted trunk (its two pieces), grown with the recruitment, each whole and joined at both ends
      const trunk = ['PV_TRUNK_1', 'PV_TRUNK'].map((id) => (NETWORK_BY_ID.get(id)!.plan as unknown as { base: [number, number][] }).base);
      const ch = cavChannels(trunk, main);
      strands = ch.map((pts, i) => { const g = cavGrowth(i, s.rec); return { pts, k: CAV[i]!.k * g, ph: 0, live: Math.min(1, g * 4) }; });   // (grown whole and joined at both ends; its opacity over its first quarter: here its width)
    }
    const de = depthEnds(v), zf = de.zf, zt = de.zt;
    let m = to3(main, z, zf, zt, de.sf, de.st, de.through);
    // smooth joins: a branch's end onto its trunk, the ends' widths and caps by the pairs (smooth-joins.ts); off, the course is the 2D rule's own
    const sj = smoothJoinsOn() ? SMOOTH.get(v.id) : undefined;
    let buried: readonly [Buried | null, Buried | null] | undefined;
    if (sj) { const f = fitEnds(v, m); m = f.pts; buried = f.buried; }
    // the bands: each one closes a channel of the varices' plexus (strand i is live while the count is under i + 1) and the rest shrink (stage-tubes.js widthWrites: 0.14 a band, to four)
    const banded = BANDED.has(v.id), rad = banded ? v.radius * (1 - 0.14 * Math.min(4, s.bands)) : v.radius;
    // the varices bead by their size: every strand, and the gastrorenal shunt itself (varix-bead.js)
    const lambda = beadLambda(v.id) as number, beads = s.bead > 0 && beadsOn(v.id);
    const own: Course = { pts: m, radius: rad, taper: sj ? sj.taper : v.taper, taperSpan: sj?.taper ? sj.span : undefined, flare: v.flare, capless: sj ? sj.joined : v.joined, clamp: buried, point: sj && !fadeOf(v.id, v.tone === 'artery') ? sj.free : undefined, bead: beads && v.id === 'C5' ? { b: s.bead, ph: 0.9, u0: 0, lambda: BEAD_LAMBDA_FUNDAL as number, len: len2d(main) } : undefined };
    // a varix is its few strands, each running whole from the vessel that feeds it to the one that drains it: the trunk's own tube, a solid fill the width of the bundle, is not drawn while
    // they are (Mohammad, 20 Nov: "what's that red mesh"); each strand widens to the trunk's width at its two ends, so it meets the vessels there without a step
    const bundle = s.strandsOn && strands.length > 0 && v.kind === 'collateral' && v.id !== 'C8';
    if (bundle) own.radius = 0;
    return [own, ...strands.map((c, i) => {
      if (!s.strandsOn) return own;
      const live = (banded ? Math.min(1, Math.max(0, i + 1 - s.bands)) : 1) * (c.live ?? 1);
      return {
        pts: to3(c.pts, z, zf, zt, de.sf, de.st, de.through), radius: Math.max(minR, rad * c.k) * live,   // (0: a closed channel, a strand a band has closed, a channel not yet grown: the shader draws none of it)
        ...(bundle && v.id !== 'C5' ? { taper: [(own.taper?.[0] ?? 1) / c.k, (own.taper?.[1] ?? 1) / c.k] as const, taperSpan: own.taperSpan ?? ([0.3, 0.3] as const), flare: own.flare, capless: own.capless, clamp: own.clamp } : {}),
        bead: beads && v.id !== 'C5' ? { b: s.bead, ph: c.ph * 1.7, u0: (STRAND_FROM_2D as Record<string, number>)[v.id] ?? 0, lambda, len: len2d(c.pts) } : undefined,
      };
    })];
  }
  // a fan: each tributary's width is the host's times the group's share and its own (at least 1.2 units), thinner while the group is only part on
  return plan.list.map((f) => ({ pts: f.dz ? to3(f.pts, z).map((p, i): Vec3 => [p[0], p[1], p[2] + f.dz![i]!]) : to3(f.pts, z), radius: len3(Math.max(0.35, Math.max(1.2, plan.hostW * plan.cfgK * f.k * (plan.when ? 0.5 + 0.5 * s.live : 1)) / 2)) }));
}

/** The tube segments each course is built with, fixed at rest so a coil changes positions and never the vertex count. */
export function tubularOf(v: NetVessel, minFirst = 0): number[] {
  // (always counted on the 2D rule's courses, so the vertex count never depends on the smooth-joins switch: a toggle rewrites the tubes in place, VesselObject.reshape)
  const was = smoothJoinsOn();
  setSmoothJoins(false);
  const rest = (() => { try { return coursesOf(v, REST); } finally { setSmoothJoins(was); } })(), plan = v.plan!;
  return rest.map((c, i) => {
    let len = 0;
    for (let i = 1; i < c.pts.length; i++) len += Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1], c.pts[i]![2] - c.pts[i - 1]![2]);
    return Math.max(i === 0 ? minFirst : 0, tubularFor(len, plan.kind === 'coil' && !(plan.coils || plan.strands) ? 1 : 2));
  });
}
