// The anatomy editor's organ edit (?editor, preview only): a pure function of one organ's geometry and its OrganEdit (types.ts).
// Order: liquify strokes (reference frame, smooth C2 Wendland falloff, total pull per vertex clamped to LIQUIFY_LIMIT), then the whole-organ move / rotY / scale about the
// organ's centroid, each clamped to ORGAN_LIMITS. A vertex's new place is a function of its REFERENCE place only, so vertices at one place (a welded seam) stay one place.
// Normals, and the baked smoothed normals (shadeN, hullN) when the geometry has them, are recomputed. An empty edit touches nothing (identical buffers).
import { type BufferGeometry, Float32BufferAttribute } from 'three';
import { smoothRestNormals } from '../scene/organs/normal-smooth.ts';
import { CAGE_LIMIT, CAGE_PAD, FOLD_AT, GRID_LIMIT, GRID_N, LIQUIFY_LIMIT, ORGAN_LIMITS, type Cage, type Grid, type OrganEdit, type V3 } from './types.ts';

const SHADE_PASSES = 6;   // (prepare.ts SHADE_PASSES; not imported: prepare.ts imports the layer, which imports the meshes, which import this)
const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The organ's centre: the middle of its bounding box (`origin` is added to the stored positions: the live path edits before the organ's depth shift). */
export function organCentroid(g: BufferGeometry, origin: V3 = [0, 0, 0]): V3 {
  const p = g.getAttribute('position').array, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { const v = p[i + k]!; if (v < lo[k]!) lo[k] = v; if (v > hi[k]!) hi[k] = v; }
  return [(lo[0]! + hi[0]!) / 2 + origin[0], (lo[1]! + hi[1]!) / 2 + origin[1], (lo[2]! + hi[2]!) / 2 + origin[2]];
}

export interface Box { lo: V3; hi: V3 }
/** The organ's bounding box (`origin` added, as organCentroid). */
export function organBox(g: BufferGeometry, origin: V3 = [0, 0, 0]): Box {
  const p = g.getAttribute('position').array, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { const v = p[i + k]!; if (v < lo[k]!) lo[k] = v; if (v > hi[k]!) hi[k] = v; }
  return { lo: [lo[0]! + origin[0], lo[1]! + origin[1], lo[2]! + origin[2]], hi: [hi[0]! + origin[0], hi[1]! + origin[1], hi[2]! + origin[2]] };
}
/** The cage's own box: the organ's box padded by CAGE_PAD on every side. */
export const cageBox = (b: Box): Box => {
  const pad = (k: number) => (b.hi[k]! - b.lo[k]!) * CAGE_PAD;
  return { lo: [b.lo[0] - pad(0), b.lo[1] - pad(1), b.lo[2] - pad(2)], hi: [b.hi[0] + pad(0), b.hi[1] + pad(1), b.hi[2] + pad(2)] };
};
/** The cage with sane dims, finite offsets, each held to CAGE_LIMIT of the padded box's size at apply time (null: none, or all zero). */
function validCage(c: Cage | undefined): Cage | null {
  if (!c || c.n?.length !== 3 || !c.n.every((v) => Number.isInteger(v) && v >= 2 && v <= 5)) return null;
  const cnt = c.n[0] * c.n[1] * c.n[2];
  if (!Array.isArray(c.d) || c.d.length !== cnt) return null;
  const d = c.d.map((v) => (v?.length === 3 && v.every(fin) ? ([v[0], v[1], v[2]] as V3) : ([0, 0, 0] as V3)));
  return d.some((v) => v[0] || v[1] || v[2]) ? { n: c.n, d } : null;
}
/** The grid with sane dims and finite numbers (null: none, or all zero). */
function validGrid(g: Grid | undefined): Grid | null {
  if (!g || g.n?.length !== 3 || !g.n.every((v) => Number.isInteger(v) && v >= 2 && v <= 64) || !g.lo?.every(fin) || !g.hi?.every(fin)) return null;
  if (!Array.isArray(g.d) || g.d.length !== 3 * g.n[0] * g.n[1] * g.n[2] || !g.d.every(fin)) return null;
  if (!(g.hi[0]! > g.lo[0]! && g.hi[1]! > g.lo[1]! && g.hi[2]! > g.lo[2]!)) return null;
  return g.d.some((v) => v) ? g : null;
}
/** Catmull-Rom weights of the four taps round `t` (0..1 inside a cell). */
function cr(t: number, w: number[]): void {
  const t2 = t * t, t3 = t2 * t;
  w[0] = -0.5 * t3 + t2 - 0.5 * t; w[1] = 1.5 * t3 - 2.5 * t2 + 1; w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t; w[3] = 0.5 * t3 - 0.5 * t2;
}
const GW = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
/** The grid's offset at a reference-frame point: tricubic Catmull-Rom of its samples (they come back exactly at the sample places), zero outside the box, the sum held by GRID_LIMIT softly. */
export function gridSample(g: Grid, p: V3): V3 {
  const [nx, ny, nz] = g.n, cell: number[] = [], f: number[] = [];
  for (let k = 0; k < 3; k++) {
    const m = g.n[k]!, u = (p[k]! - g.lo[k]!) / (g.hi[k]! - g.lo[k]!) * (m - 1);
    if (!(u >= 0 && u <= m - 1)) return [0, 0, 0];
    const c = Math.min(m - 2, Math.floor(u)); cell.push(c); f.push(u - c);
    cr(u - c, GW[k]!);
  }
  let dx = 0, dy = 0, dz = 0;
  for (let c = 0; c < 4; c++) {
    const kz = cell[2]! - 1 + c; if (kz < 0 || kz >= nz) continue;
    for (let b = 0; b < 4; b++) {
      const ky = cell[1]! - 1 + b; if (ky < 0 || ky >= ny) continue;
      const wyz = GW[1]![b]! * GW[2]![c]!;
      for (let a = 0; a < 4; a++) {
        const kx = cell[0]! - 1 + a; if (kx < 0 || kx >= nx) continue;
        const w = GW[0]![a]! * wyz, o = 3 * (kx + nx * (ky + ny * kz));
        dx += w * g.d[o]!; dy += w * g.d[o + 1]!; dz += w * g.d[o + 2]!;
      }
    }
  }
  return softLimit3(dx, dy, dz, GRID_LIMIT);
}
const r5 = (v: number): number => Math.round(v * 1e5) / 1e5;
/** The edit with its liquify strokes folded into its displacement grid (and the old grid kept): same shape to within the grid's resolution, a fixed cost per vertex, and no stroke is ever dropped. The grid's box is the strokes' reach (and the old grid's box). */
export function foldStrokes(edit: OrganEdit): OrganEdit {
  const e = clampEdit(edit);
  if (!e.strokes.length) return edit;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const s of e.strokes) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, s.at[k]! - s.radius); hi[k] = Math.max(hi[k]!, s.at[k]! + s.radius); }
  const old = e.grid;
  if (old) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, old.lo[k]!); hi[k] = Math.max(hi[k]!, old.hi[k]!); }
  const n = GRID_N, d: number[] = new Array(3 * n * n * n);
  let any = false;
  for (let kz = 0; kz < n; kz++) for (let ky = 0; ky < n; ky++) for (let kx = 0; kx < n; kx++) {
    const px = lo[0]! + (hi[0]! - lo[0]!) * kx / (n - 1), py = lo[1]! + (hi[1]! - lo[1]!) * ky / (n - 1), pz = lo[2]! + (hi[2]! - lo[2]!) * kz / (n - 1);
    const [sx, sy, sz] = strokePull(e.strokes, px, py, pz), [gx, gy, gz] = old ? gridSample(old, [px, py, pz]) : [0, 0, 0];
    const o = 3 * (kx + n * (ky + n * kz));
    d[o] = r5(sx + gx); d[o + 1] = r5(sy + gy); d[o + 2] = r5(sz + gz);
    if (d[o] || d[o + 1] || d[o + 2]) any = true;
  }
  const { strokes: _s, ...rest } = edit;
  return { ...rest, ...(any ? { grid: { n: [n, n, n] as const, lo: [lo[0]!, lo[1]!, lo[2]!] as V3, hi: [hi[0]!, hi[1]!, hi[2]!] as V3, d } } : { grid: undefined }) };
}
const folded = new WeakMap<OrganEdit, OrganEdit>();
/** The edit as the apply reads it: a long stroke list becomes a grid (once per edit object), a short one stays exact. */
export function resolveEdit(e: OrganEdit): OrganEdit {
  if ((e.strokes?.length ?? 0) <= FOLD_AT) return e;
  let r = folded.get(e);
  if (!r) { r = foldStrokes(e); folded.set(e, r); }
  return r;
}

/** The cage points' rest places (the lattice over the padded box), x fastest, as the editor draws them. */
export function cageRest(n: readonly [number, number, number], box: Box): V3[] {
  const b = cageBox(box), out: V3[] = [];
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++)
    out.push([b.lo[0] + (b.hi[0] - b.lo[0]) * i / (n[0] - 1), b.lo[1] + (b.hi[1] - b.lo[1]) * j / (n[1] - 1), b.lo[2] + (b.hi[2] - b.lo[2]) * k / (n[2] - 1)]);
  return out;
}
/** Bernstein weights of degree m-1 at s (0..1). */
function bern(m: number, s: number, out: number[]): void {
  const t = 1 - s;
  for (let i = 0; i < m; i++) { let c = 1; for (let q = 0; q < i; q++) c = c * (m - 1 - q) / (q + 1); out[i] = c * s ** i * t ** (m - 1 - i); }
}
/** The cage's pull on a reference-frame point: trivariate Bernstein blend of the handle offsets (each held to CAGE_LIMIT of the padded box), the point clamped into the box. Pure of the point, so welded vertices stay welded. */
export function cageDisplace(c: Cage, box: Box, p: V3): V3 {
  const b = cageBox(box), [nx, ny, nz] = c.n, wx: number[] = [], wy: number[] = [], wz: number[] = [];
  const size = [b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]];
  const s = [0, 1, 2].map((k) => (size[k]! > 1e-9 ? clamp((p[k]! - b.lo[k]!) / size[k]!, 0, 1) : 0));
  bern(nx, s[0]!, wx); bern(ny, s[1]!, wy); bern(nz, s[2]!, wz);
  let dx = 0, dy = 0, dz = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const h = c.d[i + nx * (j + ny * k)]!, w = wx[i]! * wy[j]! * wz[k]!;
    if (!w) continue;
    dx += w * softLimit(h[0], CAGE_LIMIT * size[0]!); dy += w * softLimit(h[1], CAGE_LIMIT * size[1]!); dz += w * softLimit(h[2], CAGE_LIMIT * size[2]!);
  }
  return [dx, dy, dz];
}

/** The edit as it will be applied: every number finite and inside its limit (a move is clamped by its length). */
export function clampEdit(e: OrganEdit): { move: V3; rotY: number; scale: number; strokes: { at: V3; radius: number; by: V3 }[]; cage: Cage | null; grid: Grid | null } {
  let mv: [number, number, number] = [0, 0, 0];
  if (e.move && e.move.length === 3 && e.move.every(fin)) {
    mv = [e.move[0], e.move[1], e.move[2]];
    const l = Math.hypot(...mv);
    if (l > ORGAN_LIMITS.move) mv = [mv[0] * ORGAN_LIMITS.move / l, mv[1] * ORGAN_LIMITS.move / l, mv[2] * ORGAN_LIMITS.move / l];
  }
  const strokes = (e.strokes ?? []).filter((s) => s && s.at?.length === 3 && s.by?.length === 3 && s.at.every(fin) && s.by.every(fin) && fin(s.radius) && s.radius > 1e-6)
    .map((s) => ({ at: [s.at[0], s.at[1], s.at[2]] as V3, radius: s.radius, by: [s.by[0], s.by[1], s.by[2]] as V3 }));
  return { move: mv, rotY: fin(e.rotY) ? clamp(e.rotY, -ORGAN_LIMITS.rotY, ORGAN_LIMITS.rotY) : 0, scale: fin(e.scale) ? clamp(e.scale, ORGAN_LIMITS.scaleMin, ORGAN_LIMITS.scaleMax) : 1, strokes, cage: validCage(e.cage), grid: validGrid(e.grid) };
}

/** A smooth saturating limit: `v` itself up to half of `lim`, then it eases (tanh) toward `lim` and never reaches it, so a limit has no plateau edge (a hard clamp makes a flat patch with a crease round it). Odd, so it holds for negative `v`. */
export function softLimit(v: number, lim: number): number {
  const a = Math.abs(v), k = lim * 0.5;
  if (a <= k) return v;
  const r = k + (lim - k) * Math.tanh((a - k) / (lim - k));
  return v < 0 ? -r : r;
}
/** The same limit on a vector's length (direction kept). */
export function softLimit3(x: number, y: number, z: number, lim: number): [number, number, number] {
  const l = Math.hypot(x, y, z);
  if (l <= lim * 0.5) return [x, y, z];
  const k = softLimit(l, lim) / l;
  return [x * k, y * k, z * k];
}

/** Smooth C2 falloff: 1 at the stroke's centre, 0 (with zero slope and curvature) at its radius. */
export const wendland = (r: number): number => (r >= 1 ? 0 : (1 - r) ** 4 * (4 * r + 1));

/** The pull of the liquify strokes on a point of the organ's reference frame: the strokes' falloff-weighted sum, its length clamped to LIQUIFY_LIMIT (what applyOrganEdit does to each vertex). */
function strokePull(strokes: readonly { at: V3; radius: number; by: V3 }[], x: number, y: number, z: number): [number, number, number] {
  let dx = 0, dy = 0, dz = 0;
  for (const s of strokes) {
    const d = Math.hypot(x - s.at[0], y - s.at[1], z - s.at[2]);
    if (d >= s.radius) continue;
    const w = wendland(d / s.radius);
    dx += s.by[0] * w; dy += s.by[1] * w; dz += s.by[2] * w;
  }
  return softLimit3(dx, dy, dz, LIQUIFY_LIMIT);
}
/** How far an organ's liquify strokes pull a point of its reference frame (scene units): the same falloff and clamp as the mesh vertex at that place. [0, 0, 0] when the organ has no strokes. */
export function strokeDisplace(edit: OrganEdit | undefined, p: V3): V3 {
  if (!edit) return [0, 0, 0];
  const e = clampEdit(resolveEdit(edit)), s = e.strokes.length ? strokePull(e.strokes, p[0], p[1], p[2]) : [0, 0, 0], g = e.grid ? gridSample(e.grid, p) : [0, 0, 0];
  return [s[0]! + g[0]!, s[1]! + g[1]!, s[2]! + g[2]!];
}

/**
 * Edits `g` in place (and returns it). `origin` is the shift between the stored positions and the frame the edit is written in (the live path edits before the organ's depth shift).
 * `centroid` (that frame) overrides the organ's own centre, so two meshes of one organ (the finished stomach and the raw one) turn about the same point.
 */
export function applyOrganEdit(g: BufferGeometry, edit: OrganEdit | undefined, opts: { origin?: V3; centroid?: V3; box?: Box } = {}): BufferGeometry {
  if (!edit) return g;
  const e = clampEdit(resolveEdit(edit));
  const plain = e.move[0] === 0 && e.move[1] === 0 && e.move[2] === 0 && e.rotY === 0 && e.scale === 1;
  if (plain && !e.strokes.length && !e.cage && !e.grid) return g;
  const o = opts.origin ?? [0, 0, 0], c = opts.centroid ?? organCentroid(g, o), box = e.cage ? opts.box ?? organBox(g, o) : null;
  const pos = g.getAttribute('position'), a = pos.array as Float32Array, n = pos.count;
  const cs = Math.cos(e.rotY), sn = Math.sin(e.rotY);
  for (let i = 0; i < n; i++) {
    let x = a[3 * i]! + o[0], y = a[3 * i + 1]! + o[1], z = a[3 * i + 2]! + o[2];
    const [dx, dy, dz] = strokePull(e.strokes, x, y, z);
    const [cx, cy, cz] = e.cage ? cageDisplace(e.cage, box!, [x, y, z]) : [0, 0, 0];
    const [gx, gy, gz] = e.grid ? gridSample(e.grid, [x, y, z]) : [0, 0, 0];
    x += dx + cx + gx; y += dy + cy + gy; z += dz + cz + gz;
    // about the centroid: scale, then turn about the vertical axis, then move
    const rx = (x - c[0]) * e.scale, ry = (y - c[1]) * e.scale, rz = (z - c[2]) * e.scale;
    a[3 * i] = c[0] + rx * cs + rz * sn + e.move[0] - o[0];
    a[3 * i + 1] = c[1] + ry + e.move[1] - o[1];
    a[3 * i + 2] = c[2] - rx * sn + rz * cs + e.move[2] - o[2];
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  const nrm = g.getAttribute('normal').array, idx = g.index ? g.index.array : [];
  if (g.getAttribute('shadeN')) g.setAttribute('shadeN', new Float32BufferAttribute(smoothRestNormals(a, nrm, idx, SHADE_PASSES), 3));
  if (g.getAttribute('hullN')) g.setAttribute('hullN', new Float32BufferAttribute(smoothRestNormals(a, nrm, idx), 3));
  g.computeBoundingBox(); g.boundingSphere = null;
  return g;
}

/** An organ's edit as a point map, for anchors that hang on the organ (a caption, a scope's way, a bleed, the ascites wall): the point of the reference frame goes where the mesh vertex at that place goes
 *  (liquify strokes first, then scale about `centroid`, the turn about the vertical axis and the move: the arithmetic of applyOrganEdit). Null when the edit moves nothing. */
export function organPointMap(edit: OrganEdit | undefined, centroid: V3, box?: Box): ((p: V3) => V3) | null {
  if (!edit) return null;
  const e = clampEdit(resolveEdit(edit));
  if (e.move[0] === 0 && e.move[1] === 0 && e.move[2] === 0 && e.rotY === 0 && e.scale === 1 && !e.strokes.length && !e.grid && !(e.cage && box)) return null;
  const cs = Math.cos(e.rotY), sn = Math.sin(e.rotY), c = centroid;
  return (p) => {
    const [dx, dy, dz] = strokePull(e.strokes, p[0], p[1], p[2]);
    const [cx, cy, cz] = e.cage && box ? cageDisplace(e.cage, box, p) : [0, 0, 0];
    const [gx, gy, gz] = e.grid ? gridSample(e.grid, p) : [0, 0, 0];
    const rx = (p[0] + dx + cx + gx - c[0]) * e.scale, ry = (p[1] + dy + cy + gy - c[1]) * e.scale, rz = (p[2] + dz + cz + gz - c[2]) * e.scale;
    return [c[0] + rx * cs + rz * sn + e.move[0], c[1] + ry + e.move[1], c[2] - rx * sn + rz * cs + e.move[2]];
  };
}

/** Each organ's reference centre (scene units, before any edit), noted by the places that make the organs; the UI lists them (meshes.ts editableOrgans). */
export const organCentroids: Record<string, V3> = {};
/** Each organ's reference bounding box (before any edit), the cage's frame. */
export const organBoxes: Record<string, Box> = {};
