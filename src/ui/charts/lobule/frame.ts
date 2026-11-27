// Across the lobule as a frame. Both views draw the same list of shapes in the same order (the other view's words and marks stand where they would, clear), so a switch of view or a new
// patient glides piece by piece (morph.ts) and the box keeps one height. The strip's colours are the figure's own lens ramps (scene/lenses/legend.ts rampStops: the colours the vessels and
// the key wear), so the card and the lobule behind it read alike: the oxygen ramp from full at the portal tract to low at the central vein, the pressure ramp at each place's own pressure.
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { parseColour, type Rgba } from '../colour.ts';
import type { Frame, Shape } from '../scene.ts';
import { rampStops, LG_MAX } from '../../../scene/lenses/legend.ts';
import type { LookId } from '../../../looks/looks.ts';
import { lobuleLayout, lobuleWords, sizeOf, TYPE, type LobuleIn, type LText } from './model.ts';

/** Slices the strip's gradient is drawn in (each a rect, laid a little over the next so no seam shows). */
export const SLICES = 48;
/** The oxygen ramp's position at the central vein end (1 at the portal tract): zone 3's blood is the least oxygenated, never none. */
export const OXY_END = 0.12;
const N_STEPS = 121;
const cache = new Map<string, Rgba[]>();
/** The ramp `name` of `look` read at N_STEPS even steps over [0, max], as the figure's key reads it. */
function steps(look: LookId, name: 'pressure' | 'oxygen'): Rgba[] {
  const key = `${look}|${name}`;
  let s = cache.get(key);
  if (!s) { s = rampStops(look, name, name === 'pressure' ? LG_MAX : 1, N_STEPS).map(([c]) => parseColour(c)); cache.set(key, s); }
  return s;
}
const at = (s: Rgba[], k: number): Rgba => s[Math.round(Math.min(1, Math.max(0, k)) * (N_STEPS - 1))]!;
/** The pressure at a place along the strip (0 portal, 1 central): straight from each station to the next. */
const pAt = (a: LobuleIn, t: number): number => (t <= 0.5 ? a.pv! + (a.sin! - a.pv!) * (t / 0.5) : a.sin! + (a.cv! - a.sin!) * ((t - 0.5) / 0.5));

export function lobuleFrame(a: LobuleIn, c: ChartCtx): Frame {
  const W = Math.max(240, c.w), f = c.type.sm, pal = c.pal;
  const L = lobuleLayout(W, f, measure, a);
  const oxy = a.view === 'oxygen', S = L.strip;
  const hasP = !!L.dots;
  const shapes: Shape[] = [];
  // the strip: its gradient in slices under its rounded clip
  shapes.push({ k: 'clip', x: S.x, y: S.y, w: S.w, h: S.h, r: S.r });
  const ox = steps(c.look, 'oxygen'), pr = steps(c.look, 'pressure'), none = pal.tok('surface-3');
  const sw = S.w / SLICES;
  for (let i = 0; i < SLICES; i++) {
    const t = (i + 0.5) / SLICES;
    const fill = oxy ? at(ox, 1 - (1 - OXY_END) * t) : hasP ? at(pr, pAt(a, t) / LG_MAX) : none;
    shapes.push({ k: 'rect', x: S.x + i * sw, y: S.y, w: sw + (i < SLICES - 1 ? 0.75 : 0), h: S.h, fill });
  }
  shapes.push({ k: 'unclip' });
  // the zone lines: dotted, in the card's own colour, as cuts through the strip
  const cut = pal.tok('surface');
  for (const x of L.zones) shapes.push({ k: 'line', x1: x, y1: S.y, x2: x, y2: S.y + S.h, pen: { color: cut, w: 2, dash: [3, 4] } });
  // the pressure line: a casing in the card's colour under a line in the text colour, so it reads on the pale and on the dark end of the ramp alike
  const ink = pal.tok('text'), clear = (k: Rgba): Rgba => [k[0], k[1], k[2], 0];
  const show = !oxy && hasP;
  const d = L.dots ?? [[S.x + 8, S.y + S.h / 2], [S.w / 2, S.y + S.h / 2], [S.w - 8, S.y + S.h / 2]];
  const pts = d.flat();
  shapes.push({ k: 'path', pts, pen: { color: show ? pal.alpha(cut, 0.85) : clear(cut), w: 5, cap: 'round', join: 'round' } });
  shapes.push({ k: 'path', pts, pen: { color: show ? ink : clear(ink), w: 2.2, cap: 'round', join: 'round' } });
  for (const [x, y] of d) shapes.push({ k: 'circle', cx: x, cy: y, r: 4, fill: show ? ink : clear(ink), pen: { color: show ? cut : clear(cut), w: 1.5 } });
  // the bracket under zone 3 (oxygen)
  const hurt = pal.tok('danger'), B = L.bracket;
  shapes.push({ k: 'path', pts: [B.x0, B.y, B.x0, B.y + B.d, B.x1, B.y + B.d, B.x1, B.y], pen: { color: oxy ? hurt : clear(hurt), w: 1.6, join: 'miter' } });
  // the words
  const colourOf = (t: LText): Rgba => {
    if (t.word === 'hurt') return hurt;
    if (t.word === 'end') return pal.tok('text-3');
    if (t.word === 'zone') return pal.tok('text-2');
    if (t.word === 'say') return L.fall && L.fall !== 'little' ? hurt : pal.tok('text-2');
    return ink;
  };
  for (const t of L.texts) {
    const on = t.only == null || t.only === a.view;
    shapes.push({ k: 'text', x: t.x, y: t.y, s: t.t, size: sizeOf(t.word, f), weight: TYPE[t.word][0], color: colourOf(t), anchor: t.anchor, baseline: 'top', alpha: on ? 1 : 0 });
  }
  return { w: W, h: L.H, shapes, label: lobuleWords(a) };
}
