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

const len2d = (pts: readonly (readonly [number, number])[]): number => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]); return l; };
/** the vessels the bands strangle (topology code C1: the coronary vein to the varices, and the varices to the azygos) */
const BANDED = new Set(['C1a', 'C1b']);
/** whether a vessel beads (varix-bead.js BEAD_SITE): its strands do, and the gastrorenal shunt itself does */
export const beadsOn = (id: string): boolean => !!(BEAD_SITE as Record<string, string>)[id];
import { type Course, tubularFor } from './tubes.ts';

export interface ShapeState { wig: number; spr: number; /** how far the collaterals are recruited, 0 to 1 (the cavernoma's channels grow with it) */ rec: number; /** the varix's beading, 0 to 0.35 (varix-bead.js) */ bead: number; /** the bands on the esophageal varices, eased (band-ease.js) */ bands: number; /** strands drawn (a closed, dotted collateral has none) */ strandsOn: boolean; /** a feeder group's 0 to 1 live share */ live: number }
export const REST: ShapeState = { wig: 0, spr: 1, rec: 1, bead: 0, bands: 0, strandsOn: true, live: 1 };

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** The course in the scene: x and y by the one linear map; depth is the vessel's tier between, easing over its first and last quarter to the depth of the node it meets, so
 *  joined vessels meet at one depth (a vessel in front and one behind it would otherwise stand apart in a turned view). */
const to3 = (pts: readonly (readonly [number, number])[], z: number, from?: number, to?: number): Vec3[] => pts.map(([x, y], i, a): Vec3 => {
  const u = i / Math.max(1, a.length - 1);
  const zz = z + (from == null ? 0 : (from - z) * (1 - smooth(u / 0.25))) + (to == null ? 0 : (to - z) * (1 - smooth((1 - u) / 0.25)));
  return [x3(x), y3(y), zz];
});
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
    const zf = NODE_Z.get(v.from), zt = NODE_Z.get(v.to);
    const m = to3(main, z, zf, zt);
    // the bands: each one closes a channel of the varices' plexus (strand i is live while the count is under i + 1) and the rest shrink (stage-tubes.js widthWrites: 0.14 a band, to four)
    const banded = BANDED.has(v.id), rad = banded ? v.radius * (1 - 0.14 * Math.min(4, s.bands)) : v.radius;
    // the varices bead by their size: every strand, and the gastrorenal shunt itself (varix-bead.js)
    const lambda = beadLambda(v.id) as number, beads = s.bead > 0 && beadsOn(v.id);
    const own = { pts: m, radius: rad, taper: v.taper, flare: v.flare, bead: beads && v.id === 'C5' ? { b: s.bead, ph: 0.9, u0: 0, lambda: BEAD_LAMBDA_FUNDAL as number, len: len2d(main) } : undefined };
    return [own, ...strands.map((c, i) => {
      if (!s.strandsOn) return own;
      const live = (banded ? Math.min(1, Math.max(0, i + 1 - s.bands)) : 1) * (c.live ?? 1);
      return {
        pts: to3(c.pts, z, zf, zt), radius: Math.max(minR, rad * c.k) * live,   // (0: a closed channel, a strand a band has closed, a channel not yet grown: the shader draws none of it)
        bead: beads && v.id !== 'C5' ? { b: s.bead, ph: c.ph * 1.7, u0: (STRAND_FROM_2D as Record<string, number>)[v.id] ?? 0, lambda, len: len2d(c.pts) } : undefined,
      };
    })];
  }
  // a fan: each tributary's width is the host's times the group's share and its own (at least 1.2 units), thinner while the group is only part on
  return plan.list.map((f) => ({ pts: to3(f.pts, z), radius: len3(Math.max(0.35, Math.max(1.2, plan.hostW * plan.cfgK * f.k * (plan.when ? 0.5 + 0.5 * s.live : 1)) / 2)) }));
}

/** The tube segments each course is built with, fixed at rest so a coil changes positions and never the vertex count. */
export function tubularOf(v: NetVessel, minFirst = 0): number[] {
  const rest = coursesOf(v, REST), plan = v.plan!;
  return rest.map((c, i) => {
    let len = 0;
    for (let i = 1; i < c.pts.length; i++) len += Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1], c.pts[i]![2] - c.pts[i - 1]![2]);
    return Math.max(i === 0 ? minFirst : 0, tubularFor(len, plan.kind === 'coil' && !(plan.coils || plan.strands) ? 1 : 2));
  });
}
