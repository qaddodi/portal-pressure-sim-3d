// THE FILLET'S FIDELITY (plan owner, 22 Nov, "Rulings on the neck gate"): the projected mesh stays within a tolerance of the live union INCLUDING the sag of each edge's midpoint (a flat triangle between two vertices on the surface dips inside a convex one and floats over a concave one).
// Where an edge's midpoint is further than `tol` x R off the union (R the narrowest arm's radius at the junction), the edge is split at its midpoint, moved onto the union by Newton steps; every triangle then takes the pattern of its split edges (1, 2 or 3), so the mesh stays
// conforming (a split edge is split for both its triangles). The seam rings' own edges are the tubes' polygon (the shader's TUBE_SAG owns it) and never split. A few passes; each halves the sag by four.
import { sdUnion, sdUnionGrad, type Capsule } from '../skin/sdf.ts';

/** `fixedCount`: the vertices [0, fixedCount) are the seam rings: an edge between two of them is never split. Returns the refined positions and triangles (the vertices keep their order, new ones follow). */
export function refineSag(pos: Float64Array, tris: readonly number[], fixedCount: number, caps: readonly Capsule[], k: number, R: number, tol: number, passes = 4): { pos: Float64Array; tris: number[]; added: number } {
  let P = Array.from(pos), T = Array.from(tris), added = 0;
  const g = new Float64Array(3);
  for (let pass = 0; pass < passes; pass++) {
    const mid = new Map<string, number>(), failed = new Set<string>();
    const key = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);
    const edges: [number, number][] = [];
    for (let t = 0; t < T.length; t += 3) for (let c = 0; c < 3; c++) {
      const a = T[t + c]!, b = T[t + (c + 1) % 3]!, kk = key(a, b);
      if (mid.has(kk) || failed.has(kk)) continue;
      mid.set(kk, -1);
      if (a < fixedCount && b < fixedCount) continue;
      edges.push([a, b]);
    }
    let any = false;
    for (const [a, b] of edges) {
      const m = [0, 1, 2].map((d) => (P[3 * a + d]! + P[3 * b + d]!) / 2) as [number, number, number];
      if (Math.abs(sdUnion(caps, k, m[0], m[1], m[2])) <= tol * R) continue;
      for (let s = 0; s < 3; s++) { const f = sdUnionGrad(caps, k, m[0], m[1], m[2], g), l2 = g[0]! ** 2 + g[1]! ** 2 + g[2]! ** 2; if (l2 > 1e-12) for (let d = 0; d < 3; d++) m[d]! -= (f * g[d]!) / l2; }
      mid.set(key(a, b), P.length / 3); P.push(m[0], m[1], m[2]); added++; any = true;
    }
    if (!any) break;
    const out: number[] = [];
    const M = (a: number, b: number): number => mid.get(key(a, b))!;
    const dist = (a: number, b: number): number => Math.hypot(P[3 * a]! - P[3 * b]!, P[3 * a + 1]! - P[3 * b + 1]!, P[3 * a + 2]! - P[3 * b + 2]!);
    for (let t = 0; t < T.length; t += 3) {
      const v = [T[t]!, T[t + 1]!, T[t + 2]!], m = [M(v[0]!, v[1]!), M(v[1]!, v[2]!), M(v[2]!, v[0]!)], n = m.filter((x) => x >= 0).length;
      if (n === 0) { out.push(...v); continue; }
      // rotate so that a split edge, or for two splits the vertex they share, is first: edge i runs v[i] -> v[i+1]
      if (n === 1) { const i = m.findIndex((x) => x >= 0), a = v[i]!, b = v[(i + 1) % 3]!, c = v[(i + 2) % 3]!, x = m[i]!; out.push(a, x, c, x, b, c); continue; }
      if (n === 3) { out.push(v[0]!, m[0]!, m[2]!, m[0]!, v[1]!, m[1]!, m[2]!, m[1]!, v[2]!, m[0]!, m[1]!, m[2]!); continue; }
      const i = m.findIndex((x) => x < 0), a = v[(i + 1) % 3]!, b = v[(i + 2) % 3]!, c = v[i]!, x = m[(i + 1) % 3]!, y = m[(i + 2) % 3]!;   // edges a-b (x) and b-c (y) split, c-a whole
      out.push(x, b, y);
      if (dist(a, y) <= dist(x, c)) out.push(a, x, y, a, y, c); else out.push(a, x, c, x, y, c);
    }
    T = out;
  }
  return { pos: new Float64Array(P), tris: T, added };
}
