// THE GASTRO-OESOPHAGEAL JUNCTION AS THE STOMACH MESH HAS IT, in all three axes (owner, 26 Nov 2026: "the direction the gastric balloon is being tugged is not right; these are anterior
// and posterior views and you can
// clearly see it's missing the GE junction"). The tamponade tube and its balloon were seated from the 2D app's waypoints (the cardia at figure y 251 on the painted outline, the way
// down at 41 degrees), but the stomach
// mesh is a different, placed shape with depth, so from any other view the tube left the oesophagus's wall early and the balloon sat in the fundus below and beside the opening. The
// junction is read here from the
// mesh itself: where the narrow oesophageal tube meets the stomach's roof (its centre), which way the oesophagus runs into it (its normal), where the stomach's lumen lies from there,
// and the mesh as a signed
// distance (positive in the lumen), so a device can be seated against the real wall. Pure: it takes the geometry, so a test loads it with the real organ file.
import type { BufferGeometry } from 'three';

export type V3 = readonly [number, number, number];

export interface GeJunction {
  /** the middle of the opening: the oesophagus's own centre where its tube ends and the stomach's roof begins (scene units) */
  centre: V3;
  /** the opening's radius: the oesophagus's half width where its tube ends (scene units) */
  radius: number;
  /** where a tube is best passed through the opening: the point of it (within ENTRY_SHARE of its radius from `centre`) with the most room below, so a body drawn up under it has the
    * lumen round it (scene units) */
  entry: V3;
  /** the unit direction the oesophagus runs into the opening (down the oesophagus, toward the stomach) */
  normal: V3;
  /** the unit direction from the opening toward the middle of the stomach's lumen: where the tube goes on once it is through */
  into: V3;
  /** the oesophagus's centre line above the opening, top to bottom, ending at `centre` (scene units, a point every ROW) */
  axis: V3[];
  /** the mesh's signed distance at a point: positive in the lumen (how far from the nearest wall), negative outside the stomach */
  clearance(x: number, y: number, z: number): number;
}

/** The rows the oesophagus is read in (scene units), and how wide a slice may be, x and z, to still be the tube (the stomach's roof is wider). */
export const ROW = 0.01, SLICE_HALF = 0.006, ESO_X = 0.12, ESO_Z = 0.14;
/** How far above and below the opening the mesh's distance field runs (scene units): it stops inside the intact oesophagus above, and above the pylorus, where the mesh is open, below. */
const CAP_ABOVE = 0.25, CAP_BELOW = 0.7;
/** The tube's pass through the opening is looked for on the opening's disk, out to this share of its radius (so the tube stays clear of the wall), in steps of ENTRY_STEP, with the room
  * read at these depths below (scene units). */
const ENTRY_SHARE = 0.6, ENTRY_STEP = 0.004, ENTRY_DEPTHS = [0.02, 0.04];
/** The most the tube may turn from the oesophagus's direction to go on into the lumen (degrees); the distances down the way on (scene units) at which its room is read, and how near the
  * best room (scene units) a smaller turn may be. */
const MAX_TURN = 70, GO_ON_AT = [0.12, 0.18, 0.24], ROOM_TOLERANCE = 0.003;
/** The stretch of oesophagus above the opening that gives its direction (scene units). */
const DIRECTION_SPAN = 0.25;

const sub = (a: V3, b: V3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): [number, number, number] => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** The slice of vertices at height y: the extents in x and z and their middle, or null where there are none. */
function sliceAt(pos: ArrayLike<number>, y: number): { x0: number; x1: number; z0: number; z1: number } | null {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (Math.abs(pos[i + 1]! - y) > SLICE_HALF) continue;
    x0 = Math.min(x0, pos[i]!); x1 = Math.max(x1, pos[i]!); z0 = Math.min(z0, pos[i + 2]!); z1 = Math.max(z1, pos[i + 2]!);
  }
  return x0 > x1 ? null : { x0, x1, z0, z1 };
}

/** The voxel of the mesh's distance field (scene units): 1.8 figure units, finer than any wall the balloon is fitted against needs. */
const VOXEL = 0.006;
const INF = 1e12;

/** Felzenszwalb and Huttenlocher's squared distance transform along one line of the grid (in place, in voxels squared). */
function edt1(f: Float32Array, n: number, off: number, stride: number, v: Int32Array, z: Float64Array, d: Float64Array): void {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const p = v[k]!, fq = f[off + q * stride]!, fp = f[off + p * stride]!;
      s = (fq + q * q - (fp + p * p)) / (2 * q - 2 * p);
      if (s <= z[k]! && k > 0) k--; else break;
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1]! < q) k++; const p = v[k]!; d[q] = (q - p) * (q - p) + f[off + p * stride]!; }
  for (let q = 0; q < n; q++) f[off + q * stride] = d[q]!;
}

/**
 * The signed distance to a closed triangle mesh, as a distance field of voxels (the mesh's winding is outward: organ-outward.test.ts): the triangles between `yMin` and `yMax` (the
 * stomach and the foot of the oesophagus) are
 * laid in the grid, the distance to the nearest of them is taken for every voxel (an exact transform), and the voxels the outside reaches through the gaps are negative. Read back by
 * trilinear blending, so a query is
 * a handful of multiplies (the balloon's seat asks for tens of thousands). Positive in the lumen, negative outside the stomach; a point off the grid is outside.
 */
export function meshClearance(pos: ArrayLike<number>, index: ArrayLike<number>, yMin: number, yMax: number): (x: number, y: number, z: number) => number {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], tris: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]! * 3, b = index[t + 1]! * 3, c = index[t + 2]! * 3;
    if (Math.min(pos[a + 1]!, pos[b + 1]!, pos[c + 1]!) > yMax || Math.max(pos[a + 1]!, pos[b + 1]!, pos[c + 1]!) < yMin) continue;
    tris.push(a, b, c);
    for (const o of [a, b, c]) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d]!, pos[o + d]!); hi[d] = Math.max(hi[d]!, pos[o + d]!); }
  }
  // (the oesophagus is open at its ragged top end: the field stops at the plane `yMax`, which is laid as a wall across it, inside the intact tube, so the lumen is closed and the
  // outside cannot flow in)
  hi[1] = yMax; lo[1] = yMin;
  const PAD = 3;
  const n = [0, 1, 2].map((d) => Math.ceil((hi[d]! - lo[d]!) / VOXEL) + (d === 1 ? 2 : 2 * PAD + 1)) as [number, number, number];
  const o = [0, 1, 2].map((d) => (d === 1 ? lo[d]! : lo[d]! - PAD * VOXEL));
  const [nx, ny, nz] = n, N = nx * ny * nz, at = (i: number, j: number, k: number): number => (k * ny + j) * nx + i;
  // the surface voxels: every triangle sampled finer than half a voxel
  const wall = new Uint8Array(N), field = new Float32Array(N).fill(INF);
  const mark = (x: number, y: number, z: number): void => {
    if (y > yMax + VOXEL || y < yMin - VOXEL) return;
    const i = Math.round((x - o[0]!) / VOXEL), j = Math.round((y - o[1]!) / VOXEL), k = Math.round((z - o[2]!) / VOXEL), q = at(i, j, k);
    wall[q] = 1; field[q] = 0;
  };
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t]!, b = tris[t + 1]!, c = tris[t + 2]!;
    const len = (p: number, q: number): number => Math.hypot(pos[q]! - pos[p]!, pos[q + 1]! - pos[p + 1]!, pos[q + 2]! - pos[p + 2]!);
    const e = Math.max(len(a, b), len(a, c), len(b, c));
    const m = Math.max(1, Math.ceil(e / (VOXEL * 0.5)));
    for (let u = 0; u <= m; u++) for (let w = 0; w <= m - u; w++) {
      const fu = u / m, fw = w / m, fa = 1 - fu - fw;
      mark(pos[a]! * fa + pos[b]! * fu + pos[c]! * fw, pos[a + 1]! * fa + pos[b + 1]! * fu + pos[c + 1]! * fw, pos[a + 2]! * fa + pos[b + 2]! * fu + pos[c + 2]! * fw);
    }
  }
  const cap = Math.round((yMax - o[1]!) / VOXEL);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) for (const j of [0, cap]) { const q = at(i, j, k); wall[q] = 1; field[q] = 0; }
  // the outside: a flood from the grid's corner through the voxels that are not wall (6 neighbours: it cannot slip through a wall sampled this finely)
  const out = new Uint8Array(N), start = at(0, 1, 0), stack: number[] = [start]; out[start] = 1;
  while (stack.length) {
    const q = stack.pop()!, i = q % nx, j = Math.floor(q / nx) % ny, k = Math.floor(q / (nx * ny));
    const next = [i > 0 ? q - 1 : -1, i < nx - 1 ? q + 1 : -1, j > 0 ? q - nx : -1, j < ny - 1 ? q + nx : -1, k > 0 ? q - nx * ny : -1, k < nz - 1 ? q + nx * ny : -1];
    for (const r of next) if (r >= 0 && !out[r] && !wall[r]) { out[r] = 1; stack.push(r); }
  }
  // the exact squared distance to the nearest wall voxel, along x, then y, then z
  const m = Math.max(nx, ny, nz), v = new Int32Array(m), z = new Float64Array(m + 1), d = new Float64Array(m);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) edt1(field, nx, at(0, j, k), 1, v, z, d);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) edt1(field, ny, at(i, 0, k), nx, v, z, d);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) edt1(field, nz, at(i, j, 0), nx * ny, v, z, d);
  // (signed, in scene units; measured against the true distance to the mesh's vertices, the field reads 0.7 voxel short, put back)
  const sdf = new Float32Array(N);
  for (let q = 0; q < N; q++) { const dist = (Math.sqrt(field[q]!) + 0.4) * VOXEL; sdf[q] = out[q] ? -dist : dist; }
  return (px, py, pz) => {
    const gx = (px - o[0]!) / VOXEL, gy = (py - o[1]!) / VOXEL, gz = (pz - o[2]!) / VOXEL;
    if (gx < 0 || gy < 0 || gz < 0 || gx >= nx - 1 || gy >= ny - 1 || gz >= nz - 1) return -1;
    const i = Math.floor(gx), j = Math.floor(gy), k = Math.floor(gz), fx = gx - i, fy = gy - j, fz = gz - k, q = at(i, j, k);
    const c00 = sdf[q]! * (1 - fx) + sdf[q + 1]! * fx, c10 = sdf[q + nx]! * (1 - fx) + sdf[q + nx + 1]! * fx;
    const c01 = sdf[q + nx * ny]! * (1 - fx) + sdf[q + nx * ny + 1]! * fx, c11 = sdf[q + nx * ny + nx]! * (1 - fx) + sdf[q + nx * ny + nx + 1]! * fx;
    return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  };
}

/**
 * The junction from the stomach mesh: scanning the oesophagus down from its top, the last row where the slice is still the tube (narrow in x and in z) is the opening; its centre is
 * `centre`, the tube's centres over
 * the DIRECTION_SPAN above it give `normal`, and `into` is the way the tube goes on into the stomach: toward the roomiest place of the lumen (70 degrees from `normal` at most).
 */
export function geJunction(geo: BufferGeometry): GeJunction {
  const pos = geo.getAttribute('position').array, index = geo.index!.array;
  let top = -Infinity;
  for (let i = 1; i < pos.length; i += 3) top = Math.max(top, pos[i]!);
  // down the oesophagus from just under its ragged top end while the slice stays narrow
  const rows: { y: number; c: V3; half: number }[] = [];
  for (let y = top - 0.15; y > 0.2; y -= ROW) {
    const s = sliceAt(pos, y);
    if (!s || s.x1 - s.x0 > ESO_X || s.z1 - s.z0 > ESO_Z) { if (rows.length) break; continue; }
    rows.push({ y, c: [(s.x0 + s.x1) / 2, y, (s.z0 + s.z1) / 2], half: Math.min(s.x1 - s.x0, s.z1 - s.z0) / 2 });
  }
  if (rows.length < 8) throw new Error('ge-junction: the stomach mesh has no narrow oesophagus to read');
  const centre = rows[rows.length - 1]!.c, radius = rows[rows.length - 1]!.half;
  const axis = rows.map((r) => r.c);
  // the direction: the tube's own run over the stretch above the opening
  const up = rows.find((r) => r.y >= centre[1] + DIRECTION_SPAN) ?? rows[0]!;
  const normal = unit(sub(centre, up.c));
  const clearance = meshClearance(pos, index, centre[1] - CAP_BELOW, centre[1] + CAP_ABOVE);
  // WHERE THE TUBE PASSES THE OPENING: the opening's own point with the most room in the lumen below it (the mouth is at the stomach's edge, with a wall close on one side; a body
  // seated under it has the
  // most lumen round it by the tube going through on the far side from that wall). Candidates on the opening's disk, and the room read a balloon's depth below along the oesophagus's direction.
  const side1 = unit(Math.abs(normal[0]) < 0.9 ? [0, -normal[2], normal[1]] : [normal[2], 0, -normal[0]]);
  const side2: V3 = unit([normal[1] * side1[2] - normal[2] * side1[1], normal[2] * side1[0] - normal[0] * side1[2], normal[0] * side1[1] - normal[1] * side1[0]]);
  const roomBelow = (p: V3): number => Math.min(...ENTRY_DEPTHS.map((t) => clearance(p[0] + normal[0] * t, p[1] + normal[1] * t, p[2] + normal[2] * t)));
  let entry: V3 = centre, entryRoom = roomBelow(centre);
  for (let rho = ENTRY_STEP; rho <= ENTRY_SHARE * radius + 1e-9; rho += ENTRY_STEP) {
    for (let a = 0; a < 16; a++) {
      const ph = (a / 16) * Math.PI * 2, c = Math.cos(ph) * rho, sn = Math.sin(ph) * rho;
      const p: V3 = [centre[0] + c * side1[0] + sn * side2[0], centre[1] + c * side1[1] + sn * side2[1], centre[2] + c * side1[2] + sn * side2[2]];
      const room = roomBelow(p);
      if (room > entryRoom + 1e-9) { entryRoom = room; entry = p; }
    }
  }
  // WHERE THE TUBE GOES ON: the direction with the most room in the lumen where a balloon is filled, straight on from the pass at distances down it (scene units), found over a cone
  // about the oesophagus's direction
  // out to MAX_TURN degrees: the smallest turn is kept among those with room within a hair of the best, so the tube goes no further round than it must.
  const sideA = side1, sideB = side2, roomIn = (d: V3): number => Math.min(...GO_ON_AT.map((t) => clearance(entry[0] + d[0] * t, entry[1] + d[1] * t, entry[2] + d[2] * t)));
  const tries: { d: V3; deg: number; room: number }[] = [];
  for (let deg = 0; deg <= MAX_TURN; deg += 5) {
    const th = (deg * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
    for (let a = 0; a < (deg ? 24 : 1); a++) {
      const ph = (a / 24) * Math.PI * 2, u = Math.cos(ph) * sn, w = Math.sin(ph) * sn;
      const d: V3 = [c * normal[0] + u * sideA[0] + w * sideB[0], c * normal[1] + u * sideA[1] + w * sideB[1], c * normal[2] + u * sideA[2] + w * sideB[2]];
      tries.push({ d, deg, room: roomIn(d) });
    }
  }
  const best = Math.max(...tries.map((x) => x.room));
  const into = unit(tries.filter((x) => x.room >= best - ROOM_TOLERANCE).reduce((m, x) => (x.deg < m.deg ? x : m)).d);
  return { centre, radius, entry, normal, into, axis, clearance };
}

/** The junction as drawn when the organ's mesh is moved along z by `dz` (organs/z.ts ORGAN_Z: 0 for every organ today, so this
 *  returns `j` itself): every point and the clearance field move with it. */
export function liftJunction(j: GeJunction, dz: number): GeJunction {
  if (!dz) return j;
  const up = (p: V3): V3 => [p[0], p[1], p[2] + dz];
  return { ...j, centre: up(j.centre), entry: up(j.entry), axis: j.axis.map(up), clearance: (x, y, z) => j.clearance(x, y, z - dz) };
}
