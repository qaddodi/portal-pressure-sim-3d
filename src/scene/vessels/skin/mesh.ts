// The junction skin mesh (spec 4.5): one closed, welded fillet that starts exactly on each arm's seam ring and fills the junction. It is the convex hull of the
// rings (minus the rings' own caps), subdivided on a regular grid, projected onto the smooth union of the arms and relaxed. Pure: numbers in, typed arrays out; the
// only three.js it touches is `Vector3` and `ConvexHull`. Never marching cubes: an irregular mesh makes the cel bands wobble.
import { Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { SKIN_GROWERS, SkinBuildError, type GrowMorph, type SkinCut, type SkinJunction, type SkinMesh, type Vec3 } from './types.ts';
import { ARM_REACH, MAX_SKIN_ARMS, closestOnArm, gradient, localRadius, sdUnionGrad, skinKOf, weights, type Capsule } from './sdf.ts';

/** The target edge length is `EDGE_SCALE` times the circumference spacing `2 pi R / ring size` of the arm nearest the edge, so the skin's triangles are the size of the tube's own around
 *  a ring, and the thin branch's side gets finer ones than the trunk's.
 *  Spec 4.5.4 subdivides every hull face 3 times and 4.5.5 projects the result. Measured on a synthetic Y that left slivers of 0.7 degrees (a hull face between two rings is 7 times
 *  longer than a ring edge, and uniform subdivision keeps its shape), and on a thin T the hull sheet bridges the crotch far outside the surface and the projection piled it onto the crease.
 *  So the hull is only the first guess at the skin's topology: it is then remeshed (split what is too long, collapse what is too short, flip toward good angles, smooth along the
 *  surface, project), which keeps the seam rings and the welded, closed topology of the spec but makes the triangles even. */
export const EDGE_SCALE = 1.1;
/** An edge splits when longer than `SPLIT_AT` targets and collapses when shorter than `COLLAPSE_AT`. (Isotropic remeshing uses 4/3 and 4/5; halves of a split are 2/3 of a target, so 4/5 collapses
 *  them again and the mesh churns. A collapse is also refused when it would leave an edge past `SPLIT_AT`.) */
export const SPLIT_AT = 4 / 3;
export const COLLAPSE_AT = 0.6;
/** Remeshing rounds, and the most vertices before the build gives up with a `SkinBuildError`. */
export const REMESH_ROUNDS = 16;
/** Collapse passes per round (a pass collapses an independent set of edges only). */
export const COLLAPSE_PASSES = 6;
/** The remesh stops once a round changes no more than this share of the triangles (after the shrink). */
export const SETTLED = 0.02;
/** The first `SHRINK_ROUNDS` rounds pull each vertex `SHRINK_PULL` of the way to the surface per round (the sheet shrinks over them); the polish rounds pull all the way. */
export const SHRINK_ROUNDS = 6;
export const SHRINK_PULL = 0.5;
/** The gentle schedule for a sheet that starts far from the surface (seams many radii from the junction: the long hull faces fold if pulled in at the usual rate): a third of the pull for 20 rounds, 40 in all. */
export const GENTLE: BuildPace = { rounds: 40, shrinkRounds: 20, pull: 0.3 };
/** How fast the remesh pulls the hull sheet onto the surface. */
export interface BuildPace { rounds: number; shrinkRounds: number; pull: number }
/** The slowest schedule, for a sheet that starts very far from the surface (five arms spread along a long host: the cava's three hepatic veins, 9 radii of cava in the skin): a seventh of the pull for 30 rounds, 48 in all. The quick schedule folds there and `GENTLE` leaves 8 triangles folded. */
export const SLOW: BuildPace = { rounds: 48, shrinkRounds: 30, pull: 0.15 };
export const MAX_VERTS = 12000;
/** Tangential smoothing per round: how far a free vertex moves toward its neighbours' mean, and the final rounds of smoothing and projecting (spec 4.5.6). */
export const SMOOTH_LAMBDA = 0.6;
export const POLISH_ROUNDS = 2;
/** Newton steps that put a vertex on the surface (spec 4.5.5), and the central-difference step as a share of k. */
export const PROJECT_STEPS = 6;
/** A closed growing arm's rows are laid on the trunk's wall from this weight of the arm (over the next FOOT_SPAN), and relaxed over it FOOT_RELAX rounds with the fillet round them held. */
export const FOOT_FROM = 0.3;
export const FOOT_SPAN = 0.4;
export const FOOT_RELAX = 120;
export const FOOT_PROJECT_EVERY = 4;
export const FOOT_DRAW_MAX = 0.8;
const smooth01 = (t: number): number => { const u = t < 0 ? 0 : t > 1 ? 1 : t; return u * u * (3 - 2 * u); };
export const GRADIENT_H = 0.05;
/** Edge flips: an edge flips when that raises the sine of the smaller of its two triangles' smallest angles by `FLIP_GAIN` times and keeps the two faces facing the same way. */
export const FLIP_GAIN = 1.05;
/** Rows of vertices from a seam over which the normal blends from the tube's to the SDF gradient (spec 4.5.7). */
export const NORMAL_BLEND_ROWS = 2;
/** Shading normals across a ridge: a vertex whose normal is more than `CREASE_DEG` from a neighbour's is eased `CREASE_EASE` of the way to its neighbours' mean, `CREASE_ROUNDS` times. A round tube's neighbouring rings differ by about 26 degrees (14 sides), so 35 leaves every plain stretch exact. */
export const CREASE_DEG = 35;
export const CREASE_EASE = 0.6;
export const CREASE_ROUNDS = 6;
/** The farthest a seam may be pushed out (spec 4.4). */
export const MAX_TRIES = 40;
/** A vertex of the second shape that is this close to the closing arm's axis (in that arm's radii) is on its thread, where the surface has no direction: it keeps the normal it had. */
export const THREAD_R = 0.05;

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

/** `buildSkin` with the schedules tried in turn on a fold (the surface doubling back on itself, which a sheet pulled onto the surface too fast does): the usual one, then `GENTLE`, then `SLOW`. The first that closes is the skin; the last error stands if none does.
 *  Every junction that closed at the usual pace is built exactly as before. `memo` (node -> the rung that closed) starts the next build of a node at its own rung and not at the top: the cava's skin folds twice before it closes, 1.6 s of a rebuild that
 *  every later rebuild of it would repeat. */
export const PACES: readonly (BuildPace | undefined)[] = [undefined, GENTLE, SLOW];
export function buildSkinSteady(j: SkinJunction, cuts: SkinCut[], seamRings: readonly Float32Array[], seamNormals: readonly Float32Array[], axes?: readonly Capsule[], maxVerts: number = MAX_VERTS, memo?: Map<string, number>): SkinMesh {
  let last: unknown;
  for (let i = memo?.get(j.node) ?? 0; i < PACES.length; i++) {
    try { const m = buildSkin(j, cuts, seamRings, seamNormals, axes, maxVerts, PACES[i]); memo?.set(j.node, i); return m; }
    catch (e) { last = e; if (!(e instanceof SkinBuildError) || !e.message.includes('folds')) throw e; }
  }
  throw last;
}

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
  // the axis begins at the foot of J on the ring's axis line when that is behind the ring (an arm that leaves a trunk's side runs on from the trunk's axis, not from J), else at J
  const ahead = out[0]! * dir[0]! + out[1]! * dir[1]! + out[2]! * dir[2]!;
  const p0 = ahead > 0 ? [c[0]! - dir[0]! * ahead, c[1]! - dir[1]! * ahead, c[2]! - dir[2]! * ahead] : [J[0], J[1], J[2]];
  const reach = Math.max(ARM_REACH * R, Math.hypot(out[0]!, out[1]!, out[2]!) * 2);
  const pts = new Float64Array([p0[0]!, p0[1]!, p0[2]!, c[0]!, c[1]!, c[2]!, c[0]! + dir[0]! * reach, c[1]! + dir[1]! * reach, c[2]! + dir[2]! * reach]);
  return { n: 3, pts, r: new Float64Array([R, R, R]) };
}

/**
 * The skin of one junction (spec 4.5). `seamRings[a]` and `seamNormals[a]` are arm `a`'s built tube ring at its cut: 14 vertices xyz, in the tube's ring order, and the
 * tube's own radial normals there. They are copied bit for bit into the skin, so there is no crack. `axes`, when given (`armCapsule` of each arm), shapes the fillet;
 * without them each arm's axis is recovered from its ring. Throws `SkinBuildError` when the hull misses a ring (spec 4.4.3).
 */
export function buildSkin(j: SkinJunction, cuts: SkinCut[], seamRings: readonly Float32Array[], seamNormals: readonly Float32Array[], axes?: readonly Capsule[], maxVerts: number = MAX_VERTS, pace?: BuildPace): SkinMesh {
  const A = j.arms.length, n = seamRings[0]!.length / 3, S = A * n;   // S: the ring vertices, ids 0..S-1 (arm * n + j), fixed for ever
  if (A < 2 || A > MAX_SKIN_ARMS || seamRings.length !== A || seamNormals.length !== A || cuts.length !== A) throw new SkinBuildError(j.node, 'needs 2 to 6 arms with a ring, a normal set and a cut each');
  const hull = ringHull(seamRings);
  if (!hull.ok) throw new SkinBuildError(j.node, `the hull misses the seam rings: ${hull.why}`);
  const caps = axes ?? seamRings.map((r) => axisFromRing(r, j.J));
  const k = skinKOf(j.arms), h = GRADIENT_H * k, tau = (2 * Math.PI) / n;
  const ekey = (a: number, b: number) => (a < b ? a * 1e7 + b : b * 1e7 + a);

  // the guess at the topology: the vertices are the rings, the triangles the hull's
  const pos: number[] = [];
  for (let a = 0; a < A; a++) for (let q = 0; q < n; q++) pos.push(seamRings[a]![3 * q]!, seamRings[a]![3 * q + 1]!, seamRings[a]![3 * q + 2]!);
  let tris = hull.faces.slice();
  const ringEdge = new Set<number>();   // the seam edges: never split, collapsed or flipped
  for (let a = 0; a < A; a++) for (let q = 0; q < n; q++) ringEdge.add(ekey(a * n + q, a * n + ((q + 1) % n)));
  const g = new Float64Array(3);
  const dist = (a: number, b: number) => Math.hypot(pos[3 * a]! - pos[3 * b]!, pos[3 * a + 1]! - pos[3 * b + 1]!, pos[3 * a + 2]! - pos[3 * b + 2]!);
  const target = (a: number, b: number) => EDGE_SCALE * tau * localRadius(caps, (pos[3 * a]! + pos[3 * b]!) / 2, (pos[3 * a + 1]! + pos[3 * b + 1]!) / 2, (pos[3 * a + 2]! + pos[3 * b + 2]!) / 2);
  const triNormal = (a: number, b: number, c: number, out: number[]) => {
    const ux = pos[3 * b]! - pos[3 * a]!, uy = pos[3 * b + 1]! - pos[3 * a + 1]!, uz = pos[3 * b + 2]! - pos[3 * a + 2]!, vx = pos[3 * c]! - pos[3 * a]!, vy = pos[3 * c + 1]! - pos[3 * a + 1]!, vz = pos[3 * c + 2]! - pos[3 * a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
  };
  /** Project vertex `v` onto the smooth union with `steps` Newton steps. */
  const project = (v: number, steps: number) => {
    let x = pos[3 * v]!, y = pos[3 * v + 1]!, z = pos[3 * v + 2]!;
    for (let s = 0; s < steps; s++) {
      const d = sdUnionGrad(caps, k, x, y, z, g), gg = g[0]! * g[0]! + g[1]! * g[1]! + g[2]! * g[2]!;
      if (gg < 1e-14) break;
      const f = d / gg; x -= f * g[0]!; y -= f * g[1]!; z -= f * g[2]!;
    }
    pos[3 * v] = x; pos[3 * v + 1] = y; pos[3 * v + 2] = z;
  };

  // --- remeshing operations. Each works on `tris` (flat, outward) and leaves the mesh closed, welded and the seam rings untouched.
  /** Drop the vertices no triangle uses (collapsed away), keeping the order and the ring ids (the first S), and renumber the triangles. */
  const dropUnused = () => {
    const V = pos.length / 3, used = new Uint8Array(V);
    for (let i = 0; i < tris.length; i++) used[tris[i]!] = 1;
    for (let v = 0; v < S; v++) used[v] = 1;
    const remap = new Int32Array(V).fill(-1), np: number[] = [];
    for (let v = 0; v < V; v++) if (used[v]) { remap[v] = np.length / 3; np.push(pos[3 * v]!, pos[3 * v + 1]!, pos[3 * v + 2]!); }
    if (np.length === pos.length) return;
    pos.length = 0; for (const x of np) pos.push(x);
    tris = tris.map((v) => remap[v]!);
  };
  /** Split every free-to-split edge longer than SPLIT_AT targets at its midpoint (red-green: 1, 2 or 3 split edges in a triangle each have a conforming pattern). Returns how many split. */
  const split = (): number => {
    const want = new Set<number>(), seen = new Set<number>();
    for (let i = 0; i < tris.length; i += 3) for (let s = 0; s < 3; s++) {
      const a = tris[i + s]!, b = tris[i + (s + 1) % 3]!, kk = ekey(a, b);
      if (seen.has(kk)) continue;
      seen.add(kk);
      if (!ringEdge.has(kk) && dist(a, b) > SPLIT_AT * target(a, b)) want.add(kk);
    }
    if (!want.size) return 0;
    // (the vertices the collapses left unused count for nothing: the first round splits the hull's long triangles into a thousand and the collapses take most away again, so they are dropped
    // before the limit is judged. A runaway remesh is one that is LIVE past it.)
    if (pos.length / 3 + want.size > maxVerts) {
      dropUnused();
      if (pos.length / 3 + want.size > maxVerts) throw new SkinBuildError(j.node, 'the mesh grew past its vertex limit');
      return split();
    }
    const mid = new Map<number, number>();
    const midOf = (a: number, b: number): number => {
      const kk = ekey(a, b);
      let m = mid.get(kk);
      if (m === undefined) { m = pos.length / 3; pos.push((pos[3 * a]! + pos[3 * b]!) / 2, (pos[3 * a + 1]! + pos[3 * b + 1]!) / 2, (pos[3 * a + 2]! + pos[3 * b + 2]!) / 2); mid.set(kk, m); }
      return m;
    };
    const next: number[] = [];
    for (let i = 0; i < tris.length; i += 3) {
      const v = [tris[i]!, tris[i + 1]!, tris[i + 2]!], m = [0, 1, 2].map((s) => want.has(ekey(v[s]!, v[(s + 1) % 3]!)));
      const cnt = +m[0]! + +m[1]! + +m[2]!;
      if (cnt === 0) { next.push(v[0]!, v[1]!, v[2]!); continue; }
      let r = 0;   // rotate so the marked edges come first (edge s runs from v[s] to v[s+1])
      if (cnt === 1) r = m[0] ? 0 : m[1] ? 1 : 2;
      else if (cnt === 2) r = !m[2] ? 0 : !m[0] ? 1 : 2;
      const [p, q, w] = [v[r]!, v[(r + 1) % 3]!, v[(r + 2) % 3]!];
      if (cnt === 1) { const mm = midOf(p, q); next.push(p, mm, w, mm, q, w); }
      else if (cnt === 2) {
        const m1 = midOf(p, q), m2 = midOf(q, w);   // marked p-q and q-w: the corner triangle, and the quad p, m1, m2, w cut on its shorter diagonal
        next.push(m1, q, m2);
        if (dist(p, m2) < dist(m1, w)) next.push(p, m1, m2, p, m2, w); else next.push(p, m1, w, m1, m2, w);
      } else { const m0 = midOf(p, q), m1 = midOf(q, w), m2 = midOf(w, p); next.push(p, m0, m2, m0, q, m1, m2, m1, w, m0, m1, m2); }
    }
    tris = next;
    return want.size;
  };

  /** Collapse edges shorter than COLLAPSE_AT targets, one vertex into the other (a free one into a seam vertex, or two free ones into their midpoint), where that keeps the mesh a closed
   *  manifold (the link condition) and flips no face. Vertices touched are locked for the pass so the data it reads stays true. Returns how many collapsed. */
  const collapse = (): number => {
    const V = pos.length / 3, vt: number[][] = Array.from({ length: V }, () => []);
    for (let i = 0; i < tris.length; i += 3) for (let s = 0; s < 3; s++) vt[tris[i + s]!]!.push(i);
    const cand: [number, number, number][] = [], seen = new Set<number>();
    for (let i = 0; i < tris.length; i += 3) for (let s = 0; s < 3; s++) {
      const a = tris[i + s]!, b = tris[i + (s + 1) % 3]!, kk = ekey(a, b);
      if (seen.has(kk)) continue;
      seen.add(kk);
      if (ringEdge.has(kk) || (a < S && b < S)) continue;
      const l = dist(a, b);
      if (l < COLLAPSE_AT * target(a, b)) cand.push([l, a, b]);
    }
    if (!cand.length) return 0;
    cand.sort((x, y) => x[0] - y[0]);
    const locked = new Uint8Array(V), dead = new Uint8Array(tris.length / 3), n0 = [0, 0, 0], n1 = [0, 0, 0];
    let any = 0;
    for (const [, a0, b0] of cand) {
      if (locked[a0] || locked[b0]) continue;
      // `r` goes, `q` stays
      let r = a0, q = b0;
      if (r < S) { r = b0; q = a0; }
      const rt = vt[r]!, qt = vt[q]!;
      const both = rt.filter((t) => qt.includes(t));
      if (both.length !== 2) continue;
      const nr = new Set<number>(), nq = new Set<number>();
      for (const t of rt) for (let s = 0; s < 3; s++) if (tris[t + s] !== r) nr.add(tris[t + s]!);
      for (const t of qt) for (let s = 0; s < 3; s++) if (tris[t + s] !== q) nq.add(tris[t + s]!);
      let common = 0;
      for (const x of nr) if (nq.has(x)) common++;
      if (common !== 2) continue;   // the link condition
      // where q ends up, and that no surviving face of r flips or collapses to a sliver
      const old = [pos[3 * q]!, pos[3 * q + 1]!, pos[3 * q + 2]!];
      if (q >= S) { pos[3 * q] = (pos[3 * q]! + pos[3 * r]!) / 2; pos[3 * q + 1] = (pos[3 * q + 1]! + pos[3 * r + 1]!) / 2; pos[3 * q + 2] = (pos[3 * q + 2]! + pos[3 * r + 2]!) / 2; }
      let ok = true;
      for (const x of nr) if (!nq.has(x) && x !== q && dist(q, x) > SPLIT_AT * target(q, x)) { ok = false; break; }   // (q has moved to the merge point already)
      if (ok) for (const t of rt) {
        if (both.includes(t)) continue;
        const [x, y, z] = [tris[t]!, tris[t + 1]!, tris[t + 2]!];
        triNormal(x, y, z, n0);
        const sw = (v: number) => (v === r ? q : v);
        triNormal(sw(x), sw(y), sw(z), n1);
        if (n0[0]! * n1[0]! + n0[1]! * n1[1]! + n0[2]! * n1[2]! < 0.3) { ok = false; break; }   // (n0 is read with r still at its place; q has not moved for it)
      }
      if (!ok) { pos[3 * q] = old[0]!; pos[3 * q + 1] = old[1]!; pos[3 * q + 2] = old[2]!; continue; }
      for (const t of rt) {
        if (both.includes(t)) { dead[t / 3] = 1; continue; }
        for (let s = 0; s < 3; s++) if (tris[t + s] === r) tris[t + s] = q;
        qt.push(t);
      }
      vt[q] = qt.filter((t) => !both.includes(t));
      for (const x of nr) locked[x] = 1;
      for (const x of nq) locked[x] = 1;
      locked[r] = 1; locked[q] = 1; any++;
    }
    if (!any) return 0;
    const next: number[] = [];
    for (let i = 0; i < tris.length; i += 3) if (!dead[i / 3]) next.push(tris[i]!, tris[i + 1]!, tris[i + 2]!);
    tris = next;
    return any;
  };

  /** Flip edges toward better angles (the Delaunay rule, in 3D), never a seam edge, a flip that folds, or one that doubles an edge. Returns how many flipped. */
  const flip = (): number => {
    const V = pos.length / 3, owner = new Map<number, [number, number]>();
    for (let i = 0; i < tris.length; i += 3) for (let s = 0; s < 3; s++) {
      const kk = ekey(tris[i + s]!, tris[i + (s + 1) % 3]!), e = owner.get(kk);
      if (!e) owner.set(kk, [i, -1]); else e[1] = i;
    }
    const valence = new Int32Array(V);
    for (const kk of owner.keys()) { valence[Math.floor(kk / 1e7)]!++; valence[kk % 1e7]!++; }
    const dead = new Set<number>(), na = [0, 0, 0], nb = [0, 0, 0], ma = [0, 0, 0], mb = [0, 0, 0];
    let flipped = 0;
    for (const [kk, [t1, t2]] of owner) {
      if (t2 < 0 || ringEdge.has(kk) || dead.has(t1) || dead.has(t2)) continue;
      let a = 0, b = 0, c = 0;
      for (let s = 0; s < 3; s++) if (ekey(tris[t1 + s]!, tris[t1 + (s + 1) % 3]!) === kk) { a = tris[t1 + s]!; b = tris[t1 + (s + 1) % 3]!; c = tris[t1 + (s + 2) % 3]!; }
      let d = -1;
      for (let s = 0; s < 3; s++) { const x = tris[t2 + s]!; if (x !== a && x !== b) d = x; }
      if (d < 0 || valence[a]! <= 3 || valence[b]! <= 3) continue;
      const before = Math.min(minAngleSin(pos, a, b, c), minAngleSin(pos, b, a, d)), after = Math.min(minAngleSin(pos, a, d, c), minAngleSin(pos, d, b, c));
      if (after < before * FLIP_GAIN) continue;
      triNormal(a, b, c, na); triNormal(b, a, d, nb); triNormal(a, d, c, ma); triNormal(d, b, c, mb);
      const dot = (p: number[], q: number[]) => p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!;
      if (dot(na, ma) < 0.7 || dot(na, mb) < 0.7 || dot(nb, ma) < 0.7 || dot(nb, mb) < 0.7) continue;
      if (owner.has(ekey(c, d))) continue;
      tris[t1] = a; tris[t1 + 1] = d; tris[t1 + 2] = c;
      tris[t2] = d; tris[t2 + 1] = b; tris[t2 + 2] = c;
      dead.add(t1); dead.add(t2); valence[a]!--; valence[b]!--; valence[c]!++; valence[d]!++;
      flipped++;
    }
    return flipped;
  };

  /** One round of smoothing, vertex by vertex: a free vertex moves SMOOTH_LAMBDA of the way to its neighbours' mean along the surface and `pull` of the way to the surface along
   *  its gradient. A move that would fold one of its faces over (its normal turning against its old one) is halved, twice, then given up. The hull is a sheet far outside the surface in a
   *  crotch, so the early rounds pull only a part of the way: the sheet shrinks onto the surface over the rounds with the remeshing keeping up, which never lets a face fold. */
  const smooth = (pull: number) => {
    const V = pos.length / 3, vt: number[][] = Array.from({ length: V }, () => []);
    for (let i = 0; i < tris.length; i += 3) for (let s = 0; s < 3; s++) vt[tris[i + s]!]!.push(i);
    const before = [0, 0, 0], after = [0, 0, 0];
    for (let v = S; v < V; v++) {
      const ts = vt[v]!;
      if (!ts.length) continue;
      const x = pos[3 * v]!, y = pos[3 * v + 1]!, z = pos[3 * v + 2]!;
      let mx = 0, my = 0, mz = 0, c = 0;
      for (const t of ts) for (let s = 0; s < 3; s++) { const u = tris[t + s]!; if (u !== v) { mx += pos[3 * u]!; my += pos[3 * u + 1]!; mz += pos[3 * u + 2]!; c++; } }
      let dx = mx / c - x, dy = my / c - y, dz = mz / c - z;
      const sd = sdUnionGrad(caps, k, x, y, z, g), gg = g[0]! * g[0]! + g[1]! * g[1]! + g[2]! * g[2]!;
      if (gg < 1e-14) continue;
      const gl = Math.sqrt(gg), nx = g[0]! / gl, ny = g[1]! / gl, nz = g[2]! / gl, dn = dx * nx + dy * ny + dz * nz;
      dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;
      const f = (pull * sd) / gg, mvx = SMOOTH_LAMBDA * dx - f * g[0]!, mvy = SMOOTH_LAMBDA * dy - f * g[1]!, mvz = SMOOTH_LAMBDA * dz - f * g[2]!;
      for (let tryI = 0, sc = 1; tryI < 3; tryI++, sc /= 2) {
        pos[3 * v] = x + sc * mvx; pos[3 * v + 1] = y + sc * mvy; pos[3 * v + 2] = z + sc * mvz;
        let ok = true;
        for (const t of ts) {
          const a = tris[t]!, b = tris[t + 1]!, d = tris[t + 2]!;
          pos[3 * v] = x; pos[3 * v + 1] = y; pos[3 * v + 2] = z; triNormal(a, b, d, before);
          pos[3 * v] = x + sc * mvx; pos[3 * v + 1] = y + sc * mvy; pos[3 * v + 2] = z + sc * mvz; triNormal(a, b, d, after);
          if (before[0]! * after[0]! + before[1]! * after[1]! + before[2]! * after[2]! < 0.2) { ok = false; break; }
        }
        if (ok) break;
        if (tryI === 2) { pos[3 * v] = x; pos[3 * v + 1] = y; pos[3 * v + 2] = z; }
      }
    }
  };

  // the remeshing loop (spec 4.5.4 to 4.5.6, with the topology kept welded and closed throughout)
  const rounds = pace?.rounds ?? REMESH_ROUNDS, shrinkRounds = pace?.shrinkRounds ?? SHRINK_ROUNDS, shrinkPull = pace?.pull ?? SHRINK_PULL;
  for (let r = 0; r < rounds; r++) {
    let changes = 0;
    for (let s = 0; s < 4; s++) { const c = split(); changes += c; if (!c) break; }
    let c1 = 0;
    for (let s = 0; s < COLLAPSE_PASSES; s++) { const c = collapse(); c1 += c; if (c < 3) break; }   // (a pass locks every neighbour of what it collapsed, so a crowded patch needs several)
    changes += c1;
    changes += flip();
    smooth(r < shrinkRounds ? shrinkPull : 1);
    if (r >= shrinkRounds && changes <= Math.max(2, SETTLED * tris.length / 3)) break;   // settled: only a stray edge still changes
  }
  for (let r = 0; r < POLISH_ROUNDS; r++) { flip(); smooth(1); }
  for (let v = S; v < pos.length / 3; v++) project(v, 2);

  // compact: drop vertices no triangle uses (collapsed away), keeping the order, so the ring ids stay arm * n + j
  const used = new Uint8Array(pos.length / 3);
  for (let i = 0; i < tris.length; i++) used[tris[i]!] = 1;
  for (let v = 0; v < S; v++) used[v] = 1;
  const remap = new Int32Array(pos.length / 3).fill(-1), keep: number[] = [];
  for (let v = 0; v < used.length; v++) if (used[v]) { remap[v] = keep.length; keep.push(v); }
  const V = keep.length, cpos = new Float64Array(3 * V);
  keep.forEach((o, i) => { cpos[3 * i] = pos[3 * o]!; cpos[3 * i + 1] = pos[3 * o + 1]!; cpos[3 * i + 2] = pos[3 * o + 2]!; });
  const index = new Uint32Array(tris.length);
  for (let i = 0; i < tris.length; i++) index[i] = remap[tris[i]!]!;

  // rows from the seam (multi-source breadth first), carrying the nearest seam vertex
  const deg = new Int32Array(V + 1);
  for (let i = 0; i < index.length; i += 3) for (let s = 0; s < 3; s++) deg[index[i + s]! + 1]! += 2;   // (two neighbours per corner, repeated across the faces that share an edge)
  for (let v = 0; v < V; v++) deg[v + 1] = deg[v + 1]! + deg[v]!;
  const nbr = new Int32Array(deg[V]!), fillAt = deg.slice(0, V);
  for (let i = 0; i < index.length; i += 3) for (let s = 0; s < 3; s++) { const a = index[i + s]!; nbr[fillAt[a]!++] = index[i + (s + 1) % 3]!; nbr[fillAt[a]!++] = index[i + (s + 2) % 3]!; }
  const row = new Int32Array(V).fill(-1), src = new Int32Array(V).fill(-1), queue: number[] = [];
  for (let v = 0; v < S; v++) { row[v] = 0; src[v] = v; queue.push(v); }
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head]!;
    for (let q = deg[v]!; q < deg[v + 1]!; q++) { const u = nbr[q]!; if (row[u]! < 0) { row[u] = row[v]! + 1; src[u] = src[v]!; queue.push(u); } }
  }

  for (let v = 0; v < V; v++) if (row[v]! < 0) throw new SkinBuildError(j.node, `vertex ${v} is not connected to a seam (${V} vertices, ${index.length / 3} triangles)`);

  // normals, weights, rest radius, nearest axis point
  const position = new Float32Array(3 * V), normal = new Float32Array(3 * V), cen = new Float32Array(3 * V), weight = new Float32Array(4 * V), weight2 = new Float32Array(2 * V), restR = new Float32Array(V);
  const w = new Float64Array(MAX_SKIN_ARMS), cp = new Float64Array(7), nrm = new Float64Array(3);
  /** The normal at vertex `v` standing at (x, y, z) on the union of `cs`: the SDF's gradient, eased from the nearest seam vertex's tube normal over the first rows (spec 4.5.7), the tube's own on a seam ring. */
  const normalAt = (cs: readonly Capsule[], v: number, x: number, y: number, z: number, out: Float64Array): void => {
    sdUnionGrad(cs, k, x, y, z, g);
    const gl = Math.hypot(g[0]!, g[1]!, g[2]!) || 1;
    let nx = g[0]! / gl, ny = g[1]! / gl, nz = g[2]! / gl;
    const rw = row[v]!;
    if (v < S) { const a = Math.floor(v / n), q = v % n; nx = seamNormals[a]![3 * q]!; ny = seamNormals[a]![3 * q + 1]!; nz = seamNormals[a]![3 * q + 2]!; }   // the tube's own, exactly
    else if (rw < NORMAL_BLEND_ROWS) {
      const t = rw / NORMAL_BLEND_ROWS, sv = src[v]!, a = Math.floor(sv / n), q = sv % n;
      const tx = seamNormals[a]![3 * q]!, ty = seamNormals[a]![3 * q + 1]!, tz = seamNormals[a]![3 * q + 2]!;
      nx = tx + (nx - tx) * t; ny = ty + (ny - ty) * t; nz = tz + (nz - tz) * t;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    }
    out[0] = nx; out[1] = ny; out[2] = nz;
  };
  /** The weights of vertex `v` at (x, y, z) on the union of `cs` (the six numbers into `out`) and its blended rest radius, the tubes' own radii (`caps`, never the zeroed ones of a second shape). A seam vertex belongs wholly to its own arm: the blend is off there (spec 4.4.1). */
  const weightsAt = (cs: readonly Capsule[], v: number, x: number, y: number, z: number, out: Float64Array): number => {
    weights(cs, k, x, y, z, out);
    if (v < S) for (let i = 0; i < MAX_SKIN_ARMS; i++) out[i] = i === Math.floor(v / n) ? 1 : 0;
    let rr = 0;
    for (let i = 0; i < A; i++) if (out[i]! > 0) { closestOnArm(caps[i]!, x, y, z, cp); rr += out[i]! * cp[3]!; }
    return rr;
  };
  for (let v = 0; v < V; v++) {
    const x = cpos[3 * v]!, y = cpos[3 * v + 1]!, z = cpos[3 * v + 2]!;
    // seam rings are the tube's own float32 vertices, copied exactly
    if (v < S) { const a = Math.floor(v / n), q = v % n; position[3 * v] = seamRings[a]![3 * q]!; position[3 * v + 1] = seamRings[a]![3 * q + 1]!; position[3 * v + 2] = seamRings[a]![3 * q + 2]!; }
    else { position[3 * v] = x; position[3 * v + 1] = y; position[3 * v + 2] = z; }
    normalAt(caps, v, x, y, z, nrm);
    normal[3 * v] = nrm[0]!; normal[3 * v + 1] = nrm[1]!; normal[3 * v + 2] = nrm[2]!;
    restR[v] = weightsAt(caps, v, x, y, z, w);
    let top = 0;
    for (let i = 0; i < A; i++) { if (w[i]! > w[top]!) top = i; if (i < 4) weight[4 * v + i] = w[i]!; else weight2[2 * v + i - 4] = w[i]!; }
    closestOnArm(caps[top]!, x, y, z, cp);
    cen[3 * v] = cp[0]!; cen[3 * v + 1] = cp[1]!; cen[3 * v + 2] = cp[2]!;
  }
  // the SHADING normal across a ridge: where two arms meet, the SDF's gradient turns fast (a crotch's normals differ by 50 to 140 degrees between neighbouring vertices), and the cel shading's two-tone band then draws a hard dark line along the ridge,
  // which the 2D joins hid by blending the shade toward the neighbour (nbrK). So a vertex whose normal differs from a neighbour's by more than CREASE_DEG is eased toward its neighbours' mean, a few rounds, over the free rows only: the seam rings and the
  // rows blended from the tube's own normal stay exact, the positions (and with them the ink outline, which the fragment stage takes from the SDF) are not touched.
  {
    const cosMax = Math.cos((CREASE_DEG * Math.PI) / 180), cur = Float32Array.from(normal), nxt = new Float32Array(normal.length);
    for (let it = 0; it < CREASE_ROUNDS; it++) {
      nxt.set(cur);
      for (let v = 0; v < V; v++) {
        if (row[v]! < NORMAL_BLEND_ROWS) continue;
        let mx = 0, my = 0, mz = 0, c = 0, sharp = false;
        for (let q = deg[v]!; q < deg[v + 1]!; q++) {
          const u = nbr[q]!, d = cur[3 * v]! * cur[3 * u]! + cur[3 * v + 1]! * cur[3 * u + 1]! + cur[3 * v + 2]! * cur[3 * u + 2]!;
          if (d < cosMax) sharp = true;
          mx += cur[3 * u]!; my += cur[3 * u + 1]!; mz += cur[3 * u + 2]!; c++;
        }
        if (!sharp || !c) continue;
        let nx = cur[3 * v]! + CREASE_EASE * (mx / c - cur[3 * v]!), ny = cur[3 * v + 1]! + CREASE_EASE * (my / c - cur[3 * v + 1]!), nz = cur[3 * v + 2]! + CREASE_EASE * (mz / c - cur[3 * v + 2]!);
        const l = Math.hypot(nx, ny, nz) || 1;
        nxt[3 * v] = nx / l; nxt[3 * v + 1] = ny / l; nxt[3 * v + 2] = nz / l;
      }
      cur.set(nxt);
    }
    normal.set(cur);
  }
  // THE GROWING ARMS' SECOND SHAPE (spec 10.2): the skin as it is when that arm is NOT THERE: the plain trunk, the union of the OTHER arms at the same blend k, so the trunk away from the mouth is the same surface in both shapes (nothing moves
  // there while the arm grows). Every vertex that belongs to the arm, its seam ring and the rows of skin out to it, lies on that trunk surface (the nearest point on it) with the trunk's normal and weights, so a closed arm leaves nothing standing off
  // the trunk. The first version kept the arm's capsule at radius 0, a thread along its axis out to the ring's centre: the smooth union still drew it as a thin cone, 1.7 to 2.7 radii long, with the ink on it (the "thorns" on the SMV, 20 Nov). The
  // arm then grows as a bud: its ring slides out from the trunk to the tube's own ring (exactly the tube's at growth 1), widening as it goes.
  const grow: GrowMorph[] = [];
  for (let a = 0; a < A && grow.length < SKIN_GROWERS; a++) {
    if (!j.arms[a]!.grow) continue;
    const capsT = caps.filter((_, i) => i !== a);
    const m: GrowMorph = { arm: a, dPos: new Float32Array(3 * V), dNor: new Float32Array(3 * V), dRest: new Float32Array(V), dWeight: new Float32Array(4 * V), dWeight2: new Float32Array(2 * V) };
    const wT = new Float64Array(MAX_SKIN_ARMS), w0 = new Float64Array(MAX_SKIN_ARMS), n0 = new Float64Array(3);
    const onTrunk = (p: Float64Array, o: number): void => {
      let x = p[o]!, y = p[o + 1]!, z = p[o + 2]!;
      for (let s = 0; s < PROJECT_STEPS; s++) {
        const d = sdUnionGrad(capsT, k, x, y, z, g), gg = g[0]! * g[0]! + g[1]! * g[1]! + g[2]! * g[2]!;
        if (gg < 1e-14) break;
        const f = d / gg; x -= f * g[0]!; y -= f * g[1]!; z -= f * g[2]!;
      }
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) { p[o] = x; p[o + 1] = y; p[o + 2] = z; }
    };
    // THE CLOSED ARM'S PLACE ON THE TRUNK (Mohammad, 20 Nov: holes in the SMV, ragged edges). Putting each vertex of the arm on the nearest point of the trunk lands every row of the sleeve on the SAME circle of the wall: the rows collapse onto
    // one another (9 to 40 triangles per skin turned against their own normals, which the fragment stage throws away as back faces) and the mouth's footprint is left open. The arm's own rows (its weight above FOOT_FROM) are laid on the
    // footprint instead: the ring at its centre, each row between drawn in by how far along the arm it is, then relaxed over the wall with the fillet round them held (each free vertex to the mean of its neighbours, back onto the surface:
    // a patch with a fixed boundary comes out without a fold). The footprint is covered, every triangle faces out, and the arm then grows from it.
    const p0 = new Float64Array(3 * V), free: number[] = [];
    const foot = [0, 0, 0];
    for (let q = 0; q < n; q++) for (let c = 0; c < 3; c++) foot[c]! += position[3 * (a * n + q) + c]! / n;
    const ringC = foot.slice();
    { const f3 = Float64Array.from(foot); onTrunk(f3, 0); foot[0] = f3[0]!; foot[1] = f3[1]!; foot[2] = f3[2]!; }
    const out = [ringC[0]! - foot[0]!, ringC[1]! - foot[1]!, ringC[2]! - foot[2]!], reach2 = out[0]! * out[0]! + out[1]! * out[1]! + out[2]! * out[2]! || 1;
    for (let v = 0; v < V; v++) {
      p0[3 * v] = position[3 * v]!; p0[3 * v + 1] = position[3 * v + 1]!; p0[3 * v + 2] = position[3 * v + 2]!;
      const own = v < S ? Math.floor(v / n) : -1;
      if (own >= 0 && own !== a) continue;   // (another arm's ring: the tube's own vertex, never moved)
      onTrunk(p0, 3 * v);
      const wa = a < 4 ? weight[4 * v + a]! : weight2[2 * v + a - 4]!;
      if (wa <= FOOT_FROM) continue;
      const along = ((position[3 * v]! - foot[0]!) * out[0]! + (position[3 * v + 1]! - foot[1]!) * out[1]! + (position[3 * v + 2]! - foot[2]!) * out[2]!) / reach2;
      const tc = own === a ? 1 : Math.min(FOOT_DRAW_MAX, smooth01((wa - FOOT_FROM) / FOOT_SPAN) * smooth01(along));   // (a row keeps a fifth of its radius at least, so its vertices keep their order round the footprint)
      for (let c = 0; c < 3; c++) p0[3 * v + c] = foot[c]! + (1 - tc) * (p0[3 * v + c]! - foot[c]!);
      onTrunk(p0, 3 * v);
      if (own !== a) free.push(v);
    }
    for (let it = 0; it < FOOT_RELAX; it++) {
      for (const v of free) {
        let mx = 0, my = 0, mz = 0, c = 0;
        for (let q = deg[v]!; q < deg[v + 1]!; q++) { const u = nbr[q]!; mx += p0[3 * u]!; my += p0[3 * u + 1]!; mz += p0[3 * u + 2]!; c++; }
        if (!c) continue;
        p0[3 * v] = mx / c; p0[3 * v + 1] = my / c; p0[3 * v + 2] = mz / c;
        if (it % FOOT_PROJECT_EVERY === FOOT_PROJECT_EVERY - 1 || it === FOOT_RELAX - 1) onTrunk(p0, 3 * v);
      }
    }
    for (let v = 0; v < V; v++) {
      const own = v < S ? Math.floor(v / n) : -1;
      let x = p0[3 * v]!, y = p0[3 * v + 1]!, z = p0[3 * v + 2]!;
      if (own >= 0 && own !== a) {
        // another arm's seam ring: the tube's own vertex, never moved, its normal and weights the same in both shapes
        n0[0] = normal[3 * v]!; n0[1] = normal[3 * v + 1]!; n0[2] = normal[3 * v + 2]!;
        for (let i = 0; i < MAX_SKIN_ARMS; i++) w0[i] = i === own ? 1 : 0;
        m.dRest[v] = 0;
      } else {
        // the trunk's normal and weights at that point (the six weights are the trunk's arms in their own places, the grower's is 0)
        sdUnionGrad(capsT, k, x, y, z, g);
        const gl = Math.hypot(g[0]!, g[1]!, g[2]!) || 1;
        n0[0] = g[0]! / gl; n0[1] = g[1]! / gl; n0[2] = g[2]! / gl;
        weights(capsT, k, x, y, z, wT);
        let rr = 0;
        for (let i = 0; i < MAX_SKIN_ARMS; i++) {
          const src = i < a ? i : i - 1;
          w0[i] = i === a || i >= A ? 0 : wT[src]!;
          if (w0[i]! > 0) { closestOnArm(caps[i]!, x, y, z, cp); rr += w0[i]! * cp[3]!; }
        }
        m.dRest[v] = restR[v]! - rr;
      }
      m.dPos[3 * v] = position[3 * v]! - x; m.dPos[3 * v + 1] = position[3 * v + 1]! - y; m.dPos[3 * v + 2] = position[3 * v + 2]! - z;
      m.dNor[3 * v] = normal[3 * v]! - n0[0]!; m.dNor[3 * v + 1] = normal[3 * v + 1]! - n0[1]!; m.dNor[3 * v + 2] = normal[3 * v + 2]! - n0[2]!;
      for (let i = 0; i < A; i++) { if (i < 4) m.dWeight[4 * v + i] = weight[4 * v + i]! - w0[i]!; else m.dWeight2[2 * v + i - 4] = weight2[2 * v + i - 4]! - w0[i]!; }
    }
    grow.push(m);
  }
  // a face turned against its own vertex normals is a fold: the hull was too far from the surface for the remesh to follow, so this junction falls back to today's method
  const folds = foldedTriangles(position, normal, index);
  if (folds.length) throw new SkinBuildError(j.node, `the surface folds at triangle ${folds[0]} (${folds.length} in all)`);
  const seamVerts: Uint32Array[] = [];
  for (let a = 0; a < A; a++) { const ids = new Uint32Array(n); for (let q = 0; q < n; q++) ids[q] = a * n + q; seamVerts.push(ids); }
  return { junction: j, cuts, position, normal, cen, weight, weight2, restR, index, seamVerts, grow };
}

/** A cheap stand-in for a triangle's smallest angle: its sine, `2 area / (longest edge x middle edge)` (no trig, no allocation; it rises and falls with the angle up to 60 degrees). */
export function minAngleSin(pos: ArrayLike<number>, a: number, b: number, c: number): number {
  const ux = pos[3 * b]! - pos[3 * a]!, uy = pos[3 * b + 1]! - pos[3 * a + 1]!, uz = pos[3 * b + 2]! - pos[3 * a + 2]!, vx = pos[3 * c]! - pos[3 * a]!, vy = pos[3 * c + 1]! - pos[3 * a + 1]!, vz = pos[3 * c + 2]! - pos[3 * a + 2]!;
  const wx = vx - ux, wy = vy - uy, wz = vz - uz;
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  const l1 = ux * ux + uy * uy + uz * uz, l2 = vx * vx + vy * vy + vz * vz, l3 = wx * wx + wy * wy + wz * wz;
  const hi = Math.max(l1, l2, l3), lo = Math.min(l1, l2, l3), mid = l1 + l2 + l3 - hi - lo;
  return Math.sqrt((cx * cx + cy * cy + cz * cz) / (hi * mid || 1));
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

/** The triangles turned against the normals of their own vertices (a fold: the surface doubles back on itself). */
export function foldedTriangles(position: ArrayLike<number>, normal: ArrayLike<number>, index: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i]!, b = index[i + 1]!, c = index[i + 2]!;
    const ux = position[3 * b]! - position[3 * a]!, uy = position[3 * b + 1]! - position[3 * a + 1]!, uz = position[3 * b + 2]! - position[3 * a + 2]!, vx = position[3 * c]! - position[3 * a]!, vy = position[3 * c + 1]! - position[3 * a + 1]!, vz = position[3 * c + 2]! - position[3 * a + 2]!;
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    let d = 0;
    for (const v of [a, b, c]) d += fx * normal[3 * v]! + fy * normal[3 * v + 1]! + fz * normal[3 * v + 2]!;
    if (d <= 0) out.push(i / 3);
  }
  return out;
}
