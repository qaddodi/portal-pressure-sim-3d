// WHICH BONES CARRY A REGION'S CAPSULES IN THE SHADER'S ROW (plan owner, 22 Nov, after WP3 measured e8f2b2cb): the vertex stage's capsule is a polyline through at most REGION_PTS bones, but the arms' tubes (and their extensions to the node) follow EVERY bone.
// A long or bent arm cut to 8 evenly spaced samples (the first cut, net/regions.ts) lets the tube stand outside the live union: the root cause of the extension's ink poking out. Here the bones of each capsule are CHOSEN: the subset of at most `max` that, over the Circuit's t and the
// real swell states, leaves the least of the full bone chain's surface outside the polyline's capsule (a bone's tube stands outside by its distance from the segment plus its radius, less the capsule's radius there). A minimax choice by dynamic programming over the chain.
import { bonesAtT } from './window.ts';
import { sdUnion, SKIN_K } from '../skin/sdf.ts';
import type { Skeleton } from './types.ts';

type V3 = readonly [number, number, number];
const T_SAMPLES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
export interface ChainFit { bones: number[]; /** the worst of the omitted bones' surface outside the capsule, over every sampled t and state, in units of that bone's radius */ worst: number }

/**
 * The radius factors (per state, every edge's factor on `skel`'s radii) the choice is judged at: the skeleton's own, and the real states with the least and the most total swell. `bakeScale`: the skeleton's radii are baked at it (the live radius is the unbaked one times the swell).
 */
export function stateScales(edges: number, bakeScale: ArrayLike<number>, states?: readonly (readonly number[])[]): Float64Array[] {
  const one = new Float64Array(edges).fill(1), out = [one.map((_, e) => 1)];
  const total = (s: readonly number[]): number => s.reduce((a, b) => a + b, 0);
  if (states?.length) for (const pick of [states.reduce((a, b) => (total(b) < total(a) ? b : a)), states.reduce((a, b) => (total(b) > total(a) ? b : a))]) out.push(one.map((_, e) => (pick[e] ?? 1) / bakeScale[e]!));
  return out;
}

/** `force[i]`: bones of chain i that stay in its subset (the seams, the node ends). */
export function shaderBones(skel: Skeleton, chains: readonly (readonly number[])[], max: number, scales: readonly ArrayLike<number>[], force: readonly ReadonlySet<number>[] = []): ChainFit[] {
  const poses = T_SAMPLES.map((t) => bonesAtT(skel, t)), sw = scales;
  return chains.map((chain, ci) => {
    const must = chain.map((g) => !!force[ci]?.has(g));
    const n = chain.length;
    // cen[p][i], r[p][i]: the chain's bones at pose/state p
    const cen: V3[][] = [], rad: number[][] = [];
    for (const P of poses) for (const s of sw) { cen.push(chain.map((g) => P[g]!.cen)); rad.push(chain.map((g) => P[g]!.r * s[skel.bones[g]!.edge]!)); }
    // cost[a][b]: the worst violation, over p, of the bones strictly between a and b against the capsule a-b (in the bone's own radius)
    const cost = (a: number, b: number): number => {
      let w = 0;
      for (let p = 0; p < cen.length; p++) {
        const A = cen[p]![a]!, B = cen[p]![b]!, ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], l2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
        for (let j = a + 1; j < b; j++) {
          const C = cen[p]![j]!, s = l2 > 1e-18 ? Math.min(1, Math.max(0, ((C[0] - A[0]) * ab[0]! + (C[1] - A[1]) * ab[1]! + (C[2] - A[2]) * ab[2]!) / l2)) : 0;
          const d = Math.hypot(C[0] - A[0] - s * ab[0]!, C[1] - A[1] - s * ab[1]!, C[2] - A[2] - s * ab[2]!), rj = rad[p]![j]!, rc = rad[p]![a]! + (rad[p]![b]! - rad[p]![a]!) * s;
          w = Math.max(w, (d + rj - rc) / Math.max(rj, 1e-9));
        }
      }
      return w;
    };
    if (n <= max) return { bones: chain.slice(), worst: 0 };
    // (a transition a -> b may not skip a bone that must stay)
    const free = (a: number, b: number): boolean => { for (let j = a + 1; j < b; j++) if (must[j]) return false; return true; };
    // best[k][b]: the least worst-violation of a chain from bone 0 to bone b using k segments
    const c = new Map<number, number>(), cst = (a: number, b: number): number => { if (!free(a, b)) return Infinity; const key = a * n + b; let v = c.get(key); if (v === undefined) { v = cost(a, b); c.set(key, v); } return v; };
    const best: number[][] = [], from: number[][] = [];
    for (let k = 0; k < max - 1; k++) { best.push(new Array<number>(n).fill(Infinity)); from.push(new Array<number>(n).fill(-1)); }
    for (let b = 1; b < n; b++) { best[0]![b] = cst(0, b); from[0]![b] = 0; }
    for (let k = 1; k < max - 1; k++) for (let b = 1; b < n; b++) for (let a = 1; a < b; a++) { const v = Math.max(best[k - 1]![a]!, cst(a, b)); if (v < best[k]![b]!) { best[k]![b] = v; from[k]![b] = a; } }
    let kBest = 0; for (let k = 1; k < max - 1; k++) if (best[k]![n - 1]! < best[kBest]![n - 1]! - 1e-12) kBest = k;
    if (!Number.isFinite(best[kBest]![n - 1]!)) return { bones: chain.filter((_, i) => i === 0 || i === n - 1 || must[i]), worst: Infinity };   // (more bones must stay than the row holds: the caller names it)
    const idx = [n - 1]; for (let k = kBest, b = n - 1; k >= 0; k--) { b = from[k]![b]!; idx.push(b); }
    idx.reverse();
    return { bones: idx.map((i) => chain[i]!), worst: Math.max(0, best[kBest]![n - 1]!) };
  });
}

/**
 * HOW FAR THE ARMS' EXTENSIONS STAND OUTSIDE THE UNION THE SHADER HOLDS, per junction region (plan owner, 22 Nov): for every vertex of an arm's tube between its seam ring and the node (at the t of `ts` and each per-edge radius factor of `scales`, applied to `skel`'s
 * radii), the signed distance to the smooth union of the region's capsules as the vertex stage builds it (`rows`: each capsule's bones, live centres and radii) over the narrowest arm's radius. 0 or less: inside. The extension is the fillet's ink hull's to hide, so it must be 0.
 */
export function extensionsOutside(skel: Skeleton, mesh: { position: Float32Array; bone: Uint16Array; weight: Float32Array; offset: Float32Array; index: Uint32Array }, reports: readonly { node: string; kind: string; variant?: number; arms: number[]; seams: number[]; triStart: number; triCount: number; capBones?: number[][]; caps?: unknown }[], rows: readonly { caps: readonly { bones: readonly number[]; mate: number }[] }[], scales: readonly ArrayLike<number>[], ts: readonly number[]): { node: string; worst: number; at: { t: number; edge: string } }[] {
  const junctions = reports.filter((n) => n.kind === 'junction' && n.caps), inRegion = new Uint8Array(mesh.index.length / 3), tube = new Uint8Array(mesh.position.length / 3);
  for (const n of junctions) inRegion.fill(1, n.triStart, n.triStart + n.triCount);
  for (let t = 0; t < inRegion.length; t++) if (!inRegion[t]) for (let s = 0; s < 3; s++) tube[mesh.index[3 * t + s]!] = 1;
  const poses = ts.map((t) => bonesAtT(skel, t)), out: { node: string; worst: number; at: { t: number; edge: string } }[] = [];
  junctions.forEach((n, ri) => {
    if ((n.variant ?? 0) !== 0 || !n.capBones) return;
    const cluster = n.node.split('+'), ext: { v: number; edge: number }[] = [];
    n.arms.forEach((edge, i) => {
      const e = skel.edges[edge]!, [first, count] = e.bones, end = cluster.includes(e.from) ? 0 : 1, seam = end === 0 ? first + n.seams[i]! : first + count - 1 - n.seams[i]!;
      for (let v = 0; v < tube.length; v++) { if (!tube[v]) continue; const b = mesh.bone[4 * v]!; if (b < first || b >= first + count || b === seam || (end === 0 ? b > seam : b < seam)) continue; ext.push({ v, edge }); }
    });
    let worst = { x: -Infinity, t: 0, edge: -1 };
    for (const sc of scales) ts.forEach((t, ti) => {
      const B = poses[ti]!, rl = (g: number): number => B[g]!.r * sc[skel.bones[g]!.edge]!;
      const caps = rows[ri]!.caps.map((c) => { const pts = new Float64Array(3 * c.bones.length), r = new Float64Array(c.bones.length); c.bones.forEach((g, q) => { pts.set(B[g]!.cen, 3 * q); r[q] = rl(g); }); return c.mate >= 0 ? { n: c.bones.length, pts, r, mate: c.mate } : { n: c.bones.length, pts, r }; });
      const narrow = Math.min(...n.capBones!.slice(0, n.arms.length).map((ids) => rl(ids[0]!))), k = SKIN_K * narrow;
      for (const { v, edge } of ext) {
        const p = [0, 0, 0];
        for (let q = 0; q < 4; q++) { const w = mesh.weight[4 * v + q]!; if (!(w > 0)) continue; const g = mesh.bone[4 * v + q]!, F = B[g]!.F, R = rl(g), o = [mesh.offset[12 * v + 3 * q]!, mesh.offset[12 * v + 3 * q + 1]!, mesh.offset[12 * v + 3 * q + 2]!]; for (let d = 0; d < 3; d++) p[d]! += w * (B[g]!.cen[d]! + R * (F[0][d]! * o[0]! + F[1][d]! * o[1]! + F[2][d]! * o[2]!)); }
        const x = sdUnion(caps, k, p[0]!, p[1]!, p[2]!) / narrow;
        if (x > worst.x) worst = { x, t, edge };
      }
    });
    out.push({ node: n.node, worst: worst.x, at: { t: worst.t, edge: skel.edges[worst.edge]?.id ?? '' } });
  });
  return out;
}
