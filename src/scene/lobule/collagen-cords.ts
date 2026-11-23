// The lobule's fibrosis as ROPES (Mohammad, 23 Nov 2026: "the fibrosis should look like ropes, not like a big blob", "this looks 3D", "it has to maintain the cel shadedness"; 606d60f4 and mock C drew strands along every band).
// ROOT CAUSE of the blob: every septum was ONE wide filled plate (the painter's three passes), and everything after it (a fade, a lit/shade gradient flank, a gain on the painted fibres) tried to make a plate look like a rope: smooth, airbrushed, 3D.
// Here a band is what it is anatomically, a bundle of a few collagen CORDS that twist about each other along the band, and each cord is drawn the way the app's figures are: a flat fill, ONE flat shade band on its lower right, and a thin deeper edge line.
// The cells show between the cords. Cords cross over and under (the weave's depth is the cosine of its phase: a front run is drawn after every back run), so the twist reads without any gradient. Pure canvas strokes, no blur, no shadow: no glow by construction.
// Painted once per look into the collagen atlas (collagen-paint.ts); the plate shader only grows them (arrival times, collagen-tau.ts), it never recolours them.
import { fibHash } from './from2d/lobule-paint.generated.js';

const TAU = Math.PI * 2;
/** The cord's flat colours from the collagen's token: its fill, its one flat shade band (lower right), its deeper edge line (a tone of the collagen's own colour, never black ink: Mohammad 20 Nov). */
export function cordColours(col: ArrayLike<number>): { fill: string; shade: string; edge: string } {
  const css = (k: number): string => `rgb(${[0, 1, 2].map((i) => Math.round(Math.min(1, Math.max(0, col[i]! * k)) * 255)).join(',')})`;
  return { fill: css(1), shade: css(0.84), edge: css(0.6) };
}

/** The look of the cords, in world units (a lobule radius is 400). */
export const CORD_W_MIN = 4.5, CORD_W_MAX = 8;   // a cord's width: 9 to 17 plate px, 6 to 11 device px on an iPhone
export const CORD_BUNDLE = 1.15;                  // a rope is a bundle of a few cords this tight: its cords sway at most this many cord widths either side of its centre line, whatever the band's width (a wide flared band is no wider rope, never a coil)
export const CORD_EDGE = 0.85;                       // the edge line's width each side
export const CORD_K = 3;                             // cords in a septum's rope
export const CORD_PERIOD = 9;                        // one full twist in this many cord widths of rope length
const SUB = 8;                                       // samples per station of the band's geometry (a twist is resolved with at least 16 a turn)

/** A band to draw as cords: its centre line P (x, y pairs), unit normals N (x, y pairs) and full widths Wd at n + 1 stations. */
export interface CordBand { P: ArrayLike<number>; N: ArrayLike<number>; Wd: ArrayLike<number>; n: number; seed: number; k?: number }

interface Run { x: number[]; y: number[] }

/** Paints the band's cords into c (the context's transform is set in world units): each cord is a polyline weaving across the band, split into back runs (drawn first) and front runs; every run is an edge line, then a fill, then the one flat shade band. */
export function paintCords(c: CanvasRenderingContext2D, b: CordBand, col: ArrayLike<number>): void {
  const { P, N, Wd, n } = b, S = n * SUB, cc = cordColours(col);
  let len = 0, sumW = 0;
  for (let i = 0; i < n; i++) { len += Math.hypot(P[2 * i + 2]! - P[2 * i]!, P[2 * i + 3]! - P[2 * i + 1]!); sumW += Wd[i]!; }
  const meanW = sumW / n;
  if (meanW < 1) return;
  const wc = Math.min(CORD_W_MAX, Math.max(CORD_W_MIN, 0.13 * meanW)), K = b.k ?? CORD_K;
  const turns = Math.max(0.75, len / (CORD_PERIOD * wc)), phase0 = fibHash(b.seed) * TAU;
  // samples: position on the centre line, its normal and the band's width there
  const sx = new Float64Array(S + 1), sy = new Float64Array(S + 1), nx = new Float64Array(S + 1), ny = new Float64Array(S + 1), sw = new Float64Array(S + 1);
  for (let s = 0; s <= S; s++) {
    const f = Math.min(n - 1e-9, (s / S) * n), i = Math.floor(f), t = f - i;
    sx[s] = P[2 * i]! + (P[2 * i + 2]! - P[2 * i]!) * t; sy[s] = P[2 * i + 1]! + (P[2 * i + 3]! - P[2 * i + 1]!) * t;
    const ax = N[2 * i]! + (N[2 * i + 2]! - N[2 * i]!) * t, ay = N[2 * i + 1]! + (N[2 * i + 3]! - N[2 * i + 1]!) * t, l = Math.hypot(ax, ay) || 1;
    nx[s] = ax / l; ny[s] = ay / l; sw[s] = Wd[i]! + (Wd[i + 1]! - Wd[i]!) * t;
  }
  const back: Run[] = [], front: Run[] = [];
  for (let j = 0; j < K; j++) {
    let cur: Run | null = null, curFront = false;
    for (let s = 0; s <= S; s++) {
      const u = s / S, th = phase0 + (TAU * j) / K + TAU * turns * u, wl = Math.max(sw[s]!, 0), cw = Math.min(wc, Math.max(1.5, wl * 0.9));
      const amp = Math.max(0, Math.min((wl - cw) / 2 - CORD_EDGE, CORD_BUNDLE * wc)), h = amp * Math.sin(th), isFront = Math.cos(th) >= 0;
      const x = sx[s]! + nx[s]! * h, y = sy[s]! + ny[s]! * h;
      if (!cur || isFront !== curFront) {
        if (cur) { cur.x.push(x); cur.y.push(y); }   // (the run ends on the sample the next one starts at, so a cord is never broken)
        cur = { x: [], y: [] }; curFront = isFront; (isFront ? front : back).push(cur);
      }
      cur.x.push(x); cur.y.push(y);
    }
  }
  const stroke = (runs: Run[], style: string, lw: number, dx: number, dy: number): void => {
    c.strokeStyle = style; c.lineWidth = lw;
    for (const r of runs) {
      if (r.x.length < 2) continue;
      c.beginPath(); c.moveTo(r.x[0]! + dx, r.y[0]! + dy);
      for (let i = 1; i < r.x.length; i++) c.lineTo(r.x[i]! + dx, r.y[i]! + dy);
      c.stroke();
    }
  };
  c.save();
  c.lineCap = 'butt'; c.lineJoin = 'round'; c.shadowBlur = 0; c.globalAlpha = 1;
  const off = wc * 0.2 * Math.SQRT1_2;
  for (const runs of [back, front]) {
    stroke(runs, cc.edge, wc + 2 * CORD_EDGE, 0, 0);
    stroke(runs, cc.fill, wc, 0, 0);
    stroke(runs, cc.shade, wc * 0.3, off, off);   // (the one flat shade band, on the lower right: the world light comes from the upper left)
  }
  c.restore();
}

/** A bundle of cords round an arc of a circle (a portal tract's fibres): the arc's centre line, normals (radial) and a width that tapers to the arc's ends. */
export function arcBand(cx: number, cy: number, r: number, a0: number, span: number, w: number, seed: number, n = 26): CordBand {
  const P = new Float64Array(2 * (n + 1)), N = new Float64Array(2 * (n + 1)), Wd = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + span * u;
    P[2 * i] = cx + Math.cos(a) * r; P[2 * i + 1] = cy + Math.sin(a) * r;
    N[2 * i] = Math.cos(a); N[2 * i + 1] = Math.sin(a);
    Wd[i] = w * Math.sqrt(Math.sin(Math.PI * u));
  }
  return { P, N, Wd, n, seed, k: 2 };
}
