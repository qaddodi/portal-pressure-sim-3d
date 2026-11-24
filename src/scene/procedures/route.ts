// The routes a catheter travels, laid on the vessels' own courses (B5). The 2D app lays them in stage-cath.js `procRoute` / `cathRoute` from the figure's drawn courses
// and the vessels' drawn radii; this is the same code on the same courses (paths.copied.ts: the 2D figure's 64 samples a vessel) in the 2D figure's world units, so every
// number that belongs to a route (its lengths, where the tip stops, where each leg starts) is the 2D app's. `route3d.ts` carries the result into the scene.
//
// A route is a smoothed polyline `pts` through the vessels' centrelines, with `raw` (the vessels' own centrelines, where the walls are), `rad` (the lumen's radius at each
// point), `cum` (arc length) and `parts` (each leg: its vessel, name, and where it starts and ends along the route). Positions along a route are lengths `d` in figure units.
import { editedPlan } from '../../editor/vessel-plan.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { UNITS_PER_SCENE } from '../frame2d.ts';
import { cutLen, headOf, legSubs, pieceAt, procSpecs, wholeOf } from './copied/proc-routes.js';
import { expandPieces } from './copied/part-names.js';

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
}

/** The 2D figure's drawn courses by edge ID: `{ cur }`, the shape the copied routing code reads. */
export const GEO2D: Record<string, { cur: P2[] }> = Object.fromEntries(Object.entries(editedPlan()).map(([id, pts]) => [id, { cur: pts as P2[] }]));

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

interface Spec {
  ids: string[]; start: number; tip: [string, number]; focus: [string, string];
  build(B: Builder): void;
  after?(r: Route): void;
}
interface LegOpts { rev?: boolean; a?: number; b?: number; until?: ((q: P2) => boolean) | null; near?: P2 | null; from?: P2 | null; name?: string; r?: number }
interface Builder { pts(list: P2[], id: string, f: number, name?: string): void; vessel(id: string, o?: LegOpts): void }

/** The HVPG catheter's route (stage-cath.js cathRoute): in from the neck, the SVC, the right atrium, down the IVC to the right hepatic vein's opening and out along it into its branch; the
 *  tip reads in the trunk of the right hepatic vein, 0.62 of the way along it. */
const HVPG: Spec = {
  ids: expandPieces(['SVC_RA', 'IVCS_RA', 'IVC_IS', 'RHV_IVC', 'POST_R_RHV']), start: 0.55, tip: ['hv', 0.62], focus: ['hv', 'branch'],
  build(B) {
    const top = headOf(GEO2D, 'SVC_RA') as P2, ost = GEO2D.RHV_IVC!.cur[GEO2D.RHV_IVC!.cur.length - 1]!;
    B.pts([[top[0] - 6, top[1] - 150], [top[0] - 2, top[1] - 60], top], 'SVC_RA', 0);
    B.vessel('SVC_RA'); B.vessel('IVCS_RA', { rev: true });
    B.vessel('IVC_IS', { rev: true, until: (q) => q[1] >= ost[1] - 4, name: 'ivc' });
    B.vessel('RHV_IVC', { rev: true, name: 'hv' }); B.vessel('POST_R_RHV', { rev: true, name: 'branch' });
  },
  after(r) { const hv = r.spans.hv!; r.hv0 = hv[0]; r.hvEnd = hv[1]; },
};

/** The DIPS's catheter (the 3D app's own: the 2D app's DIPS is a drawn stent only): in from the neck, the SVC, the right atrium and the whole cava down to where the shunt leaves it, then the shunt through the liver (as wide as
 *  the stent will be) to the portal vein, where the tip stops. */
const DIPS: Spec = {
  ids: expandPieces(['SVC_RA', 'IVCS_RA', 'IVC_IS', 'DIPS']), start: 0.55, tip: ['tract', 1], focus: ['ivc', 'tract'],
  build(B) {
    const top = headOf(GEO2D, 'SVC_RA') as P2, out = GEO2D.DIPS!.cur[GEO2D.DIPS!.cur.length - 1]!;
    B.pts([[top[0] - 6, top[1] - 150], [top[0] - 2, top[1] - 60], top], 'SVC_RA', 0);
    B.vessel('SVC_RA'); B.vessel('IVCS_RA', { rev: true });
    B.vessel('IVC_IS', { rev: true, until: (q) => q[1] >= out[1] - 2, name: 'ivc' });   // (the cava is one vein in pieces: down to where the shunt leaves it, not on to the iliacs)
    B.vessel('DIPS', { rev: true, name: 'tract', r: lumenRadius('PVH_R', 0.5) * 0.8 });
  },
};

let specs: Record<string, Spec> | null = null;
function specOf(kind: string): Spec | null {
  specs ||= { ...(procSpecs(GEO2D, lumenRadius) as unknown as Record<string, Spec>), hvpg: HVPG, dips: DIPS };
  return specs[kind] ?? null;
}
/** The route kinds this module lays (the 2D app's catheter routes; the echoendoscope's are B11's). */
export const ROUTE_KINDS = ['hvpg', 'tips', 'tipscoil', 'tipscoilin', 'brto', 'brtoC6', 'ivcread', 'ppgperc', 'bato', 'dips'] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

const kept = new Map<string, Route>();
/** The route of a catheter kind on the 2D figure's courses, laid once. Null for a kind this module does not lay. */
export function routeOf(kind: string): Route | null {
  const hit = kept.get(kind);
  if (hit) return hit;
  const spec = specOf(kind === 'tipscoilin' ? 'tipscoil' : kind);
  if (!spec) return null;
  const pts: P2[] = [], rad: number[] = [], marks: number[] = [], parts: RoutePart[] = [];
  const at = (id: string, f: number): number => lumenRadius(id, f);
  const B: Builder = {
    pts(list, id, f, name = 'lead') { marks.push(pts.length); parts.push({ id: null, name, fa: 0, fb: 0, d0: 0, d1: 0 }); for (const q of list) { pts.push(q); rad.push(at(id, f)); } },
    vessel(id, { rev = false, a = 0, b = 1, until = null, near = null, from = null, name = id, r = 0 } = {}) {
      const w = wholeOf(GEO2D, id), base: P2[] = w ? w.P : GEO2D[id]!.cur, P0 = rev ? base.slice().reverse() : base, c = lenTo(P0), n = c[c.length - 1] || 1;
      if (near) { let best = Infinity; P0.forEach((q, i) => { const dd = Math.hypot(q[0] - near[0], q[1] - near[1]); if (dd < best) { best = dd; b = c[i]! / n; } }); }
      if (from) { let best = Infinity; P0.forEach((q, i) => { const dd = Math.hypot(q[0] - from[0], q[1] - from[1]); if (dd < best) { best = dd; a = c[i]! / n; } }); }
      if (until) { const i = P0.findIndex((q, k) => k > 0 && until(q)); if (i > 0) b = c[i - 1]! / n; }
      const seg: P2[] = cutLen(P0, c, a * n, b * n), own = (f: number) => (rev ? 1 - f : f);
      marks.push(pts.length);
      const part: RoutePart = { id, name, fa: own(a), fb: own(b), d0: 0, d1: 0, whole: w ? { w, rev, a, b } : undefined };
      parts.push(part);
      for (let i = (a === 0 || from) && pts.length ? 1 : 0, run = a * n; i < seg.length; i++) {
        if (i) run += Math.hypot(seg[i]![0] - seg[i - 1]![0], seg[i]![1] - seg[i - 1]![1]);
        pts.push(seg[i]!);
        if (r) rad.push(r);
        else if (w) { const [pid, pf] = pieceAt(w, own(run / n)) as [string, number]; rad.push(at(pid, pf)); }
        else rad.push(at(id, own(run / n)));
      }
    },
  };
  spec.build(B);
  const { P, raw, Rr, idx } = smoothRoute(pts, rad, marks);
  const cum = lenTo(P), total = cum[cum.length - 1]!, L = (i: number): number => (i < idx.length ? cum[Math.min(idx[i]!, cum.length - 1)]! : total);
  parts.forEach((q, i) => { q.d0 = L(i); q.d1 = L(i + 1); const wh = q.whole as { w: unknown; rev: boolean; a: number; b: number } | undefined; if (wh) q.subs = legSubs(wh.w, wh.rev, wh.a, wh.b, q.d0, q.d1) as RoutePart[]; });
  const span = (name: string): RoutePart => parts.find((q) => q.name === name)!;
  const tp = span(spec.tip[0]), free = tp.d0 + (tp.d1 - tp.d0) * spec.tip[1];
  const spans = Object.fromEntries(parts.filter((q) => q.name !== 'lead').map((q) => [q.name, [q.d0, q.d1] as [number, number]]));
  const route: Route = {
    kind, pts: P, raw, rad: Rr, cum, total, parts, spans, start: parts[1]!.d0 * spec.start, free, hv0: free, hvEnd: total,
    focus: [span(spec.focus[0]).d0, span(spec.focus[1]).d1], ids: expandPieces(spec.ids),
  };
  if (spec.after) spec.after(route);
  if (kind === 'tipscoil' || kind === 'tipscoilin') { const q = parts.find((x) => x.name === 'coronary'); if (q) route.coilAt = { id: q.id!, f: q.fb, dir: -1 }; }
  kept.set(kind, route);
  return route;
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
