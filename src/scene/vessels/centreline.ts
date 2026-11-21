// One accessor for a vessel's drawn centreline and radius, for anything that must lie IN a vessel: the HVPG wedge column and balloon, a catheter, a probe, a highlight (Mohammad, 20 Nov: "the yellow orange column that highlights the
// vein is not highlighting the vein, it goes out of the vein downwards": it was drawn from the vein's old 2D geometry, and the veins were rebuilt as one tube each). It is the same course and the same radius the tube is built from
// (shape.ts coursesOf, tubes.ts radiusAtU), at the shape the vessel has now, so it cannot disagree with what is drawn.
import { CatmullRomCurve3, Vector3 } from 'three';
import { NETWORK_BY_ID } from './network.ts';
import { REST, coursesOf, type ShapeState } from './shape.ts';
import { radiusAtU } from './tubes.ts';
import type { Vec3 } from '../anatomy/vessels.ts';

export interface Centreline {
  readonly id: string;
  /** the length of the centreline, scene units */
  readonly length: number;
  /** the point at `u` (0 to 1 along the vessel in flow order, by length) */
  pointAt(u: number): Vec3;
  /** the unit heading at `u` */
  tangentAt(u: number): Vec3;
  /** the lumen's radius at `u`, scene units: what the tube is built at (collar and bead aside) */
  radiusAt(u: number): number;
  /** the `u` of the point on the centreline nearest `p` */
  nearestU(p: Vec3): number;
}

/** The centreline of vessel `id` at `state` (REST if none): its widest course (a varix's strands: the widest strand), or null for an id with none. */
export function centrelineOf(id: string, state: ShapeState = REST): Centreline | null {
  const v = NETWORK_BY_ID.get(id);
  if (!v?.plan) return null;
  const courses = coursesOf(v, state);
  let c = courses[0]!;
  for (const x of courses) if (x.radius > c.radius) c = x;
  if (!c || c.pts.length < 2) return null;
  const curve = new CatmullRomCurve3(c.pts.map((p) => new Vector3(p[0], p[1], p[2])));
  const length = curve.getLength(), P = new Vector3();
  return {
    id, length,
    pointAt: (u) => { curve.getPointAt(Math.min(1, Math.max(0, u)), P); return [P.x, P.y, P.z]; },
    tangentAt: (u) => { curve.getTangentAt(Math.min(1, Math.max(0, u)), P); return [P.x, P.y, P.z]; },
    radiusAt: (u) => radiusAtU(c, Math.min(1, Math.max(0, u)), length),
    nearestU: (p) => {
      let best = 0, bd = Infinity;
      const n = 200;
      for (let i = 0; i <= n; i++) { curve.getPointAt(i / n, P); const d = (P.x - p[0]) ** 2 + (P.y - p[1]) ** 2 + (P.z - p[2]) ** 2; if (d < bd) { bd = d; best = i / n; } }
      // (refined between the two samples either side of the best, so the answer is good to a thousandth of a sample)
      let lo = Math.max(0, best - 1 / n), hi = Math.min(1, best + 1 / n), bu = best;
      for (let k = 0; k <= 24; k++) { const u = lo + ((hi - lo) * k) / 24; curve.getPointAt(u, P); const d = (P.x - p[0]) ** 2 + (P.y - p[1]) ** 2 + (P.z - p[2]) ** 2; if (d < bd) { bd = d; bu = u; } }
      return bu;
    },
  };
}
