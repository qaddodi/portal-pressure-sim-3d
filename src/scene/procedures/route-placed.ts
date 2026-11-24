// THE ROUTES ON THE PLACED ANATOMY (anatomy integration, docs/approved/anatomy-placement.md; `?anatomy=new`). With the switch on, a catheter's route is laid IN 3D on the vessels' drawn centrelines
// (vessels/centreline.ts centrelineOf: the course and radius each tube is built from, whatever placement the network holds), never on the 2D courses with tier depths: the same specs as route.ts (the 2D
// app's legs, names, stops and shares), the same builder, on a geometry whose points are [figure x, figure y, depth in figure units]. The route's `raw3` is the vessels' own centreline at every sample
// (route3d.ts lays the device on it and rounds the corners inside the lumen), `pts` its projection on the figure, `cum` its length in 3D, so every reader of a route keeps working.
// The HVPG wedges in the lower right hepatic branch (owner's ruling, question 4): the tip goes out of the right hepatic vein's trunk into that branch and stops part-way along it.
import { JUNCTION_PIECES } from '../../engine/hales/portal/topology.js';
import { NETWORK, NETWORK_BY_ID } from '../vessels/network.ts';
import { centrelineOf } from '../vessels/centreline.ts';
import { REST, coursesOf } from '../vessels/shape.ts';
import { smoothJoinsOn } from '../vessels/join-mode.ts';
import { UNITS_PER_SCENE as U, x2d, x3, y2d, y3 } from '../frame2d.ts';
import { legSubs, pieceAt, procSpecs } from './copied/proc-routes.js';
import { expandPieces } from './copied/part-names.js';
import type { Route, RoutePart, P2 } from './route.ts';

/** A point of the placed route geometry: figure x, figure y (down), depth (scene z in figure units). */
export type P3 = [number, number, number];
interface Geo3 { [id: string]: { cur: P3[] } }

/** The drawn centreline of vessel `id` (the course its tube is built on: shape.ts coursesOf at rest, the first course, the one route3d.ts lays a device on) as figure-unit points about 2 figure units
 *  apart; null for a vessel with none. */
function sampled(id: string): P3[] | null {
  const v = NETWORK_BY_ID.get(id);
  const c = v?.plan ? coursesOf(v, REST)[0]?.pts : v?.pts;
  if (!c || c.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < c.length; i++) cum.push(cum[i - 1]! + Math.hypot(c[i]![0] - c[i - 1]![0], c[i]![1] - c[i - 1]![1], c[i]![2] - c[i - 1]![2]));
  const L = cum[cum.length - 1]!;
  if (!(L > 0)) return null;
  const n = Math.min(600, Math.max(8, Math.ceil((L * U) / 2) + 1)), out: P3[] = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const d = (L * i) / (n - 1);
    while (j < c.length - 1 && cum[j]! < d) j++;
    const u = cum[j]! > cum[j - 1]! ? clamp((d - cum[j - 1]!) / (cum[j]! - cum[j - 1]!), 0, 1) : 0, a = c[j - 1]!, b = c[j]!;
    out.push([x2d(lerp(a[0], b[0], u)), y2d(lerp(a[1], b[1], u)), lerp(a[2], b[2], u) * U]);
  }
  return out;
}
const geoKept = new Map<boolean, Geo3>();
/** Every drawn vessel's centreline, keyed by its id (built once per join mode, on first use, from the network as it is). */
export function geo3(): Geo3 {
  const mode = smoothJoinsOn(), hit = geoKept.get(mode);
  if (hit) return hit;
  const g: Geo3 = {};
  for (const v of NETWORK) { const s = sampled(v.id); if (s) g[v.id] = { cur: s }; }
  geoKept.set(mode, g);
  return g;
}

/** The lower right hepatic branch the HVPG wedges in: a draw-only branch of the right hepatic vein (no engine edge). The placed network names it `rhvb` (or a liver branch of the right hepatic vein's
 *  outer piece, `RHV_IVC_1~F:…`, the side branch today's network grows downward); null when the network draws none (the tip then reads in the trunk, as today). */
export function rhvbId(): string | null {
  if (NETWORK_BY_ID.has('rhvb')) return 'rhvb';
  const named = NETWORK.find((v) => /(^|[^a-z])rhvb([^a-z]|$)/i.test(v.id));
  if (named) return named.id;
  // (the right hepatic vein's own side branch: the one whose liver end is lowest, so the lower branch)
  let best: string | null = null, by = Infinity;
  for (const v of NETWORK) {
    if (!v.id.startsWith('RHV_IVC') || !v.id.includes('~F')) continue;
    const c = centrelineOf(v.id); if (!c) continue;
    const y = Math.min(c.pointAt(0)[1], c.pointAt(1)[1]);
    if (y < by) { by = y; best = v.id; }
  }
  return best;
}
/** Where along the lower branch (0 at its join with the trunk, 1 at its tip in the liver) the HVPG's tip wedges: past its middle, with the balloon and the gap behind it inside the branch, and the
 *  branch ahead of it for the wedged reading (the WHVP) to hang in. */
export const WEDGE_ALONG = 0.55;

const lenTo = (pts: readonly P3[]): number[] => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2])); return c; };
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, (a[2] ?? b[2] ?? 0) - (b[2] ?? a[2] ?? 0));

/** A vein split in pieces (topology.js JUNCTIONS) as one course: its pieces end to end (proc-routes.js wholeOf, in 3D). */
function wholeOf3(g: Geo3, id: string): { P: P3[]; ids: string[]; cuts: number[] } | null {
  const ids = (JUNCTION_PIECES as Record<string, string[]>)[id];
  if (!ids || ids.length < 2) return null;
  const P: P3[] = [], at: number[] = [];
  for (const pid of ids) {
    const c = g[pid]?.cur;
    if (!c?.length) return null;
    for (let i = P.length ? 1 : 0; i < c.length; i++) P.push(c[i]!);
    at.push(P.length - 1);
  }
  const cum = lenTo(P), n = cum[cum.length - 1] || 1;
  return { P, ids, cuts: at.map((i) => cum[i]! / n) };
}
/** The part of a polyline from length a to length b (proc-routes.js cutLen, in 3D). */
function cut3(pts: readonly P3[], cum: readonly number[], a: number, b: number): P3[] {
  const out: P3[] = [];
  for (let i = 1; i < pts.length; i++) {
    const s0 = cum[i - 1]!, s1 = cum[i]!;
    if (s1 < a || s0 > b) continue;
    const at = (d: number): P3 => { const u = s1 > s0 ? (d - s0) / (s1 - s0) : 0, p = pts[i - 1]!, q = pts[i]!; return [lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)]; };
    if (!out.length) out.push(at(Math.max(a, s0)));
    out.push(s1 <= b ? pts[i]! : at(b));
  }
  return out;
}

/** Resampled evenly and smoothed with a window as wide as the vein there (route.ts smoothRoute, in 3D): `raw` is the vessels' own centreline at the samples. */
function smooth3(pts: P3[], rad: number[], marks: number[]): { P: P3[]; raw: P3[]; Rr: number[]; idx: number[] } {
  const c0 = lenTo(pts), H = 1.2, L = c0[c0.length - 1]!, n = Math.max(2, Math.ceil(L / H) + 1);
  let P: P3[] = [], j = 1;
  const Rr: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = (L * i) / (n - 1);
    while (j < c0.length - 1 && c0[j]! < d) j++;
    const u = c0[j]! > c0[j - 1]! ? clamp((d - c0[j - 1]!) / (c0[j]! - c0[j - 1]!), 0, 1) : 0, a = pts[j - 1]!, b = pts[j]!;
    P.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)]); Rr.push(lerp(rad[j - 1]!, rad[j]!, u));
  }
  const idx = marks.map((m) => Math.round((c0[Math.min(m, c0.length - 1)]! / (L || 1)) * (n - 1)));
  const raw = P;
  for (let pass = 0; pass < 2; pass++) {
    const Q = P.map((q) => q.slice() as P3);
    for (let i = 1; i < n - 1; i++) {
      const sg = clamp(Rr[i]! * 0.55, 1, 8) / H, w = Math.min(Math.ceil(sg * 2), i, n - 1 - i);
      let sx = 0, sy = 0, sz = 0, sw = 0;
      for (let k = -w; k <= w; k++) { const g = Math.exp(-(k * k) / (2 * sg * sg)); sx += P[i + k]![0] * g; sy += P[i + k]![1] * g; sz += P[i + k]![2] * g; sw += g; }
      Q[i] = [sx / sw, sy / sw, sz / sw];
    }
    P = Q;
  }
  return { P, raw, Rr, idx };
}

interface LegOpts { rev?: boolean; a?: number; b?: number; until?: ((q: P3) => boolean) | null; near?: readonly number[] | null; from?: readonly number[] | null; name?: string; r?: number }
interface Builder { pts(list: (P2 | P3)[], id: string, f: number, name?: string): void; vessel(id: string, o?: LegOpts): void }
interface Spec { ids: string[]; start: number; tip: (string | number)[]; focus: string[]; build(B: Builder): void; after?(r: Route): void }

const headOf = (g: Geo3, id: string): P3 => (wholeOf3(g, id)?.P ?? g[id]!.cur)[0]!;

/** The HVPG on the placed anatomy: the neck, the SVC, the right atrium, down the IVC to the right hepatic vein's opening, out along its trunk to the fork, and into the lower branch, where it wedges. */
function hvpgPlaced(g: Geo3, rad: (id: string) => number): Spec {
  const br = rhvbId(), brPts = br ? g[br]?.cur : null;
  // (the branch's end that joins the trunk: of its two ends, the one nearer the trunk's course)
  const trunk = wholeOf3(g, 'RHV_IVC')?.P ?? g.RHV_IVC!.cur;
  const near = (p: P3): number => Math.min(...trunk.map((q) => dist(p, q)));
  const join = brPts ? (near(brPts[0]!) <= near(brPts[brPts.length - 1]!) ? brPts[0]! : brPts[brPts.length - 1]!) : null;
  const brRev = !!brPts && join === brPts[brPts.length - 1];
  return {
    ids: expandPieces(['SVC_RA', 'IVCS_RA', 'IVC_IS', 'RHV_IVC', ...(br ? [br] : ['POST_R_RHV'])]), start: 0.55, tip: br ? ['branch', WEDGE_ALONG] : ['hv', 0.62], focus: ['hv', 'branch'],
    build(B) {
      const top = headOf(g, 'SVC_RA'), ost = g.RHV_IVC!.cur[g.RHV_IVC!.cur.length - 1]!;
      B.pts([[top[0] - 6, top[1] - 150, top[2]], [top[0] - 2, top[1] - 60, top[2]], top], 'SVC_RA', 0);
      B.vessel('SVC_RA'); B.vessel('IVCS_RA', { rev: true });
      B.vessel('IVC_IS', { rev: true, until: (q) => q[1] >= ost[1] - 4, name: 'ivc' });
      if (br && join) { B.vessel('RHV_IVC', { rev: true, near: join, name: 'hv' }); B.vessel(br, { rev: brRev, name: 'branch', r: rad(br) }); }
      else { B.vessel('RHV_IVC', { rev: true, name: 'hv' }); if (g.POST_R_RHV) B.vessel('POST_R_RHV', { rev: true, name: 'branch' }); }
    },
    after(r) { const hv = r.spans.hv!; r.hv0 = hv[0]; r.hvEnd = (r.spans.branch ?? hv)[1]; },
  };
}
/** The DIPS's catheter on the placed anatomy (route.ts DIPS): the cava down to where the shunt leaves it, then the shunt to the portal vein. */
function dipsPlaced(g: Geo3, rad: (id: string) => number): Spec {
  return {
    ids: expandPieces(['SVC_RA', 'IVCS_RA', 'IVC_IS', 'DIPS']), start: 0.55, tip: ['tract', 1], focus: ['ivc', 'tract'],
    build(B) {
      const top = headOf(g, 'SVC_RA'), out = g.DIPS!.cur[g.DIPS!.cur.length - 1]!;
      B.pts([[top[0] - 6, top[1] - 150, top[2]], [top[0] - 2, top[1] - 60, top[2]], top], 'SVC_RA', 0);
      B.vessel('SVC_RA'); B.vessel('IVCS_RA', { rev: true });
      B.vessel('IVC_IS', { rev: true, near: out, name: 'ivc' });   // (down the cava to the point nearest where the shunt leaves it, in 3D)
      B.vessel('DIPS', { rev: true, name: 'tract', r: rad('PVH_R') * 0.8 });
    },
  };
}

/** The route of a catheter kind laid in 3D on the drawn centrelines (route.ts routeOf, the placed anatomy). Null for a kind no spec lays. */
export function placedRoute(kind: string, lumenRadius: (id: string, f?: number) => number): (Route & { raw3: [number, number, number][] }) | null {
  const g = geo3(), rad = (id: string): number => lumenRadius(id, 0.5);
  const k = kind === 'tipscoilin' ? 'tipscoil' : kind;
  const spec: Spec | undefined = k === 'hvpg' ? hvpgPlaced(g, rad) : k === 'dips' ? dipsPlaced(g, rad) : (procSpecs as (geo: Geo3, radOf: (id: string, f?: number) => number) => Record<string, Spec>)(g, lumenRadius)[k];
  if (!spec) return null;
  const pts: P3[] = [], radA: number[] = [], marks: number[] = [], parts: RoutePart[] = [];
  // A BRIDGE: where one leg ends a step away from where the next begins (the left renal vein's piece at the cava ends short of where the gastrorenal shunt joins the renal vein further out), the catheter
  // runs through the vessel that joins them, on its centreline, and that vessel is one of the route's (its lumen holds the device there), never a chord through the wall.
  const bridges: string[] = [];
  const bridge = (p: P3, q: P3, rNow: number): void => {
    if (dist(p, q) <= Math.max(rNow, 1)) return;
    let best: { id: string; i: number; j: number; cost: number } | null = null;
    for (const v of NETWORK) {
      const cur = g[v.id]?.cur; if (!cur || v.feeder) continue;
      const R = lumenRadius(v.id);
      let i = 0, j = 0, di = Infinity, dj = Infinity;
      cur.forEach((x, k) => { const a = dist(x, p), b = dist(x, q); if (a < di) { di = a; i = k; } if (b < dj) { dj = b; j = k; } });
      if (di > R || dj > R || i === j) continue;
      const cost = di + dj;
      if (!best || cost < best.cost) best = { id: v.id, i, j, cost };
    }
    if (!best) return;
    const cur = g[best.id]!.cur, step = best.i < best.j ? 1 : -1;
    for (let k = best.i + step; k !== best.j; k += step) { pts.push(cur[k]!); radA.push(lumenRadius(best.id)); }
    bridges.push(best.id);
  };
  const B: Builder = {
    pts(list, id, f, name = 'lead') {
      marks.push(pts.length); parts.push({ id: null, name, fa: 0, fb: 0, d0: 0, d1: 0 });
      const zRef = (list.find((q) => q.length > 2) as P3 | undefined)?.[2] ?? 0;
      for (const q of list) { pts.push([q[0], q[1], (q as P3)[2] ?? zRef]); radA.push(lumenRadius(id, f)); }
    },
    vessel(id, { rev = false, a = 0, b = 1, until = null, near = null, from = null, name = id, r = 0 } = {}) {
      const w = wholeOf3(g, id), base = w ? w.P : g[id]?.cur;
      if (!base) throw new Error(`no drawn centreline for ${id}`);
      const P0 = rev ? base.slice().reverse() : base, c = lenTo(P0), n = c[c.length - 1] || 1;
      if (near) { let best = Infinity; P0.forEach((q, i) => { const dd = dist(q, near); if (dd < best) { best = dd; b = c[i]! / n; } }); }
      if (from) { let best = Infinity; P0.forEach((q, i) => { const dd = dist(q, from); if (dd < best) { best = dd; a = c[i]! / n; } }); }
      if (until) { const i = P0.findIndex((q, kk) => kk > 0 && until(q)); if (i > 0) b = c[i - 1]! / n; }
      const seg = cut3(P0, c, a * n, b * n), own = (f: number): number => (rev ? 1 - f : f);
      if (pts.length && seg.length) bridge(pts[pts.length - 1]!, seg[0]!, radA[radA.length - 1]!);
      marks.push(pts.length);
      const part: RoutePart = { id, name, fa: own(a), fb: own(b), d0: 0, d1: 0, whole: w ? { w, rev, a, b } : undefined };
      parts.push(part);
      for (let i = (a === 0 || from) && pts.length ? 1 : 0, run = a * n; i < seg.length; i++) {
        if (i) run += dist(seg[i]!, seg[i - 1]!);
        pts.push(seg[i]!);
        if (r) radA.push(r);
        else if (w) { const [pid, pf] = pieceAt(w, own(run / n)) as [string, number]; radA.push(lumenRadius(pid, pf)); }
        else radA.push(lumenRadius(id, own(run / n)));
      }
    },
  };
  spec.build(B);
  const { P, raw, Rr, idx } = smooth3(pts, radA, marks);
  const cum = lenTo(P), total = cum[cum.length - 1]!, L = (i: number): number => (i < idx.length ? cum[Math.min(idx[i]!, cum.length - 1)]! : total);
  parts.forEach((q, i) => { q.d0 = L(i); q.d1 = L(i + 1); const wh = q.whole as { w: unknown; rev: boolean; a: number; b: number } | undefined; if (wh) q.subs = legSubs(wh.w, wh.rev, wh.a, wh.b, q.d0, q.d1) as RoutePart[]; });
  const span = (name: string): RoutePart => parts.find((q) => q.name === name)!;
  const tp = span(String(spec.tip[0])), free = tp.d0 + (tp.d1 - tp.d0) * Number(spec.tip[1]);
  const spans = Object.fromEntries(parts.filter((q) => q.name !== 'lead').map((q) => [q.name, [q.d0, q.d1] as [number, number]]));
  const route = {
    kind, pts: P.map((q): P2 => [q[0], q[1]]), raw: raw.map((q): P2 => [q[0], q[1]]), rad: Rr, cum, total, parts, spans, start: parts[1]!.d0 * spec.start, free, hv0: free, hvEnd: total,
    focus: [span(spec.focus[0]!).d0, span(spec.focus[1]!).d1] as [number, number], ids: expandPieces([...spec.ids, ...bridges]),
    raw3: raw.map((q): [number, number, number] => [x3(q[0]), y3(q[1]), q[2] / U]),
  };
  if (spec.after) spec.after(route);
  if (kind === 'tipscoil' || kind === 'tipscoilin') { const q = parts.find((x) => x.name === 'coronary'); if (q) (route as Route).coilAt = { id: q.id!, f: q.fb, dir: -1 }; }
  return route;
}
