// The stent pictures as frames (2D: tool-stent.js side view, stent-trace-pic.js, stent-drop-pic.js; looks chart-looks/stent.js). Each picture is laid out in the 2D units (a 320 wide picture), then
// every coordinate, stroke width, dash and type size is scaled to the card's width: the SVG's viewBox did the same in 2D. Words are at least 12 px.
import type { ChartCtx } from '../Chart.tsx';
import { look, type Look } from '../looks.ts';
import type { Rgba } from '../colour.ts';
import type { Frame, Shape, TextShape } from '../scene.ts';
import {
  COLS, DROP, DROP_NAMES, KEY, PANELS, TITLES, TR, VW, dropIn, dropLayout, keyCols, smooth01, stentSpan, ten, traceFit, traceFor, traceIn, traceLayout, xAt, type Panel, type StentState, type TraceIn,
} from './model.ts';

interface Span { c: number; a0: number; a1: number; b1: number; b0: number }
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const H = { host: 'stent' };
const a = (c: Rgba, k: number): Rgba => [c[0], c[1], c[2], c[3] * k];

/** The words' size in units for a card of width W: 12 px at the least, the card's data size when the picture is wide, never over 16 units (2D fitAll). */
export function unitSize(c: ChartCtx): { k: number; fs: number } {
  const W = Math.max(200, c.w), k = W / VW;
  return { k, fs: Math.max(12 / k, Math.min(16, Math.max(9, c.type.sm / k))) };
}

/** A picture being drawn in units. */
class Pic {
  shapes: Shape[] = [];
  readonly k: number;
  readonly c: ChartCtx;
  readonly fs: number;
  constructor(c: ChartCtx, fs: number) { this.c = c; this.fs = fs; this.k = Math.max(200, c.w) / VW; }
  lk = (key: string, st: Record<string, unknown> = {}): Look => look(this.c, H, key, st);
  private pen(l: Look, o = 1) { return { color: a(l.stroke!, o * (l.strokeOpacity ?? 1)), w: (l.width ?? 1) * this.k, dash: l.dash?.map((d) => d * this.k), cap: l.cap, join: l.join }; }
  private fillOf(l: Look, o = 1): Rgba { return a(l.fill ?? [0, 0, 0, 0], o * (l.opacity ?? 1) * (l.fillOpacity ?? 1)); }
  private sc(p: readonly number[]) { return p.map((v) => v * this.k); }
  /** an open polyline in units, pen from the look `key` */
  line(pts: readonly number[], key: string, o = 1) { this.shapes.push({ k: 'path', pts: this.sc(pts), pen: this.pen(this.lk(key), o) }); }
  /** a closed outline in units, filled by the look (and edged by it when it has a stroke) */
  poly(pts: readonly number[], key: string, o = 1) { const l = this.lk(key); this.shapes.push({ k: 'path', pts: this.sc(pts), closed: true, ...(l.fill && l.fill[3] > 0 ? { fill: this.fillOf(l, o) } : {}), ...(l.stroke ? { pen: this.pen(l, o) } : {}) }); }
  polyFill(pts: readonly number[], colour: Rgba) { this.shapes.push({ k: 'path', pts: this.sc(pts), closed: true, fill: colour }); }
  rect(x: number, y: number, w: number, h: number, key: string, o = 1) { const l = this.lk(key), k = this.k; this.shapes.push({ k: 'rect', x: x * k, y: y * k, w: Math.max(0, w) * k, h: h * k, fill: this.fillOf(l, o), ...(l.stroke ? { pen: this.pen(l, o) } : {}) }); }
  rectFill(x: number, y: number, w: number, h: number, colour: Rgba) { const k = this.k; this.shapes.push({ k: 'rect', x: x * k, y: y * k, w: w * k, h: h * k, fill: colour }); }
  dot(cx: number, cy: number, r: number, key: string, o = 1) { const l = this.lk(key), k = this.k; this.shapes.push({ k: 'circle', cx: cx * k, cy: cy * k, r: r * k, ...(l.fill && l.fill[3] > 0 ? { fill: this.fillOf(l, o) } : {}), ...(l.stroke ? { pen: this.pen(l, o) } : {}) }); }
  /** a word in units: size in units (px = size × k, never under 12) */
  text(x: number, y: number, s: string, key: string, size: number, anchor: 'start' | 'middle' | 'end' = 'start', o = 1) {
    const l = this.lk(key), k = this.k;
    const t: TextShape = { k: 'text', x: x * k, y: y * k, s, size: Math.max(12, size * k), weight: l.weight, color: l.fill!, anchor, baseline: 'middle', alpha: o, ...(l.halo ? { halo: { color: l.halo.color, w: l.halo.w * k } } : {}) };
    this.shapes.push(t);
  }
}
const frameOf = (p: Pic, hUnits: number, label: string): Frame => ({ w: Math.max(200, p.c.w), h: Math.ceil(hUnits * p.k), shapes: p.shapes, label });
const NO_STENT = 'No stent';
/** a picture with no stent in: the word, centred */
function empty(p: Pic, hUnits: number, id: string, what: string): Frame {
  p.text(VW / 2, hUnits / 2, NO_STENT, 'stent.word', p.fs, 'middle');
  return frameOf(p, hUnits, `${id}: no stent. ${what}`);
}

// ── the trace's curves, once per state ──
const tOf = (st: StentState): TraceIn => traceIn(st);

// ── the traces ──
export interface TraceOpts { pick?: Panel }
export function traceFrame(st: StentState, c: ChartCtx, o: TraceOpts = {}): Frame {
  const { fs } = unitSize(c), p = new Pic(c, fs), G = traceLayout(fs), pick = o.pick ?? 'pressure', id = st.id;
  const label = st.have ? `${id}, pressure, energy lost and velocity along the stent (schematic): ${ten(st.ppg)} mmHg portal to IVC, ${ten(st.dp)} mmHg across the stent` : `${id}: no stent`;
  if (!st.have) return empty(p, G.h, id, 'Along the stent.');
  const T = tOf(st), R = traceFit(T, st.ivc), len = T.sh.len, o2 = traceFor(T), [px0, px1] = stentSpan(), X = (cm: number) => xAt(cm, len, px0, px1, G.X0);
  const N = o2.x.length - 1, bot = G.base;
  for (let t = 0; t < 3; t++) { const y = G.base - (TR.ph * t) / 2; p.line([G.X0, y, TR.x1, y], 'stent.tr.axis'); }
  for (let k = 0; k < 5; k++) { const x = X(o2.sites[k]!); p.line([x, G.top, x, bot], 'stent.tr.site'); p.text(x, G.digits, `${k + 1}`, 'stent.tr.siteNum', fs, 'middle'); }
  const name = pick;
  let lo = 0, hi = R.pHi, ys: ArrayLike<number> = o2.loss, off = 0;
  if (name === 'pressure') { lo = R.pLo; hi = R.pHi; ys = o2.P; off = st.ivc; } else if (name === 'velocity') { lo = 0; hi = R.vHi; ys = o2.v; }
  const ky = TR.ph / Math.max(1e-6, hi - lo), yOf = (v: number) => clamp(bot - (v - lo) * ky, G.top, bot);
  const lab = (v: number) => `${clamp(Math.round(v), -100, 599)}`;
  const pts: number[] = [];
  for (let i = 0; i <= N; i++) pts.push(X(o2.x[i]!), yOf(ys[i]! + off));
  const yz = yOf(off);
  p.line([G.X0, yz, TR.x1, yz], 'stent.tr.zero');
  p.poly([...pts, X(len + TR.veinCm), yz, X(-TR.veinCm), yz], `stent.tr.area.${name}`);
  p.line(pts, `stent.tr.line.${name}`);
  for (let k = 0; k < 5; k++) p.dot(X(o2.sites[k]!), yOf(ys[o2.i[k]!]! + off), 3.2, `stent.tr.dot.${name}`);
  p.text(G.X0, G.title, TITLES[name], 'stent.tr.title', Math.min(fs, 300 / (TITLES[name].length * 0.6)), 'start');
  for (let t = 0; t < 3; t++) p.text(G.X0 - 4, G.base - (TR.ph * t) / 2, lab(lo + ((hi - lo) * t) / 2), 'stent.cap', fs, 'end');
  if (name === 'pressure') p.text(TR.x1, clamp(yz - fs * 0.7, G.top + fs * 0.5, bot), `IVC ${ten(st.ivc)}`, 'stent.cap', fs, 'end');
  p.text(160, G.key, KEY, 'stent.cap', Math.min(fs, 300 / (KEY.length * 0.6)), 'middle');
  return frameOf(p, G.h, label);
}
export { PANELS };

// ── where the pressure goes ──
export interface DropOpts { to?: 'ppg' | 'stent'; max?: number }
export function dropFrame(st: StentState, c: ChartCtx, o: DropOpts = {}): Frame {
  const { fs } = unitSize(c), p = new Pic(c, fs), G = dropLayout(fs), id = st.id;
  const label = st.have ? `${id}, where the pressure goes: ${ten(st.dp)} mmHg across the stent${o.to === 'ppg' ? `, ${ten(st.ppg)} mmHg PPG` : ''}` : `${id}: no stent`;
  if (!st.have) return empty(p, G.h, id, 'Where the pressure goes.');
  const D = dropIn(st, o), tr = D.o, N = tr.x.length - 1, ex = 1, on = D.on, len = D.len, { px0, px1, ppg, pHi } = D;
  const xa = tr.x[0]!, xb = tr.x[N]!, ky = (G.yB - G.yT) / Math.max(1e-6, pHi), Y = (v: number) => clamp(G.yB - v * ky, G.yT, G.yB);
  const X = (x: number) => (x <= 0 ? (px0 * (x - xa)) / Math.max(1e-9, -xa) : x >= len ? px1 + ((DROP.w - px1) * (x - len)) / Math.max(1e-9, xb - len) : px0 + (px1 - px0) * (x / Math.max(1e-9, len)));
  const line: number[] = [];
  for (let i = 0; i <= N; i++) line.push(X(tr.x[i]!), Y(ppg - tr.loss[i]!));
  p.poly([...line, X(xb), G.yB, X(xa), G.yB], 'stent.drop.area', ex);
  p.line([0, Y(ppg), DROP.w, Y(ppg)], 'stent.drop.guide', ex * 0.7);
  p.line([0, G.yB, DROP.w, G.yB], 'stent.drop.base', ex);
  for (const x of [px0, px1]) p.line([x, G.yT - 6, x, G.yB], 'stent.drop.guide', ex);
  p.line(line, 'stent.drop.line', ex);
  // each part's stroke: the stretch of the line where its cumulative share rises, the pen lifted elsewhere (a step is the one segment between two samples)
  const CUM = ['cOut', 'cTract', 'cEnds', 'cWall', 'cJet'] as const;
  for (let q = 0; q < COLS.length; q++) {
    const cum = tr[CUM[q]!] as ArrayLike<number>, opacity = ex * (q === 0 ? on : 1) * smooth01((D.vals[q]! - 0.03) / 0.17);
    if (opacity <= 0.002) continue;
    const on_ = new Uint8Array(N + 2);
    for (let i = 1; i <= N; i++) on_[i] = cum[i]! - cum[i - 1]! > 1e-7 ? 1 : 0;
    let run: number[] = [];
    const flush = () => { if (run.length >= 4) p.line(run, `stent.drop.s.${COLS[q]}`, opacity); run = []; };
    for (let i = 0; i <= N; i++) { if (on_[i] || on_[i + 1]) run.push(line[2 * i]!, line[2 * i + 1]!); else flush(); }
    flush();
  }
  p.text(4, Y(ppg) - 0.8 * fs, D.ppgWord, 'stent.mark.text', fs, 'start', ex * on);
  p.text(4, G.baseY, 'Portal vein', 'stent.cap', fs, 'start', ex);
  p.text((px0 + px1) / 2, G.baseY, 'Stent', 'stent.cap', fs, 'middle', ex);
  p.text(DROP.w - 4, G.baseY, 'IVC', 'stent.cap', fs, 'end', ex);
  const { lefts, kf } = keyCols(fs);
  const dims = D.vals.map((v, q) => ex * (v < 0.05 ? 0.4 : 1) * (q === 0 ? 0.4 + 0.6 * on : 1));
  COLS.forEach((col, q) => p.dot(lefts[q]! + DROP.dotR, G.nameY, DROP.dotR, `stent.key.dot.${col}`, dims[q]));
  COLS.forEach((col, q) => p.text(lefts[q]! + 2 * DROP.dotR + 3, G.nameY, DROP_NAMES[col], 'stent.key.text', kf, 'start', dims[q]));
  COLS.forEach((_, q) => p.text(lefts[q]! + 2 * DROP.dotR + 3, G.valY, D.words[q]!, 'stent.lab', kf, 'start', dims[q]));
  p.text(DROP.gutter, G.totY, D.totWord, 'stent.mark.text', Math.min(fs, (DROP.w - 2 * DROP.gutter) / (30 * 0.6)), 'start', ex);
  return frameOf(p, G.h, label);
}
