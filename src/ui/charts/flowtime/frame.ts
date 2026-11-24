// The flow-time chart as a frame at minute m (the head of each line): its lines drawn from the start up to m, each with its head and its value (looks: chart-looks/time.js, plot.js).
import type { ChartCtx } from '../Chart.tsx';
import { type Rgba } from '../colour.ts';
import { look, type Look } from '../looks.ts';
import type { Frame, Shape } from '../scene.ts';
import { RX as RX0 } from '../plot/rx-bands.generated.js';
import { yOf, decOf } from '../plot/scales.ts';
import { MINUTES, clockTicks, cw, flowGeo, flowTimeFit, headLeft, linesOf, legendOf, showsOf, startPlan, withUnit, xAt, rxGap, type FlowSeries, type Geo, type LineRow } from './model.ts';

export const RX = RX0 as unknown as Record<string, [name: string, on: (params: unknown) => boolean, tone: string]>;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const tokOf = (v: string) => v.replace(/^--/, '');

export interface FlowSpec { ser: FlowSeries; clock: 'meal' | 'days'; keys: readonly string[]; /** the treatments shown (rx-bands.js keys) */ rx?: readonly string[]; height?: number; /** the room the card leaves the chart, px (2D --ft-room); 0: none */ room?: number; /** a phone's stacked card's one height, px (2D --ft-h); 0: none */ cap?: number }
export interface FlowOut { frame: Frame; G: Geo }

/** A line's colour as a word: its -ink form where the look has one (a trace colour is 3:1, a word needs 4.5:1). */
export const inkOf = (c: ChartCtx, name: string): Rgba => (c.pal.has(`${name}-ink`) ? c.pal.tok(`${name}-ink`) : c.pal.tok(name));

export function flowTimeFrame(spec: FlowSpec, m: number, c: ChartCtx): FlowOut {
  const { pal } = c, f = c.type.sm, w = Math.max(160, c.w), { ser, clock, keys } = spec, rx = spec.rx ?? [];
  const H = { host: 'flowtime' };
  const lk = (key: string, state: Record<string, unknown> = {}, tone?: string, name = 'c'): Look => look(c, H, key, state, tone ? { [name]: tone } : {});
  const ax = ser.ax, bandEm = rx.length ? 1.4 + 0.32 * rx.length : 0, h = Math.round(spec.height ?? flowTimeFit(w, f, keys, bandEm, spec.room, spec.cap));
  const want = spec.height == null && !spec.cap ? flowTimeFit(w, f, keys, bandEm, 0, 0) : h;   // (what it would be given no room: the card judges its pair by it)
  const G = flowGeo(ser, clock, keys, rx.length, w, h, f), LINES: LineRow[] = linesOf(keys);
  const { L, R, T, B, meal } = G, X = (mm: number) => xAt(G, ax, mm);
  const surf2 = lk('plot.bg').fill!;
  const shapes: Shape[] = [];
  // a word as its look says (size, weight, colour, halo, letter spacing), at (x, y); o moves what a frame moves (anchor, alpha)
  const say = (x: number, y: number, s: string, l: Look, o: Partial<Extract<Shape, { k: 'text' }>> = {}): void => {
    shapes.push({ k: 'text', x, y, s, size: l.size ?? f, weight: l.weight, color: l.fill!, ...(l.halo ? { halo: l.halo } : {}), ...(l.upper ? { upper: true } : {}), ...(l.ls ? { ls: l.ls } : {}), ...o });
  };
  // the panel, from just under the legend to the foot
  const top = G.keyH + 0.1 * f, pr = Math.max(0, Math.min(10, w / 4, (h - top) / 4));
  shapes.push({ k: 'rect', x: 0, y: top, w, h: h - top, r: pr, fill: surf2 });
  // the treatments under the clock: their names on one row, then a thin bar each
  if (rx.length) {
    let nx = L;
    rx.forEach((k, j) => {
      const [name, , tone] = RX[k]!, nameL = lk('ft.band.name', {}, tokOf(tone), 'rx');
      if (j) { say(nx, B + 2.55 * f, '  ·  ', lk('time.tk'), { weight: nameL.weight }); nx += cw('  ·  ', f, true); }
      say(nx, B + 2.55 * f, name, nameL); nx += cw(name, f, true);
    });
    rx.forEach((k, j) => {
      const bar = lk('ft.band.bar', {}, tokOf(RX[k]![2]), 'rx');
      shapes.push({ k: 'rect', x: L, y: B + 2.8 * f + j * 0.32 * f, w: Math.max(2, R - L), h: 0.2 * f, r: 0.1 * f, fill: bar.opacity !== undefined ? [bar.fill![0], bar.fill![1], bar.fill![2], bar.fill![3] * bar.opacity] : bar.fill });
    });
  }
  const lowY = yOf(G.PB, ser.pScale), upY = yOf(G.FB, ser.fScale);
  const gl = (k: number) => lk('time.grid.text', {}, LINES[k]![3]);   // a gridline's number, in the colour of its line
  // gridlines (the left axis draws them), numbers on each side in the line's colour
  const gridLine = lk('plot.grid.line', { cut: false }).stroke!, gridW = lk('plot.grid.line', { cut: false }).width!;
  const showL = showsOf(ser.pScale, lowY, f), showR = showsOf(ser.fScale, upY, f);
  ser.fScale.ticks.forEach((v, j) => { if (showR(j)) say(R + 6, upY(v) + 0.35 * f, v.toFixed(decOf(ser.fScale)), gl(1), { anchor: 'start' }); });
  ser.pScale.ticks.forEach((v, j) => {
    shapes.push({ k: 'line', x1: L, x2: R, y1: lowY(v), y2: lowY(v), pen: { color: gridLine, w: gridW } });
    if (showL(j)) say(L - 6 - rxGap(rx.length, f), lowY(v) + 0.35 * f, v.toFixed(decOf(ser.pScale)), gl(0), { anchor: 'end' });
  });
  // the legend: each line's swatch, name and unit (the lower line's on the left, the upper's on the right or under it)
  legendOf(keys, f).forEach((k, j) => {
    const right = j > 0 && G.oneRow, y = (j && !G.oneRow ? G.rowH : 0) + 0.75 * f, x0 = right ? w : 0, kl = lk('time.key.line', {}, k.c), kt = lk('time.key.text', {}, k.c), ku = lk('time.key.unit');
    shapes.push({ k: 'line', x1: x0 + (right ? -16 : 0), x2: x0 + (right ? 0 : 16), y1: y, y2: y, pen: { color: kl.stroke!, w: kl.width!, cap: kl.cap } });
    if (right) { say(x0 - 22, y + 0.36 * f, k.name, kt, { anchor: 'end' }); say(x0 - 22 - cw(k.name, f, true) - cw(' ', f), y + 0.36 * f, k.unit, { ...ku, size: f }, { anchor: 'end' }); }
    else { say(x0 + 22, y + 0.36 * f, k.name, kt); say(x0 + 22 + cw(k.name, f, true), y + 0.36 * f, ` ${k.unit}`, { ...ku, size: f }); }
  });
  // the clock
  const axis = lk('time.axis.line');
  shapes.push({ k: 'line', x1: L, x2: R, y1: B, y2: B, pen: { color: axis.stroke!, w: axis.width! } });
  for (const mm of clockTicks(G, ax)) say(X(mm), B + 1.25 * f, mm > 0 ? `+${mm}` : mm < 0 ? `−${-mm}` : '0', lk('time.tk'), { anchor: 'middle' });
  say(X(ax.end) + G.half, B + 1.25 * f, meal ? 'min' : 'days', lk('plot.ax'), { anchor: 'start' });
  if (meal) {
    const mealLine = lk('ft.meal');
    say((X(MINUTES.from) + X(0)) / 2, T - 0.6 * f, 'Fasting', lk('ft.t', { meal: false }), { anchor: 'middle' });
    shapes.push({ k: 'line', x1: X(0), x2: X(0), y1: T - 1.5 * f, y2: B, pen: { color: mealLine.stroke!, w: mealLine.width!, dash: mealLine.dash } });
    say(X(0) + 6, T - 0.6 * f, 'Meal', lk('ft.t', { meal: true }));
  }
  // the first values: a ring at each line's start and its value clear of the lines, the rings and the numbers
  const plan = startPlan(G, ser, LINES, rx.length);
  plan.starts.forEach(({ x, y, txt }, i) => {
    const ring = lk('ft.start', {}, LINES[i]![3]);
    shapes.push({ k: 'circle', cx: plan.own[i]![0], cy: plan.own[i]![1], r: Math.max(3, f * 0.3), fill: ring.fill, pen: { color: ring.stroke!, w: ring.width! } });
    say(x, y, txt, lk('ft.v0', {}, LINES[i]![3]));
  });
  // the lines up to minute m, each with its head and its value
  const mins = ser.min, nm = mins.length;
  let n = 0; while (n < nm && mins[n]! < m) n++;
  const heads: { hx: number; hy: number; v: number; i: number }[] = [], drawn: number[][] = [];
  LINES.forEach(([slot, , , col], i) => {
    const arr = ser[slot === 'flow' ? 'flow' : 'pv'], Y = slot === 'flow' ? upY : lowY, pts: number[] = [];
    for (let q = 0; q < n; q++) pts.push(X(mins[q]!), Y(arr[q]!));
    const val = lerpAt(arr, ax.from, m), hx = X(m), hy = Y(val);
    pts.push(hx, hy);
    if (pts.length < 4) pts.push(hx, hy);
    drawn.push(pts);
    const ln = lk('plot.line', {}, col);
    shapes.push({ k: 'path', pts, pen: { color: ln.stroke!, w: ln.width!, cap: ln.cap, join: ln.join } });
    heads.push({ hx, hy, v: val, i });
  });
  const boxes = plan.right;
  // the lowest row a head's value may stand on: its baseline clears the clock's axis by the text's own descender and halo ("4.0 mmHg" stood on the axis line, the g and the halo struck through it, Portal vein thrombosis 5, capture 6ec6d323)
  const floorY = B - 0.5 * f;
  heads.forEach(({ hx, hy, v, i }) => {
    const [, , , col, , unit, d] = LINES[i]!, txt = withUnit(v, d, unit), tw = cw(txt, f * 1.1, true), left = headLeft(hx, hy, tw, f, w, boxes);
    const dot = lk('ft.dot', {}, col);
    shapes.push({ k: 'circle', cx: hx, cy: hy, r: Math.max(4, f * 0.42), fill: dot.fill, pen: { color: dot.stroke!, w: dot.width! } });
    // near the start the first value is already there: the head's own value waits
    const off = m - ax.from < 0.36 * (ax.end - ax.from), vl = lk('ft.v', { off: false }, col);
    // a head's value that would stand on a first value (the plot is short on a phone: "12.9 mmHg" ran into "11.0 mmHg", meso-rex 9, 23 Nov review) goes under its head, else over it, whichever is clear
    const px0 = left ? hx - 0.6 * f - tw : hx + 0.6 * f, px1 = px0 + tw, onStart = (y: number) => plan.starts.some(({ box: q }) => px0 < q[1] && q[0] < px1 && y - 0.85 * f < q[3] && q[2] < y + 0.25 * f);
    const base = hy - 0.7 * f, ty = !onStart(base) ? base : [hy + 1.5 * f, hy - 2.1 * f].find((y) => y <= floorY && y - 0.85 * f > top && !onStart(y)) ?? base;
    shapes.push({ k: 'text', x: hx + (left ? -0.6 : 0.6) * f, y: ty, s: txt, size: vl.size!, weight: vl.weight, color: vl.fill!, anchor: left ? 'end' : 'start', halo: vl.halo, alpha: off ? 0 : 1 });
  });
  // two heads close together: the lower band's value goes under its head, clear of the other
  const a = heads[0]!.hy - 0.7 * f, b = heads[1]!.hy - 0.7 * f;
  if (Math.abs(a - b) < 1.4 * f) {
    const j = a > b ? 0 : 1, vi = shapes.length - 3 + 2 * j, s = shapes[vi] as Extract<Shape, { k: 'text' }>;
    shapes[vi] = { ...s, y: Math.min(heads[j]!.hy + 1.5 * f, floorY) };
  }
  // the two values still on one another (a short plot, both stood under their heads and the lower one stopped at the axis: "32.1 kPa" over "6.8 mmHg", iPhone on its side): the upper one rises off the lower
  {
    const vs = [shapes.length - 3, shapes.length - 1].map((k) => shapes[k] as Extract<Shape, { k: 'text' }>);
    const wide = (t: Extract<Shape, { k: 'text' }>) => cw(t.s, f * 1.1, true), x0 = (t: Extract<Shape, { k: 'text' }>) => (t.anchor === 'end' ? t.x - wide(t) : t.x);
    const [p0, p1] = vs, up = p0!.y <= p1!.y ? 0 : 1, hi = vs[up]!, lo = vs[1 - up]!, sideBySide = x0(hi) < x0(lo) + wide(lo) && x0(lo) < x0(hi) + wide(hi);
    if (sideBySide && lo.y - hi.y < 1.05 * f) shapes[shapes.length - 3 + 2 * up] = { ...hi, y: Math.max(top + 0.85 * f, lo.y - 1.15 * f) };
  }
  // last, every head value clear of every first value and of the other head value, wherever the earlier nudges left it (a short plot: "9.5 mmHg" stood 4 px under "8.0 mmHg", the specimen at 300 px)
  {
    const idx = [shapes.length - 3, shapes.length - 1], at = (k: number) => shapes[k] as Extract<Shape, { k: 'text' }>;
    const box = (t: Extract<Shape, { k: 'text' }>, y: number) => { const wd = cw(t.s, t.size ?? f, true), x0 = t.anchor === 'end' ? t.x - wd : t.x; return [x0, x0 + wd, y - 0.85 * f, y + 0.25 * f] as const; };
    const hit = (p: readonly number[], q: readonly number[]) => p[0]! < q[1]! && q[0]! < p[1]! && p[2]! < q[3]! && q[2]! < p[3]!;
    for (const [n, k] of idx.entries()) {
      const t = at(k), other = at(idx[1 - n]!);
      const free = (y: number) => !plan.starts.some(({ box: q }) => hit(box(t, y), q)) && !hit(box(t, y), box(other, other.y));
      // (a value also keeps off the lines: "3.0 L" stood on the HVPG line's last stretch, Precipitants 3, capture 6ec6d323; where no row is clear of them the rows above are used as before)
      const rows = [t.y, t.y + 1.15 * f, t.y - 1.15 * f, t.y + 2.3 * f, t.y - 2.3 * f].filter((c) => c <= floorY && c - 0.85 * f > top);
      const y = rows.find((c) => free(c) && !drawn.some((pts) => pathHitsBox(pts, box(t, c), 0.2 * f))) ?? rows.find(free);
      if (y !== undefined && y !== t.y) shapes[k] = { ...t, y };
      else if (y === undefined && t.anchor !== 'end') {
        // no clear row: the value moves along its row to just past the first values it stood on, if the plot has the room
        const wd = cw(t.s, t.size ?? f, true), past = Math.max(...plan.starts.filter(({ box: q }) => hit(box(t, t.y), q)).map(({ box: q }) => q[1]!)) + 0.4 * f;
        if (Number.isFinite(past) && past + wd <= w - 2) shapes[k] = { ...t, x: past };
      }
    }
  }
  // a value that was moved off its own point (clear of the lines, the rings and the other numbers) says whose it is with a short leader of its line's colour, so it is never read as the neighbouring line's
  // ("8.2 mmHg" beside the PPG's end while its own dot is lower; "11.1 mmHg" half way across the plot: Two lesions 3, reviewer 24 Nov 2026)
  {
    const headAt = [shapes.length - 3, shapes.length - 1];   // (the two head values, laid last above)
    const reach = (bx0: number, bx1: number, by0: number, by1: number, cx: number, cy: number) => [Math.min(Math.max(cx, bx0), bx1), Math.min(Math.max(cy, by0), by1)] as const;
    const leader = (px: number, py: number, r: number, bx0: number, bx1: number, by0: number, by1: number, col: Rgba) => {
      const [qx, qy] = reach(bx0, bx1, by0, by1, px, py), dx = qx - px, dy = qy - py, dist = Math.hypot(dx, dy);
      if (dist < r + 0.9 * f) return;
      const sx = px + (dx / dist) * (r + 1), sy = py + (dy / dist) * (r + 1);
      shapes.push({ k: 'line', x1: sx, y1: sy, x2: qx - (dx / dist) * 2, y2: qy - (dy / dist) * 2, pen: { color: col, w: 1 } });
    };
    heads.forEach((hd, n) => {
      const t = shapes[headAt[n]!] as Extract<Shape, { k: 'text' }>;
      if (!t || t.alpha === 0) return;
      const wd = cw(t.s, t.size ?? f, true), x0 = t.anchor === 'end' ? t.x - wd : t.x;
      leader(hd.hx, hd.hy, Math.max(4, f * 0.42), x0, x0 + wd, t.y - 0.85 * f, t.y + 0.25 * f, lk('plot.line', {}, LINES[hd.i]![3]).stroke!);
    });
    plan.starts.forEach(({ box: q }, i) => leader(plan.own[i]![0], plan.own[i]![1], Math.max(3, f * 0.3), q[0]!, q[1]!, q[2]!, q[3]!, lk('plot.line', {}, LINES[i]![3]).stroke!));
  }
  const label = flowTimeLabel(ser, keys, clock, heads.map((hd) => hd.v));
  return { frame: { w, h, shapes, label, ...(want > h + 0.5 ? { want: Math.round(want) } : null) }, G };
}
/** Whether a polyline (x, y pairs) passes through a box [x0, x1, y0, y1] grown by `pad`. */
export function pathHitsBox(pts: readonly number[], q: readonly number[], pad = 0): boolean {
  const x0 = q[0]! - pad, x1 = q[1]! + pad, y0 = q[2]! - pad, y1 = q[3]! + pad;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i]!, ay = pts[i + 1]!, bx = pts[i + 2]!, by = pts[i + 3]!;
    if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(ay, by) < y0 || Math.min(ay, by) > y1) continue;
    // (Liang-Barsky: the part of the segment inside the box, if any)
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, r] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]] as const) {
      if (p === 0) { if (r < 0) { ok = false; break; } continue; }
      const t = r / p;
      if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; } else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
    }
    if (ok && t0 <= t1) return true;
  }
  return false;
}
function lerpAt(arr: readonly number[], from: number, m: number): number {
  const j = clamp(Math.floor(m - from), 0, arr.length - 2);
  return arr[j]! + (arr[j + 1]! - arr[j]!) * clamp(m - from - j, 0, 1);
}
/** The minute a share k (0 to 1) of the time-lapse stands at: its minutes on the rise; once it has ended, the held state to the end. */
export const minuteOf = (ser: FlowSeries, k: number) => (k >= 1 ? ser.ax.end : ser.ax.rise * clamp(k, 0, 1));

/** The chart in a sentence: each line's first value to its value at the head (values: the heads', or the series' ends when left out). */
export function flowTimeLabel(ser: FlowSeries, keys: readonly string[], clock: 'meal' | 'days', values?: readonly number[]): string {
  const LINES = linesOf(keys);
  return `${LINES[0]![4]} and ${LINES[1]![4].toLowerCase()} ${clock === 'days' ? `over ${ser.ax.end} days` : 'around a meal'}: `
    + LINES.map(([slot, , , , name, unit, d], j) => { const a = ser[slot === 'flow' ? 'flow' : 'pv']; return `${name.toLowerCase()} ${withUnit(a[0]!, d, unit)} to ${withUnit(values?.[j] ?? a.at(-1)!, d, unit)}`; }).join(', ');
}

/** The treatments a slide's tool shades that are on in the slide's state (rx-bands.js: each band shown when the state's params have it on). */
export const activeBands = (bands: readonly string[] | null | undefined, params: unknown): string[] => [...new Set((bands ?? []).filter((k) => Object.hasOwn(RX, k)))].filter((k) => RX[k]![1](params));

