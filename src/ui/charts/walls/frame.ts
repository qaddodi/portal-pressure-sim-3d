// The two walls (2D visual: 'walls', presenter-visuals.js wallsVisual): why a clot before the liver leaves the abdomen dry. The gut's capillary wall holds protein back, so its oncotic pull
// holds the fluid in; the sinusoid's wall lets protein through, so a pressure rise becomes lymph. One picture per wall, as a frame (looks: chart-looks/card.js, 'card.walls.*').
// The 2D picture keeps moving (albumin drifting in the lumen, the flow pulsing up the wall); this frame is the picture at rest, its pieces where the loops put them at their middle.
import type { ChartCtx } from '../Chart.tsx';
import { look } from '../looks.ts';
import type { Frame, Shape } from '../scene.ts';

/** The drawing's own box (the 2D viewBox "0 100 600 276"). */
export const WALLS_BOX = { x: 0, y: 100, w: 600, h: 276 } as const;
const Y_WALL = 236, LUMEN = [Y_WALL + 16, Y_WALL + 132] as const, PORES = [104, 202, 300, 398, 496] as const;

export interface WallsCopy { title: string; sub: string; c1: string; c2: string; aria: string }
/** The words of each panel (2D wallsVisual), under and over its drawing. */
export const WALLS_COPY: Record<'gut' | 'sin', WallsCopy> = {
  gut: { title: 'Intestinal capillary', sub: 'Continuous wall, basement membrane', c1: 'Protein retained: its oncotic gradient opposes filtration', c2: 'A pressure rise filters little fluid', aria: 'Intestinal capillary: a continuous wall on a basement membrane; protein stays in the vessel' },
  sin: { title: 'Hepatic sinusoid', sub: 'Fenestrated, no basement membrane', c1: 'Protein crosses: no oncotic gradient opposes filtration', c2: 'A pressure rise raises lymph flow at once', aria: 'Hepatic sinusoid: a fenestrated wall with no basement membrane; protein crosses into the space of Disse' },
};
export const WALLS_ARIA = 'The intestinal capillary wall retains protein; the hepatic sinusoid lets it through';

/** One wall as a frame (`sin`: the sinusoid). The picture is as wide as its box; its height keeps the 600 by 276 shape. */
export function wallsFrame(sin: boolean, c: ChartCtx): Frame {
  const u = c.w / WALLS_BOX.w, h = WALLS_BOX.h * u;
  const X = (x: number) => x * u, Y = (y: number) => (y - WALLS_BOX.y) * u;
  const lk = (key: string, state: Record<string, unknown> = {}) => look(c, { host: 'walls', px: 12 }, key, state);
  const shapes: Shape[] = [];
  const rect = (key: string, x: number, y: number, w: number, hh: number, rx: number): void => { const l = lk(key); shapes.push({ k: 'rect', x: X(x), y: Y(y), w: w * u, h: hh * u, r: rx * u, fill: l.fill }); };
  if (sin) { rect('card.walls.hep', 20, 108, 560, 42, 12); rect('card.walls.disse', 20, 154, 560, 74, 8); } else rect('card.walls.tissue', 20, 108, 560, 120, 12);
  // a band's name: the sinusoid's hepatocytes centred in their band, the rest from the band's top (the 2D fit: cap size)
  const cap = c.type.sm, word = lk('card.walls.l');
  const names: [string, number, number, boolean][] = sin ? [['Hepatocytes', 108, 42, true], ['Space of Disse: lymph', 154, 74, false]] : [['Interstitial fluid: little', 108, 120, false]];
  for (const [s, y, hh, mid] of names) shapes.push({ k: 'text', x: X(34), y: mid ? Y(y + hh / 2) : Y(y + 8), s, size: cap, weight: word.weight ?? 600, color: word.fill!, anchor: 'start', baseline: mid ? 'middle' : 'top' });
  rect('card.walls.lumen', 20, LUMEN[0], 560, LUMEN[1] - LUMEN[0], 10);
  const alb = lk('card.walls.alb');
  for (let i = 0; i < 8; i++) shapes.push({ k: 'circle', cx: X(70 + i * 66), cy: Y(LUMEN[0] + 30 + (i % 3) * 30), r: 8 * u, fill: alb.fill });
  // the sinusoid's albumin rises through three of its pores (at the middle of the loop)
  if (sin) for (const x of [PORES[0], PORES[2], PORES[4]]) shapes.push({ k: 'circle', cx: X(x), cy: Y(Y_WALL + 4), r: 8 * u, fill: alb.fill });
  const wall = lk('card.walls.wall');
  if (sin) for (let k = 0; k < 6; k++) shapes.push({ k: 'rect', x: X(20 + k * 98), y: Y(Y_WALL), w: 70 * u, h: 14 * u, r: 7 * u, fill: wall.fill });
  else {
    shapes.push({ k: 'rect', x: X(20), y: Y(Y_WALL), w: 560 * u, h: 14 * u, r: 7 * u, fill: wall.fill });
    const bm = lk('card.walls.bm');
    shapes.push({ k: 'rect', x: X(20), y: Y(Y_WALL - 9), w: 560 * u, h: 6 * u, r: 3 * u, fill: bm.fill && bm.opacity != null ? [bm.fill[0], bm.fill[1], bm.fill[2], bm.fill[3] * bm.opacity] : bm.fill });
  }
  // the flow: an arrow up through the wall (its head is the marker's triangle, 5 strokes long); the sinusoid's is wide
  const flow = lk('card.walls.flow', { big: sin }), head = lk('card.walls.head');
  const sw = sin ? 7 : 4, hs = sw / 2;
  for (const x of sin ? PORES : [170, 430]) {
    const ey = Y_WALL - (sin ? 22 : 26);
    shapes.push({ k: 'line', x1: X(x), y1: Y(Y_WALL + 40), x2: X(x), y2: Y(ey), pen: { color: flow.stroke!, w: (flow.width ?? sw) * u, cap: 'round' } });
    shapes.push({ k: 'path', pts: [X(x - 5 * hs), Y(ey + 5 * hs), X(x), Y(ey - 5 * hs), X(x + 5 * hs), Y(ey + 5 * hs)], closed: true, fill: head.fill });
  }
  return { w: c.w, h, shapes, label: WALLS_COPY[sin ? 'sin' : 'gut'].aria };
}
