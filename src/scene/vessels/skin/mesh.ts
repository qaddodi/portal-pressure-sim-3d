// The junction skin mesh (spec 4.5): one closed, welded fillet that starts exactly on each arm's seam ring and fills the junction. It is the convex hull of the
// rings (minus the rings' own caps), subdivided on a regular grid, projected onto the smooth union of the arms and relaxed. Pure: numbers in, typed arrays out; the
// only three.js it touches is `Vector3` and `ConvexHull`. Never marching cubes: an irregular mesh makes the cel bands wobble.
import { Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { SkinBuildError, type SkinCut, type SkinJunction, type SkinMesh, type Vec3 } from './types.ts';
import { ARM_REACH, closestOnArm, gradient, localRadius, sdUnionGrad, skinKOf, weights, type Capsule } from './sdf.ts';

/** The target edge length is `EDGE_SCALE` times the circumference spacing `2 pi R / ring size` of the arm nearest the edge: seam ring edges halve once, the long hull edges split until
 *  they match, and the thin branch's side gets finer triangles than the trunk's. (Spec 4.5.4 subdivides every hull face 3 times; measured on a synthetic Y that left slivers of 0.7 degrees,
 *  because a hull face between two rings is 7 times longer than a ring edge, so this refines the long way only.) */
export const EDGE_SCALE = 1.4;
/** Most refinement passes and most vertices before the build gives up with a `SkinBuildError`. */
export const MAX_REFINE_PASSES = 14;
export const MAX_VERTS = 12000;
/** The shrink-wrap (spec 4.5.5 and 4.5.6 together): the hull is a taut sheet over the junction and in a crotch it sits far outside the surface, so projecting it in one go piles
 *  its vertices up on the crease. Instead it is walked in `WRAP_ROUNDS` rounds, each moving a vertex `WRAP_STEP` of the way to the surface and `WRAP_SMOOTH` of the way to its
 *  neighbours' mean (tangentially), so the spacing stays even as it shrinks; then `POLISH_ROUNDS` more of the spec's relax-and-project. */
export const WRAP_LEVELS = 3;
/** Rounds and surface step at each level, coarsest first: the coarse level shrinks slowly so smoothing keeps up. */
export const WRAP_ROUNDS = [60, 20, 10];
export const WRAP_STEPS = [0.05, 0.2, 0.35];
export const WRAP_SMOOTH = 0.5;
export const POLISH_ROUNDS = 4;
/** Newton steps that put a vertex exactly on the surface at the end (spec 4.5.5). */
export const PROJECT_STEPS = 6;
export const GRADIENT_H = 0.05;
/** Edge flips, repeated: an edge flips when that raises the smaller of its two triangles' smallest angles by `FLIP_GAIN` (degrees) and keeps the two faces facing the same way. */
export const FLIP_PASSES = 3;
export const FLIP_GAIN_DEG = 1;
/** Rows of vertices from a seam over which the normal blends from the tube's to the SDF gradient (spec 4.5.7). */
export const NORMAL_BLEND_ROWS = 2;
/** The farthest a seam may be pushed out (spec 4.4). */
export const MAX_TRIES = 40;

export { SkinBuildError };

/** The hull of the rings, as outward triangles of vertex ids `ring * n + j` with every ring's own cap dropped, and whether it covers every ring (spec 4.5.1 to 4.5.3). */
export interface RingHull { faces: number[]; ok: boolean; why: string }

export function ringHull(rings: readonly Float32Array[]): RingHull {
  const A = rings.length, n = rings[0]!.length / 3, V = A * n;
  const fail = (why: string): RingHull => ({ faces: [], ok: false, why });
  if (A < 2 || rings.some((r) => r.length !== 3 * n)) return fail('rings must be the same size');
  const pts: Vector3[] = [], idOf = new Map<Vector3, number>();
  for (let a = 0; a < A; a++) for (let j = 0; j < n; j++) { const p = new Vector3(rings[a]![3 * j]!, rings[a]![3 * j + 1]!, rings[a]![3 * j + 2]!); pts.push(p); idOf.set(p, a * n + j); }
  const hull = new ConvexHull().setFromPoints(pts);
  if (!hull.faces.length) return fail('no hull');
  const centre = new Vector3();
  for (const p of pts) centre.add(p);
  centre.multiplyScalar(1 / pts.length);
  const onHull = new Uint8Array(V), faces: number[] = [];
  const tmpA = new Vector3(), tmpB = new Vector3(), tmpC = new Vector3();
  for (const f of hull.faces) {
    const ids: number[] = [];
    let e = f.edge;
    do { ids.push(idOf.get(e.head().point)!); e = e.next; } while (e !== f.edge);
    for (const id of ids) onHull[id] = 1;
    for (let t = 1; t < ids.length - 1; t++) {
      const tri = [ids[0]!, ids[t]!, ids[t + 1]!];
      if (tri.every((id) => Math.floor(id / n) === Math.floor(tri[0]! / n))) continue;   // one ring's own cap
      // outward winding: the face normal looks away from the middle of the hull
      tmpA.copy(pts[tri[0]!]!); tmpB.copy(pts[tri[1]!]!).sub(tmpA); tmpC.copy(pts[tri[2]!]!).sub(tmpA);
      const nrm = tmpB.cross(tmpC);
      const mid = tmpA.add(pts[tri[1]!]!).add(pts[tri[2]!]!).multiplyScalar(1 / 3).sub(centre);
      faces.push(...(nrm.dot(mid) >= 0 ? tri : [tri[0]!, tri[2]!, tri[1]!]));
    }
  }
  for (let v = 0; v < V; v++) if (!onHull[v]) return fail(`ring ${Math.floor(v / n)} vertex ${v % n} is inside the hull`);
  // every ring edge belongs to exactly one remaining face, every other edge to exactly two
  const count = new Map<number, number>(), key = (a: number, b: number) => (a < b ? a * V + b : b * V + a);
  for (let i = 0; i < faces.length; i += 3) for (let s = 0; s < 3; s++) { const k = key(faces[i + s]!, faces[i + (s + 1) % 3]!); count.set(k, (count.get(k) ?? 0) + 1); }
  const ringEdges = new Set<number>();
  for (let a = 0; a < A; a++) for (let j = 0; j < n; j++) ringEdges.add(key(a * n + j, a * n + ((j + 1) % n)));
  for (const k of ringEdges) if (count.get(k) !== 1) return fail('a ring edge is not on exactly one skin face');
  for (const [k, c] of count) if (!ringEdges.has(k) && c !== 2) return fail('the hull skin is not closed between the rings');
  return { faces, ok: true, why: '' };
}

/** Rule 4.4.3 for WP1's `chooseCuts`: does the hull of these seam rings (14 xyz each) cover every ring vertex and leave every ring edge on one face? */
export const hullCovers = (seamRings: readonly Float32Array[]): boolean => ringHull(seamRings).ok;

/** The tube's rest axis recovered from a seam ring alone, for callers that give no axes: a polyline J, ring centre, then straight on to `ARM_REACH` radii, at the ring's mean radius. */
function axisFromRing(ring: Float32Array, J: Vec3): Capsule {
  const n = ring.length / 3, c = [0, 0, 0];
  for (let j = 0; j < n; j++) for (let d = 0; d < 3; d++) c[d] += ring[3 * j + d]! / n;
  let R = 0;
  const nrm = [0, 0, 0];
  for (let j = 0; j < n; j++) {
    const a = [ring[3 * j]! - c[0]!, ring[3 * j + 1]! - c[1]!, ring[3 * j + 2]! - c[2]!], jj = (j + 1) % n;
    const b = [ring[3 * jj]! - c[0]!, ring[3 * jj + 1]! - c[1]!, ring[3 * jj + 2]! - c[2]!];
    R += Math.hypot(a[0]!, a[1]!, a[2]!) / n;
    nrm[0] += a[1]! * b[2]! - a[2]! * b[1]!; nrm[1] += a[2]! * b[0]! - a[0]! * b[2]!; nrm[2] += a[0]! * b[1]! - a[1]! * b[0]!;
  }
  const nl = Math.hypot(nrm[0]!, nrm[1]!, nrm[2]!) || 1;
  const out = [c[0]! - J[0], c[1]! - J[1], c[2]! - J[2]];
  const s = out[0]! * nrm[0]! + out[1]! * nrm[1]! + out[2]! * nrm[2]! < 0 ? -1 / nl : 1 / nl;
  const dir = [nrm[0]! * s, nrm[1]! * s, nrm[2]! * s];
  const reach = Math.max(ARM_REACH * R, Math.hypot(out[0]!, out[1]!, out[2]!) * 2);
  const pts = new Float64Array([J[0], J[1], J[2], c[0]!, c[1]!, c[2]!, c[0]! + dir[0]! * reach, c[1]! + dir[1]! * reach, c[2]! + dir[2]! * reach]);
  return { n: 3, pts, r: new Float64Array([R, R, R]) };
}

/**
 * The skin of one junction (spec 4.5). `seamRings[a]` and `seamNormals[a]` are arm `a`'s built tube ring at its cut: 14 vertices xyz, in the tube's ring order, and the
 * tube's own radial normals there. They are copied bit for bit into the skin, so there is no crack. `axes`, when given (`armCapsule` of each arm), shapes the fillet;
 * without them each arm's axis is recovered from its ring. Throws `SkinBuildError` when the hull misses a ring (spec 4.4.3).
 */
export function buildSkin(j: SkinJunction, cuts: SkinCut[], seamRings: readonly Float32Array[], seamNormals: readonly Float32Array[], axes?: readonly Capsule[]): SkinMesh {
  const A = j.arms.length, n = seamRings[0]!.length / 3;
  if (A < 2 || A > 4 || seamRings.length !== A || seamNormals.length !== A || cuts.length !== A) throw new SkinBuildError(j.node, 'needs 2 to 4 arms with a ring, a normal set and a cut each');
  const hull = ringHull(seamRings);
  if (!hull.ok) throw new SkinBuildError(j.node, `the hull misses the seam rings: ${hull.why}`);
  const caps = axes ?? seamRings.map((r) => axisFromRing(r, j.J));
  const k = skinKOf(j.arms), h = GRADIENT_H * k;

  // 1. the vertices: the rings first (id = arm * n + j, so seamVerts is just that), then midpoints
  const pos: number[] = [], fixed: number[] = [];   // fixed[v] = 1 on a seam ring or a seam edge
  const owner: number[] = [], tubeN: number[] = [];   // a seam vertex's arm (-1 for a free one) and the tube's normal there (a seam edge's midpoint takes the mean of its two ends')
  for (let a = 0; a < A; a++) for (let q = 0; q < n; q++) {
    pos.push(seamRings[a]![3 * q]!, seamRings[a]![3 * q + 1]!, seamRings[a]![3 * q + 2]!); fixed.push(1); owner.push(a);
    tubeN.push(seamNormals[a]![3 * q]!, seamNormals[a]![3 * q + 1]!, seamNormals[a]![3 * q + 2]!);
  }
  let tris = hull.faces.slice();
  const ekey = (a: number, b: number) => (a < b ? a * 1e7 + b : b * 1e7 + a);
  let ringEdge = new Set<number>();
  for (let a = 0; a < A; a++) for (let q = 0; q < n; q++) ringEdge.add(ekey(a * n + q, a * n + ((q + 1) % n)));

  // 2. refine the long way and shrink-wrap, coarse to fine: split every edge longer than its target (welded through a shared midpoint cache; ring edges stay ring edges, their
  //    midpoints on the chord), walk the free vertices onto the smooth union while smoothing them along it, then do it again at twice the resolution. Doing it in levels lets the
  //    spacing settle on a coarse mesh, where smoothing spreads vertices far in a few rounds (a crotch's sheet is mostly collapsed by the projection, and fine-mesh smoothing is too slow to undo it)
  const tau = (2 * Math.PI) / n;
  let V = pos.length / 3;
  const refine = (scale: number) => {
    for (let pass = 0; ; pass++) {
      const mid = new Map<number, number>(), want = new Set<number>(), seen = new Set<number>();
      for (let i = 0; i < tris.length; i += 3) for (let s = 0; s < 3; s++) {
        const a = tris[i + s]!, b = tris[i + (s + 1) % 3]!, kk = ekey(a, b);
        if (seen.has(kk)) continue;
        seen.add(kk);
        const dx = pos[3 * a]! - pos[3 * b]!, dy = pos[3 * a + 1]! - pos[3 * b + 1]!, dz = pos[3 * a + 2]! - pos[3 * b + 2]!;
        const R = localRadius(caps, (pos[3 * a]! + pos[3 * b]!) / 2, (pos[3 * a + 1]! + pos[3 * b + 1]!) / 2, (pos[3 * a + 2]! + pos[3 * b + 2]!) / 2);
        if (Math.hypot(dx, dy, dz) > scale * tau * R) want.add(kk);
      }
      if (!want.size) break;
      if (pass >= MAX_REFINE_PASSES || pos.length / 3 > MAX_VERTS) throw new SkinBuildError(j.node, 'refinement did not settle');
      const nextRing = new Set<number>();
      const midOf = (a: number, b: number): number => {
        const kk = ekey(a, b);
        let m = mid.get(kk);
        if (m === undefined) {
          m = pos.length / 3;
          pos.push((pos[3 * a]! + pos[3 * b]!) / 2, (pos[3 * a + 1]! + pos[3 * b + 1]!) / 2, (pos[3 * a + 2]! + pos[3 * b + 2]!) / 2);
          const onRing = ringEdge.has(kk);
          fixed.push(onRing ? 1 : 0); owner.push(onRing ? owner[a]! : -1);
          if (onRing) { const nx = tubeN[3 * a]! + tubeN[3 * b]!, ny = tubeN[3 * a + 1]! + tubeN[3 * b + 1]!, nz = tubeN[3 * a + 2]! + tubeN[3 * b + 2]!, nl = Math.hypot(nx, ny, nz) || 1; tubeN.push(nx / nl, ny / nl, nz / nl); nextRing.add(ekey(a, m)); nextRing.add(ekey(m, b)); }
          else tubeN.push(0, 0, 0);
          mid.set(kk, m);
        }
        return m;
      };
      const dist = (a: number, b: number) => Math.hypot(pos[3 * a]! - pos[3 * b]!, pos[3 * a + 1]! - pos[3 * b + 1]!, pos[3 * a + 2]! - pos[3 * b + 2]!);
      const next: number[] = [];
      for (let i = 0; i < tris.length; i += 3) {
        const v = [tris[i]!, tris[i + 1]!, tris[i + 2]!], m = [0, 1, 2].map((s) => want.has(ekey(v[s]!, v[(s + 1) % 3]!)));
        const cnt = +m[0]! + +m[1]! + +m[2]!;
        if (cnt === 0) { next.push(v[0]!, v[1]!, v[2]!); continue; }
        // rotate so the marked edges come first: edge s runs from v[s] to v[s+1]
        let r = 0;
        if (cnt === 1) r = m[0] ? 0 : m[1] ? 1 : 2;
        else if (cnt === 2) r = !m[2] ? 0 : !m[0] ? 1 : 2;
        const [p, q, w] = [v[r]!, v[(r + 1) % 3]!, v[(r + 2) % 3]!];
        if (cnt === 1) { const mm = midOf(p, q); next.push(p, mm, w, mm, q, w); }
        else if (cnt === 2) {
          // marked p-q and q-w, common vertex q: the corner triangle, and the quad p, m1, m2, w cut on its shorter diagonal
          const m1 = midOf(p, q), m2 = midOf(q, w);
          next.push(m1, q, m2);
          if (dist(p, m2) < dist(m1, w)) next.push(p, m1, m2, p, m2, w); else next.push(p, m1, w, m1, m2, w);
        } else { const m0 = midOf(p, q), m1 = midOf(q, w), m2 = midOf(w, p); next.push(p, m0, m2, m0, q, m1, m2, m1, w, m0, m1, m2); }
      }
      tris = next; ringEdge = nextRing;
    }
    V = pos.length / 3;
  };

  // adjacency (CSR), rebuilt whenever the triangles change
  let deg = new Int32Array(V + 1), adj = new Int32Array(0);
  const buildAdj = () => {
    deg = new Int32Array(V + 1);
    const seen = new Set<number>(), edges: number[] = [];
    for (let i = 0; i < tris.length; i += 3) for (let s = 0; s < 3; s++) {
      const a = tris[i + s]!, b = tris[i + (s + 1) % 3]!, kk = ekey(a, b);
      if (!seen.has(kk)) { seen.add(kk); edges.push(a, b); deg[a + 1]!++; deg[b + 1]!++; }
    }
    for (let v = 0; v < V; v++) deg[v + 1] = deg[v + 1]! + deg[v]!;
    adj = new Int32Array(deg[V]!);
    const fill = deg.slice(0, V);
    for (let e = 0; e < edges.length; e += 2) { const a = edges[e]!, b = edges[e + 1]!; adj[fill[a]!++] = b; adj[fill[b]!++] = a; }
  };

  const g = new Float64Array(3);
  let nextPos = new Float64Array(0);
  // one round: each free vertex moves `lambda` of the way to its neighbours' mean (tangentially) and `step` of the way to the surface
  const smoothMove = (lambda: number, step: number) => {
    if (nextPos.length < 3 * V) nextPos = new Float64Array(3 * V);
    for (let v = 0; v < V; v++) {
      if (fixed[v]) continue;
      const x = pos[3 * v]!, y = pos[3 * v + 1]!, z = pos[3 * v + 2]!, c = deg[v + 1]! - deg[v]!;
      let mx = 0, my = 0, mz = 0;
      for (let q = deg[v]!; q < deg[v + 1]!; q++) { const u = adj[q]!; mx += pos[3 * u]!; my += pos[3 * u + 1]!; mz += pos[3 * u + 2]!; }
      let dx = mx / c - x, dy = my / c - y, dz = mz / c - z;
      const sd = sdUnionGrad(caps, k, x, y, z, g), gg = g[0]! * g[0]! + g[1]! * g[1]! + g[2]! * g[2]!;
      if (gg < 1e-14) { nextPos[3 * v] = x; nextPos[3 * v + 1] = y; nextPos[3 * v + 2] = z; continue; }
      const gl = Math.sqrt(gg), nx = g[0]! / gl, ny = g[1]! / gl, nz = g[2]! / gl, dn = dx * nx + dy * ny + dz * nz;
      dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;   // tangential only
      const f = (step * sd) / gg;
      nextPos[3 * v] = x + lambda * dx - f * g[0]!; nextPos[3 * v + 1] = y + lambda * dy - f * g[1]!; nextPos[3 * v + 2] = z + lambda * dz - f * g[2]!;
    }
    for (let v = 0; v < V; v++) if (!fixed[v]) { pos[3 * v] = nextPos[3 * v]!; pos[3 * v + 1] = nextPos[3 * v + 1]!; pos[3 * v + 2] = nextPos[3 * v + 2]!; }
  };
  const project = (steps: number) => {
    for (let v = 0; v < V; v++) {
      if (fixed[v]) continue;
      let x = pos[3 * v]!, y = pos[3 * v + 1]!, z = pos[3 * v + 2]!;
      for (let s = 0; s < steps; s++) {
        const d = sdUnionGrad(caps, k, x, y, z, g), gg = g[0]! * g[0]! + g[1]! * g[1]! + g[2]! * g[2]!;
        if (gg < 1e-14) break;
        const f = d / gg; x -= f * g[0]!; y -= f * g[1]!; z -= f * g[2]!;
      }
      pos[3 * v] = x; pos[3 * v + 1] = y; pos[3 * v + 2] = z;
    }
  };
  for (let lvl = WRAP_LEVELS - 1; lvl >= 0; lvl--) {
    refine(EDGE_SCALE * 2 ** lvl);
    buildAdj();
    for (let r = 0; r < WRAP_ROUNDS[WRAP_LEVELS - 1 - lvl]!; r++) smoothMove(WRAP_SMOOTH, WRAP_STEPS[WRAP_LEVELS - 1 - lvl]!);
    if (lvl > 0) project(1);
  }
  project(PROJECT_STEPS);
  const polish = () => { for (let r = 0; r < POLISH_ROUNDS; r++) { smoothMove(WRAP_SMOOTH, 0); project(1); } };
  polish();
  for (let f = 0; f < FLIP_PASSES; f++) { if (!flipEdges(tris, pos, ringEdge, ekey, deg)) break; buildAdj(); polish(); }

  // 4. rows from the seam (multi-source breadth first), carrying the nearest seam vertex with it
  const row = new Int32Array(V).fill(-1), src = new Int32Array(V).fill(-1), queue: number[] = [];
  for (let v = 0; v < V; v++) if (fixed[v]) { row[v] = 0; src[v] = v; queue.push(v); }
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head]!;
    for (let q = deg[v]!; q < deg[v + 1]!; q++) { const u = adj[q]!; if (row[u]! < 0) { row[u] = row[v]! + 1; src[u] = src[v]!; queue.push(u); } }
  }

  // 5. normals, weights, rest radius, nearest axis point
  const position = new Float32Array(3 * V), normal = new Float32Array(3 * V), cen = new Float32Array(3 * V), weight = new Float32Array(4 * V), restR = new Float32Array(V);
  const w = new Float64Array(4), cp = new Float64Array(7);
  for (let v = 0; v < V; v++) {
    const x = pos[3 * v]!, y = pos[3 * v + 1]!, z = pos[3 * v + 2]!;
    // seam rings are the tube's own float32 vertices, copied exactly
    if (v < A * n) { const a = Math.floor(v / n), q = v % n; position[3 * v] = seamRings[a]![3 * q]!; position[3 * v + 1] = seamRings[a]![3 * q + 1]!; position[3 * v + 2] = seamRings[a]![3 * q + 2]!; }
    else { position[3 * v] = x; position[3 * v + 1] = y; position[3 * v + 2] = z; }
    // the normal: the SDF's gradient, eased from the nearest seam vertex's tube normal over the first rows (spec 4.5.7)
    sdUnionGrad(caps, k, x, y, z, g);
    const gl = Math.hypot(g[0]!, g[1]!, g[2]!) || 1;
    let nx = g[0]! / gl, ny = g[1]! / gl, nz = g[2]! / gl;
    const rw = row[v]!;
    if (rw < NORMAL_BLEND_ROWS) {
      const t = rw / NORMAL_BLEND_ROWS, sv = src[v]!;
      const tx = tubeN[3 * sv]!, ty = tubeN[3 * sv + 1]!, tz = tubeN[3 * sv + 2]!;
      nx = tx + (nx - tx) * t; ny = ty + (ny - ty) * t; nz = tz + (nz - tz) * t;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    }
    normal[3 * v] = nx; normal[3 * v + 1] = ny; normal[3 * v + 2] = nz;
    weights(caps, k, x, y, z, w);
    // a seam vertex belongs wholly to its own arm: the blend is off there (spec 4.4.1)
    const own = owner[v]!;
    if (own >= 0) for (let i = 0; i < 4; i++) w[i] = i === own ? 1 : 0;
    let top = 0;
    for (let i = 0; i < A; i++) if (w[i]! > w[top]!) top = i;
    let rr = 0;
    for (let i = 0; i < A; i++) { weight[4 * v + i] = w[i]!; if (w[i]! > 0) { closestOnArm(caps[i]!, x, y, z, cp); rr += w[i]! * cp[3]!; } }
    restR[v] = rr;
    closestOnArm(caps[top]!, x, y, z, cp);
    cen[3 * v] = cp[0]!; cen[3 * v + 1] = cp[1]!; cen[3 * v + 2] = cp[2]!;
  }
  const seamVerts: Uint32Array[] = [];
  for (let a = 0; a < A; a++) { const ids = new Uint32Array(n); for (let q = 0; q < n; q++) ids[q] = a * n + q; seamVerts.push(ids); }
  return { junction: j, cuts, position, normal, cen, weight, restR, index: Uint32Array.from(tris), seamVerts };
}

/** The smallest angle (degrees) of triangle a, b, c. */
export function minAngleDeg(pos: ArrayLike<number>, a: number, b: number, c: number): number {
  const P = [a, b, c];
  let lo = 180;
  for (let q = 0; q < 3; q++) {
    const o = P[q]!, p = P[(q + 1) % 3]!, r = P[(q + 2) % 3]!;
    const ux = pos[3 * p]! - pos[3 * o]!, uy = pos[3 * p + 1]! - pos[3 * o + 1]!, uz = pos[3 * p + 2]! - pos[3 * o + 2]!, vx = pos[3 * r]! - pos[3 * o]!, vy = pos[3 * r + 1]! - pos[3 * o + 1]!, vz = pos[3 * r + 2]! - pos[3 * o + 2]!;
    const cs = (ux * vx + uy * vy + uz * vz) / ((Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz)) || 1);
    lo = Math.min(lo, (Math.acos(Math.max(-1, Math.min(1, cs))) * 180) / Math.PI);
  }
  return lo;
}

/** One pass of edge flips (in place on `tris`): true when any edge flipped. Ring edges never flip, and neither does an edge whose flip would fold the surface or double an edge. */
function flipEdges(tris: number[], pos: number[], ringEdge: Set<number>, ekey: (a: number, b: number) => number, deg: Int32Array): boolean {
  const owner = new Map<number, [number, number]>();   // edge -> the triangle on each side (index of triangle start in tris)
  for (let i = 0; i < tris.length; i += 3) for (let s = 0; s < 3; s++) {
    const kk = ekey(tris[i + s]!, tris[i + (s + 1) % 3]!), e = owner.get(kk);
    if (!e) owner.set(kk, [i, -1]); else e[1] = i;
  }
  const valence = Int32Array.from(deg.subarray(1).map((d, i) => d - deg[i]!));
  const dead = new Set<number>();
  let flipped = false;
  const normal = (a: number, b: number, c: number) => {
    const ux = pos[3 * b]! - pos[3 * a]!, uy = pos[3 * b + 1]! - pos[3 * a + 1]!, uz = pos[3 * b + 2]! - pos[3 * a + 2]!, vx = pos[3 * c]! - pos[3 * a]!, vy = pos[3 * c + 1]! - pos[3 * a + 1]!, vz = pos[3 * c + 2]! - pos[3 * a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  for (const [kk, [t1, t2]] of owner) {
    if (t2 < 0 || ringEdge.has(kk) || dead.has(t1) || dead.has(t2)) continue;
    // find the edge (a, b) in t1 and the opposite vertices c (in t1) and d (in t2)
    let a = 0, b = 0, c = 0;
    for (let s = 0; s < 3; s++) if (ekey(tris[t1 + s]!, tris[t1 + (s + 1) % 3]!) === kk) { a = tris[t1 + s]!; b = tris[t1 + (s + 1) % 3]!; c = tris[t1 + (s + 2) % 3]!; }
    let d = -1;
    for (let s = 0; s < 3; s++) { const x = tris[t2 + s]!; if (x !== a && x !== b) d = x; }
    if (d < 0 || valence[a]! <= 3 || valence[b]! <= 3) continue;
    const before = Math.min(minAngleDeg(pos, a, b, c), minAngleDeg(pos, b, a, d)), after = Math.min(minAngleDeg(pos, a, d, c), minAngleDeg(pos, d, b, c));
    if (after < before + FLIP_GAIN_DEG) continue;
    // keep the surface from folding: the new faces must face as the old ones did
    const n1 = normal(a, b, c), n2 = normal(b, a, d), m1 = normal(a, d, c), m2 = normal(d, b, c);
    const dot = (p: number[], q: number[]) => p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!;
    if (dot(n1, m1) < 0.7 || dot(n1, m2) < 0.7 || dot(n2, m1) < 0.7 || dot(n2, m2) < 0.7) continue;
    // (the new edge must not already exist)
    if (owner.has(ekey(c, d))) continue;
    tris[t1] = a; tris[t1 + 1] = d; tris[t1 + 2] = c;
    tris[t2] = d; tris[t2 + 1] = b; tris[t2 + 2] = c;
    dead.add(t1); dead.add(t2); valence[a]!--; valence[b]!--; valence[c]!++; valence[d]!++;
    flipped = true;
  }
  return flipped;
}
