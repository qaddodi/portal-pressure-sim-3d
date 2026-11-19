// The cross-section as a frame (looks: chart-looks/lumen.js). The picture is square, centred in the card's width; all its pieces are always in the list
// (a clot or a ring that is not there is clear), so a new state glides.
import type { ChartCtx } from '../Chart.tsx';
import { withAlpha, type Rgba } from '../colour.ts';
import { look } from '../looks.ts';
import type { Frame, Shape } from '../scene.ts';
import { LUMEN_NUM_Y, LUMEN_R, LUMEN_WALL, LUMEN_WORD_Y, clotPoints, kindOfVessel, lumenAria, lumenLabel, lumenNameY, lumenNumOpacity, lumenOf, lumenShape, lumenSite, pctI, pictureSize, stentCut, wordSize, type LumenParams, type Site } from './model.ts';

export interface LumenView { vessel: string; stenosis: number; thrombus: number; stent: boolean; name?: string | null; site?: Site }

export function lumenFrame(v: LumenView, c: ChartCtx): Frame {
  const size = pictureSize(c.w), u = size / 100, ox = (c.w - size) / 2;
  const X = (x: number) => ox + x * u, Y = (y: number) => y * u;
  const kind = kindOfVessel(v.vessel);
  const lk = (key: string, state: Record<string, unknown> = {}) => look(c, { host: 'lumen', px: 12 }, key, { vessel: kind === 'portal' ? undefined : kind, ...state });
  const g = lumenShape({ stenosis: v.stenosis, thrombus: v.thrombus });
  const occlusion = 1 - (1 - v.stenosis) * (1 - v.thrombus), occ = pctI(occlusion);
  const wall = lk('lumen.wall'), clot = lk('lumen.clot'), open = lk('lumen.open'), stent = lk('lumen.stent'), num = lk('lumen.in'), wordLook = lk('lumen.word');
  const clotA = Math.min(1, g.t / 0.06), tissueA = Math.min(1, v.stenosis / 0.06);
  const a = (col: Rgba, k: number): Rgba => withAlpha(col, col[3] * k);
  // the picture is drawn in a 100-unit box, so every width and dash of the table is in units, scaled by u like the 2D viewBox
  const shapes: Shape[] = [];
  const cx = X(50), cy = Y(50);
  shapes.push({ k: 'circle', cx, cy, r: LUMEN_R * u, fill: wall.fill, pen: { color: wall.stroke!, w: wall.width! * u } });
  // the narrowing of a stent, in the clot's colour: a ring of tissue the open lumen sits inside
  shapes.push({ k: 'circle', cx, cy, r: (LUMEN_R - LUMEN_WALL) * u, fill: a(clot.fill!, v.stent ? tissueA : 0), pen: { color: a(clot.stroke!, v.stent ? tissueA : 0), w: clot.width! * u } });
  shapes.push({ k: 'circle', cx, cy, r: g.ri * u, fill: open.fill });
  const pts = clotPoints(g).map((q, i) => (i % 2 ? Y(q) : X(q)));
  shapes.push({ k: 'path', pts, closed: true, fill: a(clot.fill!, clotA), pen: { color: a(clot.stroke!, clotA), w: clot.width! * u, join: clot.join } });
  shapes.push({ k: 'circle', cx, cy, r: (LUMEN_R - LUMEN_WALL) * u, pen: { color: a(stent.stroke!, v.stent ? 1 : 0), w: stent.width! * u, dash: stent.dash!.map((d) => d * u) } });
  const wsz = wordSize(u) * u, op = lumenNumOpacity(occlusion);
  const word = (s: string, y: number, size: number, l: typeof num, alpha: number): Shape => ({ k: 'text', x: cx, y: Y(y), s, size, weight: l.weight ?? 600, color: l.fill!, anchor: 'middle', baseline: 'middle', alpha, halo: { color: l.halo!.color, w: l.halo!.w * u } });
  shapes.push(word(lumenLabel(v.vessel, v.name, v.site ?? 'distal'), lumenNameY(occlusion), wsz, wordLook, 1));
  shapes.push(word(`${occ}%`, LUMEN_NUM_Y, num.size! * u, num, op));
  shapes.push(word('occluded', LUMEN_WORD_Y, wsz, wordLook, op));
  const st = pctI(v.stenosis), th = pctI(v.thrombus);
  return { w: c.w, h: size, shapes, label: lumenAria(v.vessel, occ, th, st, v.stent) };
}

/** A vessel's picture from the model's params: the numbers the follower will move toward. */
export function lumenViewOf(params: LumenParams | null | undefined, vessel: string, stented: readonly string[] | null | undefined, tool: { site?: string | null; name?: string | null } = {}): { target: { stenosis: number; thrombus: number }; stent: boolean; name?: string | null; site: Site } {
  const L = lumenOf(params, vessel), site = lumenSite(params ?? {}, vessel, tool.site);
  return { target: { stenosis: L.stent ? stentCut(params ?? {}, vessel, site) : L.stenosis, thrombus: L.thrombus }, stent: L.stent || (Array.isArray(stented) && stented.includes(vessel)), name: tool.name, site };
}
