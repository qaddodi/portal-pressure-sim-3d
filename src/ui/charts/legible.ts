// Chart lettering reads at 4.5:1 on whatever it stands on, in every look (audit v2 B8: "PPG", "HVPG", "WHVP" at 3.29 to 4.33:1). Chart words take their colour from the tone they name (amber, red,
// a series' colour) and no chart checked it against its backdrop: nearly every chart test opted out of the on-card check. This is the one rule, applied where every chart's frame is shown
// (painter.ts): a word whose ink falls short is drawn toward the look's text colour (or white or black, whichever reads best) by the least share that reaches 4.5:1, so it keeps its hue as far as it can.
// The backdrop is the card's surface under the word's anchor with the plain filled rectangles laid under it (a zone's tint, a bar). A word over anything else that paints (a path, a band, a circle,
// a gradient, a picture under the chart) is left as its chart drew it: its backdrop is not known here.
import { contrast, mix, type Rgba } from './colour.ts';
import type { Frame, Shape, TextShape } from './scene.ts';

export const MIN_INK = 4.5;
const WHITE: Rgba = [1, 1, 1, 1], BLACK: Rgba = [0, 0, 0, 1];
const over = (a: Rgba, b: Rgba): Rgba => [a[0] * a[3] + b[0] * (1 - a[3]), a[1] * a[3] + b[1] * (1 - a[3]), a[2] * a[3] + b[2] * (1 - a[3]), 1];
const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** The backdrop under a word, or null when something other than a plain rectangle paints there. */
export function backdropOf(shapes: readonly Shape[], upTo: number, x: number, y: number, surface: Rgba): Rgba | null {
  let bg = over(surface, [1, 1, 1, 1]);
  for (let i = 0; i < upTo; i++) {
    const s = shapes[i]!;
    if (s.k === 'rect') { if (s.fill && s.fill[3] > 0 && inBox(x, y, s.x, s.y, s.x + s.w, s.y + s.h)) bg = over(s.fill, bg); }
    else if (s.k === 'path' && s.fill && s.fill[3] > 0 && s.pts.length >= 4) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let j = 0; j + 1 < s.pts.length; j += 2) { x0 = Math.min(x0, s.pts[j]!); x1 = Math.max(x1, s.pts[j]!); y0 = Math.min(y0, s.pts[j + 1]!); y1 = Math.max(y1, s.pts[j + 1]!); }
      if (inBox(x, y, x0, y0, x1, y1)) return null;
    } else if (s.k === 'band' || s.k === 'radial') { return null; }
    else if (s.k === 'circle' && s.fill && s.fill[3] > 0 && Math.hypot(x - s.cx, y - s.cy) <= s.r) return null;
  }
  return bg;
}

/** The ink for `colour` on `bg`: itself when it reads, else the least mix toward the best of `toward`, white and black that reaches MIN_INK (the best of them when none does). */
export function inkFor(colour: Rgba, bg: Rgba, toward: Rgba): Rgba {
  if (contrast(colour, bg) >= MIN_INK) return colour;
  const solid: Rgba = [colour[0], colour[1], colour[2], 1];
  let best: Rgba = toward;
  for (const c of [toward, WHITE, BLACK]) if (contrast(c, bg) > contrast(best, bg)) best = c;
  const at = (p: number): Rgba => mix('srgb', best, p * 100, solid, (1 - p) * 100);
  if (contrast(solid, bg) < MIN_INK && contrast(at(1), bg) < MIN_INK) return at(1);
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (contrast(at(m), bg) >= MIN_INK) hi = m; else lo = m; }
  const out = at(hi);
  return [out[0], out[1], out[2], 1];
}

/** The frame with every word that falls short of 4.5:1 inked to reach it. The same frame object when none does (a still chart costs nothing). */
export function legible(f: Frame, surface: Rgba, text: Rgba): Frame {
  let out: Shape[] | null = null;
  for (let i = 0; i < f.shapes.length; i++) {
    const s = f.shapes[i]!;
    if (s.k !== 'text' || !s.s.trim()) continue;
    const bg = backdropOf(f.shapes, i, s.x, s.y, surface);
    if (!bg) continue;
    const ink = inkFor(s.color, bg, text);   // (a label's own `alpha` is a fade that comes and goes: the ink is judged at full strength)
    if (ink === s.color) continue;
    if (!out) out = f.shapes.slice();
    // (a halo that was laid for the OLD ink: dark letters in a dark halo merge into one blob, "Liver 30 %" and "Varices 21 %" on the shunts bar, 23 Nov review. The halo follows the ink: it takes the backdrop's colour,
    //  so it separates nothing from the bar it stands on and the letters keep their own shape.)
    const halo = s.halo && contrast(ink, s.halo.color) < 3 ? { ...s.halo, color: [bg[0], bg[1], bg[2], s.halo.color[3]] as Rgba } : s.halo;
    out[i] = { ...s, color: ink, ...(halo ? { halo } : {}) } as TextShape;
  }
  return out ? { ...f, shapes: out } : f;
}
