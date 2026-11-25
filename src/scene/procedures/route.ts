// The routes a catheter travels, laid on the vessels' own courses (B5). The 2D app lays them in stage-cath.js `procRoute` / `cathRoute` from the figure's drawn courses
// and the vessels' drawn radii; route-placed.ts runs the same code on the approved placement's drawn courses, in 3D, in the 2D figure's world units, so every rule that
// belongs to a route (where the tip stops, where each leg starts) is the 2D app's. `route3d.ts` carries the result into the scene.
//
// A route is a smoothed polyline `pts` through the vessels' centrelines, with `raw` (the vessels' own centrelines, where the walls are), `rad` (the lumen's radius at each
// point), `cum` (arc length) and `parts` (each leg: its vessel, name, and where it starts and ends along the route). Positions along a route are lengths `d` in figure units.
import { EDGE_PATH_2D } from '../anatomy/source.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { UNITS_PER_SCENE } from '../frame2d.ts';
import { placedRoute } from './route-placed.ts';
import { smoothJoinsOn } from '../vessels/join-mode.ts';

export type P2 = [number, number];
export interface RoutePart { id: string | null; name: string; fa: number; fb: number; d0: number; d1: number; whole?: unknown; subs?: RoutePart[] }
export interface Route {
  kind: string;
  pts: P2[]; raw: P2[]; rad: number[]; cum: number[]; total: number;
  parts: RoutePart[]; spans: Record<string, [number, number]>;
  /** where the tip sits before it moves, where it stops (the free reading place / the work site), the hepatic vein's span (HVPG) and the close-up's legs */
  start: number; free: number; hv0: number; hvEnd: number; focus: [number, number];
  /** the vein course the coil of a TIPS-that-coils runs on in */
  coilAt?: { id: string; f: number; dir: number };
  /** every vessel the route touches (a vein cut in pieces counts whole) */
  ids: string[];
  /** (route-placed.ts) the vessels' own drawn centreline at every sample, in scene units (x, y, z), the route laid in 3D */
  raw3?: [number, number, number][];
}

/** The 2D figure's drawn courses by edge ID: `{ cur }`, the shape the copied routing code reads. */
export const GEO2D: Record<string, { cur: P2[] }> = Object.fromEntries(Object.entries(EDGE_PATH_2D).map(([id, pts]) => [id, { cur: pts as P2[] }]));

/** A vessel's lumen radius in figure units at share f along it (its drawn width at its healthy diameter, as the 2D figure draws it); '=0.5' ids are a fixed radius (the tract through the liver). */
export function lumenRadius(id: string, _f = 0.5): number {
  if (id[0] === '=') return Number(id.slice(1));
  const v = NETWORK_BY_ID.get(id);
  return v ? v.radius * UNITS_PER_SCENE : 4;
}

const lenTo = (pts: P2[]): number[] => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])); return c; };
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The vessels' courses meet at corners (the IVC turns into the hepatic vein at its side): the catheter bends through them as a wire does. Resampled evenly, then smoothed with a
 *  window as wide as the vein there, so the curve stays inside the lumen (stage-cath.js smoothRoute, unchanged). */
export function smoothRoute(pts: P2[], rad: number[], marks: number[]): { P: P2[]; raw: P2[]; Rr: number[]; idx: number[] } {
  const c0 = lenTo(pts), H = 1.2, n = Math.max(2, Math.ceil(c0[c0.length - 1]! / H) + 1);
  let P: P2[] = [], j = 1;
  const Rr: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = (c0[c0.length - 1]! * i) / (n - 1);
    while (j < c0.length - 1 && c0[j]! < d) j++;
    const u = c0[j]! > c0[j - 1]! ? clamp((d - c0[j - 1]!) / (c0[j]! - c0[j - 1]!), 0, 1) : 0;
    P.push([lerp(pts[j - 1]![0], pts[j]![0], u), lerp(pts[j - 1]![1], pts[j]![1], u)]); Rr.push(lerp(rad[j - 1]!, rad[j]!, u));
  }
  const idx = marks.map((m) => Math.round((c0[Math.min(m, c0.length - 1)]! / c0[c0.length - 1]!) * (n - 1)));
  const raw = P;
  for (let pass = 0; pass < 2; pass++) {
    const Q = P.map((q) => q.slice() as P2);
    for (let i = 1; i < n - 1; i++) {
      const sg = clamp(Rr[i]! * 0.55, 1, 8) / H, w = Math.min(Math.ceil(sg * 2), i, n - 1 - i);
      let sx = 0, sy = 0, sw = 0;
      for (let k = -w; k <= w; k++) { const g = Math.exp(-(k * k) / (2 * sg * sg)); sx += P[i + k]![0] * g; sy += P[i + k]![1] * g; sw += g; }
      Q[i] = [sx / sw, sy / sw];
    }
    P = Q;
  }
  return { P, raw, Rr, idx };
}

/** The route kinds this module lays (the 2D app's catheter routes; the echoendoscope's are B11's). */
export const ROUTE_KINDS = ['hvpg', 'tips', 'tipscoil', 'tipscoilin', 'brto', 'brtoC6', 'ivcread', 'ppgperc', 'bato', 'dips'] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

const kept = new Map<string, Route>();
/** The route of a catheter kind on the drawn courses, laid once per join mode. Null for a kind this module does not lay. */
export function routeOf(kind: string): Route | null {
  // (laid in 3D on the drawn courses, route-placed.ts, which follow the join mode)
  const key = `${kind}|${smoothJoinsOn()}`, hit = kept.get(key);
  if (hit) return hit;
  const placed = placedRoute(kind, lumenRadius); if (placed) kept.set(key, placed); return placed;
}

/** The point, direction, the vein's own centre (w) and lumen radius at length d along a route (stage-cath.js cathAt). */
export interface RoutePoint { p: P2; t: P2; w: P2; r: number }
export function routeAt(r: Route, d: number, out: RoutePoint = { p: [0, 0], t: [1, 0], w: [0, 0], r: 0 }): RoutePoint {
  d = clamp(d, 0, r.total);
  let i = 1, hi = r.cum.length - 1;
  while (i < hi) { const m = (i + hi) >> 1; if (r.cum[m]! < d) i = m + 1; else hi = m; }
  const s0 = r.cum[i - 1]!, s1 = r.cum[i]!, u = s1 > s0 ? (d - s0) / (s1 - s0) : 0, a = r.pts[i - 1]!, b = r.pts[i]!;
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, wa = r.raw[i - 1]!, wb = r.raw[i]!;
  out.p[0] = lerp(a[0], b[0], u); out.p[1] = lerp(a[1], b[1], u);
  out.t[0] = (b[0] - a[0]) / l; out.t[1] = (b[1] - a[1]) / l;
  out.w[0] = lerp(wa[0], wb[0], u); out.w[1] = lerp(wa[1], wb[1], u);
  out.r = lerp(r.rad[i - 1]!, r.rad[i]!, u);
  return out;
}

/** A treatment catheter's radius: 0.4 of the narrowest lumen on the TIPS way (the right hepatic vein, and the tract as wide as the stent), never wider than 0.7 of the narrowest lumen on this
 *  route, so it fits inside its vessels with room for its edge (stage-cath.js procRc). The HVPG's is 0.3 of the vein it reads in (its figure-pixel clamp is a screen rule). */
export function catheterRadius(r: Route): number {
  const Rf = routeAt(r, r.free).r;
  if (r.kind === 'hvpg') return Math.max(0.5, Rf * 0.3);
  let m = Rf;
  const procIn = r.parts[1]!.d0;
  for (let i = 0; i < r.pts.length; i++) if (r.cum[i]! >= procIn && r.cum[i]! <= r.free) m = Math.min(m, r.rad[i]!);
  let t = lumenRadius('PVH_R', 0.5) * 0.8;
  for (let f = 0.2; f <= 1.001; f += 0.1) t = Math.min(t, lumenRadius('RHV_IVC', f));
  return Math.max(0.5, Math.min(t * 0.4, m * 0.7));
}
