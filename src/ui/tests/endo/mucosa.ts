// The mucosa's own texture in the scope's picture, from the 2D shader's formulas (endo-render.js / endo-gl.js shade(): the same noise, the same constants, copied in endo-field.copied.js):
//   mottle: the wall is not one flat pink: 0.93 + 0.12 · mott (two octaves of noise, 14 and 40 cells round the lumen) scales the mucosa's colour. Here it is a ring of soft patches, lighter or darker
//           than the wall's mean, laid over the wall before the columns.
//   net:    the fine submucosal vessels: a thin red-violet net along the wall, lost with depth. The shader's ridges rid = 1 − |2n − 1| of two warped noises (n1 at 36 cells, n2 at 90) over 0.93, so the
//           net is the n = 0.5 contour of each, traced here (marching squares) in (angle, depth) and laid over the wall as thin lines, before the columns.
// Both are static for a lumen (they depend on neither the varix nor the bands), so they are made once, in the field's own coordinates (angle, depth), and projected by the frame. Pure.
import { TAU, nz, sstep } from '../copied/endo-field.copied.js';

/** The wall's mean mottle factor (0.93 + 0.12 · 0.5-ish): patches are drawn as the difference from it. */
export const MOTTLE_MEAN = 0.99;
export const mottleAt = (th: number, z: number): number => {
  const mott = nz(th / TAU * 14, z * 0.9, 14) * 0.6 + nz(th / TAU * 40, z * 2.5, 40) * 0.4;
  return 0.93 + 0.12 * mott - MOTTLE_MEAN;
};
export interface Patch { th: number; z: number; /** the share over the colour: + lightens (toward white), − darkens (toward black) */ d: number }
const AN = 56, ZN = 22, Z0 = 0.66, Z1 = 5.9;
let patches: Patch[] | null = null;
/** The mottle's patches: a log-spaced ring grid of cells about as wide as they are deep, those whose factor leaves the mean by more than the eye sees. */
export function mottlePatches(): readonly Patch[] {
  if (patches) return patches;
  patches = [];
  for (let j = 0; j < ZN; j++) {
    const z = Z0 * Math.pow(Z1 / Z0, (j + 0.5) / ZN);
    for (let i = 0; i < AN; i++) {
      const th = ((i + (j % 2 ? 0.5 : 0)) / AN) * TAU, d = mottleAt(th, z);
      if (Math.abs(d) >= 0.014) patches.push({ th, z, d });
    }
  }
  return patches;
}

// ── the vessel net ──
const n1At = (th: number, z: number) => { const u = th / TAU; return nz(u * 36 + 0.6 * nz(u * 9, z * 1.1, 9), z * 1.6, 36); };
const n2At = (th: number, z: number) => nz(th / TAU * 90, z * 4.2 + 3 * n1At(th, z), 90);
/** How much of the wall the net takes at depth z, by the shader's two ridges (their weights 0.16 and 0.1), faded in from 0.5 and out by 5. */
export const netFade = (z: number) => (1 - sstep(2.2, 5, z)) * sstep(0.5, 0.75, z);
export interface NetLine { z: number; weight: number; /** [th, z, th, z, …] */ pts: number[] }

/** The contour n = 0.5 of f over an (angle, depth) grid, as polylines of grid-space points (angle wraps). */
function contour(f: (th: number, z: number) => number, cols: number, zs: number[]): number[][] {
  const rows = zs.length, v = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) v[j * cols + i] = f((i / cols) * TAU, zs[j]!);
  const at = (i: number, j: number) => v[j * cols + (i % cols)]!;
  // an edge's id: horizontal (i, j)-(i+1, j) is 2·(j·cols + i), vertical (i, j)-(i, j+1) is 2·(j·cols + i) + 1
  const H = (i: number, j: number) => 2 * (j * cols + (i % cols)), V = (i: number, j: number) => 2 * (j * cols + (i % cols)) + 1;
  const segs: [number, number][] = [], link = new Map<number, number[]>();
  const add = (a: number, b: number) => { segs.push([a, b]); for (const e of [a, b]) { const l = link.get(e); if (l) l.push(segs.length - 1); else link.set(e, [segs.length - 1]); } };
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols; i++) {
    const a = at(i, j) > 0.5, b = at(i + 1, j) > 0.5, c = at(i + 1, j + 1) > 0.5, d = at(i, j + 1) > 0.5;
    const bot = H(i, j), right = V(i + 1, j), top = H(i, j + 1), left = V(i, j);
    switch ((a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0)) {
      case 1: case 14: add(left, bot); break;
      case 2: case 13: add(bot, right); break;
      case 3: case 12: add(left, right); break;
      case 4: case 11: add(right, top); break;
      case 6: case 9: add(bot, top); break;
      case 7: case 8: add(left, top); break;
      case 5: add(left, bot); add(right, top); break;
      case 10: add(bot, right); add(top, left); break;
      default: break;
    }
  }
  // where an edge's crossing is, in grid space (x wraps: a polyline across the seam keeps going past `cols`)
  const pos = (e: number, near: number): [number, number] => {
    const vert = e & 1, cell = e >> 1, j = Math.floor(cell / cols), i = cell % cols;
    const [va, vb] = vert ? [v[j * cols + i]!, v[(j + 1) * cols + i]!] : [v[j * cols + i]!, v[j * cols + ((i + 1) % cols)]!];
    const t = (0.5 - va) / (vb - va || 1e-9);
    let x = vert ? i : i + t;
    // unwrap to the side of `near` the line is on
    while (x - near > cols / 2) x -= cols;
    while (near - x > cols / 2) x += cols;
    return [x, vert ? j + t : j];
  };
  const used = new Uint8Array(segs.length), out: number[][] = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    // walk both ways from this segment
    const edges: number[] = [segs[s0]![0], segs[s0]![1]];
    used[s0] = 1;
    for (const dir of [1, 0]) {
      for (;;) {
        const tail = dir ? edges[edges.length - 1]! : edges[0]!;
        const next = (link.get(tail) ?? []).find((k) => !used[k]);
        if (next === undefined) break;
        used[next] = 1;
        const o = segs[next]![0] === tail ? segs[next]![1] : segs[next]![0];
        if (dir) edges.push(o); else edges.unshift(o);
      }
    }
    const pts: number[] = [];
    let near = pos(edges[0]!, 0)[0];
    for (const e of edges) { const [x, y] = pos(e, near); near = x; pts.push(x, y); }
    out.push(pts);
  }
  return out;
}

const CHUNK = 12;
let net: NetLine[] | null = null;
/** The net: n1's contour to z 4.6 and the finer n2's to 2.4 (further in, its lines are narrower than a pixel), cut into short runs so each carries the fade of where it lies. */
export function netLines(): readonly NetLine[] {
  if (net) return net;
  net = [];
  const build = (f: (th: number, z: number) => number, cols: number, zA: number, zB: number, dz: number, weight: number) => {
    const rows = Math.ceil((zB - zA) / dz) + 1, zs = Array.from({ length: rows }, (_, j) => zA + j * dz);
    for (const line of contour(f, cols, zs)) {
      const pts = line.slice();
      for (let k = 0; k + 1 < pts.length; k += 2) { pts[k] = (pts[k]! / cols) * TAU; const gy = pts[k + 1]!, j = Math.min(rows - 2, Math.floor(gy)); pts[k + 1] = zs[j]! + (gy - j) * dz; }
      for (let p = 0; p + 1 < pts.length / 2; p += CHUNK - 1) {
        const run = pts.slice(p * 2, Math.min(pts.length, (p + CHUNK) * 2));
        if (run.length < 4) continue;
        let zm = 0; for (let k = 1; k < run.length; k += 2) zm += run[k]!;
        zm /= run.length / 2;
        if (netFade(zm) * weight > 0.004) net!.push({ z: zm, weight, pts: run });
      }
    }
  };
  build(n1At, 180, 0.55, 4.6, 0.12, 0.16);
  build(n2At, 360, 0.55, 2.4, 0.05, 0.1);
  return net;
}
