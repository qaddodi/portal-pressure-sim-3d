// The FibroScan pane's picture as a Frame (2D fibroscan.js paintWith/drawStill, line for line, in CSS px): over the map (drawn by the GPU under the shapes, copied/fibro-gl.copied.js) the depth
// words inside its left edge, the time words inside its bottom edge, the two dotted window lines, the fitted line, the big reading with "kPa" and the exam's name in the lower right, and the
// map's own edge. Every word carries a dark halo so it reads on any colour of the map. Pure: the same inputs give the same frame.
import type { Frame, Shape } from '../../charts/scene.ts';
import type { Palette } from '../../charts/palette.ts';
import type { Rgba } from '../../charts/colour.ts';
import { measure } from '../../charts/measure.ts';
import { DEPTH0, DEPTH_SPAN, WIN0, WIN1, WAVE_T0, DASH, DEPTH_TXT, TIME_TXT, ORGAN, shearSpeed } from './copied/fibro-model.copied.js';
import { fibroscanLabel } from '../copied/instrument-aria.copied.js';

export type OrganId = 'liver' | 'spleen';
export const MAP_RADIUS = 12;   // the map's corners, px (2D: rrect(…, 12))
/** the words' size: the canvas's font size in 2D (12 px, the floor of a card's data words) */
export const CAP = 12;
/** the reading's outline: the map's darkest tone, solid (2D tokens.css --fibroscan-halo) */
export const HALO: Rgba = [22 / 255, 12 / 255, 9 / 255, 1];
const WHITE = (a: number): Rgba => [1, 1, 1, a];
const BLACK = (a: number): Rgba => [0, 0, 0, a];
/** the 2D map's bounds: the shear wave drifts a few percent around the model's median (paint(): kNow) */
export const driftOf = (kpa: number, t: number): number => kpa * (1 + 0.05 * Math.sin(t * 0.8) + 0.03 * Math.sin(t * 1.9 + 1));

export interface FibroIn {
  organ: OrganId;
  /** the number printed: "21.4", or "–" with no spleen to read */
  txt: string;
  /** the model's median stiffness the wave drifts around (kPa) */
  kpa: number;
  /** the moment (s of the simulation clock) */
  t: number;
}
/** What the layout of the still words depends on (a change of any rebuilds them; the wave line and the reading follow the frame). */
export interface Layout { m: number; TK: number; big: number; RY: number; ux: number; uw: number; ns: number; ny: number; by: number; tstep: number }

/** Where the words stand in a w × h map (2D drawStill): their margins, the reading's fitted size, the units and the exam's name. `widest` is the widest reading the number is fitted to. */
export function layoutOf(w: number, h: number, widest: string): Layout {
  const side = h < 200 && w > h * 2.2, FLOOR = 12;
  const TK = side ? FLOOR : CAP, m = Math.round(CAP * 0.7);
  const tw = (s: string, size = TK, weight = 500) => measure(s, size, weight);
  // the time words: every other tick on a narrow box ("60" ran into "80")
  const tstep = tw('0 ms') / 2 + tw('80') / 2 + tw('60') + 3 * 8 > w - 2 * m ? 40 : 20;
  const by = h - TK * 0.45;
  // the reading: inside the top right corner, clear of the "40" depth label (it steps smaller until a gap is left)
  const ly = h / 6 + TK * 0.35, lr = m + tw('40') + CAP, lt = ly - TK * 0.8;
  const uSize = Math.round(CAP * 1.4), uw = tw('kPa', uSize);
  let big = Math.round(Math.max(24, Math.min(CAP * 4, 72, h * 0.3, w * 0.28))), RM: number, RY: number;
  for (;;) {
    RM = Math.max(m * 2, Math.round(big * 0.4)); RY = RM + Math.round(big * 0.74);
    const left = w - RM - uw - 5 - tw(widest, big, 600) - big * 0.08, below = RY + big * 0.08 < lt;
    if (below || left >= lr || big <= 14) break;
    big -= 2;
  }
  const ux = w - RM;
  const ns = Math.round(Math.min(30, Math.max(CAP * 1.25, big * 0.4)));
  return { m, TK, big, RY, ux, uw, ns, ny: by - TK - Math.round(ns * 0.45), by, tstep };
}

export function fibroFrame(a: FibroIn, w: number, h: number, pal: Palette, L: Layout = layoutOf(w, h, ORGAN[a.organ].widest)): Frame {
  const O = ORGAN[a.organ];
  const y = (d: number) => ((d - DEPTH0) / DEPTH_SPAN) * h;
  const shapes: Shape[] = [];
  const word = (s: string, x: number, yy: number, size: number, weight: number, anchor: 'start' | 'middle' | 'end', halo: { color: Rgba; w: number }, key: string) =>
    shapes.push({ k: 'text', x, y: yy, s, size, weight, color: WHITE(0.96), anchor, baseline: 'alphabetic', halo, key });
  // the window the M probe measures in: two dotted lines
  for (let i = 0; i < 2; i++) { const yy = y([WIN0, WIN1][i]!); shapes.push({ k: 'line', x1: 0, y1: yy, x2: w, y2: yy, pen: { color: WHITE(0.5), w: 1, dash: DASH }, key: `win${i}` }); }
  // the map's own edge
  shapes.push({ k: 'rect', x: 0.5, y: 0.5, w: w - 1, h: h - 1, r: MAP_RADIUS, pen: { color: pal.tok('border'), w: 1 }, key: 'edge' });
  // the depth words, inside the left edge: 30, 45 mm and 60
  const dh = { color: BLACK(0.7), w: Math.max(3, L.TK * 0.32) };
  for (let d = 30; d <= 60; d += 15) word(DEPTH_TXT[(d - 30) / 15]!, L.m, y(d) + L.TK * 0.35, L.TK, 500, 'start', dh, `d${d}`);
  // the time words, inside the bottom edge, spread evenly between the two end words
  const tw = (s: string) => measure(s, L.TK, 500);
  const ntk = Math.floor(80 / L.tstep) + 1, c0 = L.m + tw('0 ms') / 2, c1 = w - L.m - tw('80') / 2;
  for (let i = 0; i < ntk; i++) word(TIME_TXT[(i * L.tstep) / 20]!, c0 + (i * (c1 - c0)) / (ntk - 1), L.by, L.TK, 500, 'middle', dh, `t${i}`);
  // the fitted line along the wave front, the window's 40 mm
  const c = shearSpeed(driftOf(a.kpa, a.t)), x0 = (WAVE_T0 / 80) * w, x1 = x0 + Math.min(1, Math.max(0, 40 / c / 80)) * w;
  shapes.push({ k: 'line', x1: x0, y1: y(WIN0), x2: x1, y2: y(WIN1), pen: { color: WHITE(0.95), w: 1.25 }, key: 'fit' });
  // the reading and its unit, the exam's name
  const uSize = Math.round(CAP * 1.4);
  word(a.txt, L.ux - L.uw - 5, L.RY, L.big, 600, 'end', { color: HALO, w: Math.max(3, L.big * 0.16) }, 'read');
  word('kPa', L.ux, L.RY, uSize, 500, 'end', { color: HALO, w: Math.max(3, L.big * 0.16) }, 'unit');
  word(O.name, L.ux, L.ny, L.ns, 700, 'end', { color: HALO, w: Math.max(3, L.ns * 0.2) }, 'organ');
  return { w, h, shapes, label: fibroscanLabel(a.organ, a.txt === '–' ? null : parseFloat(a.txt)) };
}
