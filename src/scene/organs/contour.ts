// Two things done once to an organ mesh when it is built (layer.ts build), both pure arithmetic on the geometry:
// 1. `smoothSilhouette`: the organ files are 2D's outlines resampled every 2.5 figure units, and that sampling carries the outline's own wobble (a step of a unit or so from one sample to the next), which shows as a saw-tooth
//    on the rim and on the ink that follows it. The silhouette (the edges where the mesh turns from facing the eye to facing away) is a ring of vertices; each is moved toward its neighbours along the ring a few times
//    (a low-pass, never more than MAX_MOVE), and the vertices inside follow by a falling share, so the rim is a smooth curve and no triangle is pinched.
// 2. `tailFade`: the duodenum's free end (the end that does not meet the stomach) fades out along its last stretch, as a per-vertex alpha, so it does not end as if cut off.
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three';

const XY = 1e5;
const keyOf = (x: number, y: number, z: number) => `${Math.round(x * XY)},${Math.round(y * XY)},${Math.round(z * XY)}`;

export interface Welded { n: number; id: Int32Array; verts: number[][]; nbr: Set<number>[]; tris: number[] }
/** The mesh with coincident vertices as one (a vertex id a place), and its neighbours. */
export function weld(g: BufferGeometry): Welded {
  const pos = g.getAttribute('position'), idx = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  const map = new Map<string, number>(), id = new Int32Array(pos.count), verts: number[][] = [];
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(pos.getX(i), pos.getY(i), pos.getZ(i));
    let w = map.get(k);
    if (w === undefined) { w = verts.length; map.set(k, w); verts.push([]); }
    id[i] = w; verts[w]!.push(i);
  }
  const nbr: Set<number>[] = verts.map(() => new Set<number>());
  const tris: number[] = [];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = id[idx[t]!]!, b = id[idx[t + 1]!]!, c = id[idx[t + 2]!]!;
    tris.push(a, b, c);
    nbr[a]!.add(b).add(c); nbr[b]!.add(a).add(c); nbr[c]!.add(a).add(b);
  }
  return { n: verts.length, id, verts, nbr, tris };
}

/** The silhouette ring as a map: vertex -> its two neighbours along the ring (only vertices with exactly two). */
export function silhouetteRing(g: BufferGeometry, w: Welded): Map<number, [number, number]> {
  const pos = g.getAttribute('position'), p = (v: number) => w.verts[v]![0]!;
  const sides = new Map<string, number[]>();
  for (let t = 0; t < w.tris.length; t += 3) {
    const a = w.tris[t]!, b = w.tris[t + 1]!, c = w.tris[t + 2]!;
    const [ia, ib, ic] = [p(a), p(b), p(c)];
    const area = (pos.getX(ib) - pos.getX(ia)) * (pos.getY(ic) - pos.getY(ia)) - (pos.getX(ic) - pos.getX(ia)) * (pos.getY(ib) - pos.getY(ia));
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) { const k = u < v ? `${u}|${v}` : `${v}|${u}`; (sides.get(k) ?? sides.set(k, []).get(k)!).push(area); }
  }
  const adj = new Map<number, number[]>();
  for (const [k, s] of sides) {
    if (s.length !== 2 || s[0]! * s[1]! >= 0) continue;
    const [u, v] = k.split('|').map(Number) as [number, number];
    (adj.get(u) ?? adj.set(u, []).get(u)!).push(v); (adj.get(v) ?? adj.set(v, []).get(v)!).push(u);
  }
  const ring = new Map<number, [number, number]>();
  for (const [v, l] of adj) if (l.length === 2) ring.set(v, [l[0]!, l[1]!]);
  return ring;
}

/** How jagged the silhouette is: the mean second difference (|a - 2b + c|, scene units) along the rim ring. A straight or smoothly bending rim is near 0, a saw-tooth is the size of its teeth. 0 when there is no ring. */
export function rimRoughness(g: BufferGeometry): number {
  const w = weld(g), ring = silhouetteRing(g, w), pos = g.getAttribute('position');
  let sum = 0, c = 0;
  const at = (v: number): [number, number] => [pos.getX(w.verts[v]![0]!), pos.getY(w.verts[v]![0]!)];
  for (const [v, [a, b]] of ring) { const p = at(v), q = at(a), r = at(b); sum += Math.hypot(q[0] - 2 * p[0] + r[0], q[1] - 2 * p[1] + r[1]); c++; }
  return c ? sum / c : 0;
}

/** The most a rim vertex is moved, scene units (about 1.4 figure units: the wobble, never a corner). */
export const MAX_MOVE = 0.0045;
/** Low-pass passes along the ring. */
export const RING_PASSES = 6;
/** How far in from the rim the move is felt, as a share per ring of triangles. */
const FALLOFF = [1, 0.6, 0.3, 0.1];

/** Smooths the silhouette of `g` in x and y (z untouched) and recomputes its normals. Returns how far the roughest rim vertex moved (scene units). */
export function smoothSilhouette(g: BufferGeometry, passes = RING_PASSES, maxMove = MAX_MOVE): number {
  const w = weld(g), ring = silhouetteRing(g, w), pos = g.getAttribute('position');
  if (ring.size < 8) return 0;
  const at = (v: number): [number, number] => [pos.getX(w.verts[v]![0]!), pos.getY(w.verts[v]![0]!)];
  const cur = new Map<number, [number, number]>();
  for (const v of ring.keys()) cur.set(v, at(v));
  for (let p = 0; p < passes; p++) {
    const next = new Map<number, [number, number]>();
    for (const [v, [a, b]] of ring) {
      const c = cur.get(v)!, pa = cur.get(a) ?? at(a), pb = cur.get(b) ?? at(b);
      next.set(v, [0.5 * c[0] + 0.25 * (pa[0] + pb[0]), 0.5 * c[1] + 0.25 * (pa[1] + pb[1])]);
    }
    for (const [v, q] of next) cur.set(v, q);
  }
  // each rim vertex's move, held to maxMove
  const base = new Float32Array(w.n * 2), level = new Int8Array(w.n).fill(-1), share = new Float32Array(w.n);
  let worst = 0, front: number[] = [];
  for (const [v, q] of cur) {
    const o = at(v);
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const l = Math.hypot(dx, dy);
    if (l > maxMove) { dx *= maxMove / l; dy *= maxMove / l; }
    base[2 * v] = dx; base[2 * v + 1] = dy; level[v] = 0; share[v] = 1; front.push(v); worst = Math.max(worst, Math.min(l, maxMove));
  }
  // the vertices inside follow by the share of the ring they are on: breadth first from the rim, each taking the mean move of its neighbours one ring out
  for (let k = 1; k < FALLOFF.length; k++) {
    const next: number[] = [];
    for (const v of front) for (const u of w.nbr[v]!) if (level[u] === -1) { level[u] = k; next.push(u); }
    for (const u of next) {
      let sx = 0, sy = 0, c = 0;
      for (const m of w.nbr[u]!) if (level[m] === k - 1) { sx += base[2 * m]!; sy += base[2 * m + 1]!; c++; }
      base[2 * u] = sx / c; base[2 * u + 1] = sy / c; share[u] = FALLOFF[k]!;
    }
    front = next;
  }
  for (let v = 0; v < w.n; v++) if (share[v]) for (const i of w.verts[v]!) pos.setXY(i, pos.getX(i) + base[2 * v]! * share[v]!, pos.getY(i) + base[2 * v + 1]! * share[v]!);
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingBox(); g.boundingSphere = null;
  return worst;
}

/** The farthest a new rim point sits from the chord's middle, scene units (the curve through four rim points bows by a fraction of a chord: 2.5 units is 0.0083). */
const REFINE_MAX = 0.0025;

/** The new rim point between rim points `u` and `v`, with `a` before `u` and `b` after `v` along the ring: on the smooth curve through the four (the 4-point interpolatory rule, (-a + 9u + 9v - b) / 16 in x and y, z the mean of u and v), held to REFINE_MAX from the chord's middle. */
export function rimPoint(a: readonly number[], u: readonly number[], v: readonly number[], b: readonly number[]): [number, number, number] {
  let x = (-a[0]! + 9 * u[0]! + 9 * v[0]! - b[0]!) / 16, y = (-a[1]! + 9 * u[1]! + 9 * v[1]! - b[1]!) / 16;
  const mx = (u[0]! + v[0]!) / 2, my = (u[1]! + v[1]!) / 2, d = Math.hypot(x - mx, y - my);
  if (d > REFINE_MAX) { x = mx + ((x - mx) * REFINE_MAX) / d; y = my + ((y - my) * REFINE_MAX) / d; }
  return [x, y, (u[2]! + v[2]!) / 2];
}

/** Splits every rim edge once, at a point on the smooth curve through the rim (the 4-point interpolatory rule: (-a + 9u + 9v - b) / 16 in x and y, z the mean), so the outline is a
 *  polyline of 1.25-unit chords instead of 2.5-unit ones: a rim that bends at each of its points shows as a faceted curve on a big screen, and the ink line that follows it with it. The two
 *  triangles on each rim edge (the front's and the back's) are split with it, so the surface stays whole. Run after `smoothSilhouette`, which has tuned the ring; recomputes the normals.
 *  Returns how many points were added. */
export function refineRim(g: BufferGeometry): number {
  if (!g.index) return 0;
  const w = weld(g), ring = silhouetteRing(g, w), pos = g.getAttribute('position');
  if (ring.size < 8) return 0;
  const at = (v: number): [number, number, number] => { const i = w.verts[v]![0]!; return [pos.getX(i), pos.getY(i), pos.getZ(i)]; };
  const key = (u: number, v: number) => (u < v ? `${u}|${v}` : `${v}|${u}`);
  // one new point a rim edge (by welded ends), once
  const mid = new Map<string, number>(), px: number[] = Array.from(pos.array), nx: number[] = Array.from(g.getAttribute('normal')?.array ?? []);
  let count = pos.count;
  for (const [u, [a, b]] of ring) for (const v of [a, b]) {
    const k = key(u, v);
    if (mid.has(k) || !ring.has(v)) continue;
    const pu = at(u), pv = at(v), ru = ring.get(u)!, rv = ring.get(v)!;
    const before = ru[0] === v ? ru[1] : ru[0], after = rv[0] === u ? rv[1] : rv[0];
    const pa = at(before), pb = at(after);
    px.push(...rimPoint(pa, pu, pv, pb));
    if (nx.length) nx.push(0, 0, 1);
    mid.set(k, count++);
  }
  if (count === pos.count) return 0;
  const idx = g.index.array, out: number[] = [];
  const m = (a: number, b: number): number => mid.get(key(w.id[a]!, w.id[b]!)) ?? -1;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    let i0 = idx[t]!, i1 = idx[t + 1]!, i2 = idx[t + 2]!;
    let m01 = m(i0, i1), m12 = m(i1, i2), m20 = m(i2, i0);
    const n = (m01 >= 0 ? 1 : 0) + (m12 >= 0 ? 1 : 0) + (m20 >= 0 ? 1 : 0);
    if (n === 0) { out.push(i0, i1, i2); continue; }
    if (n === 3) { out.push(i0, m01, m20, m01, i1, m12, m20, m12, i2, m01, m12, m20); continue; }
    // turn the triangle until its marked edge is 0-1 (one marked) or its marked edges are 0-1 and 1-2 (two)
    for (let r = 0; r < 3; r++) {
      const one = n === 1 && m01 >= 0, two = n === 2 && m01 >= 0 && m12 >= 0;
      if (one || two) break;
      [i0, i1, i2] = [i1, i2, i0]; [m01, m12, m20] = [m12, m20, m01];
    }
    if (n === 1) out.push(i0, m01, i2, m01, i1, i2);
    else out.push(m01, i1, m12, i0, m01, m12, i0, m12, i2);
  }
  g.setAttribute('position', new Float32BufferAttribute(px, 3));
  if (nx.length) g.setAttribute('normal', new Float32BufferAttribute(nx, 3));
  g.setIndex(new Uint32BufferAttribute(out, 1));
  g.computeVertexNormals();
  g.computeBoundingBox(); g.boundingSphere = null;
  return count - pos.count;
}

/** How many steps in from the rim `ringDistance` counts (it is stored as bytes). The outline's own feather needs three; the organ glow and the AO seat ramp across their whole hull (26 and 9 figure units, INK_FS), which on a
 *  mesh of 1 to 2.5 units a step is up to about 26 steps, so the count must reach past that or the ramp ends in a hard step where it stops. */
export const RING_CAP = 40;

/** Each vertex's number of steps in from the rim ring, 0 on the ring and `cap` (RING_CAP) at that or farther: the outline hull's outer edge is the pushed ring, and its coverage ramps from it (INK_FS, vRd), so the edge is
 *  anti-aliased by arithmetic where the canvas has no multisampling (a 2x screen: quality.ts). A mesh with no ring reads `cap` everywhere (no feather). */
export function ringDistance(g: BufferGeometry, cap = RING_CAP): Float32Array {
  const w = weld(g), ring = silhouetteRing(g, w), n = g.getAttribute('position').count, out = new Float32Array(n).fill(cap);
  if (ring.size < 8) return out;
  const d = new Int16Array(w.n).fill(-1);
  let front: number[] = [];
  for (const v of ring.keys()) { d[v] = 0; front.push(v); }
  for (let k = 1; k < cap && front.length; k++) {
    const next: number[] = [];
    for (const v of front) for (const u of w.nbr[v]!) if (d[u] === -1) { d[u] = k; next.push(u); }
    front = next;
  }
  for (let v = 0; v < w.n; v++) if (d[v]! >= 0) for (const i of w.verts[v]!) out[i] = d[v]!;
  return out;
}

/** The duodenum's per-vertex alpha: 0 at the free end (the end farthest from the stomach), rising by a smoothstep to 1 at `share` of the way along the tube. The ends are found by two sweeps over the surface. */
export function tailFade(g: BufferGeometry, stomach: BufferGeometry, share = 0.4): Float32Array {
  const w = weld(g), pos = g.getAttribute('position');
  const p3 = (v: number): [number, number, number] => { const i = w.verts[v]![0]!; return [pos.getX(i), pos.getY(i), pos.getZ(i)]; };
  const dijkstra = (src: number): Float64Array => {
    const d = new Float64Array(w.n).fill(Infinity); d[src] = 0;
    const heap: [number, number][] = [[0, src]];
    const push = (e: [number, number]) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p]![0] <= heap[i]![0]) break; [heap[p], heap[i]] = [heap[i]!, heap[p]!]; i = p; } };
    const pop = (): [number, number] => { const top = heap[0]!, last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l; if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i]!, heap[m]!]; i = m; } } return top; };
    while (heap.length) {
      const [du, u] = pop();
      if (du > d[u]!) continue;
      const a = p3(u);
      for (const v of w.nbr[u]!) { const b = p3(v), nd = du + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (nd < d[v]!) { d[v] = nd; push([nd, v]); } }
    }
    return d;
  };
  const far = (d: Float64Array) => { let m = 0; for (let v = 0; v < w.n; v++) if (Number.isFinite(d[v]!) && d[v]! > d[m]!) m = v; return m; };
  const A = far(dijkstra(0)), dA = dijkstra(A), B = far(dA);
  // the free end is the one farther (in the figure's plane) from any vertex of the stomach
  const sp = stomach.getAttribute('position');
  const near = (v: number) => { const [x, y] = p3(v); let m = Infinity; for (let i = 0; i < sp.count; i += 3) m = Math.min(m, Math.hypot(sp.getX(i) - x, sp.getY(i) - y)); return m; };
  const free = near(A) > near(B) ? A : B, dFree = free === A ? dA : dijkstra(B);
  const total = Math.max(...Array.from(dFree).filter(Number.isFinite)), L = share * total;
  const out = new Float32Array(pos.count);
  for (let v = 0; v < w.n; v++) { const t = Math.min(1, Math.max(0, dFree[v]! / L)), a = t * t * (3 - 2 * t); for (const i of w.verts[v]!) out[i] = a; }
  return out;
}
