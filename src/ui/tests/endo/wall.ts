// Wall mechanics as a frame (Tests › Endoscopy, the second view; 2D instruments.js createVarixWall drawWall). A cross-section of the esophagus with the varix in its wall: muscle outside, mucosa inside,
// the lumen in the middle, the varix at the top bulging into it, filled with the pressure inside it, its rim in the stress meter's colour, the ΔP arrows pushing out of it, the wall stress σ
// as two arcs pulling apart round the top, the thickness w as a bracket across the rim and the radius r as a dashed line, each name set where its INK is clear (wall-geometry.copied.js,
// copied from 2D: it places names by the ink rows the glyph atlas records, src/ui/charts/ink.ts). Pure: (the varix, the pressure in it, the look, the size) → Frame; tests/b11-endo.test.ts reads it.
import { arcPoints } from '../../charts/geometry.ts';
import { withAlpha, type Rgba } from '../../charts/colour.ts';
import type { Palette } from '../../charts/palette.ts';
import type { Frame, Shape } from '../../charts/scene.ts';
import { inkRows, type InkRow } from '../../charts/ink.ts';
import { pressureColour } from '../../charts/profile/pressure-colour.ts';
import type { LookId } from '../../../looks/looks.ts';
import { wallRead, wallShare, WALL_WORDS, WALL_MEANING } from '../../../engine/hales/portal/wall-read.js';
import { BRACKET_A, createWallGeometry } from '../copied/wall-geometry.copied.js';
import { ENDO_WORDS } from '../copied/endo-words.copied.js';
import { clamp } from '../copied/num.copied.js';

/** What the picture reads of the model (metrics.varix). */
export interface WallVarix { r: number; w: number; ptm: number; ratio: number; ratioMean?: number; ratioShown?: number }
export type WallState = 'ok' | 'caution' | 'danger' | 'critical';
/** The meter's four states by the stress's share of the tear point (one rule, read by the bar, the readout and the rim of the varix drawn below; instruments.js wallState). */
export const wallState = (r: number): WallState => (r > 1 ? 'critical' : r > 0.7 ? 'danger' : r > 0.4 ? 'caution' : 'ok');
/** the names in the order they are drawn, as the checks read them (bit i of `drawn`: name i) */
export const WALL_NAMES: readonly string[] = ENDO_WORDS.wall.names;
export const wallLabels = (drawn: number): string => WALL_NAMES.filter((_n, i) => drawn & (1 << i)).join(',');
/** the card's type size for the picture's names, never under 12 px */
export const wallFontSize = (typeSm: number) => Math.max(12, typeSm);

const WHITE: Rgba = [1, 1, 1, 1];
type Ink = { T: InkRow[]; R: InkRow[]; W: InkRow[]; L: InkRow[]; M: InkRow[] };
const inks = new Map<number, Ink>();
/** The names' ink at a type size (one object for a size, so the layout keeps its fit while the size holds). */
export function inkAt(fs: number): Ink {
  let k = inks.get(fs);
  if (!k) { k = { T: inkRows('σ', fs, 600), R: inkRows('r', fs, 600), W: inkRows('w', fs, 600), L: inkRows('lumen', fs, 500), M: inkRows('muscle', fs, 500) }; if (inks.size > 16) inks.clear(); inks.set(fs, k); }
  return k;
}

export interface WallIn { v: WallVarix; /** the varix's node pressure, mmHg */ pVar: number; /** the stress share the picture shows (the model's two-breath mean, or a slide's) */ share: number }
export interface WallFrame { frame: Frame; drawn: number; names: string; gaps: unknown }

export function wallFrame(a: WallIn, size: number, fs: number, pal: Palette, look: LookId, geom: ReturnType<typeof createWallGeometry>): WallFrame {
  const w = size, hh = size, v = a.v, shapes: Shape[] = [];
  const out = (s: Shape) => shapes.push(s);
  const L = geom.place(w, hh, fs, inkAt(fs), v);
  const { cx, cy, R, Rl, rr, vy, lw, ro, len } = L;
  const sev = wallState(a.share), rim = pal.tok(sev), text2 = pal.tok('text-2'), ink = pal.tok('text-3');
  // the wall: muscle outside, mucosa inside, the lumen in the middle
  const stomach = pal.tok('organ-stomach');
  out({ k: 'circle', cx, cy, r: R, fill: withAlpha(stomach, 0.3) });
  out({ k: 'circle', cx, cy, r: R * 0.74, fill: withAlpha(stomach, 0.55) });
  out({ k: 'circle', cx, cy, r: R, pen: { color: pal.tok('hairline'), w: 1 } });
  out({ k: 'circle', cx, cy, r: Rl, fill: pal.tok('surface') });
  // transmural pressure pushes outward on the varix wall: longer arrows for a higher ΔP
  const aw = Math.max(1.25, R / 140), hd = 4 + R / 60;
  for (let ang = -Math.PI; ang < Math.PI - 0.01; ang += Math.PI / 4) {
    const x0 = cx + Math.cos(ang) * (rr + 3), y0 = vy + Math.sin(ang) * (rr + 3), x1 = cx + Math.cos(ang) * (rr + 3 + len), y1 = vy + Math.sin(ang) * (rr + 3 + len);
    out({ k: 'line', x1: x0, y1: y0, x2: x1, y2: y1, pen: { color: text2, w: aw } });
    out({ k: 'path', pts: [x1, y1, x1 - Math.cos(ang - 0.45) * hd, y1 - Math.sin(ang - 0.45) * hd, x1 - Math.cos(ang + 0.45) * hd, y1 - Math.sin(ang + 0.45) * hd], closed: true, fill: text2 });
  }
  // the varix, filled with the pressure inside it, its rim in the stress meter's colour
  out({ k: 'circle', cx, cy: vy, r: rr, fill: pressureColour(look, a.pVar), pen: { color: rim, w: lw } });
  // the radius, drawn across the varix
  out({ k: 'line', x1: cx, y1: vy, x2: cx + rr, y2: vy, pen: { color: withAlpha(WHITE, 0.85), w: 1.25, dash: [3, 3] } });
  const word = (s: string, x: number, y: number, weight: number, color: Rgba, halo?: Rgba) => out({ k: 'text', s, x, y, size: fs, weight, color, anchor: 'middle', baseline: 'middle', ...(halo ? { halo: { color: halo, w: 3 } } : {}) });
  if (L.r.show) word('r', L.r.x, L.r.y, 600, pal.tok('text'), pal.tok('label-halo'));
  // Laplace's other two terms: the wall stress σ along the wall (two arrows pulling apart round the top, heavier as the stress rises) and the wall thickness w across the rim (a bracket)
  const sw = clamp(1.25 + 2.5 * clamp(v.ratio, 0, 1.2), 1.25, 4);
  for (let si = 0; si < 2; si++) {
    const s = si === 0 ? -1 : 1, a0 = -Math.PI / 2 + s * 0.22, a1 = -Math.PI / 2 + s * 1.05, h5 = 5 + R / 50;
    out({ k: 'path', pts: arcPoints(cx, vy, ro, ro, Math.min(a0, a1), Math.max(a0, a1), 2), pen: { color: rim, w: sw } });
    const ex = cx + Math.cos(a1) * ro, ey = vy + Math.sin(a1) * ro, ux = -Math.sin(a1) * s, uy = Math.cos(a1) * s;
    out({ k: 'path', pts: [ex + ux * h5 * 0.2, ey + uy * h5 * 0.2, ex - ux * h5 + uy * h5 * 0.55, ey - uy * h5 - ux * h5 * 0.55, ex - ux * h5 - uy * h5 * 0.55, ey - uy * h5 + ux * h5 * 0.55], closed: true, fill: rim });
  }
  if (L.sigma.show) {
    const s = L.sigma;
    if (s.lead) out({ k: 'line', x1: s.sx, y1: s.sy, x2: s.ex, y2: s.ey, pen: { color: ink, w: 1 } });
    word('σ', s.x, s.y, 600, rim);
  }
  const wl = L.w, bx = Math.cos(BRACKET_A), by = Math.sin(BRACKET_A);
  out({ k: 'line', x1: wl.bx0, y1: wl.by0, x2: wl.bx1, y2: wl.by1, pen: { color: ink, w: 1 } });
  for (let di = 0; di < 2; di++) { const d = di === 0 ? rr - lw / 2 : rr + lw / 2; out({ k: 'line', x1: cx + bx * d - by * 3, y1: vy + by * d + bx * 3, x2: cx + bx * d + by * 3, y2: vy + by * d - bx * 3, pen: { color: ink, w: 1 } }); }
  if (wl.show) {
    if (wl.lead) out({ k: 'line', x1: wl.sx, y1: wl.sy, x2: wl.ex, y2: wl.ey, pen: { color: ink, w: 1 } });
    word('w', wl.x, wl.y, 600, ink);
  }
  // "lumen" and "muscle" inside the rings they name
  if (L.lumen.show) word('lumen', cx, L.lumen.y, 500, ink);
  if (L.muscle.show) word('muscle', cx, L.muscle.y, 500, ink);
  return { frame: { w, h: hh, shapes, label: ENDO_WORDS.wall.aria }, drawn: L.drawn, names: wallLabels(L.drawn), gaps: L.gaps };
}

/** What the tiles print for a varix (instruments.js createVarixWall update): the four readings worked out from the shown ΔP, r and w (so they multiply out), the stress as a share of the tear point and its words. */
export function wallReadings(v: WallVarix, pin = NaN) {
  const wr = wallRead(v) as { ptm: string; r: string; w: string; index: string };
  const share = wallShare(v) as number, W = ENDO_WORDS.wall;
  const shown = Number.isFinite(pin) ? pin : share, state = wallState(shown);
  return {
    ptm: wr.ptm, r: wr.r, w: wr.w, index: wr.index, share,
    /** the sentence the stress tile keeps (hidden in the Tests card, read by a screen reader) */
    stress: share > 1 ? W.above : `${Math.round(share * 100)}${W.tear}`,
    pct: String(Math.round(shown * 100)), state, word: (WALL_WORDS as Record<string, string>)[state]!,
    /** the meter's fill slid in from the left inside its track (instruments.js slideTxt: tenths of a percent) */
    fill: `${Math.round(clamp(share, 0, 1) * 1000) / 10 - 100}% 0px`,
  };
}
export const WALL_NOTE = ENDO_WORDS.wall.note + WALL_MEANING;
export { wallShare };
