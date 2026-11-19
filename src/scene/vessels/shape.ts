// A vessel's tubes at its present shape: its own course (coiled as it opens), the strands of a braided collateral, or a fan of tributaries. Built from the 2D
// figure's own courses and rules (coil.ts, coil.copied.ts); the scene rewrites a vessel's positions in place when the shape moves (VesselObject.reshape).
import type { Vec3 } from '../anatomy/vessels.ts';
import { len3, x3, y3 } from '../frame2d.ts';
import { TIER_Z } from '../frame2d.ts';
import { coilCourses } from './coil.ts';
import { NODE_Z, type NetVessel } from './network.ts';
import { type Course, tubularFor } from './tubes.ts';

export interface ShapeState { wig: number; spr: number; /** strands drawn (a closed, dotted collateral has none) */ strandsOn: boolean; /** a feeder group's 0 to 1 live share */ live: number }
export const REST: ShapeState = { wig: 0, spr: 1, strandsOn: true, live: 1 };

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
    const { main, strands } = coilCourses(v.id, plan.base as [number, number][], plan.coils, s.wig, s.spr);
    const zf = NODE_Z.get(v.from), zt = NODE_Z.get(v.to);
    const m = to3(main, z, zf, zt);
    return [{ pts: m, radius: v.radius, taper: v.taper }, ...strands.map((c) => (s.strandsOn ? { pts: to3(c.pts, z, zf, zt), radius: Math.max(minR, v.radius * c.k) } : { pts: m, radius: v.radius, taper: v.taper }))];
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
