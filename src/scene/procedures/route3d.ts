// A route in the scene: the 2D route (route.ts, the figure's world units) carried by the one linear map of frame2d.ts, with a depth for each sample from the tier of the vessel it runs in, so a
// device sits exactly where the vessel it travels is and stays registered with it as the figure turns. Lengths stay in figure units (they are the 2D app's: `d` below is a length along the route
// in those units, `u` is a share), radii and positions are scene units.
import { Vector3 } from 'three';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { TIER_Z, UNITS_PER_SCENE, x3, y3 } from '../frame2d.ts';
import { type Route, type RoutePart, routeAt, routeOf } from './route.ts';

export interface Route3D {
  route: Route;
  /** one scene point per smoothed route sample, and its depth */
  z: Float32Array;
  /** the route's own scene positions at the samples */
  pos: Vector3[];
  /** where the tip stands when `u` of its way is done (u: 0 at the route's `start`, 1 at `free`), as a length */
  tipD(u: number): number;
  /** the scene point at length d, and the unit direction there */
  point(d: number, out?: Vector3): Vector3;
  dir(d: number, out?: Vector3): Vector3;
  /** the vessel's lumen radius at d, in scene units */
  lumen(d: number): number;
  /** the catheter's radius, scene units */
  rc: number;
}

const partIdAt = (parts: readonly RoutePart[], d: number): string | null => {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (d <= p.d1 + 1e-6 && d >= p.d0 - 1e-6) return p.id ?? parts.slice(i + 1).find((q) => q.id)?.id ?? null;
  }
  return parts[parts.length - 1]?.id ?? null;
};
const tierZ = (id: string | null): number => {
  if (!id) return TIER_Z.net;
  if (id === 'TIPS' || id === 'DIPS') return TIER_Z.over;
  const v = NETWORK_BY_ID.get(id);
  return v ? TIER_Z[v.tier] : TIER_Z.net;
};

const kept = new Map<string, Route3D>();
export function route3d(kind: string): Route3D | null {
  const hit = kept.get(kind);
  if (hit) return hit;
  const r = routeOf(kind);
  if (!r) return null;
  const n = r.pts.length;
  let z = new Float32Array(n);
  for (let i = 0; i < n; i++) z[i] = tierZ(partIdAt(r.parts, r.cum[i]!));
  // the vessels step from tier to tier; the device passes through the step, so the depth is eased over about 14 figure units either side
  for (let pass = 0; pass < 2; pass++) {
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, w = 0; for (let k = -12; k <= 12; k++) { const j = Math.min(n - 1, Math.max(0, i + k)), g = Math.exp(-(k * k) / 50); s += z[j]! * g; w += g; } q[i] = s / w; }
    z = q;
  }
  const pos = r.pts.map((p, i) => new Vector3(x3(p[0]), y3(p[1]), z[i]!));
  const zAt = (d: number): number => {
    d = Math.min(r.total, Math.max(0, d));
    let i = 1, hi = r.cum.length - 1;
    while (i < hi) { const m = (i + hi) >> 1; if (r.cum[m]! < d) i = m + 1; else hi = m; }
    const s0 = r.cum[i - 1]!, s1 = r.cum[i]!, u = s1 > s0 ? (d - s0) / (s1 - s0) : 0;
    return z[i - 1]! + (z[i]! - z[i - 1]!) * u;
  };
  const pt = { p: [0, 0] as [number, number], t: [1, 0] as [number, number], w: [0, 0] as [number, number], r: 0 };
  const out: Route3D = {
    route: r, z, pos,
    tipD: (u) => r.start + (r.free - r.start) * Math.min(1, Math.max(0, u)),
    point(d, o = new Vector3()) { routeAt(r, d, pt); return o.set(x3(pt.p[0]), y3(pt.p[1]), zAt(d)); },
    dir(d, o = new Vector3()) {
      routeAt(r, d, pt);
      const e = 1.2, a = zAt(d - e), b = zAt(d + e);
      return o.set(pt.t[0], -pt.t[1], ((b - a) / (2 * e)) * UNITS_PER_SCENE).normalize();
    },
    lumen(d) { routeAt(r, d, pt); return pt.r / UNITS_PER_SCENE; },
    rc: 0,
  };
  out.rc = (kind === 'hvpg' ? Math.max(0.5, routeAt(r, r.free, pt).r * 0.3) : catheterRc(r)) / UNITS_PER_SCENE;
  kept.set(kind, out);
  return out;
}
import { catheterRadius } from './route.ts';
const catheterRc = catheterRadius;

/** A route's named stretches as u (0..1 of the way in, the share `ProcCatheter` takes): the 2D stage.cathStops. `tract` is the TIPS's way through the liver, `rpv` the right portal vein. */
export function stopsOf(r3: Route3D): Record<string, [number, number]> {
  const r = r3.route, span = r.free - r.start || 1;
  return Object.fromEntries(Object.entries(r.spans).map(([k, [a, b]]) => [k, [(a - r.start) / span, (b - r.start) / span] as [number, number]]));
}
