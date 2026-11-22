// WHERE A REGION'S TWO MESHES HAND OVER (plan owner, 22 Nov): a junction region has a body-built mesh and a map-built mesh, both projected onto the same live smooth union. The body mesh is fold-free from t = 0 up to some `a`, the map mesh from some
// `b` up to t = 1; where b < a both are fine and the hand-over (the screen dither, WP3) happens inside [b, a]. This file finds them: it evaluates each mesh's junction start at every 0.05 of t the way the vertex stage does (the bones at the Circuit's t by
// their peel, the two offset sets blended by the vertex's share, the radii at rest, the baked scale) and projects it onto the live union with 3 Newton steps, then counts the triangles that face into the union and the vertices that stay off it.
// A CPU twin of tests/net-oracle.ts (WP3's), which holds the same rules under test; the oracle checks this file's windows on the real regions.
import { sdUnion, sdUnionGrad, SKIN_K, type Capsule } from '../skin/sdf.ts';
import { MAP_K, sceneToMap } from '../../circuit/map.ts';
import { PEEL_SPAN, peelAt, peelRank, peelSlope } from '../../circuit/peel.ts';
import { foldCount } from './keys.ts';
import type { Vec3 } from '../../anatomy/vessels.ts';
import type { NetMesh, Skeleton } from './types.ts';

type V3 = [number, number, number];
const sub = (a: Vec3, b: Vec3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** The smallest rotation that takes the frame's tangent to T, applied to the frame (the shader's frameTo). */
function frameTo(F: readonly [Vec3, Vec3, Vec3], T: Vec3): [V3, V3, V3] {
  const t0 = F[0], c = dot(t0, T);
  if (c > 0.99999) return [[...T], [...F[1]], [...F[2]]];
  if (c < -0.9999) return [mul(F[0], -1), mul(F[1], -1), [...F[2]]];
  const ax = cross(t0, T), k = 1 / (1 + c);
  const rot = (v: Vec3): V3 => add(add(mul(v, c), cross(ax, v)), mul(ax, dot(ax, v) * k));
  return [[...T], rot(F[1]), rot(F[2])];
}

export interface BoneAt { cen: V3; F: [V3, V3, V3]; r: number; share: number }
/** Every bone at the Circuit's t (the shader's netBone, at rest swell): position and radius linear in the bone's peel share, the frame turned to the blended tangent. */
export function bonesAtT(skel: Skeleton, t: number): BoneAt[] {
  return skel.bones.map((B, bi) => {
    const [first, count] = skel.edges[B.edge]!.bones, k = bi - first, A = B.pos[0], M = B.pos[1];
    if (!(t > 0)) return { cen: [...A], F: [[...B.frame[0]], [...B.frame[1]], [...B.frame[2]]], r: B.r[0], share: 0 };
    const rank = peelRank(sceneToMap(M[0], M[1])[0]), w = peelAt(t, rank), cen = add(A, mul(sub(M, A), w));
    const p = skel.bones[first + Math.max(0, k - 1)]!, n = skel.bones[first + Math.min(count - 1, k + 1)]!, du = Math.max(n.u - p.u, 1e-6);
    const dA = mul(sub(n.pos[0], p.pos[0]), 1 / du), dM = mul(sub(n.pos[1], p.pos[1]), 1 / du), rs = rank > 0 && rank < 1 ? dM[0] / MAP_K / PEEL_SPAN : 0;
    const Tm = add(add(mul(dA, 1 - w), mul(dM, w)), mul(sub(M, A), peelSlope(t, rank) * rs));
    return { cen, F: frameTo(B.frame, dot(Tm, Tm) > 1e-9 ? norm(Tm) : B.frame[0]), r: B.r[0] + (B.r[1] - B.r[0]) * w, share: w };
  });
}

/** What a region's mesh needs of its report. */
export interface WindowRegion { node: string; variant: 0 | 1 | 2; vertStart: number; vertCount: number; arms: number; triStart: number; triCount: number; capBones: number[][]; mates: number[] }

/** The fold count and the worst distance off the live union (in units of the narrowest arm's radius) of one region's mesh at t, the arms at the radii the mesh was baked at (`NetMesh.bakeScale`: the reference state; the keys cover the others). */
export function meshAtT(m: Pick<NetMesh, 'bone' | 'weight' | 'offset' | 'offsetMap' | 'index'>, rg: WindowRegion, bones: readonly BoneAt[], steps = 3): { folds: number; off: number } {
  const caps: Capsule[] = rg.capBones.map((ids, i) => {
    const pts = new Float64Array(3 * ids.length), r = new Float64Array(ids.length);
    ids.forEach((g, q) => { pts.set(bones[g]!.cen, 3 * q); r[q] = bones[g]!.r; });
    return rg.mates[i]! >= 0 ? { n: ids.length, pts, r, mate: rg.mates[i]! } : { n: ids.length, pts, r };
  });
  const k = SKIN_K * Math.min(...rg.capBones.slice(0, rg.arms).map((ids) => bones[ids[0]!]!.r)), R = k / SKIN_K;
  const used = new Set<number>();
  for (let tr = rg.triStart; tr < rg.triStart + rg.triCount; tr++) for (let q = 0; q < 3; q++) used.add(m.index[3 * tr + q]!);
  const verts = [...used].sort((a, b) => a - b), pos = new Float64Array(3 * verts.length);
  let off = 0;
  verts.forEach((v, q) => {
    const p: V3 = [0, 0, 0], pB: V3 = [0, 0, 0], pM: V3 = [0, 0, 0];
    let S = 0;
    for (let i = 0; i < 4; i++) {
      const wk = m.weight[4 * v + i]!;
      if (!(wk > 0)) continue;
      const b = bones[m.bone[4 * v + i]!]!, sc = b.r;
      const fr = (set: Float32Array): V3 => { const o: V3 = [set[12 * v + 3 * i]!, set[12 * v + 3 * i + 1]!, set[12 * v + 3 * i + 2]!]; return add(add(mul(b.F[0], o[0]), mul(b.F[1], o[1])), mul(b.F[2], o[2])); };
      const a = fr(m.offset), am = fr(m.offsetMap);
      S += wk * b.share;
      for (let d = 0; d < 3; d++) { p[d] += wk * b.cen[d]!; pB[d] += wk * sc * a[d]!; pM[d] += wk * sc * am[d]!; }
    }
    const s = Math.min(1, Math.max(0, S));
    for (let d = 0; d < 3; d++) pos[3 * q + d] = p[d]! + pB[d]! + (pM[d]! - pB[d]!) * s;
    if (v >= rg.vertStart && v < rg.vertStart + rg.vertCount) {
      const g = [0, 0, 0], x = pos.subarray(3 * q, 3 * q + 3);
      for (let st = 0; st < steps; st++) { const f = sdUnionGrad(caps, k, x[0]!, x[1]!, x[2]!, g), l2 = g[0]! ** 2 + g[1]! ** 2 + g[2]! ** 2; if (l2 > 1e-12) for (let d = 0; d < 3; d++) x[d]! -= (f * g[d]!) / l2; }
      off = Math.max(off, Math.abs(sdUnion(caps, k, x[0]!, x[1]!, x[2]!)) / R);
    }
  });
  return { folds: foldCount({ verts, tris: Array.from(m.index.subarray(3 * rg.triStart, 3 * (rg.triStart + rg.triCount))) }, pos, caps, k), off };
}

export const T_STEP = 0.05;
export const OFF_MAX = 0.01;
type Row = { folds: number; off: number };
/** One region's meshes' windows. `a` is the last t up to which the body mesh is whole (no fold, within OFF_MAX R of the union), `b` the first from which the map mesh is. */
export interface Window {
  a: number; b: number;
  /** the range [from, to] the body and map meshes hand over in; null when they do not overlap (a mid mesh may then bridge them: `mid`) */
  switchT: [number, number] | null;
  /** with a mid mesh: the whole run of t it covers [lo, hi], and the two hand-overs (body to mid, mid to map), null when the mid mesh does not bridge the gap */
  mid?: { lo: number; hi: number; windows: [[number, number], [number, number]] | null };
  /** per grid t (0, 0.05 ..): each mesh's folds and distance off the union */
  rows: { t: number; body: Row; map: Row; mid?: Row }[];
}

export function windowOf(built: Skeleton, m: Pick<NetMesh, 'bone' | 'weight' | 'offset' | 'offsetMap' | 'index'>, body: WindowRegion, map: WindowRegion, mid?: WindowRegion): Window {
  const rows: Window['rows'] = [], n = Math.round(1 / T_STEP);
  for (let i = 0; i <= n; i++) {
    const t = i * T_STEP, bones = bonesAtT(built, t);
    rows.push({ t, body: meshAtT(m, body, bones), map: meshAtT(m, map, bones), ...(mid ? { mid: meshAtT(m, mid, bones) } : {}) });
  }
  const ok = (x: Row | undefined): boolean => !!x && x.folds === 0 && x.off <= OFF_MAX;
  let a = -T_STEP; for (const r of rows) { if (!ok(r.body)) break; a = r.t; }
  let b = 1 + T_STEP; for (let i = rows.length - 1; i >= 0; i--) { if (!ok(rows[i]!.map)) break; b = rows[i]!.t; }
  const out: Window = { a, b, switchT: null, rows };
  if (b < a) {
    // inside the overlap, a narrow band about the middle of the Circuit's t (or as close to it as the overlap allows): both meshes are whole across all of it
    const w = Math.min(0.2, a - b), c = Math.min(a - w / 2, Math.max(b + w / 2, 0.5));
    out.switchT = [Math.max(b, c - w / 2), Math.min(a, c + w / 2)];
  } else if (mid) {
    // the mid mesh's whole run that reaches back into the body's range and forward into the map's: the hand-overs stand in the overlaps, a narrow band about the middle of each
    let best: { lo: number; hi: number } | null = null;
    for (let i = 0; i < rows.length; i++) {
      if (!ok(rows[i]!.mid)) continue;
      let j = i; while (j + 1 < rows.length && ok(rows[j + 1]!.mid)) j++;
      const lo = rows[i]!.t, hi = rows[j]!.t;
      if (lo < a && hi > b && (!best || hi - lo > best.hi - best.lo)) best = { lo, hi };
      i = j;
    }
    if (best) {
      const band = (from: number, to: number): [number, number] => { const h = Math.min(0.05, (to - from) / 2), c = (from + to) / 2; return [c - h, c + h]; };
      out.mid = { ...best, windows: [band(best.lo, a), band(b, best.hi)] };
    } else out.mid = { lo: 0, hi: 0, windows: null };
  }
  return out;
}
