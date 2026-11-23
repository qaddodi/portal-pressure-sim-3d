// The lobule's collagen at full strength, on a layer of its own (Plan 25b): the tail of 2D's paintLobule (lobule-paint.generated.js, which is never edited) with the septa, the portal tracts and the vein's wall at their fullest, and Plan 24's
// intimal ring, drawn with the generated file's own primitives in the painter's own order, so the layer over the tissue (painted with none of it) is the one-pass painting at the full state (source-over is associative).
// What grows and recedes is shown by the shader from the layer's arrival times (collagen-tau.ts); the bands' shapes are listed once here (`septaBands`) for the painter and for the times.
import { bandGeomInto, fibHash, fibrousBand } from './from2d/lobule-paint.generated.js';
import { lookColours } from './lz-colours.ts';
import { CV_COLLAR0, CV_COLLAR_K, CV_FILL } from './cv-band.ts';
import { PLATE_S } from './plate.ts';
import type { LookId } from '../../looks/looks.ts';

type P2 = [number, number];
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** The painter's SPURS (the corners the early spurs leave) and its deeper periportal tones (PRE_LIGHT, PRE_DARK). */
/** A septum's width at the tract end, in widths (the painter's 1.5: a flare that, on the widest bands, reached 250 plate px and put a wide pale apron round every tract; here the band narrows into the tract, whose own bundles blend it in). */
const SEPTA_E0 = 0.7;
const SPURS = [1, 3, 5], PRE_DARK = [0.86, 0.78, 0.6], PRE_LIGHT = [0.78, 0.64, 0.44];

/** What the painters of this layer read of the plate's shape (plate.ts plateShape): the lobule's size and corners, the portal-central septa, the tracts' and the vein's radii. */
export interface CollagenShape { R: number; cx: number; cy: number; rt: number; rcv0: number; lobules: { corners: P2[] }[]; septaPC: { pts: P2[] }[] }
export interface CollagenInput { G: CollagenShape; dark: boolean; rgb: { col: ArrayLike<number> }; cvIn: number; shadow: string }

/** A band's options as the painter's septumOpt sets them. */
export interface BandOpt { w: number; rgb: ArrayLike<number> | null; a: number; e0: number; e1: number; amp: number; seed: number; pts: P2[] | null; path: ((o: BandOpt, u: number, out: number[]) => void) | null }
/** One septum at its fullest: a hex edge's bridge (portal-portal), a portal-central bridge, or an early spur. */
export interface BandSpec { kind: 'hex' | 'pc' | 'spur'; A: P2; B: P2; o: BandOpt }

/** The painter's septumPath, as a smooth curve (Mohammad, 23 Nov 2026: "the bands' course ... now they're jagged or have sharp edges"): the band's centre line runs through the septum's own points as a Catmull-Rom spline, so its direction changes smoothly
 *  (the painter's straight lerp between points turned by a few degrees at every one of them, and a band wide against its own curvature showed each turn as a kink in its outline). */
function septumPath(o: BandOpt, u: number, out: number[]): void {
  const pts = o.pts!, f = Math.min(1, Math.max(0, u)) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
  const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!, t2 = t * t, t3 = t2 * t;
  for (let k = 0; k < 2; k++) out[k] = 0.5 * (2 * p1[k]! + (p2[k]! - p0[k]!) * t + (2 * p0[k]! - 5 * p1[k]! + 4 * p2[k]! - p3[k]!) * t2 + (3 * p1[k]! - p0[k]! - 3 * p2[k]! + p3[k]!) * t3);
}

/** Every septum of the lobule at full cirrhosis (su 1: paintLobule's widths 0.045 + 0.075 su, the bridges' 0.6 + 0.3 g, the spurs' length 0.25 + 0.3), in the painter's drawing order. */
export function septaBands(G: CollagenShape, rgb: ArrayLike<number> | null = null): BandSpec[] {
  const R = G.R, w = R * 0.12, wHex = R * 0.2, wPC = R * 0.14, crn = G.lobules[0]!.corners, out: BandSpec[] = [];
  const opt = (ww: number, a: number, e1: number, amp: number, seed: number, pts: P2[] | null): BandOpt => ({ w: ww, rgb, a, e0: SEPTA_E0, e1, amp, seed, pts, path: pts ? septumPath : null });
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

const TAU = Math.PI * 2;
const rgba = (c: ArrayLike<number>, a: number): string => `rgba(${Math.round(c[0]! * 255)},${Math.round(c[1]! * 255)},${Math.round(c[2]! * 255)},${a.toFixed(3)})`;
/** One bundle of a tract or its cuff: the painter's fibrousBand along a curved path round the tract's centre (the painter's tractPath and cuffPath: a wavy arc of radius r0 and span about the centre). */
interface ArcOpt extends BandOpt { a0: number; span: number; r0: number; phase: number; rx: number; th: number }
function arcPath(o: BandOpt, u: number, out: number[]): void {
  const q = o as ArcOpt, a = q.a0 + q.span * u, r = q.r0 + q.th * (0.09 * Math.sin(5 * a + q.phase) + 0.12 * Math.sin(Math.PI * u));
  out[0] = Math.cos(a) * q.rx * r; out[1] = Math.sin(a) * q.rx * r;
}
function bundle(c: CanvasRenderingContext2D, rgb: ArrayLike<number>, rx: number, a0: number, span: number, r0: number, phase: number, w: number, a: number, seed: number, e0: number, e1: number, th = 1): void {
  const o: ArcOpt = { w, rgb, a, e0, e1, amp: 0, seed, pts: null, path: arcPath, a0, span, r0, phase, rx, th };
  const A: [number, number] = [0, 0], B: [number, number] = [0, 0], t = [0, 0];
  arcPath(o, 0, t); A[0] = t[0]!; A[1] = t[1]!; arcPath(o, 1, t); B[0] = t[0]!; B[1] = t[1]!;
  fibrousBand(c, A, B, o);
}
/** The septa at their fullest (Mohammad, 23 Nov 2026: "the cirrhosis needs to look kinda like [the periportal fibrosis]"): each septum is a rope of the same curving bundles the tracts are made of, not one wide band: 3 to 6 bundles lying side by side along its smooth
 *  centre line, each with its own width, intensity, waviness and fibres, tapering at their ends, so a septum has the periportal bundles' character, fade and variation. Painted on a layer of their own (Plan 31: see paintCollagenWorld). Every bundle lies within the
 *  band's body, so the arrival times (collagen-tau.ts, the whole band) still cover every pixel. */
export function paintSepta(c: CanvasRenderingContext2D, P: CollagenInput): void {
  const { G, dark } = P, PRE = dark ? PRE_DARK : PRE_LIGHT, g = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 };
  for (const b of septaBands(G, PRE)) {
    bandGeomInto(g, b.A, b.B, b.o, b.o.path);
    const nb = b.kind === 'hex' ? 8 : b.kind === 'pc' ? 6 : 4;
    for (let j = 0; j < nb; j++) {
      const sd = b.o.seed * 13 + j * 7, off0 = ((j + 0.5) / nb - 0.5) * 0.95, ph = fibHash(sd + 1) * TAU;
      const path = (_o: BandOpt, u: number, out: number[]): void => {
        const f = Math.min(1, Math.max(0, u)) * 26, i = Math.min(25, Math.floor(f)), t = f - i, m = (k: number): number => lerp(g.P[2 * i + k]!, g.P[2 * i + 2 + k]!, t), nn = (k: number): number => lerp(g.N[2 * i + k]!, g.N[2 * i + 2 + k]!, t);
        const wd = lerp(g.Wd[i]!, g.Wd[i + 1]!, t), off = off0 + 0.07 * Math.sin(TAU * 1.3 * u + ph);
        out[0] = m(0) + nn(0) * off * wd; out[1] = m(1) + nn(1) * off * wd;
      };
      const A: [number, number] = [0, 0], B: [number, number] = [0, 0], t2 = [0, 0];
      path(b.o, 0, t2); A[0] = t2[0]!; A[1] = t2[1]!; path(b.o, 1, t2); B[0] = t2[0]!; B[1] = t2[1]!;
      fibrousBand(c, A, B, { w: b.o.w * (1.25 / nb) * (0.8 + 0.5 * fibHash(sd + 2)), rgb: PRE, a: 0.7 + 0.3 * fibHash(sd + 3), e0: 0.5, e1: 0.5, amp: 0, seed: sd, pts: null, path });
    }
  }
  c.globalAlpha = 1;
}

/** One portal tract at its fullest (Mohammad, 23 Nov 2026: "a hard-edged pale disc ... clipped straight where it meets the hepatocytes"): the painter's curving bundles (fibrousTract's own, 10 crossing the tract and 18 in a collar round it), but with NO flat disc under them and NO clip, so the tract has no rim and no bundle is cut at a circle. The shader's front fades over this (collagen-edge.ts TRACT_FRONT_K). */
export function paintTract(c: CanvasRenderingContext2D, x: number, y: number, radius: number, angle: number, rgb: ArrayLike<number>, seed: number): void {
  c.save(); c.translate(x, y); c.rotate(angle);
  const phase = fibHash(seed) * TAU;
  for (let k = 0; k < 10; k++) {
    const sd = seed + k * 37, w = radius * (0.08 + 0.085) * (0.7 + fibHash(sd + 3));
    bundle(c, rgb, radius, fibHash(sd) * TAU, 1.2 + 2 * fibHash(sd + 1), 0.25 + 0.65 * fibHash(sd + 2), phase, w, Math.min(1, 0.75 + 0.35 * fibHash(sd + 4)), sd, 0.2, 0.25);
  }
  const inner = radius * 0.62, outer = radius * 1.08, thick = outer - inner;
  for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 6; k++) {
    const sd = 211 + ring * 17 + k;
    bundle(c, rgb, radius, TAU * k / 6 + ring * 0.27, TAU / 6 * (1.2 + 0.5 * fibHash(sd)), (inner + thick * (0.18 + ring * 0.3)) / radius, fibHash(sd + 5) * TAU, thick * 0.34, 1, sd, 0.45, 0.5);
  }
  c.restore();
}

/** The central vein's collagen at its fullest, the same bundles round the vein (Mohammad, 23 Nov 2026: "the central vein fibrosis is just bad", "unify the fibrosis"): rings of curving bundles from the scar's innermost edge (CV_FILL of the lumen) out to the collar's outer edge, as
 *  round as the vein, painted into the tracts' plate about the vein's centre. The shader (plate.ts) shows the part of it that has grown: from the lumen's edge to the collar's, on the live wall radius. */
export function paintVein(c: CanvasRenderingContext2D, P: CollagenInput): void {
  const { G, dark } = P, PRE = dark ? PRE_DARK : PRE_LIGHT, rw = P.cvIn;
  if (rw <= 0) return;
  const rMin = rw * (1 - CV_FILL), rMax = rw + G.rcv0 * (CV_COLLAR0 + CV_COLLAR_K), nR = 5, nB = 6;
  c.save(); c.translate(G.cx, G.cy);
  for (let ring = 0; ring < nR; ring++) {
    const r = rMin + (rMax - rMin) * (ring + 0.5) / nR, wr = (rMax - rMin) / nR;
    for (let k = 0; k < nB; k++) {
      const sd = 600 + ring * 31 + k, span = TAU / nB * (1.55 + 0.35 * fibHash(sd));
      bundle(c, PRE, 1, TAU * k / nB + ring * 0.37, span, r, fibHash(sd + 5) * TAU, wr * (0.95 + 0.4 * fibHash(sd + 3)), 0.8 + 0.2 * fibHash(sd + 4), sd, 0.85, 0.85, r * 0.04);
    }
  }
  c.restore();
}

/** The portal tracts at their fullest, in the painter's order. The central vein's collagen is NOT painted: cv-band.ts draws it from its radius (the painted fibres made a second, see-through ring round the solid one). */
export function paintTracts(c: CanvasRenderingContext2D, P: CollagenInput): void {
  const { G, dark } = P, PRE = dark ? PRE_DARK : PRE_LIGHT;
  c.globalAlpha = 1;
  const rt = G.rt * 1.7;
  for (const [x, y, ci] of tractCorners(G)) paintTract(c, x, y, rt, Math.atan2(y - G.cy, x - G.cx), PRE, 900 + ci * 71);
  paintVein(c, P);
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
