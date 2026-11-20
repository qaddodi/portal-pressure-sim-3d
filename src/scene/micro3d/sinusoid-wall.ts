// The sinusoid's wall, as a thin shell round the lumen cut open along its length (Mohammad, 20 Nov 2026: "extend the surface of the endothelial cell into the vessel wall, curve it, and have the cut
// out of the fenestrae holes kinda cut middle cylinder"; design A1 of the mock-ups). The lumen is an ellipse across (half width H, depth Z.trough x H); the wall is the shell of thickness TW outside
// it. The endothelial cell is the wall itself: its surface runs down the curve from the cut and fades into the blood's colour lower down, and at the nucleus the same surface hangs a little into the
// lumen. The fenestrae are cylinders along the shell's outward normal, straight through its thickness: the cut passes through the axis of the first of each slot, so the cut edge shows it as a
// half-pipe gutter, and a second bore, lower on the curve, shows the same hole whole.
//
// Everything here is pure geometry in the sinusoid's frame (µm; y down as 2D's, z toward the viewer): the scene (sinusoid3d.ts) puts it in the plane (y up) and gives it colours and shaders.
import { MeshBuilder } from './cel3d.ts';
import { SEED, nucAt } from '../sinusoid/layout.ts';

/** The lumen's depth as a share of its half width (the same as sinusoid3d's Z.trough: tests/micro3d-wall.test.ts holds the two together). */
export const TROUGH_K = 0.92;
export const WALL = {
  /** How far down the curve (radians from the cut) the shell runs; the lumen's own surface takes over from there. */
  phi1: 0.62,
  /** The shell's rows down the curve (spaced closely at the cut, where the bores are). */
  rows: 36,
  /** The second bore of each slot: s down the wall from the cut (µm) and its x from the slot's centre (µm). */
  s2: 1.15, dx2: 0.12,
  /** How far the cell hangs into the lumen at its nucleus (µm), and the arc (µm) over which it comes back to the wall. */
  hang: 0.9, hangS: [1.2, 3.2],
  /** The cell's footprint (a lens from the nucleus's middle: half length along x, half width down the wall about s) and its nucleus's section on the cut (half length, share of the band's width). */
  cellHalf: 4.6, cellS: 0.7, cellHs: 1.5, nucHalf: 3.1, nucFy: 0.45, nucHfy: 0.32,
  /** The lining's colour fades into the blood's from this angle to phi1. */
  fadeFrom: 0.22,
} as const;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** What the wall reads of the host: the lumen's half width and the wall's outer face (µm from the axis), at x. */
export interface WallGeo { halfW(x: number): number; wallIn(x: number): number }

/** How far the cell swells at x (0 bare wall to 1 the nucleus's middle): a raised cosine round the nearest nucleus of the lining (seed nsd), over cellHalf each way. */
export function endoSwell(x: number, nsd: number): number {
  const n = Math.floor(x / 38);
  let sw = 0;
  for (let k = -1; k <= 1; k++) {
    const u = Math.abs(x - nucAt(n + k, nsd)) / WALL.cellHalf;
    if (u < 1) sw = Math.max(sw, 0.5 * (1 + Math.cos(Math.PI * u)));
  }
  return sw;
}

// ---- the curve ---------------------------------------------------------------------------------------------------------------------

// arc length down the ellipse from the cut, as a share of H: S(phi) = integral of sqrt(sin^2 + K^2 cos^2); s = H x S(phi)
const NS = 512, PHI_TOP = 1.7;
const sTab = new Float64Array(NS + 1);
for (let i = 1; i <= NS; i++) { const p = ((i - 0.5) / NS) * PHI_TOP; sTab[i] = sTab[i - 1]! + Math.hypot(Math.sin(p), TROUGH_K * Math.cos(p)) * (PHI_TOP / NS); }
/** Arc down the curve from the cut, in units of H. */
export function arcOf(phi: number): number { const t = clamp(phi, 0, PHI_TOP) / PHI_TOP * NS, i = Math.min(NS - 1, Math.floor(t)); return sTab[i]! + (sTab[i + 1]! - sTab[i]!) * (t - i); }
/** The angle at arc `a` (units of H). */
export function phiAt(a: number): number { let lo = 0, hi = NS; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sTab[m]! <= a) lo = m; else hi = m; } return ((lo + (a - sTab[lo]!) / (sTab[hi]! - sTab[lo]!)) / NS) * PHI_TOP; }
/** The outward unit normal of the lumen's ellipse at phi, as (y, z) (y away from the axis, z toward the viewer). */
export function nHat(phi: number, H: number): [number, number] { const a = Math.cos(phi) / H, b = -Math.sin(phi) / (TROUGH_K * H), l = Math.hypot(a, b); return [a / l, b / l]; }

/** How far the cell hangs into the lumen at (x, s). */
export function hangAt(x: number, s: number, nsd: number | null): number { if (nsd === null) return 0; return WALL.hang * endoSwell(x, nsd) * (1 - smooth(WALL.hangS[0], WALL.hangS[1], s)); }
/** The cell's share of the surface at (x, s): 1 inside its footprint, melting to 0 at its edge (no outline: Mohammad, 20 Nov 2026, "there should not be a line separating the cell from its body"). */
export function cellShare(x: number, s: number, nsd: number): number {
  const n = Math.floor(x / 38);
  let m = 0;
  for (let k = -1; k <= 1; k++) {
    const rr = Math.hypot((x - nucAt(n + k, nsd)) / WALL.cellHalf, (s - WALL.cellS) / WALL.cellHs);
    m = Math.max(m, 1 - smooth(0.5, 1, rr));
  }
  return m;
}

/** The inner surface (facing the lumen) at x and angle phi: [yd, z], the cell's hang taken off along the normal. */
export function innerPoint(g: WallGeo, x: number, phi: number, nsd: number | null): [number, number] {
  const H = g.halfW(x), n = nHat(phi, H), d = hangAt(x, H * arcOf(phi), nsd);
  return [H * Math.cos(phi) - n[0] * d, -TROUGH_K * H * Math.sin(phi) - n[1] * d];
}
/** The outer surface (the wall's far face, toward Disse) at x and angle phi: [yd, z]. */
export function outerPoint(g: WallGeo, x: number, phi: number): [number, number] {
  const H = g.halfW(x), n = nHat(phi, H), t = g.wallIn(x) - H;
  return [H * Math.cos(phi) + n[0] * t, -TROUGH_K * H * Math.sin(phi) + n[1] * t];
}
/** The angle down the curve where the outer face meets Disse's floor (z = zFloor). */
export function outerPhiAt(g: WallGeo, x: number, zFloor: number): number {
  let lo = 0, hi = 1.2;
  for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (outerPoint(g, x, m)[1] > zFloor) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** The rows down the curve, close together at the cut. */
export const phiRow = (k: number, K: number, top: number): number => top * (k / K) ** 2;

/** Colour weights per vertex of a built shell or face, in vertex order: the share that is the cell's sheet and the share that has faded into the blood. */
export interface Weights { cell: number[]; lum: number[] }
export const newWeights = (): Weights => ({ cell: [], lum: [] });

type Side = -1 | 1;
const Yp = (yDown: number): number => -yDown;
const cross = (a: number[], b: number[]): number[] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

/** The columns along x: every µm, every half µm where the cell swells. */
export function wallColumns(x0: number, x1: number): number[] {
  const xs: number[] = [];
  for (let x = x0; x <= x1 + 1e-6; x += 1) {
    xs.push(x);
    if (x + 1 <= x1 + 1e-6 && (endoSwell(x, SEED.nucUp) > 0 || endoSwell(x + 1, SEED.nucUp) > 0 || endoSwell(x, SEED.nucDn) > 0 || endoSwell(x + 1, SEED.nucDn) > 0)) xs.push(x + 0.5);
  }
  return xs;
}

/**
 * One side's shell: the inner surface from the cut down the curve to phi1 (kind 'in', facing the lumen) or the outer one from the cut down to Disse's floor (kind 'out', facing away). Each vertex
 * carries `aux`, its place s down the wall (µm), for the round holes of the second bore. Colours are weights (see Weights), painted by the scene.
 */
export function buildShell(b: MeshBuilder, w: Weights, g: WallGeo, xs: readonly number[], side: Side, kind: 'in' | 'out', zFloor: number): void {
  const nsd = side < 0 ? SEED.nucUp : SEED.nucDn, K = kind === 'in' ? WALL.rows : 10, rows: number[] = [];
  const pt = (x: number, phi: number): [number, number] => (kind === 'in' ? innerPoint(g, x, phi, nsd) : outerPoint(g, x, phi));
  for (const x of xs) {
    rows.push(b.count);
    const top = kind === 'in' ? WALL.phi1 : outerPhiAt(g, x, zFloor), H = g.halfW(x);
    for (let k = 0; k <= K; k++) {
      const phi = phiRow(k, K, top), P = pt(x, phi), e = 0.02, dv = 0.003;
      const px = [2 * e, pt(x + e, phi)[0] - pt(x - e, phi)[0], pt(x + e, phi)[1] - pt(x - e, phi)[1]];
      const pv = [0, pt(x, phi + dv)[0] - pt(x, Math.max(0, phi - dv))[0], pt(x, phi + dv)[1] - pt(x, Math.max(0, phi - dv))[1]];
      let n = cross(px, pv); const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1; n = [n[0]! / l, n[1]! / l, n[2]! / l];
      const nh = nHat(phi, H), out = n[1]! * nh[0] + n[2]! * nh[1];
      if ((kind === 'in' && out > 0) || (kind === 'out' && out < 0)) n = [-n[0]!, -n[1]!, -n[2]!];
      b.v(x, Yp(side * P[0]), P[1], n[0]!, Yp(side * n[1]!), n[2]!, [1, 1, 1]);
      const s = H * arcOf(phi);
      b.aux.push(s);
      w.cell.push(kind === 'in' ? cellShare(x, s, nsd) : 0);
      w.lum.push(kind === 'in' ? smooth(WALL.fadeFrom, WALL.phi1, phi) : 0);
    }
  }
  const len = K + 1;
  for (let i = 0; i < rows.length - 1; i++) b.strip(rows[i]!, rows[i + 1]!, len);
}

/** One side's cut: the flat band at z = 0 from the cell's inner edge (hanging into the lumen at the nucleus) to the wall's outer face; `aux`, `aux2` run -1 to 1 across it, for the line along its two edges. */
export function buildCut(b: MeshBuilder, w: Weights, g: WallGeo, xs: readonly number[], side: Side): void {
  const nsd = side < 0 ? SEED.nucUp : SEED.nucDn, rows: number[] = [];
  for (const x of xs) {
    rows.push(b.count);
    const yi = g.halfW(x) - hangAt(x, 0, nsd), yo = g.wallIn(x), cs = cellShare(x, 0, nsd);
    b.v(x, Yp(side * yi), 0, 0, 0, 1, [1, 1, 1]); b.aux.push(-1); b.aux2.push(0); w.cell.push(cs); w.lum.push(0);
    b.v(x, Yp(side * yo), 0, 0, 0, 1, [1, 1, 1]); b.aux.push(1); b.aux2.push(0); w.cell.push(cs); w.lum.push(0);
  }
  for (let i = 0; i < rows.length - 1; i++) b.strip(rows[i]!, rows[i + 1]!, 2);
}

/** The nucleus the cut passes through: its section, an ellipse on the cut inside the cell's band (a hair above it); `aux`, `aux2` its place in the unit circle for the line drawn in the fill. */
export function buildNucleusSection(b: MeshBuilder, g: WallGeo, side: Side, xn: number, seg = 48, rings = 8): void {
  const nsd = side < 0 ? SEED.nucUp : SEED.nucDn, base = b.count;
  for (let r = 0; r <= rings; r++) {
    const rad = r / rings;
    for (let i = 0; i <= seg; i++) {
      const ph = (i / seg) * Math.PI * 2, u = rad * Math.cos(ph), v = rad * Math.sin(ph), x = xn + WALL.nucHalf * u;
      const yi = g.halfW(x) - hangAt(x, 0, nsd), yo = g.wallIn(x), fy = WALL.nucFy + WALL.nucHfy * v;
      b.v(x, Yp(side * (yi + (yo - yi) * fy)), 0.012, 0, 0, 1); b.aux.push(u); b.aux2.push(v);
    }
  }
  for (let r = 0; r < rings; r++) for (let i = 0; i < seg; i++) { const a0 = base + r * (seg + 1) + i, b0 = a0 + seg + 1; b.quad(a0, b0, b0 + 1, a0 + 1); }
}

/** A bore of radius r in the slot at x (µm): the gutter the cut makes through the first (half a cylinder along y, below the cut) and the whole cylinder of the second down the curve, each from the
 *  lumen to the wall's outer face. Vertex colours run from 1 at the lumen's end to 0.5 at Disse's, so the bore darkens as it goes in. Normals face the bore's axis. */
export function buildBore(b: MeshBuilder, g: WallGeo, side: Side, x: number, r: number): void {
  const SEG = 12, SEG2 = 18;
  // the gutter: half the cylinder (z <= 0) along y at the cut
  {
    const H = g.halfW(x), y0 = H, y1 = g.wallIn(x), rows: number[] = [];
    for (const [yd, k] of [[y0, 1], [y1, 0.5]] as [number, number][]) {
      rows.push(b.count);
      for (let i = 0; i <= SEG; i++) { const a = Math.PI + (i / SEG) * Math.PI, c = Math.cos(a), sn = Math.sin(a); b.v(x + r * c, Yp(side * yd), r * sn, -c, 0, -sn, [k, k, k]); }
    }
    b.strip(rows[0]!, rows[1]!, SEG + 1);
  }
  // the second bore: a whole cylinder along the outward normal at s2 down the curve
  {
    const x2 = x + WALL.dx2, H = g.halfW(x2), phi = phiAt(WALL.s2 / H), n = nHat(phi, H), P = innerPoint(g, x2, phi, null), t = g.wallIn(x2) - H, rows: number[] = [];
    for (const k of [0, 1]) {
      rows.push(b.count);
      for (let i = 0; i <= SEG2; i++) {
        const a = (i / SEG2) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        // (e1 = x; e2 = across the normal in the (y, z) plane)
        const yd = P[0] + n[0] * t * k + r * sn * -n[1], z = P[1] + n[1] * t * k + r * sn * n[0];
        const ny = sn * n[1], nz = -sn * n[0];   // (toward the axis: minus the offset)
        b.v(x2 + r * c, Yp(side * yd), z, -c, Yp(side * ny), nz, [1 - 0.5 * k, 1 - 0.5 * k, 1 - 0.5 * k]);
      }
    }
    b.strip(rows[0]!, rows[1]!, SEG2 + 1);
  }
}
