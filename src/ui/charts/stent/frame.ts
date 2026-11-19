// The stent pictures as frames (2D: tool-stent.js side view, stent-trace-pic.js, stent-drop-pic.js; looks chart-looks/stent.js). Each picture is laid out in the 2D units (a 320 wide picture), then
// every coordinate, stroke width, dash and type size is scaled to the card's width: the SVG's viewBox did the same in 2D. Words are at least 12 px.
import type { ChartCtx } from '../Chart.tsx';
import { look, type Look } from '../looks.ts';
import type { Rgba } from '../colour.ts';
import type { Frame, Shape, TextShape } from '../scene.ts';
import { samplerFor } from '../../../scene/lenses/model.ts';
import { lumenShown, profileAt, waistSpan, endSpan } from '../../../engine/hales/portal/stent-geom.js';
import {
  COLS, DROP, DROP_NAMES, KEY, N_PROFILE, PANELS, STENT_SPANS, TITLES, TR, VW, dropIn, dropLayout, gateIndex, int, keyCols, localVelocity, openVelocity, sideLayout, smooth01, stentNormal, stentOutline,
  stentSpan, ten, traceFit, traceFor, traceIn, traceLayout, velPos, xAt, type Panel, type StentState, type TraceIn,
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

// ── the side view ──
export interface SideOpts {
  /** the lumen coloured by what: velocity (the figure's velocity ramp against the stent's usual range) or pressure */
  color?: 'velocity' | 'pressure';
  /** the five pressure sites as marks on the drawing (the chart under it shares their x) */
  sites?: boolean;
  /** the Doppler third this slide reads, a band behind it: 'proximal' | 'mid' | 'distal' (resolved by the caller from the slide's `gate`) */
  gate?: 'proximal' | 'mid' | 'distal' | null;
}
const GATES = [1 / 6, 0.5, 5 / 6];
const KEYW = 110, KX = (VW - KEYW) / 2, NKS = 11;

export function sideFrame(st: StentState, c: ChartCtx, o: SideOpts = {}): Frame {
  const { fs } = unitSize(c), S = sideLayout(fs), p = new Pic(c, fs), id = st.id;
  const label = st.have ? `${id} side view: flow ${ten(st.flow)} L/min, peak velocity ${int(st.vel)} cm/s, lumen at the narrowest ${ten(st.lumen)} mm` : `${id}: no stent`;
  const x0 = S.x0, L = S.span, x1 = x0 + L, cy = S.cy, sh = st.sh;
  const pxMm = Math.min(3.3, L / sh.len / 10), d = st.d, dPx = d * pxMm, s = clamp(st.s, 0, 1), site = st.site;
  const colorBy = o.color ?? 'velocity', pressure = colorBy === 'pressure';
  // the two veins either side, open ended: a faint fill and their walls running up to the stent
  p.rect(0, cy - S.stubH / 2, x0 + 0.5, S.stubH, 'stent.vein.p');
  p.rect(x1 - 0.5, cy - S.stubH / 2, VW - x1 + 0.5, S.stubH, 'stent.vein.h');
  const vh = S.stubH / 2;
  p.line([0, cy - vh, x0, cy - vh], 'stent.vein.wall'); p.line([0, cy + vh, x0, cy + vh], 'stent.vein.wall');
  p.line([x1, cy - vh, VW, cy - vh], 'stent.vein.wall'); p.line([x1, cy + vh, VW, cy + vh], 'stent.vein.wall');
  if (!st.have) {
    p.poly([x0, cy - dPx / 2, x1, cy - dPx / 2, x1, cy + dPx / 2, x0, cy + dPx / 2], 'stent.ghost');
    p.text(VW / 2, cy, NO_STENT, 'stent.word', fs, 'middle');
    return frameOf(p, S.h, label);
  }
  p.text(4, S.nameY, id === 'DIPS' ? 'PV' : 'RPV', 'tf.vein.name', fs, 'start');
  p.text(VW - 4, S.nameY, id === 'DIPS' ? 'IVC' : 'RHV', 'tf.vein.name', fs, 'end');
  // the Doppler's slide third, a band behind everything else on the stent
  const span = o.gate ? STENT_SPANS[o.gate] : null;
  if (span) p.rect(x0 + span[0] * L, S.bandY, (span[1] - span[0]) * L, S.bandH, 'stent.gate.band');
  // the lumen, coloured along the stent: one slice to each of the outline's samples (a gradient of the velocity colours, or of the pressure along the trace)
  const tr = traceFor(tOf(st));
  const vel = samplerFor(c.look as never, 'velocity'), pres = samplerFor(c.look as never, 'pressure');
  const v0 = openVelocity(st.flow, d, id), norm = stentNormal(id, d);
  const colourAt = (u: number): Rgba => {
    if (pressure) { const q = pres.at(clamp(st.ivc + tr.P[gateIndex(u, tOf(st).sh.len)]!, 0, 35)); return [q[0], q[1], q[2], 1]; }
    const q = vel.at(velPos(localVelocity(v0, profileAt(sh, s, site, u)), norm)); return [q[0], q[1], q[2], 1];
  };
  const n = N_PROFILE, edge = stentOutline(x0, L, cy, dPx, 0, s, sh, site);
  for (let i = 0; i < n; i++) {
    const q0 = 2 * n + 1 - i, q1 = 2 * n + 1 - (i + 1);
    // (a slice reaches half a sample past its ends so neighbours overlap and no seam shows)
    const top = [edge[2 * i]!, edge[2 * i + 1]!, edge[2 * (i + 1)]!, edge[2 * (i + 1) + 1]!], bot = [edge[2 * q1]!, edge[2 * q1 + 1]!, edge[2 * q0]!, edge[2 * q0 + 1]!];
    p.polyFill([...top, ...bot], colourAt((i + 0.5) / n));
  }
  p.poly(edge, 'stent.lumen');
  // the dimension line: the narrowing's length and lumen in mm; with no narrowing the whole stent's length in cm, the same line moving out to the ends
  const red = sh.red || 0, sMax = Math.max(s, red), wr = sMax > 1e-6 ? red / (red + s) : 0, wsp = waistSpan(sh) as Span, esp = endSpan(sh, site) as Span;
  const kk = smooth01((sMax - 0.01) / 0.05), xa = x0 + ((esp.a1 + (wsp.a1 - esp.a1) * wr) * kk) * L, xb = x1 + (x0 + (esp.b1 + (wsp.b1 - esp.b1) * wr) * L - x1) * kk, ym = S.dimY;
  p.line([xa, ym + 4, xa, ym, xb, ym, xb, ym + 4], 'stent.dim');
  const lx = clamp((xa + xb) / 2, x0 + 24, x1 - 24);
  p.text(lx, S.labY, `${ten(lumenShown(d * (1 - sMax)))} mm`, 'stent.word', fs, 'middle', kk);
  p.text(lx, S.labY, `${ten(sh.len)} cm`, 'stent.word', fs, 'middle', 1 - kk);
  // the flow's arrow, its size following the flow
  const ak = clamp(0.55 + st.flow / 3, 0.55, 1.35), ax = Math.max(15, x0 / 2), AR = [-9, -3, 1, -3, 1, -7, 10, 0, 1, 7, 1, 3, -9, 3];
  p.poly(AR.map((v, i) => (i % 2 ? cy + v * ak : ax + v * ak)), 'stent.arrow');
  // the Doppler's three points: a tick down from the stent's wall, and the number under it (the velocity lens) or the pressure there (the pressure lens)
  const yb = cy + dPx / 2;
  for (let q = 0; q < 3; q++) {
    const xg = x0 + GATES[q]! * L;
    p.line([xg, yb, xg, S.gateTop], 'stent.gate.tick');
    p.text(xg, S.numY, pressure ? ten(st.ivc + tr.P[gateIndex(GATES[q]!, sh.len)]!) : int(st.g[q]!), 'stent.num', fs, 'middle');
  }
  const capSize = Math.min(fs, 300 / (38 * 0.58));
  const bHi = Number.isFinite(norm[1]) ? norm[1] : 190, bLo = norm[0];
  p.text(VW / 2, S.capY, pressure ? 'Static pressure, mmHg' : `Peak at each gate, cm/s (usual ${Math.round(bLo)} to ${Math.round(bHi)})`, 'stent.cap', capSize, 'middle');
  // the colour key: a strip of the ramp with its ends named (the velocity lens: 0 to twice the usual ceiling with the usual range's edges marked; the pressure lens: 0 to 30 mmHg)
  const K = 44, kw = KEYW / K, ky = S.keyY - 2.5;
  for (let i = 0; i < K; i++) {
    const f = (i + 0.5) / K, q = pressure ? pres.at(clamp(30 * f, 0, 35)) : vel.at(velPos(2 * bHi * f, norm));
    p.rectFill(KX + i * kw, ky, kw + 0.4, 5, [q[0], q[1], q[2], 1]);
  }
  p.rect(KX, ky, KEYW, 5, 'stent.key.bar');
  p.text(KX - 5, S.keyY, pressure ? '0' : 'slower', 'stent.cap', fs, 'end');
  p.text(KX + KEYW + 5, S.keyY, pressure ? '30' : 'faster', 'stent.cap', fs, 'start');
  if (!pressure) for (const b of [bLo, bHi]) { const xk = KX + (KEYW * b) / (2 * bHi); p.line([xk, S.keyY - 4.5, xk, S.keyY + 4.5], 'stent.gate.tick'); }
  // the five pressure sites as marks on the drawing, on the x the chart under it uses (a tick down to the lumen's top and its digit)
  if (o.sites) {
    const X0 = traceLayout(fs).X0, top = S.siteY + 5;
    for (let k = 0; k < 5; k++) {
      const cmK = tr.sites[k]!, xk = xAt(cmK, sh.len, x0, x1, X0), inside = cmK > 0 && cmK < sh.len, half = inside ? (dPx * profileAt(sh, s, site, cmK / sh.len)) / 2 : S.stubH / 2;
      p.line([xk, top, xk, Math.max(top + 1, cy - half - 1)], 'stent.gate.tick');
      p.text(xk, S.siteY, `${k + 1}`, 'stent.tr.siteNum', fs, 'middle');
    }
  }
  return frameOf(p, S.h, label);
}

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
