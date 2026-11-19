// The treatment menu as a frame (2D tool-menu.js `build`, on the curve's looks 'cv.*', 'time.*', plot.*; the curve's own scales, axis row and word placing, curve-pure.generated.js). The 2D builds an svg
// tree; here the same geometry gives the shapes of one Frame: a dot for each treatment at the PPG it reaches (up) against the liver's flow it costs (across), sized by the share of portal blood that
// bypasses the liver and coloured by the PPG's rating, the patient as he stands the ring, the PPG 12 line and the liver's 55 % line named over their lines, and the key row at the top.
import type { ChartCtx } from '../Chart.tsx';
import { look, type Look } from '../looks.ts';
import type { Frame, Shape, TextShape } from '../scene.ts';
import * as P from '../curve/curve-pure.generated.js';
import { dotRadius, ratingTok, type MenuPoint } from './model.ts';
import { curveHeight } from '../curve/frame.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const H = { host: 'curve' };
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const cw = (t: unknown, f: number, b?: unknown) => String(t).length * f * (b ? 0.6 : 0.56);
export interface MenuSpec { dots: readonly MenuPoint[]; base: Record<string, number | null | undefined> | null; baseLabel: string; height?: number }
export interface MenuOut { frame: Frame; G: Any; crowded: boolean }

// The key under the chart when the dots carry numbers: each "1 Propranolol", left to right and wrapped to rows of the chart's width (the ring leads it with a small ring of its own).
function stepKeyOf(dots: readonly MenuPoint[], w: number, f: number, baseLabel: string) {
  let x = 0, row = 0;
  const first = baseLabel ? [{ n: 0, ring: true, id: '', name: baseLabel, w: 0.9 * f + cw(baseLabel, f, 1) }] : [];
  const items = [...first, ...[...dots].sort((a, b) => a.liver - b.liver).map((d, k) => ({ n: k + 1, ring: false, id: d.id, name: d.short, w: cw(String(k + 1), f, 1) + 0.45 * f + cw(d.short, f, 1) }))].map((it) => {
    if (x > 0 && x + it.w > w) { row++; x = 0; }
    const at = { ...it, x, row }; x += it.w + 1.4 * f; return at;
  });
  return { items, rows: items.length ? row + 1 : 0 };
}

/** The chart's geometry for a card w × h px in type f px: its scales from the dots (and the ring), the plot's box and the words' rows. */
export function menuGeo(w: number, h: number, f: number, dots: readonly MenuPoint[], base: MenuSpec['base'], steps = false, baseLabel = '') {
  const rowH = 1.5 * f, ys = [...dots.map((d) => d.ppg), base?.ppg].filter(Number.isFinite) as number[], xs = [...dots.map((d) => d.liver), base?.liver].filter(Number.isFinite) as number[];
  // (The scale runs on nice numbers round the dots, from zero only when they come near it.)
  const [x0, x1] = P.xDomain(xs) as [number, number];
  const read = 'PPG, mmHg', size = 'Dot size: portosystemic shunt fraction', two = cw(read, f, 1) + cw(size, f, 1) + 4 * f > w, keyH = (two ? 2 : 1) * rowH + 0.2 * f;
  const stepKey = steps ? stepKeyOf(dots, w, f, base ? baseLabel : '') : null, stepH = stepKey?.rows ? stepKey.rows * rowH + 0.3 * f : 0;
  const most = clamp(Math.floor((h - 3.3 * f - stepH - keyH - 2 * f) / (1.6 * f)) + 1, 3, 7), sL: Any = P.leftScale('ppg', ys, most, [12]);
  const ax = { name: 'Liver blood flow, % of healthy', unit: '%', d: 0, k: 'liver' };
  const tw = Math.max(...sL.ticks.map((v: number) => cw(P.fmtTick(v, 0), f))), L = Math.ceil(tw + 14), R = Math.floor(w - 10);
  const { xt, nameAt } = P.xAxisRow(x0, x1, L, R, w, f, ax, Math.max(2, Math.min(7, Math.floor((w - 4 * f) / (3.2 * f)))));
  const foot = (nameAt == null ? 3.1 : 1.7) * f, T = keyH + 1.4 * f, B = h - foot - 0.2 * f - stepH;
  return { w, h, f, rowH, x0, x1, xt, nameAt, sL, ax, read, size, two, keyH, foot, stepKey, stepH, L, R, T, B: Math.max(T + 3 * f, B) };
}

type Seg = number[] & { w?: number };
const seg = (a: number[], w?: number): Seg => Object.assign([...a], w == null ? {} : { w }) as Seg;

function build(spec: MenuSpec, c: ChartCtx, w: number, h: number, f: number, steps: boolean): MenuOut {
  const { dots, base, baseLabel } = spec;
  const G = menuGeo(w, h, f, dots, base, steps, baseLabel), { L, R, T, B, sL, x0, x1 } = G;
  const lk = (key: string, state: Record<string, unknown> = {}, tone?: string): Look => look(c, H, key, state, tone ? { c: tone } : {});
  const stroke = (l: Look) => ({ color: l.stroke!, w: l.width ?? 1, ...(l.dash && l.dash.length ? { dash: l.dash } : {}), ...(l.cap ? { cap: l.cap } : {}), ...(l.join ? { join: l.join } : {}) });
  const say = (out: Shape[], x: number, y: number, s: string, l: Look, o: Partial<TextShape> = {}) => {
    if (!s) return;
    out.push({ k: 'text', x, y, s, size: l.size ?? f, weight: l.weight, color: l.fill!, ...(l.halo ? { halo: l.halo } : {}), ...(l.upper ? { upper: true } : {}), ...(l.ls ? { ls: l.ls } : {}), ...o });
  };
  const X = (v: number) => L + (R - L) * (v - x0) / ((x1 - x0) || 1), Y = (v: number) => B - (B - T) * clamp((v - sL.min) / ((sL.max - sL.min) || 1), 0, 1);
  const panelY = G.keyH + 0.2 * f, panelH = B + G.foot - panelY - G.stepH, pr = Math.max(0, Math.min(10, w / 4, panelH / 4));
  const panel: Shape[] = [{ k: 'rect', x: 0, y: panelY, w, h: panelH, r: pr, fill: lk('plot.bg').fill }];
  const grid: Shape[] = [], cutShapes: Shape[] = [], keyShapes: Shape[] = [], axisShapes: Shape[] = [], stepShapes: Shape[] = [], leadShapes: Shape[] = [], dotShapes: Shape[] = [], wordShapes: Shape[] = [];
  const dec = (sc: { ticks: number[] }) => (sc.ticks.some((v) => Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) ? 2 : sc.ticks.some((v) => v % 1) ? 1 : 0);
  void dec;
  for (const v of sL.ticks as number[]) {
    const g = lk('plot.grid.line', { cut: false });
    grid.push({ k: 'line', x1: L, x2: R, y1: Y(v), y2: Y(v), pen: { color: g.stroke!, w: g.width ?? 1 } });
    say(grid, L - 6, Y(v) + 0.35 * f, P.fmtTick(v, 0), lk('time.grid.text', {}, 'text-2'), { anchor: 'end' });
  }
  // (The ring is the patient as he stands; each treatment is a dot, sized by the blood that bypasses the liver and coloured by the PPG's rating.)
  const ring = base && Number.isFinite(base.ppg) && Number.isFinite(base.liver) ? [X(base.liver as number), Y(base.ppg as number)] as [number, number] : null, rr = Math.max(5, f * 0.45);
  const pts = dots.map((d) => ({ d, x: X(d.liver), y: Y(d.ppg), r: dotRadius(d.shunt, f), c: ratingTok(d.ppg) }));
  const half = (r: number) => r + 2;
  const named = [...(ring ? [{ id: '', x: ring[0], y: ring[1], r: rr, txt: baseLabel }] : []), ...pts.map((q) => ({ id: q.d.id, x: q.x, y: q.y, r: q.r, txt: q.d.short }))];
  const boxes: number[][] = named.map((q) => [q.x - half(q.r), q.y - half(q.r), q.x + half(q.r), q.y + half(q.r)]), segs: Seg[] = [];
  // (The cut-offs: the PPG's red line, and the liver's severe line when the dots reach it; each named over its line, at the end the dots leave clear.)
  const pc = (P.cutsOf('ppg') as Any[]).find((q) => q.rate === 'hi' && q.v > sL.min && q.v < sL.max), lc = (P.cutsOf('liver') as Any[]).find((q) => q.rate === 'hi' && q.v > x0 && q.v < x1);
  const inside = [0, 0, w, h];
  if (pc) {
    const y = Y(pc.v), txt = `PPG ${pc.v}`, tw = 1.12 * cw(txt, f, true);
    const at = P.placeWord([{ x: L + 3, y: y - 0.35 * f, anchor: 'start' }, { x: R - 3, y: y - 0.35 * f, anchor: 'end' }, { x: L + 3, y: y + 1.05 * f, anchor: 'start' }, { x: R - 3, y: y + 1.05 * f, anchor: 'end' }], tw, f, { boxes, inside });
    const g = lk('plot.grid.line', { cut: true, rate: pc.rate });
    cutShapes.push({ k: 'line', x1: L, x2: R, y1: y, y2: y, pen: stroke(g) });
    say(wordShapes, at.x, at.y, txt, lk('cv.cut', { rate: pc.rate }), { anchor: at.anchor });
    boxes.push(at.box); segs.push(seg([L, y, R, y], 5));
  }
  if (lc) {
    const x = X(lc.v), txt = `Liver ${lc.v}`, tw = 1.12 * cw(txt, f, true), y = T - 0.45 * f;
    const at = P.placeWord([{ x, y, anchor: 'middle' }, { x: x + 0.3 * f, y, anchor: 'start' }, { x: x - 0.3 * f, y, anchor: 'end' }], tw, f, { boxes, inside });
    const g = lk('plot.grid.line', { cut: true, rate: lc.rate });
    cutShapes.push({ k: 'line', x1: x, x2: x, y1: T - 0.2 * f, y2: B, pen: stroke(g) });
    say(wordShapes, at.x, at.y, txt, lk('cv.cut', { rate: lc.rate }), { anchor: at.anchor });
    boxes.push(at.box); segs.push(seg([x, T, x, B], 5));
  }
  // (The key row: the reading at the left, what a dot's size means at the right.)
  say(keyShapes, 0, 0.75 * f + 0.36 * f, 'PPG', lk('time.key.text', {}, 'text-2'));
  say(keyShapes, cw('PPG', f, true) * 0.95, 0.75 * f + 0.36 * f, ', mmHg', { ...lk('time.key.unit'), size: f });
  say(keyShapes, G.two ? 0 : w, (G.two ? 2.25 : 0.75) * f + 0.36 * f, G.size, lk('time.key.unit', {}, 'text-3'), { anchor: G.two ? 'start' : 'end' });
  const axl = lk('time.axis.line');
  axisShapes.push({ k: 'line', x1: L, x2: R, y1: B, y2: B, pen: { color: axl.stroke!, w: axl.width ?? 1 } });
  for (const x of G.xt as number[]) say(axisShapes, X(x), B + 1.25 * f, P.fmtTick(x, 0), lk('time.tk'), { anchor: X(x) <= L + 1 ? 'start' : X(x) >= R - 1 ? 'end' : 'middle' });
  const axName = P.xAxisName(G.ax) as string;
  say(axisShapes, G.nameAt ?? clamp((L + R) / 2, 8 + cw(axName, f, 1) / 2, w - 8 - cw(axName, f, 1) / 2), B + (G.nameAt == null ? 2.6 : 1.25) * f, axName, lk('cv.ax'), { anchor: 'middle' });
  // (The words keep off every dot, the ring, the cut-offs and the chart's edge; a name that cannot stand close and clear gives way to numbers and a key.)
  const num = new Map<string, string>((G.stepKey?.items.filter((it) => !it.ring) ?? []).map((it) => [it.id, String(it.n)]));
  const items = named.map((q) => ({ x: q.x, y: q.y, w: !q.id && num.size ? 0 : 1.08 * cw(num.get(q.id) ?? q.txt, f, true) }));
  const ob = { boxes, segs, lines: [{ y: B, x0: L, x1: R }], bounds: [L + 1, T - 1.3 * f, R - 1, B - 0.15 * f], inside };
  const spots: Any[] = named.length ? P.placeDotNames(items, f, half(Math.max(...named.map((q) => q.r))), ob) : [];
  const crowded = !steps && dots.length > 0 && (P.namesCrowded(spots, f) as boolean);
  named.forEach((q, i) => {
    const s = spots[i], word = num.get(q.id) ?? q.txt;
    if (!s?.ok || (!q.id && num.size)) return;   // (with numbers, the ring is named in the key)
    say(wordShapes, s.x, s.y, word, lk('cv.dname', { num: !!(num.size && q.id) }), { anchor: s.anchor });
    if (s.lead) leadShapes.push({ k: 'line', x1: s.lead[0], y1: s.lead[1], x2: s.lead[2], y2: s.lead[3], pen: stroke(lk('cv.lead')) });
  });
  for (const q of pts) { const dl = lk('cv.dot', {}, q.c); dotShapes.push({ k: 'circle', cx: q.x, cy: q.y, r: q.r, fill: dl.fill, pen: { color: dl.stroke!, w: dl.width ?? 1 } }); }
  if (ring) { const rl = lk('cv.ring', {}, 'text-2'); dotShapes.push({ k: 'circle', cx: ring[0], cy: ring[1], r: rr, fill: rl.fill, pen: { color: rl.stroke!, w: rl.width ?? 1 } }); }
  if (G.stepKey?.rows) for (const it of G.stepKey.items) {
    const y = B + G.foot + 1.3 * f + it.row * G.rowH, l = lk('cv.sk');
    if (it.ring) {
      const rl = lk('cv.ring', {}, 'text-2');
      stepShapes.push({ k: 'circle', cx: it.x + 0.35 * f, cy: y - 0.05 * f, r: 0.3 * f, fill: rl.fill, pen: { color: rl.stroke!, w: rl.width ?? 1 } });
      say(stepShapes, it.x + 0.9 * f, y, it.name, l);
    } else {
      say(stepShapes, it.x, y, String(it.n), { ...l, weight: lk('cv.sn').weight });
      say(stepShapes, it.x + cw(String(it.n), f, 1) * 0.95, y, ` ${it.name}`, l);
    }
  }
  const label = `Treatment menu: PPG against sinusoidal flow. ${ring ? `${baseLabel} ${Math.round(base!.ppg as number)} mmHg, ${Math.round(base!.liver as number)}%` : ''}${dots.map((d) => `; ${d.name} ${d.ppg.toFixed(1)} mmHg, ${Math.round(d.liver)}%`).join('')}`;
  const shapes: Shape[] = [...panel, ...grid, ...cutShapes, ...keyShapes, ...axisShapes, ...stepShapes, ...leadShapes, ...dotShapes, ...wordShapes];
  return { frame: { w, h, shapes, label }, G, crowded };
}

export function menuFrame(spec: MenuSpec, c: ChartCtx): MenuOut {
  const f = c.type.sm, w = Math.max(160, c.w), h = Math.round(Math.max(8 * f, spec.height ?? curveHeight(w, f)));
  let out = build(spec, c, w, h, f, false);
  // a crowd of names: numbers on the dots and a key under the chart, if the plot keeps its height
  if (out.crowded) { const b2 = build(spec, c, w, h, f, true); if (b2.G.B - b2.G.T >= 5 * f) out = b2; }
  return out;
}
