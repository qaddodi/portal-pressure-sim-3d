// The starting sheet of a skin made from the SURFACE ITSELF (mesh.ts buildSkin, the `sdf` pace), for a junction whose hull sheet folds.
// The hull of the seam rings is a sheet far outside the surface wherever the arms run close and part slowly (a fork that leaves its parent at 30 degrees, five veins spread along a cava): the remesh pulls it in, the sheet doubles back on itself and the skin is lost.
// Here the sheet starts ON the surface: the smooth union of the arms (sdf.ts) is sampled on a grid, the surface between the samples is taken with surface nets (one vertex per cell the surface crosses, one quad per grid edge it crosses),
// every cell on the far side of a seam is left out so the sheet ends in one open loop at each seam, and each loop is zipped to its seam ring (the tube's own 14 vertices, which stay the first S vertices of the skin, ids arm * n + j).
// The remesh then only has to even out the triangles: the sheet is already within a cell of the surface, so there is nothing to fold. Pure numbers in, numbers out (no scene, no three.js).
import { SkinBuildError } from '../../skin/types.ts';
import { sdUnion, type Capsule } from './sdf.ts';
import { capStrayLoops } from './sheet-caps.ts';

/** The grid cell, as a share of the narrowest arm's radius, and the most cells the grid may have (a fine grid for a thin fork, a coarser one for a long cava). */
export const SHEET_CELL = 0.15;
export const SHEET_MAX_CELLS = 1500000;
/** A cell on the far side of an arm's seam plane is left out within this many of the arm's radii of its axis (its own tube beyond the seam, and nothing of another arm: the clearance rule keeps those farther away). */
export const SHEET_CUT_R = 1.3;

type V3 = readonly [number, number, number];

export interface Sheet { pos: number[]; tris: number[] }

/**
 * The sheet of a junction: `pos` the seam rings' vertices first (arm * n + j, as given), then the surface's own; `tris` outward triangles, closed except along the seam rings' edges (each of which is on exactly one triangle).
 * Throws `SkinBuildError` when the surface is not one clean piece per seam (an arm whose cut leaves no loop, two loops, a loop that touches itself, an edge on three faces).
 */
export function sdfSheet(node: string, caps: readonly Capsule[], k: number, seamRings: readonly Float32Array[], J: V3, anchors?: readonly V3[]): Sheet {
  const A = seamRings.length, n = seamRings[0]!.length / 3;
  // each seam: the ring's centre, mean radius, and the plane normal turned away from J
  const cen: V3[] = [], nor: V3[] = [], rad: number[] = [];
  for (let a = 0; a < A; a++) {
    const r = seamRings[a]!;
    const c = [0, 0, 0];
    for (let q = 0; q < n; q++) for (let d = 0; d < 3; d++) c[d]! += r[3 * q + d]! / n;
    let nx = 0, ny = 0, nz = 0, R = 0;
    for (let q = 0; q < n; q++) {
      const p = [r[3 * q]! - c[0]!, r[3 * q + 1]! - c[1]!, r[3 * q + 2]! - c[2]!], s = ((q + 1) % n) * 3, w = [r[s]! - c[0]!, r[s + 1]! - c[1]!, r[s + 2]! - c[2]!];
      nx += p[1]! * w[2]! - p[2]! * w[1]!; ny += p[2]! * w[0]! - p[0]! * w[2]!; nz += p[0]! * w[1]! - p[1]! * w[0]!;
      R += Math.hypot(p[0]!, p[1]!, p[2]!) / n;
    }
    const o = anchors?.[a] ?? J, l = Math.hypot(nx, ny, nz) || 1, away = (c[0]! - o[0]) * nx + (c[1]! - o[1]) * ny + (c[2]! - o[2]) * nz < 0 ? -1 : 1;   // (away from the arm's own start: a landing arm inside another's skin starts at its landing)
    cen.push([c[0]!, c[1]!, c[2]!]); nor.push([(nx / l) * away, (ny / l) * away, (nz / l) * away]); rad.push(R);
  }
  const Rmin = Math.min(...rad);
  // the grid: every ring and J, plus a margin
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const eat = (x: number, y: number, z: number) => { const p = [x, y, z]; for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d]!, p[d]!); hi[d] = Math.max(hi[d]!, p[d]!); } };
  eat(J[0], J[1], J[2]);
  for (let a = 0; a < A; a++) for (let q = 0; q < n; q++) eat(seamRings[a]![3 * q]!, seamRings[a]![3 * q + 1]!, seamRings[a]![3 * q + 2]!);
  const pad = 1.6 * Math.max(...rad);
  for (let d = 0; d < 3; d++) { lo[d]! -= pad; hi[d]! += pad; }
  let h = SHEET_CELL * Rmin;
  const cells = () => Math.ceil((hi[0]! - lo[0]!) / h) * Math.ceil((hi[1]! - lo[1]!) / h) * Math.ceil((hi[2]! - lo[2]!) / h);
  while (cells() > SHEET_MAX_CELLS) h *= 1.15;
  const nx = Math.ceil((hi[0]! - lo[0]!) / h), ny = Math.ceil((hi[1]! - lo[1]!) / h), nz = Math.ceil((hi[2]! - lo[2]!) / h);
  const sx = nx + 1, sy = ny + 1, plane = sx * sy;
  const sd = new Float32Array(sx * sy * (nz + 1));
  for (let z = 0; z <= nz; z++) for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) sd[x + y * sx + z * plane] = sdUnion(caps, k, lo[0]! + x * h, lo[1]! + y * h, lo[2]! + z * h);

  /** Whether the cell (x, y, z) lies beyond one arm's seam, inside that arm's own tube: left out. */
  const cut = (x: number, y: number, z: number): boolean => {
    const px = lo[0]! + (x + 0.5) * h, py = lo[1]! + (y + 0.5) * h, pz = lo[2]! + (z + 0.5) * h;
    for (let a = 0; a < A; a++) {
      const dx = px - cen[a]![0], dy = py - cen[a]![1], dz = pz - cen[a]![2], s = dx * nor[a]![0] + dy * nor[a]![1] + dz * nor[a]![2];
      if (s <= 0) continue;
      if (Math.hypot(dx - s * nor[a]![0], dy - s * nor[a]![1], dz - s * nor[a]![2]) < SHEET_CUT_R * rad[a]!) return true;
    }
    return false;
  };

  // one vertex in each cell the surface crosses (the mean of its edge crossings), numbered after the S ring vertices
  const S = A * n, cellId = new Int32Array(nx * ny * nz).fill(-1), pos: number[] = [];
  for (let a = 0; a < A; a++) for (let q = 0; q < n; q++) pos.push(seamRings[a]![3 * q]!, seamRings[a]![3 * q + 1]!, seamRings[a]![3 * q + 2]!);
  const E: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const corner = new Float64Array(8), cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { corner[c] = sd[x + cx[c]! + (y + cy[c]!) * sx + (z + cz[c]!) * plane]!; if (corner[c]! < 0) neg++; }
    if (neg === 0 || neg === 8 || cut(x, y, z)) continue;
    let mx = 0, my = 0, mz = 0, cnt = 0;
    for (const [a, b] of E) {
      const va = corner[a]!, vb = corner[b]!;
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      mx += x + cx[a]! + t * (cx[b]! - cx[a]!); my += y + cy[a]! + t * (cy[b]! - cy[a]!); mz += z + cz[a]! + t * (cz[b]! - cz[a]!); cnt++;
    }
    cellId[x + y * nx + z * nx * ny] = pos.length / 3;
    pos.push(lo[0]! + (mx / cnt) * h, lo[1]! + (my / cnt) * h, lo[2]! + (mz / cnt) * h);
  }
  const at = (x: number, y: number, z: number): number => (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? -1 : cellId[x + y * nx + z * nx * ny]!);

  // one quad for every grid edge the surface crosses, from the four cells around it, wound outward (toward the side the field grows)
  const tris: number[] = [];
  const quad = (c: [number, number, number, number], axis: number, sign: number) => {
    if (c.some((v) => v < 0)) return;
    const ax = [0, 0, 0]; ax[axis] = sign;
    const p = (v: number, d: number) => pos[3 * v + d]!;
    const nrm = [0, 0, 0], u = [p(c[1], 0) - p(c[0], 0), p(c[1], 1) - p(c[0], 1), p(c[1], 2) - p(c[0], 2)], w = [p(c[2], 0) - p(c[0], 0), p(c[2], 1) - p(c[0], 1), p(c[2], 2) - p(c[0], 2)];
    nrm[0] = u[1]! * w[2]! - u[2]! * w[1]!; nrm[1] = u[2]! * w[0]! - u[0]! * w[2]!; nrm[2] = u[0]! * w[1]! - u[1]! * w[0]!;
    const q = nrm[0]! * ax[0]! + nrm[1]! * ax[1]! + nrm[2]! * ax[2]! >= 0 ? c : ([c[3], c[2], c[1], c[0]] as typeof c);
    // (cut on the shorter diagonal)
    const d02 = Math.hypot(p(q[0], 0) - p(q[2], 0), p(q[0], 1) - p(q[2], 1), p(q[0], 2) - p(q[2], 2)), d13 = Math.hypot(p(q[1], 0) - p(q[3], 0), p(q[1], 1) - p(q[3], 1), p(q[1], 2) - p(q[3], 2));
    if (d02 <= d13) tris.push(q[0], q[1], q[2], q[0], q[2], q[3]); else tris.push(q[0], q[1], q[3], q[1], q[2], q[3]);
  };
  for (let z = 0; z <= nz; z++) for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
    const v0 = sd[x + y * sx + z * plane]!;
    if (x < nx && (v0 < 0) !== (sd[x + 1 + y * sx + z * plane]! < 0)) quad([at(x, y - 1, z - 1), at(x, y, z - 1), at(x, y, z), at(x, y - 1, z)], 0, sd[x + 1 + y * sx + z * plane]! - v0 > 0 ? 1 : -1);
    if (y < ny && (v0 < 0) !== (sd[x + (y + 1) * sx + z * plane]! < 0)) quad([at(x - 1, y, z - 1), at(x - 1, y, z), at(x, y, z), at(x, y, z - 1)], 1, sd[x + (y + 1) * sx + z * plane]! - v0 > 0 ? 1 : -1);
    if (z < nz && (v0 < 0) !== (sd[x + y * sx + (z + 1) * plane]! < 0)) quad([at(x - 1, y - 1, z), at(x, y - 1, z), at(x, y, z), at(x - 1, y, z)], 2, sd[x + y * sx + (z + 1) * plane]! - v0 > 0 ? 1 : -1);
  }
  if (!tris.length) throw new SkinBuildError(node, 'the sampled surface is empty');

  // the open loops: the edges that lie on one triangle only, each in the direction its triangle runs. A staircase cut can leave a vertex where two loops touch (a bow tie) and a thin web of the field an edge on three faces: the triangles round such a vertex or
  // edge are taken off, round after round, until every seam is one simple loop (the hole grows by a cell or so there; the remesh closes the difference)
  const key = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  let next = new Map<number, number>(), kept = tris.slice();
  for (let round = 0; ; round++) {
    const count = new Map<number, number>();
    for (let i = 0; i < kept.length; i += 3) for (let s = 0; s < 3; s++) { const e = key(kept[i + s]!, kept[i + (s + 1) % 3]!); count.set(e, (count.get(e) ?? 0) + 1); }
    next = new Map<number, number>();
    const bad = new Set<number>();
    for (let i = 0; i < kept.length; i += 3) for (let s = 0; s < 3; s++) {
      const a = kept[i + s]!, b = kept[i + (s + 1) % 3]!, c = count.get(key(a, b))!;
      if (c > 2) { bad.add(a); bad.add(b); }
      else if (c === 1) { if (next.has(a)) bad.add(a); else next.set(a, b); }
    }
    // (an open vertex that is the end of two loop edges too)
    const into = new Map<number, number>();
    for (const b of next.values()) into.set(b, (into.get(b) ?? 0) + 1);
    for (const [v, c] of into) if (c > 1) bad.add(v);
    if (!bad.size) break;
    if (round >= 12) throw new SkinBuildError(node, 'the sampled surface has seam loops that touch or edges on three faces that peeling does not clear');
    const f: number[] = [];
    for (let i = 0; i < kept.length; i += 3) if (!bad.has(kept[i]!) && !bad.has(kept[i + 1]!) && !bad.has(kept[i + 2]!)) f.push(kept[i]!, kept[i + 1]!, kept[i + 2]!);
    kept = f;
  }
  tris.length = 0; for (const v of kept) tris.push(v);
  const loops: number[][] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let v = start;
    while (!seen.has(v)) { seen.add(v); loop.push(v); const w = next.get(v); if (w === undefined) throw new SkinBuildError(node, 'a seam loop of the sampled surface is not closed'); v = w; }
    if (v !== start) throw new SkinBuildError(node, 'a seam loop of the sampled surface is not closed');
    loops.push(loop);
  }
  loops.splice(0, loops.length, ...capStrayLoops(loops, tris, pos, cen, rad));   // (a small hole at no seam: sheet-caps.ts)
  if (loops.length !== A) throw new SkinBuildError(node, `the sampled surface has ${loops.length} seam loops for ${A} arms`);

  // each loop to the arm whose seam plane it lies nearest, then zipped to that arm's ring
  const taken = new Set<number>();
  for (const loop of loops) {
    const m = [0, 0, 0];
    for (const v of loop) for (let d = 0; d < 3; d++) m[d]! += pos[3 * v + d]! / loop.length;
    let arm = -1, best = Infinity;
    for (let a = 0; a < A; a++) { if (taken.has(a)) continue; const d = Math.hypot(m[0]! - cen[a]![0], m[1]! - cen[a]![1], m[2]! - cen[a]![2]); if (d < best) { best = d; arm = a; } }
    if (arm < 0 || best > 2 * rad[arm]!) throw new SkinBuildError(node, 'a seam loop of the sampled surface is not at a seam');
    taken.add(arm);
    zip(tris, pos, loop, arm, n, cen[arm]!, nor[arm]!);
  }
  return { pos, tris };
}

/** The strip of triangles between an open loop of the sampled surface and its arm's ring, both taken round in the same direction about the seam's axis, advancing whichever has less of its circle behind it. Winding keeps every edge on two faces running opposite ways. */
function zip(tris: number[], pos: number[], loop: number[], arm: number, n: number, c: V3, t: V3): void {
  // the basis of the seam plane
  const ref: V3 = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let e1x = ref[1] * t[2] - ref[2] * t[1], e1y = ref[2] * t[0] - ref[0] * t[2], e1z = ref[0] * t[1] - ref[1] * t[0];
  const l1 = Math.hypot(e1x, e1y, e1z); e1x /= l1; e1y /= l1; e1z /= l1;
  const e2x = t[1] * e1z - t[2] * e1y, e2y = t[2] * e1x - t[0] * e1z, e2z = t[0] * e1y - t[1] * e1x;
  const angle = (v: number): number => { const dx = pos[3 * v]! - c[0], dy = pos[3 * v + 1]! - c[1], dz = pos[3 * v + 2]! - c[2]; return Math.atan2(dx * e2x + dy * e2y + dz * e2z, dx * e1x + dy * e1y + dz * e1z); };
  const TAU = 2 * Math.PI;
  // the loop's direction about the axis (the sign of the angle it sweeps)
  let sweep = 0;
  for (let i = 0; i < loop.length; i++) { let d = angle(loop[(i + 1) % loop.length]!) - angle(loop[i]!); if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; sweep += d; }
  const dir = sweep >= 0 ? 1 : -1;
  const ring: number[] = [];   // the ring's vertices in the loop's direction
  for (let q = 0; q < n; q++) ring.push(arm * n + q);
  let rs = 0;
  { let d = 0; for (let q = 0; q < n; q++) { let a = angle(ring[(q + 1) % n]!) - angle(ring[q]!); if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; d += a; } rs = d >= 0 ? 1 : -1; }
  const ringDir = rs === dir ? ring : [...ring].reverse();
  // progress of each vertex round the circle from the loop's first vertex, in [0, 1)
  const a0 = angle(loop[0]!);
  const prog = (v: number): number => { let d = (angle(v) - a0) * dir; d = ((d % TAU) + TAU) % TAU; return d / TAU; };
  // start the ring at the vertex just before the loop's first (its progress nearest to 0 from above)
  let r0 = 0, best = Infinity;
  for (let q = 0; q < n; q++) { const p = prog(ringDir[q]!); const d = Math.min(p, 1 - p); if (d < best) { best = d; r0 = q; } }
  const R = Array.from({ length: n }, (_, i) => ringDir[(r0 + i) % n]!);
  const lp = loop.map((v) => prog(v)), rp = R.map((v, i) => (i === 0 ? 0 : prog(v)));
  // the loop's direction in the mesh is the direction its own triangles run along it; the strip's triangles reverse those edges
  let l = 0, r = 0;
  while (l < loop.length || r < n) {
    const nl = l < loop.length ? (l + 1 < loop.length ? lp[l + 1]! : 1) : Infinity, nr = r < n ? (r + 1 < n ? rp[r + 1]! : 1) : Infinity;
    if (l < loop.length && (nl <= nr || r >= n)) { tris.push(loop[(l + 1) % loop.length]!, loop[l]!, R[r % n]!); l++; }
    else { tris.push(loop[l % loop.length]!, R[r % n]!, R[(r + 1) % n]!); r++; }
  }
}
