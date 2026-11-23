// The talk so far as a frame (2D: talk-trace.js draw() and drawMiles()); looks: chart-looks/talk.js and plot.js, host 'talk'. Every word is the chart's type size (12 px at least).
import type { ChartCtx } from '../Chart.tsx';
import type { Rgba } from '../colour.ts';
import { look, type Look } from '../looks.ts';
import { fitHeight, type Frame, type Shape, type TextShape } from '../scene.ts';
import { bandKeys, bandRuns } from '../plot/rx-bands.generated.js';
import { hvpgRate } from '../../../engine/hales/portal/pressure-cuts.js';
import { LINES, WEDGE_C, daysOf, f1, keepClear, layoutMiles, layoutTalk, milesHeight, spanWords, talkHeight, textW, tokName, type Layout, type Run, type TalkPoint } from './model.ts';

const rate = hvpgRate as (v: number) => 'ok' | 'mid' | 'hi';
const fillOf = (l: Look): Rgba | undefined => { const o = l.fillOpacity ?? l.opacity; return l.fill && o !== undefined ? [l.fill[0], l.fill[1], l.fill[2], l.fill[3] * o] : l.fill; };

export interface TraceSpec {
  pts: readonly TalkPoint[];
  /** the treatments the slide shades (rx-bands.js keys: tool.bands) */
  bands?: readonly string[] | null;
  /** the name of the band between PV and WHVP (tool.gap), default 'PV − WHVP' */
  gap?: string | null;
  /** 'milestones': the HVPG alone with a level name over each milestone (tool.style) */
  style?: 'milestones' | null;
  /** the box's height: the card's (default: the height the chart wants) */
  height?: number;
}
export const gapNameOf = (gap: string | null | undefined) => (typeof gap === 'string' && gap.trim() ? gap.trim() : 'PV − WHVP');
/** The treatments' runs over the states (rx-bands.js bandRuns). */
export const runsOf = (pts: readonly TalkPoint[], bands: readonly string[] | null | undefined): Run[] => { const keys = bandKeys({ bands }); return keys.length ? bandRuns(pts.map((p) => p.params), keys) : []; };

export function traceFrame(spec: TraceSpec, c: ChartCtx): Frame {
  const pts = spec.pts.filter((p) => p.fp), f = c.type.sm, W = Math.max(160, c.w), gapName = gapNameOf(spec.gap), runs = runsOf(pts, spec.bands);
  const miles = spec.style === 'milestones';
  const HT = Math.round(spec.height ?? fitHeight(miles ? milesHeight(pts, W, f, runs) : talkHeight(pts, W, f, runs, gapName), c));
  return miles ? milesFrame(pts, runs, W, HT, f, c) : fullFrame(pts, runs, gapName, W, HT, f, c);
}

function kit(c: ChartCtx) {
  const shapes: Shape[] = [];
  const lk = (key: string, state: Record<string, unknown> = {}, tone?: string): Look => look(c, { host: 'talk' }, key, state, tone ? { c: tone } : {});
  const say = (x: number, y: number, s: string, l: Look, o: Partial<TextShape> = {}): void => {
    shapes.push({ k: 'text', x, y, s, size: l.size ?? c.type.sm, weight: l.weight, color: l.fill!, ...(l.halo ? { halo: l.halo } : {}), ...(l.upper ? { upper: true } : {}), ...(l.ls ? { ls: l.ls } : {}), ...o });
  };
  const rule = (x1: number, y1: number, x2: number, y2: number, l: Look) => shapes.push({ k: 'line', x1, y1, x2, y2, pen: { color: l.stroke!, w: l.width!, dash: l.dash, cap: l.cap } });
  const panel = (y: number, W: number, h: number) => shapes.push({ k: 'rect', x: 0, y, w: W, h, r: Math.max(0, Math.min(10, W / 4, h / 4)), fill: lk('plot.bg').fill! });
  return { shapes, lk, say, rule, panel };
}

/** The treatment bars over the plot, from y: a name over each bar, the bar thin and neutral, a dot where it starts. */
function barShapes(bars: Layout['bars'], y: number, fs: number, k: ReturnType<typeof kit>) {
  const rowH = fs + 10, bar = k.lk('talk.rx.bar'), dot = k.lk('talk.rx.dot'), name = k.lk('talk.rx.name');
  for (const q of bars) {
    const by = y + q.row * rowH + fs + 4;
    k.say(q.nameX, by - 5, q.run.name, name, { anchor: q.anchor });
    k.shapes.push({ k: 'rect', x: q.a, y: by - 1.5, w: Math.max(0, q.b - q.a), h: 3.5, r: 1.75, fill: fillOf(bar) });
    if (q.more) k.shapes.push({ k: 'path', pts: [q.b + 1, by - 4, q.b + 7, by + 0.25, q.b + 1, by + 4.5], closed: true, fill: fillOf(bar) });
    k.shapes.push({ k: 'circle', cx: q.a, cy: by + 0.25, r: 3.5, fill: dot.fill });
  }
}

function fullFrame(pts: readonly TalkPoint[], runs: readonly Run[], gapName: string, W: number, HT: number, fs: number, c: ChartCtx): Frame {
  const Lo = layoutTalk({ pts, W, HT, fs, runs, gapName });
  const { n, last, narrow, g, X, Y, L, R, pMax, unitW, gStep, pTop, T, B, ty, rowName, bars, blocks, mp, rowsUsed, rowTop, lineH, ends, sx, tx, mode } = Lo;
  const k = kit(c), { shapes, lk, say, rule } = k;
  k.panel(pTop, W, HT - 1.5 - pTop);
  // gridlines and their numbers; the unit once at the top of the axis
  const grid = lk('plot.grid.line', { cut: false }), gt = lk('plot.grid.text');
  for (let q = 0; q <= pMax / gStep; q++) { rule(L, Y(q * gStep), R, Y(q * gStep), grid); say(L - 8, Y(q * gStep) + 0.35 * fs, String(q * gStep), gt, { anchor: 'end' }); }
  say(Math.max(L - 8, unitW), T - 0.6 * fs - 2, 'mmHg', lk('plot.unit'), { anchor: 'end' });
  // a faint upright line at each state, from the top of the plot to its axis
  const mark = lk('talk.mark.line');
  pts.forEach((_, i) => rule(X(i), T - 4, X(i), B, mark));
  const ys = (key: string) => pts.map((p, i) => [X(i), Y(p.fp[key] || 0)] as const);
  const pv = ys('pv'), wh = ys('whvp'), fh = ys('fhvp');
  const flat = (a: readonly (readonly [number, number])[]) => a.flatMap(([x, y]) => [x, y]);
  // the two bands: the HVPG under, the gap before the sinusoids over it, each named once inside
  if (n > 1) {
    shapes.push({ k: 'band', top: flat(wh), bottom: flat(fh), fill: fillOf(lk('talk.gap.hv', {}, tokName(WEDGE_C)))! });
    shapes.push({ k: 'band', top: flat(pv), bottom: flat(wh), fill: fillOf(lk('talk.gap', {}, 'tr-pv'))! });
  }
  const bandName = (upper: typeof pv, lower: typeof pv, text: string) => {
    let best: { h0: number; x: number; y: number } | null = null;
    for (let i = 0; i < n - 1; i++) {
      const h0 = Math.min(lower[i]![1] - upper[i]![1], lower[i + 1]![1] - upper[i + 1]![1]), wd = upper[i + 1]![0] - upper[i]![0];
      if (h0 >= 1.3 * fs && wd >= textW(text, fs) + 10 && (!best || h0 > best.h0)) best = { h0, x: (upper[i]![0] + upper[i + 1]![0]) / 2, y: (upper[i]![1] + upper[i + 1]![1] + lower[i]![1] + lower[i + 1]![1]) / 4 };
    }
    return best;
  };
  const gapAt = bandName(pv, wh, gapName), hvAt = bandName(wh, fh, 'HVPG');
  if (hvAt) say(hvAt.x, hvAt.y + 0.33 * fs, 'HVPG', lk('talk.gap.name', { hv: true }), { anchor: 'middle' });
  if (gapAt) say(gapAt.x, gapAt.y + 0.33 * fs, gapName, lk('talk.gap.name'), { anchor: 'middle' });
  // the lines: FHVP a neutral reference, then WHVP and PV with a point at each state (the PV a ring where the WHVP's dot would cover it)
  const pen = (l: Look) => ({ color: l.stroke!, w: l.width!, cap: l.cap, join: l.join });
  const free = lk('talk.line.free'), lw = lk('talk.line', {}, tokName(WEDGE_C)), lp = lk('talk.line', {}, 'tr-pv');
  if (n > 1) { shapes.push({ k: 'path', pts: flat(fh), pen: pen(free) }); shapes.push({ k: 'path', pts: flat(wh), pen: pen(lw) }); shapes.push({ k: 'path', pts: flat(pv), pen: pen(lp) }); }
  ([[wh, WEDGE_C], [pv, '--tr-pv']] as const).forEach(([a, col], kk) => a.forEach(([x, y], i) => {
    const r = i === last ? 4.5 : 3.5, near = kk === 1 && Math.abs(pv[i]![1] - wh[i]![1]) < 2 * r + 1;
    if (near) { const d = lk('talk.dot.ring', {}, tokName(col)); shapes.push({ k: 'circle', cx: x, cy: y, r: r + 2.5, pen: { color: d.stroke!, w: d.width! } }); }
    else { const d = lk('talk.dot', {}, tokName(col)); shapes.push({ k: 'circle', cx: x, cy: y, r, fill: d.fill, pen: { color: d.stroke!, w: d.width! } }); }
  }));
  // each line's name at its right end, with its last value where there is room
  for (const e of ends) {
    shapes.push({ k: 'rect', x: sx, y: e.y - 1.5, w: 8, h: 3, r: 1.5, fill: lk('talk.swatch', {}, tokName(e.c)).fill });
    say(tx, e.y + 0.35 * fs, e.a, lk('talk.lbl.n'));
    if (!narrow) say(tx + textW(e.a, fs, 700) + 4, e.y + 0.35 * fs, e.v, lk('talk.lbl.v'));
  }
  const axis = lk('time.axis.line');
  rule(L, B, R, B, axis);
  // The time row: a visit of several states shares a bracket and its day; a break on the axis between visits, the time between them over it where it fits.
  const visits: { i0: number; i1: number; when: string; day: string | undefined }[] = [];
  pts.forEach((p, i) => { if (!i || g[i] !== g[i - 1]) visits.push({ i0: i, i1: i, when: p.when || String(p.n), day: p.day ?? p.when }); else visits.at(-1)!.i1 = i; });
  const vX = (v: { i0: number; i1: number }) => (X(v.i0) + X(v.i1)) / 2;
  const vText = (v: { i0: number; i1: number; when: string }) => (v.i1 > v.i0 && !narrow && textW(`${v.when} · one visit`, fs, 500) + 12 <= X(v.i1) - X(v.i0) + 12 ? `${v.when} · one visit` : v.when);
  const vKept = keepClear(visits.map(vX), visits.map((v) => textW(vText(v), fs, 600)), W);
  const am = lk('talk.axis.mark'), said: [number, number][] = [];   // (where the visits' names stand: the time between two visits is only said where it stands clear of them)
  visits.forEach((v, kk) => {
    const now = v.i1 === last, xs = [X(v.i0) - 6, X(v.i1) + 6];
    if (v.i1 > v.i0) shapes.push({ k: 'path', pts: [xs[0]!, B + 5, xs[0]!, B + 9, xs[1]!, B + 9, xs[1]!, B + 5], pen: pen(am) });
    if (vKept.has(kk)) { say(vX(v), ty, vText(v), lk('talk.when', { now }), { anchor: 'middle' }); const hw = textW(vText(v), fs, 600) / 2; said.push([vX(v) - hw, vX(v) + hw]); }
  });
  visits.slice(1).forEach((v, kk) => {
    const a = X(visits[kk]!.i1), b = X(v.i0), mx = (a + b) / 2, d0 = daysOf(visits[kk]!.day), d1 = daysOf(v.day), span = d0 != null && d1 != null && d1 > d0 ? spanWords(d1 - d0) : '';
    if (b - a < 16) return;
    shapes.push({ k: 'path', pts: [mx - 5, B + 4, mx - 1, B - 4], pen: pen(am) }, { k: 'path', pts: [mx + 1, B + 4, mx + 5, B - 4], pen: pen(am) });
    const sw2 = span ? textW(span, fs, 500) / 2 : 0;
    if (span && b - a >= 2 * sw2 + 16 && said.every(([x0, x1]) => mx + sw2 + 4 <= x0 || mx - sw2 - 4 >= x1)) say(mx, ty, span, lk('talk.span'), { anchor: 'middle' });
  });
  // The readings rows under the plot (those the box has room for), each value under its state (where it stands clear), named in the right column.
  const gapV = pts.map((p) => f1((p.fp.pv || 0) - (p.fp.whvp || 0))), hvV = pts.map((p) => f1(p.fp.hvpg || 0));
  const keepOf = (vs: string[]) => keepClear(pts.map((_, i) => X(i)), vs.map((t) => textW(t, fs, 600)), R + 6);
  const keep1 = keepOf(gapV), keep2 = keepOf(hvV), rowAt = (key: string) => Lo.rowDefs.find((d) => d[0] === key)?.[1];
  const gapY = rowAt('gap'), hvY = rowAt('hv');
  if (Lo.rowDefs.length) rule(L, Lo.r1 - fs - 3, W - 8, Lo.r1 - fs - 3, grid);
  pts.forEach((p, i) => {
    const now = i === last;
    if (gapY != null && keep1.has(i)) say(X(i), gapY, gapV[i]!, lk('talk.read', { now }), { anchor: 'middle' });
    if (hvY != null && keep2.has(i)) say(X(i), hvY, hvV[i]!, lk('talk.read', { rate: rate(p.fp.hvpg as number), now }), { anchor: 'middle' });
  });
  const sw = (y: number, tone: string) => shapes.push({ k: 'rect', x: sx, y: y - 0.7 * fs, w: 8, h: 8, r: 2, fill: fillOf(lk('talk.swatch.gap', {}, tone)) });
  if (gapY != null) { sw(gapY, 'tr-pv'); say(tx, gapY, rowName, lk('talk.read.name')); }
  if (hvY != null) { sw(hvY, tokName(WEDGE_C)); say(tx, hvY, 'HVPG', lk('talk.read.name')); }
  // The stage names, then the treatments.
  if (mode === 'names') {
    pts.forEach((_, i) => {
      const at = mp.at[i]!;
      if (!at.show) return;
      // (rows counted from the plot up, as milePlaces gives them: row 0 is the lowest)
      const r = rowsUsed - 1 - at.row, y0 = rowTop(r) + fs, st = lk('talk.stage', { now: i === last });
      blocks[i]!.lines.forEach((t, q) => say(at.ax, y0 + q * lineH, t, st, { anchor: at.anchor }));
    });
  } else {
    const ring = (cx: number, cy: number, i: number) => {
      // (the numeral alone, bold, in the text colour with the card's halo: no disc, no ring, no face, as the step numbers everywhere since 23 Nov: docs/approved/step-markers.md; the latest in the full text colour)
      const now = i === last, nn = lk('talk.stage', { now }), card = lk('talk.step.ring', { now: false });
      say(cx, cy + 0.35 * fs, String(i + 1), nn, { anchor: 'middle', weight: 700, halo: { color: card.fill!, w: 3 } });
    };
    const y0 = fs + 3, cap = lk('talk.stage', { now: true });
    if (n) { Lo.cap.forEach((t, q) => say(Lo.capX, y0 + q * lineH, t, cap)); ring(Lo.sr + 2, y0 - 0.35 * fs, last); }
    for (let i = 0; i < n; i++) if (Lo.stepKept.has(i)) ring(X(i), Lo.stepY, i);
  }
  barShapes(bars, Lo.stripY, fs, k);
  const label = 'Pressures over the talk so far: ' + pts.map((p) => `${p.when || `slide ${p.n}`}${p.tick ? `, ${p.tick}` : ''}, PV ${(p.fp.pv ?? 0).toFixed(0)}, WHVP ${(p.fp.whvp ?? 0).toFixed(0)}, ${gapName} ${f1((p.fp.pv || 0) - (p.fp.whvp || 0))}, HVPG ${f1(p.fp.hvpg)}`).join('; ')
    + runs.map((r) => `. ${r.name} from ${pts[r.i0]!.when || `slide ${pts[r.i0]!.n}`}`).join('');
  return { w: W, h: HT, shapes, label };
}

function milesFrame(pts: readonly TalkPoint[], runs: readonly Run[], W: number, HT: number, fs: number, c: ChartCtx): Frame {
  const Lo = layoutMiles({ pts, W, HT, fs, runs });
  const { L, R, vfs, X, mi, at, bars, bRows, nameY, T0, T, B, gMax, Y, ticks, named, last } = Lo;
  const k = kit(c), { shapes, lk, say, rule } = k;
  k.panel(T0 - 6, W, HT - 1.5 - (T0 - 6));
  const gt = lk('plot.grid.text');
  for (const v of ticks) {
    const cut = v === 5 || v === 10, l = lk('plot.grid.line', { cut, rate: v === 10 ? 'hi' : v === 5 ? 'mid' : undefined });
    rule(L, Y(v), R, Y(v), l); say(L - 8, Y(v) + 0.35 * fs, String(v), gt, { anchor: 'end' });
  }
  say(Math.max(L - 8, Lo.unitW), T - 0.6 * fs - 2, 'mmHg', lk('plot.unit'), { anchor: 'end' });
  say(L, T - 0.6 * fs - 2, 'HVPG', lk('plot.ax'));
  // A line under each milestone's name down to the axis, and the times under the axis.
  const mark = lk('talk.mark.line');
  pts.forEach((p, i) => {
    if (p.mile) rule(X(i), bRows ? T - 4 : T0 - 2, X(i), B + 4, mark);
    if (named.has(i)) say(X(i), B + fs + 6, p.when || String(p.n), lk('talk.mark.text', { now: i === last }), { anchor: 'middle' });
  });
  mi.forEach((i, q) => say(at[q]!.ax, nameY(at[q]!.row), pts[i]!.mile!, lk('talk.ms', { now: i === last }), { anchor: at[q]!.anchor }));
  barShapes(bars, T0 - 4, fs, k);
  // (Each stretch of the line in the colour of where it ends, the cut-offs' own.)
  pts.slice(1).forEach((p, q) => { const l = lk('talk.line.hv', { rate: rate(p.fp.hvpg as number) }); shapes.push({ k: 'path', pts: [X(q), Y(pts[q]!.fp.hvpg || 0), X(q + 1), Y(p.fp.hvpg || 0)], pen: { color: l.stroke!, w: l.width!, cap: l.cap, join: l.join } }); });
  pts.forEach((p, i) => { const l = lk('talk.pt', { rate: rate(p.fp.hvpg as number) }); shapes.push({ k: 'circle', cx: X(i), cy: Y(p.fp.hvpg || 0), r: i === last ? 6 : 4, fill: l.fill, pen: { color: l.stroke!, w: l.width! } }); });
  if (pts.length) { const v = lk('talk.value', { rate: rate(pts[last]!.fp.hvpg as number) }); say(R + 10, Y(pts[last]!.fp.hvpg || 0) + 0.35 * vfs, f1(pts[last]!.fp.hvpg), v, { size: Math.max(v.size ?? vfs, vfs) }); }
  void gMax;
  const label = 'HVPG over the talk so far: ' + pts.map((p) => `${p.when || `slide ${p.n}`}${p.mile ? `, ${p.mile}` : ''}, ${f1(p.fp.hvpg)}`).join('; ') + runs.map((r) => `. ${r.name} from ${pts[r.i0]!.when || `slide ${pts[r.i0]!.n}`}`).join('');
  return { w: W, h: HT, shapes, label };
}
