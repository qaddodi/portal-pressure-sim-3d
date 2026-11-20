// A route in the scene: the 2D route (route.ts, the figure's world units) carried by the one linear map of frame2d.ts, with a depth for each sample from the tier of the vessel it runs in, so a
// device sits exactly where the vessel it travels is and stays registered with it as the figure turns. Lengths stay in figure units (they are the 2D app's: `d` below is a length along the route
// in those units, `u` is a share), radii and positions are scene units.
import { Vector3 } from 'three';
import { NETWORK_BY_ID, type NetVessel } from '../vessels/network.ts';
import { REST, coursesOf } from '../vessels/shape.ts';
import { smoothJoinsOn } from '../vessels/join-mode.ts';
import { TIER_Z, UNITS_PER_SCENE, x3, y3 } from '../frame2d.ts';
import { type Route, type RoutePart, routeAt, routeOf } from './route.ts';

const lines = new Map<string, readonly (readonly [number, number, number])[]>();
/** The centreline the vessel's tube is built on (shape.ts coursesOf at rest: depth eased to its nodes, ends fitted to their trunks with smooth joins); a fan of tributaries has none, so its own points. */
function centreline(id: string): readonly (readonly [number, number, number])[] | null {
  const key = `${id}|${smoothJoinsOn()}`, hit = lines.get(key);
  if (hit) return hit;
  const v: NetVessel | undefined = NETWORK_BY_ID.get(id);
  if (!v) return null;
  const c = v.plan ? coursesOf(v, REST)[0]?.pts ?? v.pts : v.pts;
  lines.set(key, c);
  return c;
}
/** The nearest point of vessel `id`'s own 3D centreline (the course its tube is built on, z included, read now so a changed course is followed) to (x, y, z), and the distance. */
export function nearestOnCourse(id: string, x: number, y: number, z: number): { x: number; y: number; z: number; dist: number } | null {
  const pts = centreline(id);
  if (!pts || pts.length < 2) return null;
  let best: { x: number; y: number; z: number; dist: number } | null = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz;
    const u = l2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / l2)) : 0;
    const cx = a[0] + dx * u, cy = a[1] + dy * u, cz = a[2] + dz * u, d = Math.hypot(x - cx, y - cy, z - cz);
    if (!best || d < best.dist) best = { x: cx, y: cy, z: cz, dist: d };
  }
  return best;
}
/** The distance in scene units from `p` to the nearest centreline of the vessels `ids`; Infinity when none has a course. */
export function courseDistance(ids: readonly string[], p: Vector3): number {
  let best = Infinity;
  for (const id of ids) { const c = nearestOnCourse(id, p.x, p.y, p.z); if (c && c.dist < best) best = c.dist; }
  return best;
}

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
  const key = `${kind}|${smoothJoinsOn()}`, hit = kept.get(key);
  if (hit) return hit;
  const r = routeOf(kind);
  if (!r) return null;
  const n = r.pts.length;
  let z: Float32Array<ArrayBufferLike> = new Float32Array(n);
  for (let i = 0; i < n; i++) z[i] = tierZ(partIdAt(r.parts, r.cum[i]!));
  // the vessels step from tier to tier; the device passes through the step, so the depth is eased over about 14 figure units either side
  for (let pass = 0; pass < 2; pass++) {
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, w = 0; for (let k = -12; k <= 12; k++) { const j = Math.min(n - 1, Math.max(0, i + k)), g = Math.exp(-(k * k) / 50); s += z[j]! * g; w += g; } q[i] = s / w; }
    z = q;
  }
  // The device runs INSIDE the lumen: where a sample lies on a vessel, its depth is that vessel's own centreline depth (read now from the course its tube is built on, so a changed course or node depth is followed),
  // and a sample the corner-cutting smoothing left more than half a lumen from the centreline is drawn back to within half a lumen of it. Only a stretch with no vessel (the lead-in) keeps the tier depth.
  const lumenS = (i: number): number => r.rad[i]! / UNITS_PER_SCENE;
  const offX = new Float32Array(n), offY = new Float32Array(n);
  const partAt = (d: number): RoutePart | undefined => r.parts.find((q) => d <= q.d1 + 1e-6 && d >= q.d0 - 1e-6) ?? r.parts[r.parts.length - 1];
  for (let i = 0; i < n; i++) {
    const part = partAt(r.cum[i]!), cands = [part?.id, ...(part?.subs ?? []).map((q) => q.id)].filter((id): id is string => !!id && NETWORK_BY_ID.has(id));
    const px = x3(r.pts[i]![0]), py = y3(r.pts[i]![1]);
    let best: { x: number; y: number; z: number; dist: number } | null = null, bestXY = Infinity;
    for (const id of cands) { const c = nearestOnCourse(id, px, py, z[i]!); if (c) { const dxy = Math.hypot(c.x - px, c.y - py); if (dxy < bestXY) { bestXY = dxy; best = c; } } }
    if (!best) continue;
    z[i] = best.z;
    const lim = 0.5 * lumenS(i);
    if (bestXY > lim) { const k = (bestXY - lim) / bestXY; offX[i] = (best.x - px) * k; offY[i] = (best.y - py) * k; }
  }
  // (a light smoothing of the depth and of the pull, so a corner where the route passes from one vessel to the next bends and does not step)
  const soft = (v: Float32Array, h: number): Float32Array => { const q = new Float32Array(n); for (let i = 0; i < n; i++) { let a = 0; for (let k = -h; k <= h; k++) a += v[Math.min(n - 1, Math.max(0, i + k))]!; q[i] = a / (2 * h + 1); } return q; };
  z = soft(z, 2);
  const offX2 = soft(offX, 4), offY2 = soft(offY, 4);
  for (let i = 0; i < n; i++) { offX[i] = offX2[i]!; offY[i] = offY2[i]!; }
  const pos = r.pts.map((p, i) => new Vector3(x3(p[0]) + offX[i]!, y3(p[1]) + offY[i]!, z[i]!));
  const bracket = (d: number): [number, number] => {
    d = Math.min(r.total, Math.max(0, d));
    let i = 1, hi = r.cum.length - 1;
    while (i < hi) { const m = (i + hi) >> 1; if (r.cum[m]! < d) i = m + 1; else hi = m; }
    const s0 = r.cum[i - 1]!, s1 = r.cum[i]!;
    return [i, s1 > s0 ? (d - s0) / (s1 - s0) : 0];
  };
  const zAt = (d: number): number => { const [i, u] = bracket(d); return z[i - 1]! + (z[i]! - z[i - 1]!) * u; };
  const offAt = (d: number, o: Vector3): Vector3 => { const [i, u] = bracket(d); return o.set(o.x + offX[i - 1]! + (offX[i]! - offX[i - 1]!) * u, o.y + offY[i - 1]! + (offY[i]! - offY[i - 1]!) * u, o.z); };
  const pt = { p: [0, 0] as [number, number], t: [1, 0] as [number, number], w: [0, 0] as [number, number], r: 0 };
  const out: Route3D = {
    route: r, z, pos,
    tipD: (u) => r.start + (r.free - r.start) * Math.min(1, Math.max(0, u)),
    point(d, o = new Vector3()) { routeAt(r, d, pt); return offAt(d, o.set(x3(pt.p[0]), y3(pt.p[1]), zAt(d))); },
    dir(d, o = new Vector3()) {
      routeAt(r, d, pt);
      const e = 1.2, a = zAt(d - e), b = zAt(d + e);
      return o.set(pt.t[0], -pt.t[1], ((b - a) / (2 * e)) * UNITS_PER_SCENE).normalize();
    },
    lumen(d) { routeAt(r, d, pt); return pt.r / UNITS_PER_SCENE; },
    rc: 0,
  };
  out.rc = (kind === 'hvpg' ? Math.max(0.5, routeAt(r, r.free, pt).r * 0.3) : catheterRc(r)) / UNITS_PER_SCENE;
  kept.set(key, out);
  return out;
}
import { catheterRadius } from './route.ts';
const catheterRc = catheterRadius;

/** A route's named stretches as u (0..1 of the way in, the share `ProcCatheter` takes): the 2D stage.cathStops. `tract` is the TIPS's way through the liver, `rpv` the right portal vein. */
export function stopsOf(r3: Route3D): Record<string, [number, number]> {
  const r = r3.route, span = r.free - r.start || 1;
  return Object.fromEntries(Object.entries(r.spans).map(([k, [a, b]]) => [k, [(a - r.start) / span, (b - r.start) / span] as [number, number]]));
}
