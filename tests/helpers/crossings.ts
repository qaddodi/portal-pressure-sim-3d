// Where two vessels of the network meet or cross, shared by tests/vessel-crossings.test.ts and tests/vessel-depth.test.ts.
import type { NetVessel } from '../../src/scene/vessels/network.ts';
import { SMOOTH } from '../../src/scene/vessels/smooth-joins.ts';

type V = Pick<NetVessel, 'id' | 'host' | 'from' | 'to' | 'radius' | 'pts'>;

/** An end of `a` that lies on `b` in 3D (within their two radii): a landing. Placed, a collateral's or shunt's end is laid on its host's course where the placement puts it, not at a shared node name (C6 leaves the
 *  splenic vein where the IMV joins it; its node is SVD, the IMV's is SV), so the node names alone called those landings crossings at zero depth. */
export const landsOn = (a: V, b: V): boolean => {
  const reach = a.radius + b.radius;
  return [a.pts[0]!, a.pts[a.pts.length - 1]!].some((e) => b.pts.some((q, j) => {
    const r = b.pts[j + 1]; if (!r) return Math.hypot(e[0]! - q[0]!, e[1]! - q[1]!, e[2]! - q[2]!) < reach;
    const d = [r[0]! - q[0]!, r[1]! - q[1]!, r[2]! - q[2]!], L2 = d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]! || 1;
    const u = Math.min(1, Math.max(0, ((e[0]! - q[0]!) * d[0]! + (e[1]! - q[1]!) * d[1]! + (e[2]! - q[2]!) * d[2]!) / L2));
    return Math.hypot(e[0]! - q[0]! - d[0]! * u, e[1]! - q[1]! - d[1]! * u, e[2]! - q[2]! - d[2]! * u) < reach;
  }));
};

/** Two vessels that join: one host, a shared node, a declared smooth-join mate, or an end of one landing on the other. */
export const connected = (a: V, b: V): boolean =>
  a.host === b.host || a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to || SMOOTH.get(a.id)?.mate.includes(b.id) === true || SMOOTH.get(b.id)?.mate.includes(a.id) === true || landsOn(a, b) || landsOn(b, a);

/** Every sample of `a` (four a segment) that overlaps `b` on the screen (within their two radii in x and y), with both centrelines' depths there. */
export function screenOverlaps(a: V, b: V): { az: number; bz: number }[] {
  const reach = a.radius + b.radius, out: { az: number; bz: number }[] = [];
  for (let i = 0; i < a.pts.length - 1; i++) {
    for (let t = 0; t < 1; t += 0.25) {
      const p = [0, 1, 2].map((k) => a.pts[i]![k]! + (a.pts[i + 1]![k]! - a.pts[i]![k]!) * t);
      for (let j = 0; j < b.pts.length - 1; j++) {
        const q0 = b.pts[j]!, q1 = b.pts[j + 1]!, dx = q1[0]! - q0[0]!, dy = q1[1]! - q0[1]!, L2 = dx * dx + dy * dy || 1;
        const u = Math.min(1, Math.max(0, ((p[0]! - q0[0]!) * dx + (p[1]! - q0[1]!) * dy) / L2));
        if (Math.hypot(p[0]! - (q0[0]! + dx * u), p[1]! - (q0[1]! + dy * u)) >= reach) continue;
        out.push({ az: p[2]!, bz: q0[2]! + (q1[2]! - q0[2]!) * u });
      }
    }
  }
  return out;
}
