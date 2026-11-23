// The treatment menu as a frame (2D: tool-menu.js build(); looks: chart-looks/time.js 'cv.*', 'time.*' and plot.js, host 'curve': the menu is the curve's card). Every treatment this
// patient could get is a dot at the PPG it reaches (up) against the sinusoidal flow it costs (across), sized by the share of portal blood that bypasses the liver and coloured by the
// PPG's own rating; the ring is the patient as he stands. The geometry, the word placing and the numbers are 2D's own (menu-pure.generated.js, curve-pure.generated.js); this
// file only turns the svg builder's elements into shapes.
import type { ChartCtx } from '../Chart.tsx';
import { look, type Look } from '../looks.ts';
import { measure } from '../measure.ts';
import { fitHeight, type Shape, type Frame, type TextShape } from '../scene.ts';
import { cutsOf, fmtTick, namesCrowded, placeDotNames, placeWord, xAxisName } from '../curve/curve-pure.generated.js';
import { baseName, dotRadius, geo, ratingTok } from './menu-pure.generated.js';
import { curveHeight } from '../curve/frame.ts';
import { tableH } from '../../layout/chart-box.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
/** One treatment's dot: the model's reading for it, in shown units (menuPoints). */
export interface MenuDot { id: string; name: string; short: string; ppg: number; liver: number; shunt?: number }
/** The slide's own reading, the ring: its PPG, the liver's flow and the shunt fraction. */
export interface MenuBase { ppg?: number | null; liver?: number | null; shunt?: number | null }
export interface MenuSpec { dots: readonly MenuDot[]; base: MenuBase | null; baseLabel: string; height?: number }

const H = { host: 'curve' };
const cw = (t: unknown, f: number, b?: unknown) => String(t).length * f * (b ? 0.6 : 0.56);
const mw = (t: string, f: number, bold = false) => measure(t, f, bold ? 700 : 500);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
type Seg = number[] & { w?: number };
const seg = (a: number[], w?: number): Seg => Object.assign([...a], w == null ? {} : { w }) as Seg;

function drawOnce(spec: MenuSpec, c: ChartCtx, w: number, h: number, f: number, steps: boolean) {
  const { dots, baseLabel } = spec, base = spec.base;
  const G = geo(w, h, f, dots, base, steps, baseLabel) as Any, { L, R, T, B, sL, x0, x1 } = G;
  const lk = (key: string, state: Record<string, unknown> = {}, tone?: string): Look => look(c, H, key, state, tone ? { c: tone.replace(/^--/, '') } : {});
  const stroke = (l: Look) => ({ color: l.stroke!, w: l.width ?? 1, ...(l.dash && l.dash.length ? { dash: l.dash } : {}), ...(l.cap ? { cap: l.cap } : {}) });
  const say = (out: Shape[], x: number, y: number, s: string, l: Look, o: Partial<TextShape> = {}) => {
    if (!s) return;
    out.push({ k: 'text', x, y, s, size: l.size ?? f, weight: l.weight, color: l.fill!, ...(l.halo ? { halo: l.halo } : {}), ...(l.upper ? { upper: true } : {}), ...(l.ls ? { ls: l.ls } : {}), ...o });
  };
  const X = (v: number) => L + (R - L) * (v - x0) / ((x1 - x0) || 1), Y = (v: number) => B - (B - T) * clamp((v - sL.min) / ((sL.max - sL.min) || 1), 0, 1);
  const ty = (y: number) => y + 0.35 * f;
  const ring = base && Number.isFinite(base.ppg) && Number.isFinite(base.liver) ? [X(base.liver as number), Y(base.ppg as number)] : null, rr = Math.max(5, f * 0.45);
  const pts = dots.map((d) => ({ d, x: X(d.liver), y: Y(d.ppg), r: dotRadius(d.shunt, f) as number, c: ratingTok(d.ppg) as string }));
  const half = (r: number) => r + 2;
  const named = [...(ring ? [{ id: '', x: ring[0]!, y: ring[1]!, r: rr, txt: baseLabel }] : []), ...pts.map((q) => ({ id: q.d.id, x: q.x, y: q.y, r: q.r, txt: q.d.short }))];
  const boxes: number[][] = named.map((q) => [q.x - half(q.r), q.y - half(q.r), q.x + half(q.r), q.y + half(q.r)]), segs: Seg[] = [];

  // the panel, from just under the key row to under the axis's name
  const py = G.keyH + 0.2 * f, ph = B + G.foot - py - G.stepH, pr = Math.max(0, Math.min(10, w / 4, ph / 4));
  const panel: Shape[] = [{ k: 'rect', x: 0, y: py, w, h: ph, r: pr, fill: lk('plot.bg').fill }];
  // gridlines and numbers
  const grid: Shape[] = [];
  sL.ticks.forEach((v: number) => {
    const g = lk('plot.grid.line', { cut: false });
    grid.push({ k: 'line', x1: L, x2: R, y1: Y(v), y2: Y(v), pen: { color: g.stroke!, w: g.width ?? 1 } });
    say(grid, L - 6, ty(Y(v)), fmtTick(v, 0), lk('time.grid.text', {}, 'text-2'), { anchor: 'end' });
  });
  // the cut-offs: the PPG's red line, and the liver's severe line when the dots reach it, each named over its line at the end the dots leave clear
  const pc = (cutsOf('ppg') as Any[]).find((q) => q.rate === 'hi' && q.v > sL.min && q.v < sL.max), lc = (cutsOf('liver') as Any[]).find((q) => q.rate === 'hi' && q.v > x0 && q.v < x1);
  const cutShapes: Shape[] = [], inside = [0, 0, w, h];
  if (pc) {
    const y = Y(pc.v), txt = `PPG ${pc.v}`, tw = 1.12 * cw(txt, f, true);
    const at = placeWord([{ x: L + 3, y: y - 0.35 * f, anchor: 'start' }, { x: R - 3, y: y - 0.35 * f, anchor: 'end' }, { x: L + 3, y: y + 1.05 * f, anchor: 'start' }, { x: R - 3, y: y + 1.05 * f, anchor: 'end' }], tw, f, { boxes, inside });
    cutShapes.push({ k: 'line', x1: L, x2: R, y1: y, y2: y, pen: stroke(lk('plot.grid.line', { cut: true, rate: pc.rate })) });
    say(cutShapes, at.x, at.y, txt, lk('cv.cut', { rate: pc.rate }), { anchor: at.anchor });
    boxes.push(at.box); segs.push(seg([L, y, R, y], 5));
  }
  if (lc) {
    const x = X(lc.v), txt = `Liver ${lc.v}`, tw = 1.12 * cw(txt, f, true), y = T - 0.45 * f;
    const at = placeWord([{ x, y, anchor: 'middle' }, { x: x + 0.3 * f, y, anchor: 'start' }, { x: x - 0.3 * f, y, anchor: 'end' }], tw, f, { boxes, inside });
    cutShapes.push({ k: 'line', x1: x, x2: x, y1: T - 0.2 * f, y2: B, pen: stroke(lk('plot.grid.line', { cut: true, rate: lc.rate })) });
    say(cutShapes, at.x, at.y, txt, lk('cv.cut', { rate: lc.rate }), { anchor: at.anchor });
    boxes.push(at.box); segs.push(seg([x, T, x, B], 5));
  }
  // the key row: the reading at the left, what a dot's size means at the right
  const keyRow: Shape[] = [];
  const kt = lk('time.key.text', {}, 'text-2'), ku = lk('time.key.unit', {}, 'text-3');
  say(keyRow, 0, ty(0.75 * f), 'PPG', kt);
  say(keyRow, mw('PPG', f, true), ty(0.75 * f), ', mmHg', { ...lk('time.key.unit'), size: f });
  say(keyRow, G.two ? 0 : w, ty((G.two ? 2.25 : 0.75) * f), G.size, ku, { anchor: G.two ? 'start' : 'end' });
  // the axis
  const axl = lk('time.axis.line'), axis: Shape[] = [{ k: 'line', x1: L, x2: R, y1: B, y2: B, pen: { color: axl.stroke!, w: axl.width ?? 1 } }];
  (G.xt as number[]).forEach((x) => say(axis, X(x), B + 1.25 * f, fmtTick(x, 0), lk('time.tk'), { anchor: X(x) <= L + 1 ? 'start' : X(x) >= R - 1 ? 'end' : 'middle' }));
  const axName = xAxisName(G.ax) as string;
  say(axis, G.nameAt ?? clamp((L + R) / 2, 8 + cw(axName, f, 1) / 2, w - 8 - cw(axName, f, 1) / 2), B + (G.nameAt == null ? 2.6 : 1.25) * f, axName, lk('cv.ax'), { anchor: 'middle' });

  // the words keep off every dot, the ring, the cut-offs and the chart's edge; a name that cannot stand close and clear gives way to numbers and a key
  const num = new Map<string, string>((G.stepKey?.items ?? []).filter((it: Any) => !it.ring).map((it: Any) => [it.id, String(it.n)]));
  const items = named.map((q) => ({ x: q.x, y: q.y, w: !q.id && num.size ? 0 : 1.08 * cw(num.get(q.id) ?? q.txt, f, true) }));
  const ob = { boxes, segs, lines: [{ y: B, x0: L, x1: R }], bounds: [L + 1, T - 1.3 * f, R - 1, B - 0.15 * f], inside: [0, 0, w, h] };
  const spots = named.length ? (placeDotNames(items, f, half(Math.max(...named.map((q) => q.r))), ob) as Any[]) : [];
  const crowded = !steps && dots.length > 0 && (namesCrowded(spots, f) as boolean);
  const names: Shape[] = [], leads: Shape[] = [];
  named.forEach((q, i) => {
    const s = spots[i], word = num.get(q.id) ?? q.txt;
    if (!s?.ok || (!q.id && num.size)) return;   // (with numbers, the ring is named in the key)
    say(names, s.x, s.y, word, lk('cv.dname', { num: !!(num.size && q.id) }), { anchor: s.anchor });
    if (s.lead) leads.push({ k: 'line', x1: s.lead[0], y1: s.lead[1], x2: s.lead[2], y2: s.lead[3], pen: stroke(lk('cv.lead')) });
  });
  const dotShapes: Shape[] = pts.map((q) => { const dl = lk('cv.dot', {}, q.c); return { k: 'circle', cx: q.x, cy: q.y, r: q.r, fill: dl.fill, pen: { color: dl.stroke!, w: dl.width ?? 1 } } as Shape; });
  const ringShape: Shape[] = ring ? [(() => { const rl = lk('cv.ring', {}, 'text-2'); return { k: 'circle', cx: ring[0]!, cy: ring[1]!, r: rr, fill: rl.fill, pen: { color: rl.stroke!, w: rl.width ?? 1 } } as Shape; })()] : [];
  // the key under the chart when the dots carry numbers: each "1 Propranolol", left to right and wrapped to rows of the chart's width (the ring leads it with a small ring of its own)
  const stepKey: Shape[] = [];
  (G.stepKey?.items ?? []).forEach((it: Any) => {
    const y = B + G.foot + 1.3 * f + it.row * G.rowH, l = lk('cv.sk');
    if (it.ring) {
      const rl = lk('cv.ring', {}, 'text-2');
      stepKey.push({ k: 'circle', cx: it.x + 0.35 * f, cy: y - 0.05 * f, r: 0.3 * f, fill: rl.fill, pen: { color: rl.stroke!, w: rl.width ?? 1 } });
      say(stepKey, it.x + 0.9 * f, y, it.name, l);
    } else {
      say(stepKey, it.x, y, String(it.n), { ...l, weight: lk('cv.sn').weight });
      say(stepKey, it.x + mw(String(it.n), f, true), y, ` ${it.name}`, l);
    }
  });
  const label = `Treatment menu: PPG against sinusoidal flow. ${ring ? `${baseLabel} ${Math.round(base!.ppg as number)} mmHg, ${Math.round(base!.liver as number)}%` : ''}${dots.map((d) => `; ${d.name} ${d.ppg.toFixed(1)} mmHg, ${Math.round(d.liver)}%`).join('')}`;
  const frame: Frame = { w, h, shapes: [...panel, ...grid, ...cutShapes, ...keyRow, ...axis, ...stepKey, ...leads, ...dotShapes, ...ringShape, ...names], label };
  return { frame, G, crowded };
}

export interface MenuOut { frame: Frame; G: Any; crowded: boolean }
/** The menu at the card's width. Until the treatments are worked out (`dots` empty) the frame shows alone and the dots come in over it. */
export function menuFrame(spec: MenuSpec, c: ChartCtx): MenuOut {
  const f = c.type.sm, w = Math.max(160, c.w), h = Math.round(Math.max(8 * f, spec.height ?? fitHeight(tableH() ?? curveHeight(w, f), c)));
  let out = drawOnce(spec, c, w, h, f, false);
  // a crowd of names: numbers on the dots and a key under the chart, if the plot keeps its height; else the names stay and any with no clear spot is left out
  if (out.crowded) { const o2 = drawOnce(spec, c, w, h, f, true); if (o2.G.B - o2.G.T >= 5 * f) out = o2; }
  return out;
}
export { baseName };
