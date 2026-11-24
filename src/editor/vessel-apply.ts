// Vessel edits as eased offsets on the 2D plan (plan: docs/editor-plan.md, workstream A). No mesh, no field: network.ts feeds the offset plan to the join, run-on, bend and skin code it has today.
// A node move shifts every arm end at that node by one vector and eases it to zero along the arm (smoothstep over its first quarter, at most 6 radii). Control points are offsets
// interpolated with smoothstep between knots (zero slope at each knot) and pinned to zero at both ends. With nothing to apply the very same array comes back.
import type { Overrides } from './types.ts';

export type P2 = readonly [number, number];
export interface EdgeEnds { id: string; from: string; to: string }
export interface ApplyOpts { /** Half the vessel's drawn width in plan units: caps an arm's easing at 6 of them. */ radius?: number }
export interface Applied { path: readonly P2[]; /** Depth offset per path point (scene units), or null when no dz is edited. */ dz: Float64Array | null }

export const NODE_REACH_FRAC = 0.4;
export const NODE_REACH_RADII = 10;
/** An arm's reach grows with the move: about this many times the move's length (never past the arm). */
export const NODE_REACH_MOVE = 3;
/** Quintic smootherstep: 0 to 1 over 0..1 with zero first AND second derivative at both ends (C2). */
const smoother = (t: number): number => { const c = t < 0 ? 0 : t > 1 ? 1 : t; return c * c * c * (c * (6 * c - 15) + 10); };
/** The falloff of a node move along an arm: 1 at the node, 0 at `reach`, C2 at both (so neither the arm's tangent nor its curvature jumps), and flat at the node, so every arm there keeps its own direction. */
export const armFalloff = (d: number, reach: number): number => 1 - smoother(d / reach);

/** Is there anything for this vessel? */
export function hasEdits(o: Overrides | undefined, e: EdgeEnds): boolean {
  if (!o) return false;
  return !!(o.nodes?.[e.from] || o.nodes?.[e.to] || o.vessels?.[e.id]?.pts?.length);
}

/** The control points' kernel: between knots the offset eases by quintic smootherstep (C2: no corner and no jump of curvature at a knot, flat there, so a point is a rounded hump, never a peak), 0 at both ends. */
function knotBlend(x: readonly number[], y: readonly number[]): (u: number) => number {
  return (u: number): number => {
    let i = 0;
    while (i < x.length - 2 && u > x[i + 1]!) i++;
    const span = x[i + 1]! - x[i]!, t = span > 1e-9 ? smoother((u - x[i]!) / span) : 0;
    return y[i]! + (y[i + 1]! - y[i]!) * t;
  };
}

/** Centripetal Catmull-Rom through `pts`, resampled at `n` points standing at the arc-length shares `at` (the bone count and spacing the course had): the edited course is one smooth curve, with
 *  its ends exact. */
function refit(pts: readonly (readonly [number, number])[], at: Float64Array): [number, number][] {
  const n = pts.length, SUB = 6, dense: [number, number][] = [], cum: number[] = [0];
  const P = (i: number): readonly [number, number] => (i < 0 ? [2 * pts[0]![0] - pts[1]![0], 2 * pts[0]![1] - pts[1]![1]] : i >= n ? [2 * pts[n - 1]![0] - pts[n - 2]![0], 2 * pts[n - 1]![1] - pts[n - 2]![1]] : pts[i]!);
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const dt = (a: readonly [number, number], b: readonly [number, number]): number => Math.max(Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5), 1e-4);
    const t0 = 0, t1 = t0 + dt(p0, p1), t2 = t1 + dt(p1, p2), t3 = t2 + dt(p2, p3);
    for (let k = 0; k < SUB; k++) {
      const t = t1 + ((t2 - t1) * k) / SUB;
      const L = (a: readonly [number, number], b: readonly [number, number], ta: number, tb: number): [number, number] => { const w = (t - ta) / (tb - ta); return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]; };
      const a1 = L(p0, p1, t0, t1), a2 = L(p1, p2, t1, t2), a3 = L(p2, p3, t2, t3);
      const b1 = L(a1, a2, t0, t2), b2 = L(a2, a3, t1, t3);
      dense.push(L(b1, b2, t1, t2));
    }
  }
  dense.push([pts[n - 1]![0], pts[n - 1]![1]]);
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1]! + Math.hypot(dense[i]![0] - dense[i - 1]![0], dense[i]![1] - dense[i - 1]![1]));
  const total = cum[cum.length - 1]! || 1, out: [number, number][] = [];
  let j = 0;
  for (let i = 0; i < at.length; i++) {
    if (i === 0) { out.push([pts[0]![0], pts[0]![1]]); continue; }
    if (i === at.length - 1) { out.push([pts[n - 1]![0], pts[n - 1]![1]]); continue; }
    const s = at[i]! * total;
    while (j < dense.length - 2 && cum[j + 1]! < s) j++;
    const span = cum[j + 1]! - cum[j]!, w = span > 1e-12 ? (s - cum[j]!) / span : 0;
    out.push([dense[j]![0] + (dense[j + 1]![0] - dense[j]![0]) * w, dense[j]![1] + (dense[j + 1]![1] - dense[j]![1]) * w]);
  }
  return out;
}

/** The vessel's 2D course with its edits applied: positions in plan units, and a per-point depth offset.
 *  Falloffs (named, so the cause of a kink is findable): a node move eases along each arm by `armFalloff` (quintic smootherstep, C2, flat at the node) over a reach of
 *  max(a quarter of the arm, 6 radii) or 3 times the move, whichever is larger, never past the arm; control points ease between knots by `knotBlend` (quintic smootherstep, C2, flat at each knot and at both ends); then the displaced course is refitted as a centripetal Catmull-Rom curve resampled at the same bone shares. */
export function applyVesselOverrides(e: EdgeEnds, path: readonly P2[], o: Overrides | undefined, opts: ApplyOpts = {}): Applied {
  if (!hasEdits(o, e) || path.length < 2) return { path, dz: null };
  const n = path.length, out: [number, number][] = path.map((p) => [p[0], p[1]]), dz = new Float64Array(n);
  const arc = new Float64Array(n);
  for (let i = 1; i < n; i++) arc[i] = arc[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  const total = arc[n - 1]! || 1;
  const base = Math.min(NODE_REACH_FRAC * total, opts.radius ? NODE_REACH_RADII * opts.radius : Infinity);
  let anyZ = false;
  for (const end of [0, 1] as const) {
    const mv = o!.nodes?.[end ? e.to : e.from];
    if (!mv) continue;
    const reach = Math.min(total, Math.max(base, NODE_REACH_MOVE * Math.hypot(mv.dx, mv.dy)));
    for (let i = 0; i < n; i++) {
      const d = end ? total - arc[i]! : arc[i]!;
      const w = armFalloff(d, reach);
      if (w <= 0) continue;
      out[i]![0] += mv.dx * w; out[i]![1] += mv.dy * w;
      if (mv.dz) { dz[i] += mv.dz * w; anyZ = true; }
    }
  }
  const pts = o!.vessels?.[e.id]?.pts;
  if (pts?.length) {
    const knots = [...pts].filter((k) => k.u > 0 && k.u < 1).sort((a, b) => a.u - b.u).filter((k, i, l) => i === 0 || k.u - l[i - 1]!.u > 1e-6);
    if (knots.length) {
      const U = [0, ...knots.map((k) => k.u), 1];
      const fx = knotBlend(U, [0, ...knots.map((k) => k.dx), 0]), fy = knotBlend(U, [0, ...knots.map((k) => k.dy), 0]), fz = knotBlend(U, [0, ...knots.map((k) => k.dz ?? 0), 0]);
      for (let i = 0; i < n; i++) {
        const u = arc[i]! / total;
        out[i]![0] += fx(u); out[i]![1] += fy(u);
        const z = fz(u);
        if (z) { dz[i] += z; anyZ = true; }
      }
    }
  }
  const at = new Float64Array(n);
  for (let i = 0; i < n; i++) at[i] = arc[i]! / total;
  return { path: refit(out, at), dz: anyZ ? dz : null };
}

/** Every path with its edits applied (the same object back when nothing is edited), plus the depth offsets of the edited ones. */
export function applyAll(paths: Record<string, readonly P2[]>, edges: readonly EdgeEnds[], o: Overrides | undefined, radiusOf?: (id: string) => number): { paths: Record<string, readonly P2[]>; dz: Map<string, Float64Array> } {
  const dz = new Map<string, Float64Array>();
  if (!o || ((!o.nodes || !Object.keys(o.nodes).length) && (!o.vessels || !Object.keys(o.vessels).length))) return { paths, dz };
  const out: Record<string, readonly P2[]> = { ...paths };
  for (const e of edges) {
    const p = paths[e.id];
    if (!p) continue;
    const r = applyVesselOverrides(e, p, o, { radius: radiusOf?.(e.id) });
    out[e.id] = r.path;
    if (r.dz) dz.set(e.id, r.dz);
  }
  return { paths: out, dz };
}

/** Depth offset at normalised position u (0..1) along a vessel's course from its per-point offsets. */
export function dzAt(dz: Float64Array, u: number): number {
  if (dz.length < 2) return dz[0] ?? 0;
  const f = Math.min(1, Math.max(0, u)) * (dz.length - 1), i = Math.min(dz.length - 2, Math.floor(f));
  return dz[i]! + (dz[i + 1]! - dz[i]!) * (f - i);
}
