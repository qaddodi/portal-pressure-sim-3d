// Where everything of the sinusoid view stands: a port of the 2D app's placement (sinusoid-gl.js), in the sinusoid's own frame in micrometres (x along the flow,
// portal end first; y across, up), so the 3D sinusoid has the same cells, pores, nuclei and canaliculi in the same places as the 2D one. The 2D shader and its
// JavaScript share one integer hash; this is that hash and the functions built on it (tests/scene-sinusoid-layout.test.ts holds values taken from the 2D file).
export const SLOT = 1;       // fenestra slots (µm): ten to a stretch of lining, with a sieve plate in it
export const CELL = 24;      // hepatocyte pitch along a plate (µm)
export const PORE_W = 0.6;
/** The layers across the sinusoid, in µm, from its axis out: the lumen's half width, the endothelium, the space of Disse, one hepatocyte plate. */
export const UM = { lum: 5, endo: 0.8, disse: 3.4, hep: 20 } as const;
/** The 2D app's seeds: the main sinusoid's linings (upper, lower), its plates (upper, lower). */
export const SEED = { poreUp: 3, poreDn: 5, nucUp: 41, nucDn: 42, plateUp: 29, plateDn: 71 } as const;

const hsh = (x0: number): number => {
  let x = x0 >>> 0;
  x = (x ^ (x >>> 16)) >>> 0; x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0; x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
};
/** A hash of (i, seed) in [0, 1), 24 bits. */
export const h1 = (i: number, s: number): number => (hsh((Math.imul((i + 1048576) >>> 0, 0x9e3779b1) ^ hsh(s)) >>> 0) >>> 8) / 16777216;

export interface Pore { x: number; w: number; th: number }
/** The fenestra in slot j of a lining (seed), or null: its centre, width and the porosity below which it shuts. Each sieve plate is five evenly spaced pores. */
export function poreAt(j: number, sd: number): Pore | null {
  const G = Math.floor(j / 10), k = j - 10 * G;
  if (h1(G, sd) >= 0.8 || k < 3 || k > 7) return null;
  return { x: SLOT * j + 0.5, w: PORE_W, th: 0.12 + 0.28 * Math.abs(k - 5) + 0.18 * h1(G, sd + 4) };
}
/** How open a fenestra is (0 to 1) at the lining's open share `por`. */
export const poreOpenness = (th: number, por: number): number => { const t = Math.min(1, Math.max(0, (por - th + 0.06) / 0.12)); return t * t * (3 - 2 * t); };
/** Boundary j of a plate's cells (seed). */
export const cellEdge = (j: number, sd: number): number => CELL * j + 7 * (h1(j, sd) - 0.5);
/** A cell border's x at depth v into the plate (v 0 at its face on the space of Disse): the 2D's straight line with one gentle bend and a tilt, so neighbours fit like tiles. */
export function edgeAt(j: number, sd: number, v: number): number {
  const vm = UM.hep * (0.3 + 0.4 * h1(j, sd + 9)), bend = 4 * (h1(j, sd + 10) - 0.5), tilt = 2.6 * (h1(j, sd + 11) - 0.5);
  return cellEdge(j, sd) + bend * (Math.abs(v - vm) / (0.5 * UM.hep) - 0.5) + tilt * (v / UM.hep - 0.5);
}
/** Where (µm along) the bile canaliculus sits on border j of a plate: the border at mid-plate. */
export function canaliculusAt(j: number, sd: number): number {
  const vm = UM.hep * (0.3 + 0.4 * h1(j, sd + 9)), bend = 4 * (h1(j, sd + 10) - 0.5);
  return cellEdge(j, sd) + bend * (Math.abs(UM.hep * 0.5 - vm) / (0.5 * UM.hep) - 0.5);
}
export interface HepCell { j: number; x0: number; x1: number; nu: number; nv: number; nr: number; bi: boolean }
/** Cell j of a plate (seed): its ends and its nucleus (u along, v across as shares of the cell, radius in µm, binucleate). */
export function cellOf(j: number, sd: number): HepCell {
  return { j, x0: cellEdge(j, sd), x1: cellEdge(j + 1, sd), nu: 0.3 + 0.4 * h1(j, sd + 1), nv: 0.4 + 0.2 * h1(j, sd + 2), nr: 2.6 + 0.5 * h1(j, sd + 3), bi: h1(j, sd + 4) < 0.12 };
}
/** The centre (µm along) of endothelial nucleus n of a lining (seed nsd). */
export const nucAt = (n: number, nsd: number): number => 38 * n + 8 + 22 * h1(n, nsd);

/** How far (µm) a Kupffer cell's centre stands from any endothelial nucleus on its lining: the endothelial cell's swell (4.6 µm each way) and the Kupffer cell's own body and arms (about 5.4 µm along)
 *  never meet, so it sits on bare lining between two endothelial cells (Mohammad, 20 Nov 2026: "move the kupffer cell to be not on top of an endothelial cell"). */
export const KUP_CLEAR = 10.5;
/** The place nearest `want` (µm along) on the lining of nuclei seed `nsd` where a Kupffer cell is clear of every endothelial cell (KUP_CLEAR from each nucleus). */
export function kupfferClear(want: number, nsd: number): number {
  let best = want, bd = Infinity;
  const n0 = Math.floor(want / 38);
  for (let n = n0 - 3; n <= n0 + 3; n++) {
    const a = nucAt(n, nsd) + KUP_CLEAR, b = nucAt(n + 1, nsd) - KUP_CLEAR;
    if (b < a) continue;
    const x = Math.min(b, Math.max(a, want)), d = Math.abs(x - want);
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}
/** How far (µm) from a nucleus's centre its cell's swell hides the lining's fenestrae (2D: NUC_COVER). */
export const NUC_COVER = 4.4;
/** Whether the swell of an endothelial nucleus (seed nsd) covers the lining at x (2D: underNucleus). */
export function underNucleus(x: number, nsd: number): boolean {
  const n = Math.floor(x / 38);
  for (let k = -1; k <= 1; k++) if (Math.abs(x - nucAt(n + k, nsd)) < NUC_COVER) return true;
  return false;
}
/** The fenestra a callout points at (2D: calloutPore): of a lining's pores near x, one the nuclei's swells leave showing, open the longest and near x, on screen between lo and hi when one is. x itself when none is clear. */
export function calloutPore(pores: readonly Pore[], x: number, lo: number, hi: number, nsd: number): number {
  for (let pass = 0; pass < 2; pass++) {
    const a = pass ? -Infinity : lo, b = pass ? Infinity : hi;
    let best: Pore | null = null, bs = Infinity;
    for (const p of pores) {
      const dx = Math.abs(p.x - x);
      if (dx > 20 || p.x < a || p.x > b || underNucleus(p.x, nsd)) continue;
      const s = p.th + 0.02 * dx;
      if (s < bs) { bs = s; best = p; }
    }
    if (best) return best.x;
  }
  return x;
}
/** The cell of a plate (seed) that holds x, written into `out` (2D: cellAtInto). */
export function cellAt(x: number, sd: number): HepCell {
  let j = Math.floor(x / CELL);
  if (x < cellEdge(j, sd)) j--; else if (x >= cellEdge(j + 1, sd)) j++;
  return cellOf(j, sd);
}
