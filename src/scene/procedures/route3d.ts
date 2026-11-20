// A route in the scene: the 2D route (route.ts, the figure's world units) carried by the one linear map of frame2d.ts, with a depth for each sample from the tier of the vessel it runs in, so a
// device sits exactly where the vessel it travels is and stays registered with it as the figure turns. Lengths stay in figure units (they are the 2D app's: `d` below is a length along the route
// in those units, `u` is a share), radii and positions are scene units.
import { Vector3 } from 'three';
import { NETWORK_BY_ID, type NetVessel } from '../vessels/network.ts';
import { REST, coursesOf } from '../vessels/shape.ts';
import { smoothJoinsOn } from '../vessels/join-mode.ts';
import { TIER_Z, UNITS_PER_SCENE, x3, y3 } from '../frame2d.ts';
import { type Route, type RoutePart, catheterRadius, routeAt, routeOf } from './route.ts';

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

/** The least bend radius a device takes, in catheter radii: the smoothing's width (a Gaussian this wide turns a right-angle elbow into an arc about this round). */
export const BEND_RADII = 6;
/** How much of the room the lumen has beyond the shaft a sample may use to cut a corner: under 1, so the shaft never touches the wall. */
export const SAFE = 0.92;
/** Rounds the route's corners in place: moves each sample (offX, offY, z) toward the Gaussian-smoothed path, by no more than SAFE of its vessel's room beyond the shaft. Ends and stretches with no room stay put. */
export function smoothBends(r: Route, rc: number, z: Float32Array, offX: Float32Array, offY: Float32Array): void {
  const n = r.pts.length, U = UNITS_PER_SCENE, sigma = Math.max(rc * U * BEND_RADII, 1e-6), reach = sigma * 2.6;
  const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = x3(r.pts[i]![0]) + offX[i]!; Y[i] = y3(r.pts[i]![1]) + offY[i]!; Z[i] = z[i]!; }
  for (let i = 0; i < n; i++) {
    const room = Math.max(0, (r.rad[i] ?? 0) / U - rc) * SAFE;
    if (room < 1e-6) continue;
    let sx = 0, sy = 0, sz = 0, w = 0;
    for (let j = i; j >= 0 && r.cum[i]! - r.cum[j]! <= reach; j--) { const k = Math.exp(-((r.cum[i]! - r.cum[j]!) ** 2) / (2 * sigma * sigma)); sx += X[j]! * k; sy += Y[j]! * k; sz += Z[j]! * k; w += k; }
    for (let j = i + 1; j < n && r.cum[j]! - r.cum[i]! <= reach; j++) { const k = Math.exp(-((r.cum[j]! - r.cum[i]!) ** 2) / (2 * sigma * sigma)); sx += X[j]! * k; sy += Y[j]! * k; sz += Z[j]! * k; w += k; }
    let dx = sx / w - X[i]!, dy = sy / w - Y[i]!, dz = sz / w - Z[i]!;
    const m = Math.hypot(dx, dy, dz);
    if (m > room) { const f = room / m; dx *= f; dy *= f; dz *= f; }
    offX[i] = offX[i]! + dx; offY[i] = offY[i]! + dy; z[i] = z[i]! + dz;
  }
}

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
  // The device runs INSIDE the lumen, ON the centreline: each sample that lies on a vessel is put exactly on that vessel's own centreline (read now from the course its tube is built on, depth included, so a changed
  // course or node depth is followed). Where the route turns from one vessel into the next (the cava into a hepatic or renal vein) the two centrelines meet at their node, so the corner is a sharp turn at that
  // node and never a chord across the cava's lumen. Only a stretch with no vessel (the lead-in) keeps the 2D rule's own point and the tier depth.
  const offX = new Float32Array(n), offY = new Float32Array(n);
  const partAt = (d: number): RoutePart | undefined => r.parts.find((q) => d <= q.d1 + 1e-6 && d >= q.d0 - 1e-6) ?? r.parts[r.parts.length - 1];
  for (let i = 0; i < n; i++) {
    const part = partAt(r.cum[i]!), cands = [part?.id, ...(part?.subs ?? []).map((q) => q.id)].filter((id): id is string => !!id && NETWORK_BY_ID.has(id));
    const px = x3(r.pts[i]![0]), py = y3(r.pts[i]![1]);
    let best: { x: number; y: number; z: number; dist: number } | null = null, bestXY = Infinity;
    for (const id of cands) { const c = nearestOnCourse(id, px, py, z[i]!); if (c) { const dxy = Math.hypot(c.x - px, c.y - py); if (dxy < bestXY) { bestXY = dxy; best = c; } } }
    if (!best) continue;
    z[i] = best.z; offX[i] = best.x - px; offY[i] = best.y - py;
  }
  // ROUNDED CORNERS (20 Nov 2026): snapping each sample to its vessel's centreline leaves a sharp elbow where one vessel turns into the next (the cava into a hepatic vein), and a tube swept
  // through an elbow kinks. The path is smoothed along its arc length with a Gaussian whose width is a minimum bend radius (BEND_RADII catheter radii), and each sample may move off the
  // centreline only as far as the lumen has room beyond the shaft (SAFE of it), so the catheter takes a generous bend and still lies wholly inside its vessel at any tilt.
  const rcS = (kind === 'hvpg' ? Math.max(0.5, routeAt(r, r.free, { p: [0, 0], t: [1, 0], w: [0, 0], r: 0 }).r * 0.27) : catheterRadius(r)) / UNITS_PER_SCENE;
  smoothBends(r, rcS, z, offX, offY);
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
  const A = new Vector3(), B = new Vector3();
  const point = (d: number, o = new Vector3()): Vector3 => { routeAt(r, d, pt); return offAt(d, o.set(x3(pt.p[0]), y3(pt.p[1]), zAt(d))); };
  const out: Route3D = {
    route: r, z, pos,
    tipD: (u) => r.start + (r.free - r.start) * Math.min(1, Math.max(0, u)),
    point,
    // the direction is the path's own (a difference across the smoothed samples), so a ring's frame follows the bend the tube is swept through
    dir(d, o = new Vector3()) {
      const e = 2.4, lo = Math.max(0, d - e), hi = Math.min(r.total, d + e);
      if (hi - lo < 1e-6) return o.set(1, 0, 0);
      point(lo, A); point(hi, B);
      o.subVectors(B, A);
      return o.lengthSq() > 1e-12 ? o.normalize() : o.set(1, 0, 0);
    },
    lumen(d) { routeAt(r, d, pt); return pt.r / UNITS_PER_SCENE; },
    rc: 0,
  };
  out.rc = rcS;
  kept.set(key, out);
  return out;
}

/** A route's named stretches as u (0..1 of the way in, the share `ProcCatheter` takes): the 2D stage.cathStops. `tract` is the TIPS's way through the liver, `rpv` the right portal vein. */
export function stopsOf(r3: Route3D): Record<string, [number, number]> {
  const r = r3.route, span = r.free - r.start || 1;
  return Object.fromEntries(Object.entries(r.spans).map(([k, [a, b]]) => [k, [(a - r.start) / span, (b - r.start) / span] as [number, number]]));
}
