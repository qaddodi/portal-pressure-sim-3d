// The TIPS figure of Tests > IR > TIPS as one chart frame (2D tips-figure.js): the stent drawn to scale, the veins either side, the device as a cut view, the waist's and the end stenosis's brackets,
// the three Doppler gates' numbers and the two ends' under it, and (chart) the chart on the same x: Velocity (the scanner's along the path, the usual range as a band, a dot at each gate) or
// Pressure (the pressure along it, the PPG's bracket at the left edge, the drop across the stent at its hepatic end). Every number and every row is the 2D file's own (copied/figure-parts.copied.js:
// figLayout, xOf, vTop, pTop, the words); the pieces are drawn on the shared chart GL as a frame, in the same order and with the same looks (chart-looks/stent.js tf.*), each piece carrying
// the strength the 2D piece held (the lens crossfades by strength, so the frame keeps the same pieces and a Chart glides between two of them).
import type { ChartCtx } from '../../charts/Chart.tsx';
import { look, type Look } from '../../charts/looks.ts';
import type { Rgba } from '../../charts/colour.ts';
import type { Frame, Shape } from '../../charts/scene.ts';
import { STENT_SPANS } from '../../../engine/hales/portal/topology.js';
import { samplerFor } from '../../../scene/lenses/model.ts';
import { stentColourAt } from '../../../scene/lenses/stent-lens.ts';
import { waistSpan, endSpan, profileAt, lumenShown, waistShown } from '../../../engine/hales/portal/stent-geom.js';
import { stentCutD, bareOf } from '../../../scene/procedures/copied/stent-mesh.js';
import { TRACE_N, makeTrace } from '../../../engine/hales/portal/stent-trace.js';
import {
  N_PROFILE, gateIndex, int, scanK, stentNormal, stentOutline, ten, traceFor, traceIn, type StentState,
} from '../../charts/stent/model.ts';
import {
  GATES, GUTTER, HEAD, figLayout, mmWord, dpWord, ppgWord, usualWord, waistWord, sampleAt, xOf, vTop, pTop,
} from './copied/figure-parts.copied.js';

export type TipsLens = 'velocity' | 'pressure';
const H = { host: 'stent' };
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const mul = (c: Rgba, k: number): Rgba => [c[0], c[1], c[2], c[3] * k];
const mix = (a: Rgba, b: Rgba, t: number): Rgba => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
/** The 2D figure's word sizes: the gates' and the brackets' numbers 12, the veins' names and the chart's captions 11 (the chart type's floor is 12 px, looks.ts MIN_WORD). */
const W12 = 12, W11 = 12;
const SLICES = 64, VEIN_SLICES = 14;

/** What the figure's SVG held in fixed pieces and the 2D file kept in closures: the usual-range word's spot and the PPG word's spot are kept between frames so a word never hops about as a slider moves. */
export interface FigKeep { usualPick: number; ppgPick: number }
export const newKeep = (): FigKeep => ({ usualPick: 0, ppgPick: 0 });

/** The wires of the cut stent in the order the 2D piece draws them. */
const WIRES = ['backBare', 'backCov', 'frontBare', 'frontCov', 'glint', 'band', 'tab'] as const;
/** The path strings of the device (M and L only, with Z closing the cover's bands) as polylines, one per sub path. */
export function subPaths(d: string): { pts: number[]; closed: boolean }[] {
  const out: { pts: number[]; closed: boolean }[] = [];
  let cur: { pts: number[]; closed: boolean } | null = null;
  const re = /([MLZ])\s*(-?\d+(?:\.\d+)?)?\s*(-?\d+(?:\.\d+)?)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1] === 'Z') { if (cur) cur.closed = true; continue; }
    if (m[2] == null || m[3] == null) continue;
    if (m[1] === 'M') { cur = { pts: [], closed: false }; out.push(cur); }
    cur?.pts.push(+m[2], +m[3]);
  }
  return out.filter((p) => p.pts.length >= 4);
}

/** What the frame is made from, and what it is told about the figure's kind (a vessel card's is the stent alone; Tests > IR > TIPS has the chart). */
export interface FigOpts { lens: TipsLens; labels?: boolean; chart?: boolean; keep?: FigKeep; /** the vessel card's compact figure: the rows packed tighter (CARD_TOP, CARD_GATE) and the veins outlined as the stent is */ card?: boolean; /** the Doppler third a slide reads: a band behind it from the brackets' row down to the gates' ticks (2D `gate`) */ gate?: 'proximal' | 'mid' | 'distal' | null }
/** The card figure's rows: the word row 7 px down and its bracket 15, the stent from 20, the gates' ticks 13 under it and 8 px under their numbers (the full figure keeps 9, 21, 26, 15 and 10). Its height is 20 + hvH + 13 + 8 = 41 + hvH. */
export const CARD_ROWS = { labY: 7, brY: 15, top: 20, gate: 13, foot: 8 } as const;

class Pic {
  shapes: Shape[] = [];
  private memo = new Map<string, Look>();
  readonly c: ChartCtx;
  constructor(c: ChartCtx) { this.c = c; }
  lk(key: string): Look { let l = this.memo.get(key); if (!l) { l = look(this.c, H, key); this.memo.set(key, l); } return l; }
  private penOf(l: Look, o: number) { return { color: mul(l.stroke!, o * (l.strokeOpacity ?? 1)), w: l.width ?? 1, dash: l.dash, cap: l.cap, join: l.join }; }
  private fillOf(l: Look, o: number): Rgba { return mul(l.fill ?? [0, 0, 0, 0], o * (l.opacity ?? 1) * (l.fillOpacity ?? 1)); }
  line(pts: readonly number[], key: string, o = 1) { this.shapes.push({ k: 'path', pts: pts.slice(), pen: this.penOf(this.lk(key), o) }); }
  poly(pts: readonly number[], key: string, o = 1) { const l = this.lk(key); this.shapes.push({ k: 'path', pts: pts.slice(), closed: true, ...(l.fill && l.fill[3] > 0 ? { fill: this.fillOf(l, o) } : {}), ...(l.stroke ? { pen: this.penOf(l, o) } : {}) }); }
  fillPoly(pts: readonly number[], colour: Rgba) { this.shapes.push({ k: 'path', pts: pts.slice(), closed: true, fill: colour }); }
  rect(x: number, y: number, w: number, h: number, key: string, o = 1) { const l = this.lk(key); this.shapes.push({ k: 'rect', x, y, w: Math.max(0, w), h, fill: this.fillOf(l, o), ...(l.stroke ? { pen: this.penOf(l, o) } : {}) }); }
  rectFill(x: number, y: number, w: number, h: number, colour: Rgba) { this.shapes.push({ k: 'rect', x, y, w, h, fill: colour }); }
  dot(cx: number, cy: number, r: number, key: string, o = 1) { const l = this.lk(key); this.shapes.push({ k: 'circle', cx, cy, r, ...(l.fill && l.fill[3] > 0 ? { fill: this.fillOf(l, o) } : {}), ...(l.stroke ? { pen: this.penOf(l, o) } : {}) }); }
  text(x: number, y: number, s: string, key: string, size: number, anchor: 'start' | 'middle' | 'end', o = 1) {
    const l = this.lk(key);
    this.shapes.push({ k: 'text', x, y, s, size: Math.max(12, size), weight: l.weight, color: l.fill!, anchor, baseline: 'middle', alpha: o, ...(l.halo ? { halo: l.halo } : {}) });
  }
}


/** The figure as one frame for the stent `st` (charts/stent/model.ts stentState) in a box c.w wide. */
export function tipsFigureFrame(st: StentState, c: ChartCtx, o: FigOpts): Frame {
  const labels = o.labels !== false, chart = !!o.chart, keep = o.keep ?? newKeep();
  const W = Math.max(200, c.w);
  const L = figLayout(W, { labels, chart }) as Record<string, number>;
  if (o.card && labels && !chart) { const half = L.hvH! / 2; L.labY = CARD_ROWS.labY; L.brY = CARD_ROWS.brY; L.cy = CARD_ROWS.top + half; L.gateY = L.cy + half + CARD_ROWS.gate; L.heroH = L.gateY + CARD_ROWS.foot; L.h = L.heroH; }
  const p = new Pic(c), id = st.id, ex = st.have ? 1 : 0, cm = o.lens === 'pressure' ? 1 : 0;
  const sh = st.sh, len = sh.len, s = st.s, site = st.site, d = st.d, k = L.k!, cy = L.cy!, x0 = L.x0!, x1 = L.x1!, span = x1 - x0, dPx = d * k, ivc = st.ivc;
  const rec = makeTrace(), tin = traceIn(st), t = traceFor(tin, rec);
  const lk = c.look as never, pres = samplerFor(lk, 'pressure');
  const presAt = (mm: number): Rgba => { const q = pres.at(clamp(mm, 0, 35)); return [q[0], q[1], q[2], 1]; };
  const label = st.have
    ? `${id}, drawn to scale: ${ten(d)} mm, ${ten(len)} cm. PPG ${ten(st.ppg)} mmHg, ${ten(st.dp)} mmHg across the stent, flow ${ten(st.flow)} L/min.${chart ? ` The chart under it shows ${o.lens === 'pressure' ? 'the pressure' : 'the peak velocity'} along it.` : ''}`
    : `${id}: no stent`;

  // the Doppler's slide third, a band behind everything else on the stent
  const band = o.gate ? STENT_SPANS[o.gate] : null;
  if (band) p.rect(x0 + band[0] * span, L.brY! + 5, (band[1] - band[0]) * span, L.gateY! - 8 - (L.brY! + 5), 'stent.gate.band', ex);

  // the veins either side, neutral; in the pressure lens their own pressure fades in over them
  p.rect(0, cy - L.pvH! / 2, x0 + 2, L.pvH!, 'stent.vein.p');
  p.rect(x1 - 2, cy - L.hvH! / 2, W - x1 + 2, L.hvH!, 'stent.vein.h');
  const vein = (xa: number, xb: number, y: number, hh: number) => {
    const w = (xb - xa) / VEIN_SLICES;
    for (let i = 0; i < VEIN_SLICES; i++) {
      const xi = xa + (i + 0.5) * w, q = ex ? presAt(ivc + t.P[sampleAt(xi, len, L)]!) : ([0, 0, 0, 1] as Rgba);
      p.rectFill(xa + i * w, y, w + 0.4, hh, mul(q, cm * ex * 0.7));
    }
  };
  vein(0, x0 + 2, cy - L.pvH! / 2, L.pvH!);
  vein(x1 - 2, W, cy - L.hvH! / 2, L.hvH!);
  if (o.card) {   // (the cel veins: each a tube in its own tone, a pale band along its top and a faint shade under it, inked on both walls)
    const tone = (n: string, fb: string): Rgba => c.pal.tok(c.pal.has(n) ? n : fb);
    const tube = (xa: number, xb: number, hh: number, col: Rgba) => {
      const y0 = cy - hh / 2, y1 = cy + hh / 2;
      p.fillPoly([xa, y0, xb, y0, xb, y1, xa, y1], mul(col, 0.34));
      p.fillPoly([xa, y0, xb, y0, xb, y0 + hh * 0.38, xa, y0 + hh * 0.38], [1, 1, 1, 0.16]);
      p.fillPoly([xa, y1, xb, y1, xb, y1 - hh * 0.3, xa, y1 - hh * 0.3], [0, 0, 0, 0.07]);
      for (const y of [y0, y1]) p.line([xa, y, xb, y], 'stent.lumen', 1);
    };
    tube(0, x0 + 2, L.pvH!, tone('tour-portal', 'text-3'));
    tube(x1 - 2, W, L.hvH!, tone('tour-sys', 'text-3'));
  }

  // the lumen, to scale; its colours along the picture's width (velocity: the scanner's against the stent's range; pressure: absolute)
  const edge = stentOutline(x0, span, cy, dPx, 0, s, sh, site), n = N_PROFILE;
  // (the strip's colours are the stent's lens colours along it, scene/lenses/stent-lens.ts: the one function the 3D stent is coloured by, so the strip and the stent cannot disagree)
  const slice = (i0: number, i1: number) => {
    const u = (i0 + i1) / (2 * n);
    const cv = stentColourAt('velocity', lk, st, t, u), colV: Rgba = cv ? [cv[0], cv[1], cv[2], 1] : [0, 0, 0, 1];
    const cp = cm > 0.001 ? stentColourAt('pressure', lk, st, t, u) : null, colP: Rgba = cp ? [cp[0], cp[1], cp[2], 1] : colV;
    return mul(mix(colV, colP, cm), ex);
  };
  for (let q = 0; q < SLICES; q++) {
    // (a slice is one or two of the outline's samples, reaching half a sample past its ends so neighbours overlap and no seam shows)
    const a = Math.round((q * n) / SLICES), b = Math.max(a + 1, Math.round(((q + 1) * n) / SLICES));
    const top: number[] = [], bot: number[] = [];
    for (let i = a; i <= b; i++) top.push(edge[2 * i]!, edge[2 * i + 1]!);
    for (let i = b; i >= a; i--) { const j = 2 * n + 1 - i; bot.push(edge[2 * j]!, edge[2 * j + 1]!); }
    p.fillPoly([...top, ...bot], slice(a, b));
  }
  p.poly(edge, 'stent.lumen', ex);
  if (o.card) p.poly(edge, 'stent.dim', ex);   // (the cel ink round the lumen)
  // a soft tube shading over the lumen's flat velocity colour: a pale band along its upper side and a faint shade along the lower, each fading toward the axis (the cel look's two soft tones, never a stripe)
  const side = (up: boolean, col: Rgba, reach: number) => {
    const edgePt = (i: number): [number, number] => { const q = up ? i : 2 * n + 1 - i; return [edge[2 * q]!, edge[2 * q + 1]!]; };
    const midPt = (i: number): [number, number] => { const a = edgePt(i), j = 2 * n + 1 - (up ? i : 2 * n + 1 - i), b: [number, number] = [edge[2 * j]!, edge[2 * j + 1]!]; return [a[0] + (b[0] - a[0]) * reach, a[1] + (b[1] - a[1]) * reach]; };
    const out: number[] = [];
    for (let i = 0; i <= n; i++) out.push(...edgePt(i));
    for (let i = n; i >= 0; i--) out.push(...midPt(i));
    p.fillPoly(out, col);
  };
  if (ex > 0.01) { side(true, [1, 1, 1, 0.2 * ex], 0.42); side(false, [0, 0, 0, 0.09 * ex], 0.38); }

  // The stent as a cut view (stent-mesh.js stentCutD): only its wall on each side, the cover's thin bands and the rings along them, so the lumen shows whole and a narrowing pinches the wall with it.
  const frameAt = (a: number, side: number): [number, number] => { const u = a / span; return [x0 + a, cy + (side * (dPx * profileAt(sh, s, site, u))) / 2]; };
  const mesh = stentCutD(frameAt, span, bareOf(span, len), { t: clamp(0.55 * k, 1.6, 2.6), step: Math.max(3, 0.22 * L.pxCm!), ampB: Math.min(4, 0.9 * k), ampC: Math.min(2.4, 0.5 * k) }) as unknown as Record<string, string>;
  for (const sp of subPaths(mesh.wall || '')) p.poly(sp.pts, 'tf.wall', ex);
  for (const wname of WIRES) for (const sp of subPaths(mesh[wname] || '')) p.line(sp.pts, `stent.wire.${wname}`, ex);

  // the veins' names, inside the veins at the stent's two ends (RPV and RHV for the TIPS, PV and IVC for the DIPS)
  p.text(4, cy, id === 'DIPS' ? 'PV' : 'RPV', 'tf.vein.name', W11, 'start', ex);
  p.text(W - 4, cy, id === 'DIPS' ? 'IVC' : 'RHV', 'tf.vein.name', W11, 'end', ex);

  if (labels) {
    // the waist: a bracket over it with its lumen and length; it fades with the waist (never pops)
    const red = sh.red || 0, wsp = waistSpan(sh) as { a1: number; b1: number }, wa = x0 + wsp.a1 * span, wb = x0 + wsp.b1 * span, yb = L.brY!;
    const wOn = ex * clamp((red - 0.004) / 0.03, 0, 1);
    p.line([wa, yb + 4, wa, yb, wb, yb, wb, yb + 4], 'stent.dim', wOn);
    p.text((wa + wb) / 2, L.labY!, waistWord(lumenShown(d * (1 - red)), waistShown(sh.waist)), 'tf.word', W12, 'middle', wOn);
    // the end stenosis: its lumen over it
    const esp = endSpan(sh, site) as { a1: number; b1: number }, ea = x0 + esp.a1 * span, eb = x0 + esp.b1 * span, eOn = ex * clamp((s - 0.004) / 0.03, 0, 1);
    p.line([ea, yb + 4, ea, yb, eb, yb, eb, yb + 4], 'stent.dim', eOn);
    p.text(clamp((ea + eb) / 2, 24, W - 24), L.labY!, mmWord(lumenShown(d * (1 - s))), 'tf.word', W12, 'middle', eOn);
    // the Doppler's three gates: a tick down from the lumen, the number where it is taken (the lens: cm/s, or mmHg at the same three places)
    const ticks: number[][] = [];
    for (let q = 0; q < 3; q++) {
      const u = GATES[q] as number, xg = x0 + u * span, yl = cy + (d * k * profileAt(sh, s, site, u)) / 2 + 2;
      ticks.push([xg, yl, xg, L.gateY! - 8]);
    }
    for (let q = 0; q < 3; q++) p.line(ticks[q]!, 'stent.gate.tick', ex);
    for (let q = 0; q < 3; q++) p.text(ticks[q]![0]!, L.gateY!, int(st.g[q]!), 'tf.num', W12, 'middle', ex * (1 - cm));
    for (let q = 0; q < 3; q++) p.text(ticks[q]![0]!, L.gateY!, ten(ivc + t.P[gateIndex(GATES[q] as number, len)]!), 'tf.num', W12, 'middle', ex * cm);
    // the stent's two ends: the trace's own numbers where blood enters and leaves it
    const kd = scanK(id), ends: number[][] = [];
    for (let q = 0; q < 2; q++) {
      const xe = q ? x1 : x0, yl = cy + (d * k * profileAt(sh, s, site, q)) / 2 + 2;
      ends.push([xe, yl, xe, L.gateY! - 8]);
    }
    for (let q = 0; q < 2; q++) p.line(ends[q]!, 'stent.gate.tick', ex);
    for (let q = 0; q < 2; q++) p.text(ends[q]![0]!, L.gateY!, int(t.v[gateIndex(q, len)]! * kd), 'tf.num', W12, 'middle', ex * (1 - cm));
    for (let q = 0; q < 2; q++) p.text(ends[q]![0]!, L.gateY!, ten(ivc + t.P[gateIndex(q, len)]!), 'tf.num', W12, 'middle', ex * cm);
  }
  if (chart) paintChart(p, st, t, L, { lens: o.lens, ex, cm, ivc, len, sh, keep });
  return { w: W, h: Math.ceil(L.h!), shapes: p.shapes, label };
}

interface ChartIn { lens: TipsLens; ex: number; cm: number; ivc: number; len: number; sh: StentState['sh']; keep: FigKeep }
/** The velocity axis's and the pressure axis's round tops for this stent (the 2D follower glided these as they stepped; a Chart glides the frame). */
export function axesOf(st: StentState): { vHi: number; pHi: number } {
  const t = traceFor(traceIn(st), makeTrace()), kd = scanK(st.id);
  let mx = 0;
  for (let i = 0; i <= TRACE_N; i++) mx = Math.max(mx, t.v[i]! * kd);
  return { vHi: vTop(Math.max(mx, st.g[0], st.g[1], st.g[2], 200)), pHi: pTop(st.ivc + st.ppg) };
}

function paintChart(p: Pic, st: StentState, o: ReturnType<typeof traceFor>, L: Record<string, number>, q: ChartIn): void {
  const { ex, cm, ivc, len, keep } = q, id = st.id, top = L.plotTop!, bot = L.plotBot!, G = GUTTER, X = (cm_: number) => xOf(cm_, len, L as never, G) as number;
  const { vHi, pHi } = axesOf(st);
  // (The axis runs a fifth past its top tick, as the mock's: the top tick and its number sit clear under the chart's title.)
  const yV = (x: number) => clamp(bot - (x / (vHi * HEAD)) * (bot - top), top - 2, bot), yP = (v: number) => clamp(bot - (v / (pHi * HEAD)) * (bot - top), top - 2, bot);
  for (let i = 0; i < 4; i++) { const y = bot - ((bot - top) * i) / (3 * HEAD); p.line([G, y, L.W!, y], i ? 'stent.tr.axis' : 'stent.tr.zero', ex); }
  // velocity: the scanner's along the path, the usual range over the stent, a dot at each gate
  const av = ex * (1 - cm), ap = ex * cm, kd = scanK(id), nm = stentNormal(id, st.d), lo = nm ? nm[0] : 90, hi = nm && Number.isFinite(nm[1]) ? nm[1] : 190;
  p.rect(L.x0!, yV(hi), L.x1! - L.x0!, Math.max(0, yV(lo) - yV(hi)), 'tf.band', av);
  const vLine: number[] = [], vArea: number[] = [];
  for (let i = 0; i <= TRACE_N; i++) { const x = X(o.x[i]!), y = yV(o.v[i]! * kd); vLine.push(x, y); vArea.push(x, y); }
  vArea.push(X(o.x[TRACE_N]!), bot, X(o.x[0]!), bot);
  // (The usual range's words stand at the band's top, right end, else its left end, else just under its top edge, whichever the trace does not run through: play-test F10.)
  {
    const uw = usualWord(lo, hi) as string, bw = uw.length * 6.4 + 6, y0 = yV(hi) + 9;
    const hit = (xa: number, xb: number, y: number) => { for (let i = 0; i <= TRACE_N; i++) { const x = vLine[2 * i]!; if (x >= xa && x <= xb && Math.abs(vLine[2 * i + 1]! - y) < 8) return true; } return false; };
    const okR = !hit(L.x1! - 4 - bw, L.x1! - 4, y0), okL = !hit(L.x0! + 4, L.x0! + 4 + bw, y0);
    if (keep.usualPick === 0 && !okR) keep.usualPick = okL ? 1 : 2; else if (keep.usualPick === 1 && !okL) keep.usualPick = okR ? 0 : 2; else if (keep.usualPick === 2 && (okR || okL)) keep.usualPick = okR ? 0 : 1;
    const right = keep.usualPick === 0, left = keep.usualPick === 1;
    p.text(left ? L.x0! + 4 : L.x1! - 4, right || left ? y0 : y0 + 12, uw, 'stent.cap', W11, left ? 'start' : 'end', av);
  }
  p.poly(vArea, 'tf.area', av);
  p.line(vLine, 'tf.line', av);
  for (let g = 0; g < 3; g++) { const j = gateIndex(GATES[g] as number, len); p.dot(X(o.x[j]!), yV(o.v[j]! * kd), 3.2, 'tf.dot', av); }
  p.text(0, L.titleY!, 'Peak velocity, cm/s', 'stent.cap', W11, 'start', av);
  for (let i = 0; i < 3; i++) p.text(0, bot - ((bot - top) * (i + 1)) / (3 * HEAD) - 7, int((vHi * (i + 1)) / 3), 'stent.cap', W11, 'start', av);
  // pressure: absolute along the path; the PPG and the stent's own drop, two brackets
  const pLine: number[] = [];
  for (let i = 0; i <= TRACE_N; i++) pLine.push(X(o.x[i]!), yP(ivc + o.P[i]!));
  p.line(pLine, 'tf.line', ap);
  // (the PPG at the left edge: its top is where the line starts, the portal vein; a dashed guide carries the IVC's level across to its foot)
  const i0 = gateIndex(0, len), i1 = gateIndex(1, len), pIn = ivc + o.P[i0]!, pOut = ivc + o.P[i1]!, pv = ivc + st.ppg, xs = L.x1! - 2, xg = G + 3;
  p.line([L.x0!, yP(pIn), xs, yP(pIn)], 'stent.drop.guide', ap);
  p.line([xg, yP(ivc), L.x1!, yP(ivc)], 'stent.drop.guide', ap);
  p.line([xs - 4, yP(pIn), xs, yP(pIn), xs, yP(pOut), xs - 4, yP(pOut)], 'tf.brk.stent', ap);
  p.text(xs - 8, yP(pIn) + 12, dpWord(st.dp) as string, 'tf.lab.stent', W12, 'end', ap);
  p.line([xg + 4, yP(pv), xg, yP(pv), xg, yP(ivc), xg + 4, yP(ivc)], 'tf.brk.ppg', ap);
  // its words beside it, halfway down (under the portal vein's flat line); a bracket too short for them puts them just under its foot
  const bh = yP(ivc) - yP(pv);
  // (Its words stand where the trace is not: halfway down, else just above the IVC's guide, else under it. The trace's own drop ran through them on a phone, play-test F10.)
  const pw = ppgWord(st.ppg) as string, tx0 = xg + 8, tx1 = tx0 + pw.length * 7.2 + 4;
  const hitsTrace = (y: number) => { for (let i = 0; i <= TRACE_N; i++) { const x = pLine[2 * i]!; if (x < tx0 - 2 || x > tx1) continue; if (Math.abs(pLine[2 * i + 1]! - y) < 9) return true; } return false; };
  const yIvc = yP(ivc), cand = [(yP(pv) + yIvc) / 2, yIvc - 9, yIvc + 10];
  const kept = keep.ppgPick < cand.length && !hitsTrace(cand[keep.ppgPick]!) ? keep.ppgPick : cand.findIndex((y) => !hitsTrace(y));   // (the spot it has stays while it is clear, so it never hops about as a slider moves)
  keep.ppgPick = kept < 0 ? 0 : kept;
  p.text(tx0, bh < 28 ? yIvc + 10 : cand[keep.ppgPick]!, pw, 'tf.lab.ppg', W12, 'start', ap);
  p.text(0, L.titleY!, 'Pressure, mmHg', 'stent.cap', W11, 'start', ap);
  for (let i = 0; i < 3; i++) p.text(0, bot - ((bot - top) * (i + 1)) / (3 * HEAD) - 7, int((pHi * (i + 1)) / 3), 'stent.cap', W11, 'start', ap);
}
