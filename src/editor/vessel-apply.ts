// Vessel edits as eased offsets on the 2D plan (plan: docs/editor-plan.md, workstream A). No mesh, no field: network.ts feeds the offset plan to the join, run-on, bend and skin code it has today.
// A node move shifts every arm end at that node by one vector and eases it to zero along the arm (smoothstep over its first quarter, at most 6 radii). Control points are offsets
// interpolated with smoothstep between knots (zero slope at each knot) and pinned to zero at both ends. With nothing to apply the very same array comes back.
import type { Overrides } from './types.ts';

export type P2 = readonly [number, number];
export interface EdgeEnds { id: string; from: string; to: string }
export interface ApplyOpts { /** Half the vessel's drawn width in plan units: caps an arm's easing at 6 of them. */ radius?: number }
export interface Applied { path: readonly P2[]; /** Depth offset per path point (scene units), or null when no dz is edited. */ dz: Float64Array | null }

export const NODE_REACH_FRAC = 0.25;
export const NODE_REACH_RADII = 6;
const smooth = (t: number): number => { const c = t < 0 ? 0 : t > 1 ? 1 : t; return c * c * (3 - 2 * c); };

/** Is there anything for this vessel? */
export function hasEdits(o: Overrides | undefined, e: EdgeEnds): boolean {
  if (!o) return false;
  return !!(o.nodes?.[e.from] || o.nodes?.[e.to] || o.vessels?.[e.id]?.pts?.length);
}

/** The vessel's 2D course with its edits applied: positions in plan units, and a per-point depth offset. */
export function applyVesselOverrides(e: EdgeEnds, path: readonly P2[], o: Overrides | undefined, opts: ApplyOpts = {}): Applied {
  if (!hasEdits(o, e) || path.length < 2) return { path, dz: null };
  const n = path.length, out: [number, number][] = path.map((p) => [p[0], p[1]]), dz = new Float64Array(n);
  const arc = new Float64Array(n);
  for (let i = 1; i < n; i++) arc[i] = arc[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  const total = arc[n - 1]! || 1;
  const reach = Math.min(NODE_REACH_FRAC * total, opts.radius ? NODE_REACH_RADII * opts.radius : Infinity);
  let anyZ = false;
  for (const end of [0, 1] as const) {
    const mv = o!.nodes?.[end ? e.to : e.from];
    if (!mv) continue;
    for (let i = 0; i < n; i++) {
      const d = end ? total - arc[i]! : arc[i]!;
      const w = smooth(1 - d / reach);
      if (w <= 0) continue;
      out[i]![0] += mv.dx * w; out[i]![1] += mv.dy * w;
      if (mv.dz) { dz[i] += mv.dz * w; anyZ = true; }
    }
  }
  const pts = o!.vessels?.[e.id]?.pts;
  if (pts?.length) {
    const knots = [...pts].filter((k) => k.u > 0 && k.u < 1).sort((a, b) => a.u - b.u);
    if (knots.length) {
      const U = [0, ...knots.map((k) => k.u), 1];
      const DX = [0, ...knots.map((k) => k.dx), 0], DY = [0, ...knots.map((k) => k.dy), 0], DZ = [0, ...knots.map((k) => k.dz ?? 0), 0];
      let s = 0;
      for (let i = 0; i < n; i++) {
        const u = arc[i]! / total;
        while (s < U.length - 2 && u > U[s + 1]!) s++;
        const span = U[s + 1]! - U[s]!, t = span > 1e-9 ? smooth((u - U[s]!) / span) : 0;
        out[i]![0] += DX[s]! + (DX[s + 1]! - DX[s]!) * t; out[i]![1] += DY[s]! + (DY[s + 1]! - DY[s]!) * t;
        const z = DZ[s]! + (DZ[s + 1]! - DZ[s]!) * t;
        if (z) { dz[i] += z; anyZ = true; }
      }
    }
  }
  return { path: out, dz: anyZ ? dz : null };
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
