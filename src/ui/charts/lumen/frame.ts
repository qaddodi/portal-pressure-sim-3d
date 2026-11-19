// The cross-section as a frame (looks: chart-looks/lumen.js). The picture is square, centred in the card's width; all its pieces are always in the list
// (a clot or a ring that is not there is clear), so a new state glides.
import type { ChartCtx } from '../Chart.tsx';
import { mix, withAlpha, type Rgba } from '../colour.ts';
import type { Frame, Shape } from '../scene.ts';
import { LUMEN_NUM_Y, LUMEN_R, LUMEN_WALL, LUMEN_WORD_Y, clotPoints, kindOfVessel, lumenAria, lumenLabel, lumenNameY, lumenNumOpacity, lumenOf, lumenShape, lumenSite, pctI, pictureSize, stentCut, wordSize, type LumenParams, type Site } from './model.ts';

const TONE = { portal: 'tour-portal', systemic: 'tour-sys', artery: 'artery' } as const;

export interface LumenView { vessel: string; stenosis: number; thrombus: number; stent: boolean; name?: string | null; site?: Site }

export function lumenFrame(v: LumenView, c: ChartCtx): Frame {
  const { pal } = c, size = pictureSize(c.w), u = size / 100, ox = (c.w - size) / 2;
  const X = (x: number) => ox + x * u, Y = (y: number) => y * u;
  const vessel = pal.tok(TONE[kindOfVessel(v.vessel)]);
  const g = lumenShape({ stenosis: v.stenosis, thrombus: v.thrombus });
  const occlusion = 1 - (1 - v.stenosis) * (1 - v.thrombus), occ = pctI(occlusion);
  const clotFill = pal.tok('thrombus'), clotEdge = pal.tok('thrombus-edge');
  const clotA = Math.min(1, g.t / 0.06), tissueA = Math.min(1, v.stenosis / 0.06);
  const a = (col: Rgba, k: number): Rgba => withAlpha(col, col[3] * k);
  const shapes: Shape[] = [];
  const cx = X(50), cy = Y(50);
  shapes.push({ k: 'circle', cx, cy, r: LUMEN_R * u, fill: mix('srgb', vessel, 30, pal.tok('surface')), pen: { color: mix('srgb', vessel, 75, pal.tok('text')), w: 1.5 } });
  // the narrowing of a stent, in the clot's colour: a ring of tissue the open lumen sits inside
  shapes.push({ k: 'circle', cx, cy, r: (LUMEN_R - LUMEN_WALL) * u, fill: a(clotFill, v.stent ? tissueA : 0), pen: { color: a(clotEdge, v.stent ? tissueA : 0), w: 0.8 * u } });
  shapes.push({ k: 'circle', cx, cy, r: g.ri * u, fill: vessel });
  const pts = clotPoints(g).map((q, i) => (i % 2 ? Y(q) : X(q)));
  shapes.push({ k: 'path', pts, closed: true, fill: a(clotFill, clotA), pen: { color: a(clotEdge, clotA), w: 0.8 * u, join: 'round' } });
  shapes.push({ k: 'circle', cx, cy, r: (LUMEN_R - LUMEN_WALL) * u, pen: { color: a(pal.tok('stent-metal'), v.stent ? 1 : 0), w: 2.2 * u, dash: [4.6 * u, 2.2 * u] } });
  const ink = pal.tok('gl-in-ink'), edge = pal.tok('gl-in-edge'), wsz = wordSize(u) * u, op = lumenNumOpacity(occlusion);
  const word = (s: string, y: number, size: number, halo: number, alpha: number, weight = 600): Shape => ({ k: 'text', x: cx, y: Y(y), s, size, weight, color: ink, anchor: 'middle', baseline: 'middle', alpha, halo: { color: edge, w: halo * u } });
  shapes.push(word(lumenLabel(v.vessel, v.name, v.site ?? 'distal'), lumenNameY(occlusion), wsz, 1.3, 1));
  shapes.push(word(`${occ}%`, LUMEN_NUM_Y, 22 * u, 1.9, op));
  shapes.push(word('occluded', LUMEN_WORD_Y, wsz, 1.3, op));
  const st = pctI(v.stenosis), th = pctI(v.thrombus);
  return { w: c.w, h: size, shapes, label: lumenAria(v.vessel, occ, th, st, v.stent) };
}

/** A vessel's picture from the model's params: the numbers the follower will move toward. */
export function lumenViewOf(params: LumenParams | null | undefined, vessel: string, stented: readonly string[] | null | undefined, tool: { site?: string | null; name?: string | null } = {}): { target: { stenosis: number; thrombus: number }; stent: boolean; name?: string | null; site: Site } {
  const L = lumenOf(params, vessel), site = lumenSite(params ?? {}, vessel, tool.site);
  return { target: { stenosis: L.stent ? stentCut(params ?? {}, vessel, site) : L.stenosis, thrombus: L.thrombus }, stent: L.stent || (Array.isArray(stented) && stented.includes(vessel)), name: tool.name, site };
}
