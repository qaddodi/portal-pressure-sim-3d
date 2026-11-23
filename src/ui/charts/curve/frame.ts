// The parameter curve as a frame (2D: tool-curve.js createCurve: geo(), build() and paint(); looks: chart-looks/time.js 'cv.*', 'time.*', plot.js).
// The 2D code builds an svg tree and places the words on every paint; here the same geometry and the same word placing (the lifted functions of
// curve-pure.generated.js) give the shapes of one Frame. The case's ring and its value are never drawn in 2D either (his 29 Oct: "no more circles"):
// the case is the upright dashed line (or the short tick up from the x axis with a reading on x).
import type { ChartCtx } from '../Chart.tsx';
import type { Rgba } from '../colour.ts';
import { look, type Look } from '../looks.ts';
import { measure } from '../measure.ts';
import { fitHeight, type Frame, type Shape, type TextShape } from '../scene.ts';
import * as P from './curve-pure.generated.js';
import { minusFixed } from '../looks2d/num.js';
import { heldToRoom } from '../profile/model.ts';
import { tableH } from '../../layout/chart-box.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
/** The 2D tool object (a deck slide's `tool: { kind: 'curve', … }`), as the 2D app reads it. */
export type CurveTool = Record<string, Any>;
/** The ring's place: the case's x and each line's value there (shown units); on: read from the curve at a what-if's setting. */
export interface Goal { x: number | null; ys: (number | null)[]; on?: boolean }
export interface CurveSpec {
  tool: CurveTool;
  /** the worked out series ({ xs, ys, lx? }), or null while the points are not there (the axes show, the lines come later) */
  ser: Any | null;
  /** the other states shown as points: each { slide | preset, name, fp } */
  dots?: Any[];
  /** where the case sits (ringAt), and its glided x for the tick */
  goal?: Goal | null;
  atX?: number | null;
  height?: number;
  /** the room the data card leaves the chart, px (2D --pz-room): the chart is never taller than it; absent or 0: none measured, or a stacked card */
  room?: number;
}
export interface CurveOut { frame: Frame; G: Any; fits: boolean; /** the dots' names cannot all stand close and clear (2D needSteps): the dots then carry numbers and a key names them */ crowded: boolean }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const tokOf = (v: string) => v.replace(/^--/, '');
/** A text's width as the layout reckons it before it is drawn (2D: near enough). */
const cw = (t: unknown, f: number, b?: unknown) => String(t).length * f * (b ? 0.6 : 0.56);
/** A word's real width in Inter, for running one word on from another. */
const mw = (t: string, f: number, bold = false) => measure(t, f, bold ? 700 : 500);
const dec = (sc: { ticks: number[] }) => (sc.ticks.some((v) => Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) ? 2 : sc.ticks.some((v) => v % 1) ? 1 : 0);
const H = { host: 'curve' };
const withA = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], c[3] * a];

/** The height a curve wants at width w in type f (the 2D card gives the chart what is left of it; here, a plot about three fifths as high as it is wide, with room for its rows). */
/** A curve, course or menu's picture height: the screen's table height (layout/card-size.ts, Plan 45), never under 17 em (the least that keeps its tick and event names: at 186 px on an iPhone the course dropped "1.5 L" and
 *  "Treatment starts"); a phone on its side keeps 2D's own (0.62 of the width). */
export const curveHeight = (w: number, f: number) => { const t = tableH(); return t == null ? Math.round(Math.max(0.62 * w, 17 * f)) : Math.round(Math.max(t, 17 * f)); };

// A dot's place on line j (shown units), or null: with against every line is the one reading, so a dot sits once, on the first.
function dotXY(t: CurveTool, d: Any, j: number, ls: Any[]): [number, number] | null {
  const xk = P.xKeyOf(t), xm = P.lineMeta(xk), l = ls[j];
  if (!d.fp || (P.againstOf(t) && j) || (Array.isArray(d.on) && !d.on.includes(j))) return null;
  const x = d.fp[xk], y = d.fp[l.k];
  return Number.isFinite(x) && Number.isFinite(y) ? [x * xm.x, y * l.x] : null;
}
const namedDots = (t: CurveTool, dots: Any[]) => { const ls = P.drawnLines(t); return dots.filter((d) => d.name && ls.some((_: unknown, j: number) => dotXY(t, d, j, ls))); };
function stepKeyOf(t: CurveTool, dots: Any[], w: number, f: number) {
  let x = 0, row = 0;
  const items = namedDots(t, dots).map((d, k) => ({ n: k + 1, name: d.name as string, w: cw(String(k + 1), f, 1) + 0.45 * f + cw(d.name, f, 1) })).map((it) => {
    if (x > 0 && x + it.w > w) { row++; x = 0; }
    const at = { ...it, x, row }; x += it.w + 1.4 * f; return at;
  });
  return { items, rows: items.length ? row + 1 : 0 };
}

/** The geometry for a chart w × h px in type f px: its scales from the series (or, until it is ready, from the case's own values and the axis's ends). */
export function curveGeo(t: CurveTool, ser: Any | null, dots: Any[], goal: Goal | null, w: number, h: number, f: number, steps = false, alt = false) {
  const ls = P.drawnLines(t), ax = P.spellAxis(P.axisMeta(t)), ag = !!P.againstOf(t), xk = P.xKeyOf(t);
  const vals0 = ls.map((_: unknown, j: number) => [...(ser ? ser.ys[j] : [goal?.ys[j]]), ...dots.map((d) => dotXY(t, d, j, ls)?.[1])].filter(Number.isFinite) as number[]);
  const one = ag || (!!t.oneScale && ls.length > 1);
  const vals = one ? [vals0.flat()] : vals0, keyLs = ag ? [{ ...P.lineMeta(P.curveLines(t)[0]), name: P.readingName(t), c: '--text-2', bare: true }] : ls;
  let x0: number, x1: number;
  if (xk) {
    const xv = [...(ser ? ser.lx.flat() : []), goal?.x, ...dots.flatMap((d) => ls.map((_: unknown, j: number) => dotXY(t, d, j, ls)?.[0]))];
    [x0, x1] = P.xDomain(xv, t.xFrom, t.xTo);
  } else { const xs = P.curveXs(t).map((x: number) => x * ax.x); x0 = xs[0]; x1 = xs.at(-1)!; }
  const keyRead = false, kvW = 0;
  const keys0 = keyLs.length < 2 || keyLs.reduce((a: number, l: Any) => a + 22 + cw(l.name, f, 1) + 6 + cw(l.unit, f) + kvW, 0) + 2 * f <= w;
  const sty = P.stylesOf(t), styW = sty ? sty.reduce((a: number, s: string) => a + 22 + 1.05 * cw(s, f, 1), 0) + f : 0, readW = ag ? cw(keyLs[0].name, f, 1) + 6 + cw(keyLs[0].unit, f) : 0;
  const styBelow = !!sty && readW + styW + 2 * f > w, styRows = styBelow ? 1 : 0;
  const altW = ag && alt ? ls.reduce((a: number, l: Any) => a + 22 + 1.05 * cw(l.name, f, 1), 0) + f * (ls.length - 1) : 0;
  const altBelow = ag && alt && (styBelow || readW + (sty ? styW + f : 0) + altW + 2 * f > w);
  const altRows: number[][] = [], altFirst: number[] = [], altX = readW + 1.5 * f;
  if (altBelow) {
    let used = 0, k = 0;
    if (!styBelow) for (; k < ls.length; k++) { const kw = 22 + 1.05 * cw(ls[k].name, f, 1); if (altX + used + kw > w - (sty ? styW + f : 0)) break; altFirst.push(k); used += kw + f; }
    used = 0;
    ls.forEach((l: Any, j: number) => { if (j < k) return; const kw = 22 + 1.05 * cw(l.name, f, 1); if (!altRows.length || used + kw > w) { altRows.push([]); used = 0; } altRows.at(-1)!.push(j); used += kw + f; });
  }
  const stepKey = steps ? stepKeyOf(t, dots, w, f) : null, stepH = stepKey?.rows ? stepKey.rows * 1.5 * f + 0.3 * f : 0;
  const plotH = h - 3.3 * f - stepH - ((keys0 && !altBelow ? 1 : keys0 ? 1 + altRows.length : 2) * 1.5 * f + styRows * 1.5 * f + 2 * f), most = clamp(Math.floor(plotH / (1.6 * f)) + 1, 3, 7);
  const ticksOn = t.cuts === 'ticks' || !!t.cutTicks, sL: Any = P.leftScale(ls[0].k, vals[0], most, ticksOn ? P.yCutsOf(t, ls[0].k).map((c: Any) => c.v) : [], !!t.cutTicks), sR = ls[1] && !one ? P.rightScale(vals[1], sL.ticks.length) : null;
  const tickCuts = ticksOn ? P.yCutsOf(t, ls[0].k).filter((c: Any) => sL.ticks.some((v: number) => Math.abs(v - c.v) < 1e-6)) : [];
  const keys = keyLs.map((l: Any) => ({ ...l, w: (l.bare ? 0 : 22) + cw(l.name, f, 1) + 6 + cw(l.unit, f) + kvW }));
  const oneRow = keys.length < 2 || keys[0].w + keys[1].w + 2 * f <= w, rowH = 1.5 * f, legH = ((oneRow && !altBelow ? 1 : oneRow ? 1 + altRows.length : 2) + styRows) * rowH;
  const tw = (sc: Any) => Math.max(...sc.ticks.map((v: number) => cw(P.fmtTick(v, dec(sc)), f)));
  const most0 = Math.max(2, Math.min(7, Math.floor((w - 4 * f) / (3.2 * f))));
  const L = Math.ceil(tw(sL) + 14), R = Math.floor(w - (sR ? tw(sR) + 14 : 10));
  const { xt, nameAt } = P.xAxisRow(x0, x1, L, R, w, f, ax, most0);
  const foot = (nameAt == null ? 3.1 : 1.7) * f, T = legH + (P.xCutsOf(t).length ? 2 : 1.4) * f, B = h - foot - 0.2 * f - stepH;
  return { w, h, f, ls, ag, alt, sty, styBelow, one, ax, x0, x1, xt, nameAt, foot, sL, sR, tickCuts, keyRead, stepKey, keys, oneRow, altBelow, altRows, rowH, altFirst, altX, keyH: legH, L, R, T, B: Math.max(T + 3 * f, B), styW };
}

type Seg = number[] & { w?: number };
const seg = (a: number[], w?: number): Seg => Object.assign([...a], w == null ? {} : { w }) as Seg;

/** The case's value on each line, as the slide's own state gives it (2D: ringAt, then aim()'s reading from the curve): see data.ts goalOf. */

function drawOnce(spec: CurveSpec, c: ChartCtx, w: number, h: number, f: number, steps: boolean, alt: boolean): CurveOut {
  const t = spec.tool, ser = spec.ser, dots = spec.dots ?? [], goal = spec.goal ?? null;
  const G = curveGeo(t, ser, dots, goal, w, h, f, steps, alt);
  const { L, R, T, B, sL, sR, ls, ax, xt } = G;
  const lk = (key: string, state: Record<string, unknown> = {}, tone?: string): Look => look(c, H, key, state, tone ? { c: tokOf(tone) } : {});
  const X = (x: number) => G.L + (G.R - G.L) * (x - G.x0) / ((G.x1 - G.x0) || 1);
  const Yof = (sc: Any) => (v: number) => G.B - (G.B - G.T) * clamp((v - sc.min) / ((sc.max - sc.min) || 1), 0, 1);
  const YL = Yof(sL), YR = sR ? Yof(sR) : null;
  const lineX = (j: number) => ser?.lx?.[j] || ser?.xs;
  const Yj = (j: number) => (j && !G.one ? YR || YL : YL);
  const say = (out: Shape[], x: number, y: number, s: string, l: Look, o: Partial<TextShape> = {}) => {
    if (!s) return;
    out.push({ k: 'text', x, y, s, size: l.size ?? f, weight: l.weight, color: l.fill!, ...(l.halo ? { halo: l.halo } : {}), ...(l.upper ? { upper: true } : {}), ...(l.ls ? { ls: l.ls } : {}), ...o });
  };
  const stroke = (l: Look) => ({ color: l.stroke!, w: l.width ?? 1, ...(l.dash && l.dash.length ? { dash: l.dash } : {}), ...(l.cap ? { cap: l.cap } : {}), ...(l.join ? { join: l.join } : {}) });

  // ── the segments the words keep off: the data lines' (the diagonal's too) ──
  const segs: Seg[] = [];
  if (ser) ser.ys.forEach((ys: number[], j: number) => { const Y = Yj(j), xs = lineX(j); for (let i = 1; i < ys.length; i++) if (Number.isFinite(ys[i - 1]) && Number.isFinite(ys[i])) segs.push(seg([X(xs[i - 1]), Y(ys[i - 1]), X(xs[i]), Y(ys[i])])); });

  // ── layers, in the 2D svg's order ──
  const panelShapes: Shape[] = [], zoneShapes: Shape[] = [], gridShapes: Shape[] = [], cutShapes: Shape[] = [], xCutShapes: Shape[] = [], legendShapes: Shape[] = [], axisShapes: Shape[] = [];
  const leadShapes: Shape[] = [], stepShapes: Shape[] = [], atShapes: Shape[] = [], walkShapes: Shape[] = [], lineShapes: Shape[] = [], dotShapes: Shape[] = [], wordShapes: Shape[] = [];

  // the panel: from just under the key row to under the axis's name, the chart's full width
  const py = G.keyH + 0.2 * f, ph = B + G.foot - py, pr = Math.max(0, Math.min(10, w / 4, ph / 4));
  panelShapes.push({ k: 'rect', x: 0, y: py, w, h: ph, r: pr, fill: lk('plot.bg').fill });

  // the zone
  let zoneLab: { tw: number; text: string } | null = null;
  const edge = P.zoneEdge(t.zone, G.x0, G.x1);
  if (edge) {
    const pts = edge.map(([x, y]: number[]) => [X(x), YL(clamp(y, sL.min, sL.max))]);
    const flat = pts.flatMap((p: number[]) => p);
    zoneShapes.push({ k: 'path', pts: [...flat, pts.at(-1)![0], B, pts[0][0], B], closed: true, fill: lk('cv.zone.fill').fill });
    const e = lk('cv.zone.edge');
    zoneShapes.push({ k: 'path', pts: flat, pen: stroke(e) });
    if (typeof t.zone.label === 'string' && t.zone.label) zoneLab = { tw: 1.1 * cw(t.zone.label, f, true), text: t.zone.label };
  }

  // gridlines and numbers
  const tickC = G.one && !G.ag ? '--text-2' : ls[0].c;
  sL.ticks.forEach((v: number, j: number) => {
    const tc = G.tickCuts.find((q: Any) => Math.abs(q.v - v) < 1e-6), g = lk('plot.grid.line', { cut: false });
    gridShapes.push({ k: 'line', x1: L, x2: R, y1: YL(v), y2: YL(v), pen: { color: g.stroke!, w: g.width ?? 1 } });
    if (tc) { const s = lk('cv.stub', { tc: tc.rate }); gridShapes.push({ k: 'line', x1: L, x2: L + 0.9 * f, y1: YL(v), y2: YL(v), pen: stroke(s) }); }
    say(gridShapes, L - 6, YL(v) + 0.35 * f, P.fmtTick(v, dec(sL)), tc ? lk('cv.tc', { tc: tc.rate }) : lk('time.grid.text', {}, G.ag ? '--text-2' : tickC), { anchor: 'end' });
    if (sR) say(gridShapes, R + 6, YL(v) + 0.35 * f, P.fmtTick(sR.ticks[j], dec(sR)), lk('time.grid.text', {}, ls[1].c), { anchor: 'start' });
  });

  // the first line's cut-offs, dashed in their rating's colour, where they fall inside its scale
  const held = (q: Any) => G.tickCuts.some((r: Any) => r.v === q.v);
  const cutVs = P.yCutsOf(t, ls[0].k).filter((q: Any) => q.v > sL.min && q.v < sL.max && (!held(q) || t.cutNames?.[q.v]));
  interface CutLab { txt: string; short: string | null; twS: number; tw: number; lines: Any[]; cands: Any[]; rate: string; useShort?: boolean }
  const cutLabs: CutLab[] = [];
  cutVs.forEach((q: Any) => {
    const nm = t.cutNames?.[q.v], vtxt = minusFixed(q.v, Number.isInteger(q.v) ? 0 : 1), isHeld = held(q);
    const y = YL(q.v), txt = nm ? (isHeld ? nm : `${nm} ≥${vtxt} ${ls[0].unit}`.trim()) : P.cutWords(ls[0].k, q.v) || `${G.ag ? P.readingName(t) : ls[0].name} ${vtxt}`;
    cutLabs.push({ txt, rate: q.rate, short: nm ? null : P.cutWords(ls[0].k, q.v) ? txt : vtxt, twS: 1.12 * cw(vtxt, f, true), tw: 1.12 * cw(txt, f, true), lines: cutVs.filter((o: Any) => o !== q && !held(o)).map((o: Any) => ({ y: YL(o.v), x0: L, x1: R })),
      cands: [{ x: R - 3, y: y - 0.35 * f, anchor: 'end' }, { x: L + 3, y: y - 0.35 * f, anchor: 'start' },
        { x: R - 3, y: y + 0.35 * f, anchor: 'end', on: true }, { x: L + 3, y: y + 0.35 * f, anchor: 'start', on: true },
        { x: R - 3, y: y + 1.05 * f, anchor: 'end' }, { x: L + 3, y: y + 1.05 * f, anchor: 'start' },
        ...(isHeld ? [{ x: L + 0.3 * (R - L), y: y - 0.35 * f, anchor: 'start' }, { x: L + 0.55 * (R - L), y: y - 0.35 * f, anchor: 'start' }, { x: L + 0.3 * (R - L), y: y + 1.05 * f, anchor: 'start' }] : [])] });
    if (!isHeld) { const g = lk('plot.grid.line', { cut: true, rate: q.rate }); cutShapes.push({ k: 'line', x1: L, x2: R, y1: y, y2: y, pen: stroke(g) }); }
  });

  // the x reading's cut-offs, upright and dashed the same way, each named over the plot
  const xCutLabs: { x: number; tw: number; text: string; rate: string }[] = [];
  P.xCutsOf(t).filter((q: Any) => q.v > G.x0 && q.v < G.x1).forEach((q: Any) => {
    const x = X(q.v), vtxt = minusFixed(q.v, Number.isInteger(q.v) ? 0 : 1), nm = P.xCutName(G.ax.k, q.v), txt = nm ? `${nm} ≥${vtxt}` : `${vtxt} ${ax.unit}`.trim();
    xCutLabs.push({ x, tw: 1.12 * cw(txt, f, true), text: txt, rate: q.rate });
    segs.push(seg([x, T, x, B], 5));
    const g = lk('plot.grid.line', { cut: true, rate: q.rate });
    xCutShapes.push({ k: 'line', x1: x, x2: x, y1: T - 0.2 * f, y2: B, pen: stroke(g) });
  });

  // the key row: each reading's swatch, name and unit
  G.keys.forEach((k: Any, j: number) => {
    const right = j && G.oneRow, y = (j && !G.oneRow ? G.rowH : 0) + 0.75 * f, x0 = right ? G.w : 0;
    if (!k.bare) { const kl = lk('time.key.line', {}, k.c); legendShapes.push({ k: 'line', x1: x0 + (right ? -16 : 0), x2: x0 + (right ? 0 : 16), y1: y, y2: y, pen: stroke(kl) }); }
    const kt = lk('time.key.text', {}, k.c), ku = { ...lk('time.key.unit'), size: f };
    const tx = k.bare ? 0 : right ? -22 : 22;
    if (right) { say(legendShapes, x0 + tx, y + 0.36 * f, k.name, kt, { anchor: 'end' }); say(legendShapes, x0 + tx - mw(k.name, f, true) - mw(' ', f), y + 0.36 * f, k.unit, ku, { anchor: 'end' }); }
    else { say(legendShapes, x0 + tx, y + 0.36 * f, k.name, kt); say(legendShapes, x0 + tx + mw(k.name, f, true), y + 0.36 * f, ` ${k.unit}`, ku); }
  });

  // the key of the lines, stood in for names that found no clear spot on the drawing (drawn only when paint says so)
  const altShapes: Shape[] = [];
  if (G.ag) {
    const kw = (l: Any) => 22 + 1.05 * cw(l.name, f, 1), at: ([number, number] | null)[] = ls.map(() => null);
    if (G.altBelow) {
      let x = G.altX - G.w; G.altFirst.forEach((j: number) => { at[j] = [x, -G.rowH]; x += kw(ls[j]) + f; });
      G.altRows.forEach((row: number[], r: number) => { let x2 = -G.w; row.forEach((j) => { at[j] = [x2, r * G.rowH]; x2 += kw(ls[j]) + f; }); });
    } else { let x = 0; for (let j = ls.length - 1; j >= 0; j--) { x -= kw(ls[j]); at[j] = [x, 0]; x -= f; } }
    const shift = G.sty && !G.styBelow && !G.altBelow ? G.sty.reduce((a: number, s: string) => a + 22 + 1.05 * cw(s, f, 1), 0) + 2 * f : 0;
    const gy = (G.altBelow ? G.rowH * (G.styBelow ? 2 : 1) : 0) + 0.75 * f;
    ls.forEach((l: Any, i: number) => {
      const x = G.w + at[i]![0] - shift, y = gy + at[i]![1];
      altShapes.push({ k: 'line', x1: x, x2: x + 16, y1: y, y2: y, pen: stroke(lk('time.key.line', { ref: !!l.ref, dash: !!l.dash }, l.c)) });
      say(altShapes, x + 22, y + 0.36 * f, l.name, lk('time.key.text', {}, l.c));
    });
  }
  // styles: a solid and a dashed swatch in the plain text colour, each with its name
  if (G.sty) {
    let x = 0;
    const gx0 = (s: number) => s, wAll = G.styW - f;
    const gx = G.styBelow ? 0 : G.w - wAll, gy = (G.styBelow ? G.rowH : 0) + 0.75 * f;
    G.sty.forEach((s: string, i: number) => {
      legendShapes.push({ k: 'line', x1: gx + gx0(x), x2: gx + x + 16, y1: gy, y2: gy, pen: stroke(lk('time.key.line', { dash: !!i }, '--text-2')) });
      say(legendShapes, gx + x + 22, gy + 0.36 * f, s, lk('time.key.text', {}, '--text-2'));
      x += 22 + 1.05 * cw(s, f, 1) + f;
    });
  }

  // the axis: its line, the numbers, the name
  const axl = lk('time.axis.line');
  axisShapes.push({ k: 'line', x1: L, x2: R, y1: B, y2: B, pen: { color: axl.stroke!, w: axl.width ?? 1 } });
  xt.forEach((x: number) => say(axisShapes, X(x), B + 1.25 * f, P.fmtTick(x, ax.d), lk('time.tk'), { anchor: X(x) <= L + 1 ? 'start' : X(x) >= R - 1 ? 'end' : 'middle' }));
  const axName = P.xAxisName(ax);
  say(axisShapes, G.nameAt ?? Math.max(8 + cw(axName, f, 1) / 2, Math.min(G.w - 8 - cw(axName, f, 1) / 2, (L + R) / 2)), B + (G.nameAt == null ? 2.6 : 1.25) * f, axName, lk('cv.ax'), { anchor: 'middle' });

  // gap: the band between two swept lines read against the same x
  if (t.gap && ser && G.ag && ls.length >= 3) {
    const at = (j: number) => (ser.ys[j] || []).map((y: number, i: number) => (Number.isFinite(y) ? [X(lineX(j)[i]), Yj(j)(y)] : null)).filter(Boolean) as number[][], a = at(1), b = at(2).reverse();
    if (a.length > 1 && b.length > 1) zoneShapes.push({ k: 'path', pts: [...a, ...b].flatMap((p) => p), closed: true, fill: lk('cv.gap').fill });
  }

  // the lines
  ls.forEach((l: Any, j: number) => {
    const Y = Yj(j), ys = ser?.ys[j], xs = lineX(j);
    if (!ys) return;
    const pts = ys.map((y: number, i: number) => (Number.isFinite(y) ? [X(xs[i]), Y(y)] : null)).filter(Boolean).flatMap((p: number[]) => p);
    if (pts.length < 4) return;
    lineShapes.push({ k: 'path', pts, pen: stroke(lk('cv.line', { ref: !!l.ref, dash: !!l.dash }, l.c)) });
  });

  // the other states as small filled points in their line's colour, named beside the first; a walk joins them in order
  const dr = Math.max(3.5, 0.3 * f);
  let nth = 0;
  interface DotPt { txt: string; full: string; at: ([number, number] | null)[]; first: [number, number] | undefined; hasName: boolean }
  const dotPts: DotPt[] = dots.map((d) => {
    const at = ls.map((_: unknown, j: number) => { const p = dotXY(t, d, j, ls); return p ? ([X(p[0]), Yj(j)(p[1])] as [number, number]) : null; });
    const first = at.find(Boolean) as [number, number] | undefined, num = d.name && first ? String(++nth) : '';
    const txt = G.stepKey && num ? num : d.name || '';
    return { txt, full: d.name || '', at, first, hasName: !!d.name };
  });
  // (steps' key: the dots carry their numbers, and a key under the chart names them)
  if (G.stepKey?.rows) G.stepKey.items.forEach((it: Any) => {
    const l = lk('cv.sk'), y = B + G.foot + 1.3 * f + it.row * 1.5 * f, nl = { ...l, weight: lk('cv.sn').weight };
    say(stepShapes, it.x, y, String(it.n), nl);
    say(stepShapes, it.x + mw(String(it.n), f, true), y, ` ${it.name}`, l);
  });
  const walkSets = P.walksOf(t), arrowDraw: { pts: number[]; c: string }[] = [];
  ls.forEach((l: Any, j: number) => walkSets.forEach((g: number[]) => {
    const pts = g.map((i) => dotPts[i]?.at[j]).filter(Boolean) as [number, number][];
    if (pts.length > 1) { const wl = lk('cv.walk', {}, l.c); walkShapes.push({ k: 'path', pts: pts.flatMap((p) => p), pen: { ...stroke(wl), color: withA(wl.stroke!, wl.opacity ?? 1) } }); }
    for (let i = 1; i < pts.length; i++) {
      segs.push(seg([pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1]], 2));
      const ar = P.walkArrow(pts[i - 1], pts[i], dr, f);
      if (ar) { arrowDraw.push({ pts: (ar.d.match(/-?\d+(?:\.\d+)?/g) as string[]).map(Number), c: l.c }); segs.push(seg(ar.seg, 3)); }
    }
  }));
  arrowDraw.forEach((a) => { const al = lk('cv.arrow', {}, a.c); walkShapes.push({ k: 'path', pts: a.pts, closed: true, fill: withA(al.fill!, al.opacity ?? 1) }); });
  for (const d of dotPts) for (const p of d.at) if (p) segs.push(seg([p[0] - dr, p[1], p[0] + dr, p[1]], 3));
  dotPts.forEach((d) => d.at.forEach((p, j) => {
    if (!p) return;
    const dl = lk('cv.dot', {}, ls[j].c);
    dotShapes.push({ k: 'circle', cx: p[0], cy: p[1], r: dr, fill: dl.fill, pen: { color: dl.stroke!, w: dl.width ?? 1 } });
  }));

  // ── the words, placed clear of everything (2D paint) ──
  const xk = P.xKeyOf(t);
  const ok = !!goal && Number.isFinite(goal.x);
  const atX = spec.atX ?? goal?.x;
  const cx = ok ? X(clamp(goal!.x as number, Math.min(G.x0, G.x1), Math.max(G.x0, G.x1))) : 0;
  const cxNow = atX != null && Number.isFinite(atX) ? X(clamp(atX, Math.min(G.x0, G.x1), Math.max(G.x0, G.x1))) : cx;
  if (ok) atShapes.push({ k: 'line', x1: cxNow, x2: cxNow, y1: xk ? B - 0.8 * f : T - 0.4 * f, y2: B, pen: stroke(lk('cv.at', { atx: !!xk })), key: 'cv-at' });
  const ob: Any = { segs, boxes: [] as number[][], lines: [...cutVs.filter((q: Any) => !held(q)).map((q: Any) => ({ y: YL(q.v), x0: L, x1: R, w: 5 })), { y: B, x0: L, x1: R }],
    bounds: [L + 1, T - 1.3 * f, R - 1, B - 0.15 * f], cutBounds: [L, T - 0.1 * f, R, B - 0.1 * f], inside: [0, 0, G.w, G.h] };
  const rr = Math.max(5, f * 0.45) + 2, ddr = dr + 2;
  const boxes: number[][] = [...(ok ? [xk ? [cx - 1.5, G.B - 0.8 * f, cx + 1.5, G.B] : [cx - 1.5, G.T - 0.4 * f, cx + 1.5, G.B]] : []),
    ...dotPts.flatMap((d) => d.at.filter(Boolean).map((p) => [p![0] - ddr, p![1] - ddr, p![0] + ddr, p![1] + ddr]))];
  // whether the dots' names cannot all stand close and clear, as placeDotNames would put them with the case where it is now
  let crowded = false;
  {
    const nd0 = dotPts.filter((d) => d.hasName && d.first);
    if (nd0.length) {
      const bx = [...(ok ? ls.flatMap((_: unknown, j: number) => (Number.isFinite(goal!.ys[j]) ? [[cx - rr, Yj(j)(goal!.ys[j] as number) - rr, cx + rr, Yj(j)(goal!.ys[j] as number) + rr]] : [])) : []),
        ...dotPts.flatMap((d) => d.at.filter(Boolean).map((p) => [p![0] - ddr, p![1] - ddr, p![0] + ddr, p![1] + ddr]))];
      const sp = P.placeDotNames(nd0.map((d) => ({ x: d.first![0], y: d.first![1], w: 1.08 * cw(d.full, f, true) })), f, ddr, { ...ob, boxes: bx, lines: ob.lines.map((q: Any) => ({ ...q, w: 3 })) });
      crowded = P.namesCrowded(sp, f);
    }
  }

  // each line's name on the drawing beside its own line (with against): the first clear spot along it
  const lineNames: { j: number; x: number; y: number; anchor: string }[] = [];
  const named: boolean[] = [];
  if (ser && G.ag) (ls.map((l: Any, j: number) => [l, j]) as [Any, number][]).sort((a: Any, b: Any) => cw(b[0].name || '', f, true) - cw(a[0].name || '', f, true) || a[1] - b[1]).forEach(([l, j]: [Any, number]) => {
    const ys = ser.ys[j], xs = lineX(j), tw = 1.12 * cw(l.name, f, true), cands: Any[] = [];
    const at = xs.map((_: unknown, i: number) => xs.length - 1 - i);
    for (const i of at) {
      const y = ys[i], x = X(xs[i]);
      if (!Number.isFinite(y)) continue;
      const rise = (ys[Math.min(ys.length - 1, i + 1)] ?? y) - (ys[Math.max(0, i - 1)] ?? y) >= 0, py2 = Yj(j)(y);
      for (const k of [0, 0.7, 1.4, 2.1, 2.8]) cands.push({ x: x + (rise ? -0.3 : 0.3) * f, y: py2 - (0.5 + k) * f, anchor: rise ? 'end' : 'start' }, { x: x + (rise ? 0.3 : -0.3) * f, y: py2 + (1.3 + k) * f, anchor: rise ? 'start' : 'end' });
      cands.push({ x, y: py2 - 0.55 * f, anchor: 'middle' }, { x, y: py2 + 1.35 * f, anchor: 'middle' });
    }
    const yAt = (k: number, px: number) => { const ys2 = ser.ys[k], xs2 = lineX(k); for (let i = 1; i < ys2.length; i++) { const a = X(xs2[i - 1]), b = X(xs2[i]);
      if (px >= Math.min(a, b) && px <= Math.max(a, b) && Number.isFinite(ys2[i - 1]) && Number.isFinite(ys2[i])) return Yj(k)(ys2[i - 1] + (ys2[i] - ys2[i - 1]) * ((px - a) / ((b - a) || 1))); } return null; };
    const own = (cd: Any) => { const x0 = cd.anchor === 'end' ? cd.x - tw : cd.anchor === 'middle' ? cd.x - tw / 2 : cd.x, mx = x0 + tw / 2, my = cd.y - 0.3 * f, a = yAt(j, mx);
      return a == null || ls.every((_: unknown, k: number) => { if (k === j) return true; const o = yAt(k, mx); return o == null || !((o - my) * (o - a) < 0); }); };
    const pl = cands.length ? P.placeWord(cands.filter(own), tw, f, { ...ob, boxes, lines: ob.lines.map((q: Any) => ({ ...q, w: 3 })) }) : null;
    named.push(!!pl && pl.n === 0);
    if (!pl) return;
    boxes.push(pl.box);
    lineNames.push({ j, x: pl.x, y: pl.y, anchor: pl.anchor });
  });
  // every name clear of everything, or none on the drawing: then the key at the top names the lines
  const fits = !ser || (named.length > 0 && named.every(Boolean));

  // the x cut-offs' names over the plot
  xCutLabs.forEach((q) => {
    const y = G.T - 0.45 * f;
    const p = P.placeWord([{ x: q.x, y, anchor: 'middle' }, { x: q.x + 0.3 * f, y, anchor: 'start' }, { x: q.x - 0.3 * f, y, anchor: 'end' }], q.tw, f, { boxes, inside: ob.inside });
    boxes.push(p.box);
    say(wordShapes, p.x, p.y, q.text, lk('cv.cut', { rate: q.rate }), { anchor: p.anchor });
  });
  // each dot's name beside its first point
  const nd = dotPts.filter((d) => d.hasName && d.first), leads: Seg[] = [];
  const spots = P.placeDotNames(nd.map((d) => ({ x: d.first![0], y: d.first![1], w: 1.08 * cw(d.txt, f, true) })), f, ddr, { ...ob, boxes, lines: ob.lines.map((q: Any) => ({ ...q, w: 3 })) });
  nd.forEach((d, i) => {
    const pl = spots[i];
    if (pl.ok) say(wordShapes, pl.x, pl.y, d.txt, lk('cv.dname', { num: !!G.stepKey }), { anchor: pl.anchor });
    if (pl.ok && pl.lead) { const ll = lk('cv.lead'); leadShapes.push({ k: 'line', x1: pl.lead[0], y1: pl.lead[1], x2: pl.lead[2], y2: pl.lead[3], pen: stroke(ll) }); }
    if (pl.ok) { boxes.push(pl.box); if (pl.lead) leads.push(seg(pl.lead, 2)); }
  });
  // the cut-offs' names
  cutLabs.forEach((q) => {
    const ly = q.cands[0].y + 0.35 * f, endN = (x0: number, x1: number) => ob.segs.filter((s2: Seg) => s2.w == null && P.segHits(s2 as unknown as [number, number, number, number], [x0, ly - 2 * f, x1, ly + 2 * f])).length;
    const rN = endN(G.R - q.tw - 3, G.R), lN = endN(G.L, G.L + q.tw + 3), ends = lN < rN ? [['start', G.L + 3], ['end', G.R - 3]] : [['end', G.R - 3], ['start', G.L + 3]];
    const clear = ends.flatMap(([anchor, x]) => [0.4, 0.9, 1.4].map((d) => ({ x, y: ly - d * f, anchor })));
    const near = ok ? q.cands.filter((s2) => s2.anchor === 'end').flatMap((s2) => [{ ...s2, x: cx - 0.5 * f, anchor: 'end' }, { ...s2, x: cx + 0.5 * f, anchor: 'start' }]) : [];
    const obs = { segs: [...ob.segs, ...leads], boxes, bounds: ob.cutBounds, lines: q.lines, inside: ob.inside, boxW: 8 };
    const cs = [...clear, ...q.cands, ...near];
    let p = P.placeWord(cs, q.tw, f, { ...obs, segPad: 0.5 * f }), short = false;
    if (p.n) { const r2 = P.placeWord(cs, q.tw, f, obs); if (r2.n < p.n) p = r2; }
    if (q.short && (q.useShort || p.n > 0)) { const r2 = P.placeWord([...clear, ...q.cands, ...near], q.twS, f, obs); if (q.useShort || r2.n < p.n) { p = r2; short = true; q.useShort = true; } }
    boxes.push(p.box);
    say(wordShapes, p.x, p.y, short ? q.short! : q.txt, lk('cv.cut', { rate: q.rate, on: !!p.on }), { anchor: p.anchor });
  });
  // the zone's name inside it
  if (zoneLab) {
    const cands: Any[] = [];
    for (const dy of [0.7, 1.9, 3.1]) cands.push({ x: G.R - 0.6 * f, y: G.B - dy * f, anchor: 'end' }, { x: G.L + 0.6 * f, y: G.B - dy * f, anchor: 'start' }, { x: (G.L + G.R) / 2, y: G.B - dy * f, anchor: 'middle' });
    const pl = P.placeWord(cands, zoneLab.tw, f, { ...ob, boxes });
    boxes.push(pl.box);
    say(wordShapes, pl.x, pl.y, zoneLab.text, lk('cv.zone.t'), { anchor: pl.anchor });
  }
  // the lines' names on the drawing (when they fit) or their key at the top (when they do not)
  if (ser && fits) lineNames.forEach((n) => say(wordShapes, n.x, n.y, ls[n.j].name, lk('cv.name', {}, ls[n.j].c), { anchor: n.anchor as TextShape['anchor'] }));

  const label = `${ls.map((l: Any) => l.name).join(' and ')} against ${ax.name.toLowerCase()}, ${minusFixed(G.x0, ax.d)} to ${minusFixed(G.x1, ax.d)} ${ax.unit}`
    + (ok ? `; this case at ${minusFixed(goal!.x as number, ax.d)} ${ax.unit}: ${ls.map((l: Any, j: number) => (Number.isFinite(goal!.ys[j]) ? `${l.name} ${minusFixed(goal!.ys[j] as number, l.d)} ${l.unit}` : '')).filter(Boolean).join(', ')}` : '')
    + (dotPts.length ? `; also ${dotPts.map((d) => d.full).filter(Boolean).join(', ')}` : '');
  const shapes: Shape[] = [...panelShapes, ...zoneShapes, ...gridShapes, ...cutShapes, ...xCutShapes, ...legendShapes, ...(G.ag && !fits ? altShapes : []), ...axisShapes, ...stepShapes, ...atShapes, ...walkShapes, ...lineShapes, ...leadShapes, ...dotShapes, ...wordShapes];
  // the walks sit under the lines in 2D's order (walks, arrows, lines, leads, dots, names): walks above are pushed with arrows; keep that order
  return { frame: { w, h, shapes, label }, G, fits, crowded };
}

export function curveFrame(spec: CurveSpec, c: ChartCtx): CurveOut {
  const f = c.type.sm, w = Math.max(160, c.w), own = spec.height ?? fitHeight(curveHeight(w, f), c), h = Math.round(Math.max(8 * f, heldToRoom(own, spec.room, f)!));
  let out = drawOnce(spec, c, w, h, f, false, false);
  // a crowd of names: numbers on the dots and a key under the chart, if the plot keeps its height
  if (out.crowded) { const g2 = drawOnce(spec, c, w, h, f, true, false); if (g2.G.B - g2.G.T >= 5 * f) out = g2; }
  // with against, names that found no clear spot: the key of the lines above the plot, the plot a little shorter
  if (out.G.ag && !out.G.alt && !out.fits) out = drawOnce(spec, c, w, h, f, !!out.G.stepKey, true);
  // (held to the room: the card judges its pair by the height the chart wants, Frame.want)
  return own > h + 0.5 ? { ...out, frame: { ...out.frame, want: Math.round(own) } } : out;
}

/** The same frame with the case's line at x (shown units): the line glides after its goal while the words stand where they were placed (2D moveAt: a frame of the glide moves that line and nothing else). */
export function withAtX(out: CurveOut, x: number): Frame {
  const G = out.G, px = G.L + (G.R - G.L) * (clamp(x, Math.min(G.x0, G.x1), Math.max(G.x0, G.x1)) - G.x0) / ((G.x1 - G.x0) || 1);
  return { ...out.frame, shapes: out.frame.shapes.map((s) => (s.k === 'line' && s.key === 'cv-at' ? { ...s, x1: px, x2: px } : s)) };
}
