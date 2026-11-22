// The lobule's collagen at full strength, on a layer of its own (Plan 25b): the tail of 2D's paintLobule (lobule-paint.generated.js, which is never edited) with the septa, the portal tracts and the vein's wall at their fullest, and Plan 24's
// intimal ring, drawn with the generated file's own primitives in the painter's own order, so the layer over the tissue (painted with none of it) is the one-pass painting at the full state (source-over is associative).
// What grows and recedes is shown by the shader from the layer's arrival times (collagen-tau.ts); the bands' shapes are listed once here (`septaBands`) for the painter and for the times.
import { fibrousBand, fibrousCuff, fibrousTract } from './from2d/lobule-paint.generated.js';
import { paintIntima } from './cv-intima.ts';
import { lookColours } from './lz-colours.ts';
import { PLATE_S } from './plate.ts';
import type { LookId } from '../../looks/looks.ts';

type P2 = [number, number];
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** The painter's SPURS (the corners the early spurs leave) and its deeper periportal tones (PRE_LIGHT, PRE_DARK). */
const SPURS = [1, 3, 5], PRE_DARK = [0.86, 0.78, 0.6], PRE_LIGHT = [0.78, 0.64, 0.44];

/** What the painters of this layer read of the plate's shape (plate.ts plateShape): the lobule's size and corners, the portal-central septa, the tracts' and the vein's radii. */
export interface CollagenShape { R: number; cx: number; cy: number; rt: number; rcv0: number; lobules: { corners: P2[] }[]; septaPC: { pts: P2[] }[] }
export interface CollagenInput { G: CollagenShape; dark: boolean; rgb: { col: ArrayLike<number> }; cvIn: number; shadow: string }

/** A band's options as the painter's septumOpt sets them. */
export interface BandOpt { w: number; rgb: ArrayLike<number> | null; a: number; e0: number; e1: number; amp: number; seed: number; pts: P2[] | null; path: ((o: BandOpt, u: number, out: number[]) => void) | null }
/** One septum at its fullest: a hex edge's bridge (portal-portal), a portal-central bridge, or an early spur. */
export interface BandSpec { kind: 'hex' | 'pc' | 'spur'; A: P2; B: P2; o: BandOpt }

/** The painter's septumPath: a band's centre line along the septum's own points. */
function septumPath(o: BandOpt, u: number, out: number[]): void {
  const pts = o.pts!, f = Math.min(1, Math.max(0, u)) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
  out[0] = lerp(pts[i]![0], pts[i + 1]![0], t); out[1] = lerp(pts[i]![1], pts[i + 1]![1], t);
}

/** Every septum of the lobule at full cirrhosis (su 1: paintLobule's widths 0.045 + 0.075 su, the bridges' 0.6 + 0.3 g, the spurs' length 0.25 + 0.3), in the painter's drawing order. */
export function septaBands(G: CollagenShape, rgb: ArrayLike<number> | null = null): BandSpec[] {
  const R = G.R, w = R * 0.12, wHex = R * 0.2, wPC = R * 0.14, crn = G.lobules[0]!.corners, out: BandSpec[] = [];
  const opt = (ww: number, a: number, e1: number, amp: number, seed: number, pts: P2[] | null): BandOpt => ({ w: ww, rgb, a, e0: 1.5, e1, amp, seed, pts, path: pts ? septumPath : null });
  for (let i = 0; i < crn.length; i++) out.push({ kind: 'hex', A: crn[i]!, B: crn[(i + 1) % 6]!, o: opt(wHex, 1, 1.5, R * 0.025, 11 + i, null) });
  for (let k = 0; k < G.septaPC.length; k++) { const pts = G.septaPC[k]!.pts; out.push({ kind: 'pc', A: pts[0]!, B: pts[pts.length - 1]!, o: opt(wPC, 1, 0.9, 0, 31 + k, pts) }); }
  for (let k = 0; k < 3; k++) { const A = crn[SPURS[k]!]!; out.push({ kind: 'spur', A, B: [lerp(A[0], G.cx, 0.55), lerp(A[1], G.cy, 0.55)], o: opt(w * 0.55, 0.8, 0.15, R * 0.03, 41 + k, null) }); }
  return out;
}

/** The distinct tract corners (the painter draws one that rounds to an earlier one once). */
export function tractCorners(G: CollagenShape): [number, number, number][] {
  const corners = G.lobules[0]!.corners, out: [number, number, number][] = [];
  for (let ci = 0; ci < corners.length; ci++) {
    const [x, y] = corners[ci]!;
    let dup = false;
    for (let j = 0; j < ci && !dup; j++) dup = Math.round(corners[j]![0]) === Math.round(x) && Math.round(corners[j]![1]) === Math.round(y);
    if (!dup) out.push([x, y, ci]);
  }
  return out;
}

/** The septa at their fullest into a context whose transform is set (world units), with the nodules' shade beside them. Plan 31: painted on a layer of their own (see paintCollagenWorld), so a tract or the vein never carries a septum's ghost beneath it
 *  while the septa have not grown (schistosomiasis, SOS), and the wide septa never tint a tract's translucent cuff. */
export function paintSepta(c: CanvasRenderingContext2D, P: CollagenInput): void {
  const { G, rgb } = P, COL = rgb.col;
  c.save();
  c.shadowColor = P.shadow;
  // (each band twice, the second without the shade and the fibres, so the core is as dense as the bands' width is wide: coverage 0.67 to 0.89)
  for (const b of septaBands(G, COL)) { c.shadowBlur = G.R * 0.06; fibrousBand(c, b.A, b.B, b.o); c.shadowBlur = 0; fibrousBand(c, b.A, b.B, { ...b.o, detail: 0 } as BandOpt); }   // (nodules bulge beside the bands)
  c.restore();
  c.globalAlpha = 1;
}

/** The portal tracts, the vein's cuff and Plan 24's ring at their fullest, in the painter's order. */
export function paintTracts(c: CanvasRenderingContext2D, P: CollagenInput): void {
  const { G, dark, rgb } = P, COL = rgb.col, PRE = dark ? PRE_DARK : PRE_LIGHT;
  c.globalAlpha = 1;
  const rt = G.rt * 1.7;
  for (const [x, y, ci] of tractCorners(G)) {
    fibrousTract(c, x, y, rt, Math.atan2(y - G.cy, x - G.cx), PRE, 1, 900 + ci * 71);
    fibrousCuff(c, x, y, rt * 0.62, rt * 1.08, PRE, 1);
  }
  fibrousCuff(c, G.cx, G.cy, P.cvIn, P.cvIn + G.rcv0 * 0.95, COL, 1);
  paintIntima(c, { m: { fibPost: 1 }, G, rgb: { col: COL }, cvIn: P.cvIn });
}

/** The collagen layer is an atlas two plates wide, n × n each: the tracts and the vein on the left, the septa on the right (the shader reads each at its own uv). `which` paints one plate alone at the left (a node twin that is one plate square). */
export const ATLAS_W = 2;
export function paintCollagenWorld(w: CanvasRenderingContext2D, n: number, sc: number, bx: number, by: number, P: CollagenInput, which: 'atlas' | 'tracts' | 'septa' = 'atlas'): void {
  w.setTransform(1, 0, 0, 1, 0, 0); w.clearRect(0, 0, n * (which === 'atlas' ? ATLAS_W : 1), n);
  const plate = (dx: number, paint: (c: CanvasRenderingContext2D, P: CollagenInput) => void): void => {
    w.save(); w.beginPath(); w.rect(dx, 0, n, n); w.clip();
    w.setTransform(sc, 0, 0, sc, dx - bx * sc, -by * sc);
    paint(w, P); w.restore();
  };
  if (which !== 'septa') plate(0, paintTracts);
  if (which === 'septa') plate(0, paintSepta); else if (which === 'atlas') plate(n, paintSepta);
}

/** What the collagen painter reads for a look (the plate's own input, plate.ts plateInput, with the septa, tracts and wall at full): the shape, the look's colours, the vein's wall radius (cvR lobule radii). */
export function collagenInput(G: CollagenShape, cvR: number, look: LookId): CollagenInput {
  const L = lookColours(look);
  return { G, dark: L.dark, rgb: { col: L.rgb01('--lz-septum') }, cvIn: cvR * PLATE_S, shadow: L.tk('--lz-nodule-shadow') as string };
}
