// The procedure's graph as a frame at t seconds after the change (the head of each line): its legend, its two axes (tints on the worse side of the left line's cut-offs, or the
// goal's green band), the flat stretch before the change, the dashed line and the word of the event, each point the model gave, the heads and their values. Lifted from event-graph.js
// build() and paint(); looks: chart-looks/time.js and plot.js (host 'flowtime', the time-lapse graph's own).
import { heldToRoom } from '../profile/model.ts';
import type { ChartCtx } from '../Chart.tsx';
import type { Rgba } from '../colour.ts';
import { look, type Look } from '../looks.ts';
import type { Frame, Shape, TextShape } from '../scene.ts';
import { LINE, cw as cwReal, headLeft, withUnit } from '../flowtime/model.ts';
import { EVENT_S, PRE_S, TICK_S, evCw, evGeo, evHeight, evLabel, evX, evY, eventScales, fmtN, goalSpot, valAt, type EvRun, type EvSpec } from './model.ts';

const tokOf = (v: string) => v.replace(/^--/, '');
const fillOf = (l: Look): Rgba | undefined => { const o = l.fillOpacity ?? l.opacity; return l.fill && o !== undefined ? [l.fill[0], l.fill[1], l.fill[2], l.fill[3] * o] : l.fill; };

export interface EvInput {
  spec: EvSpec;
  /** where the two lines start, the model's units, [lower, upper] */
  before: readonly [number, number];
  /** where they are expected to end (the slide's own settled state), or null: the scale is then set from the start alone */
  end?: readonly [number, number] | null;
  /** the points after the change (null: before it) */
  run?: Pick<EvRun, 'pts' | 'n' | 'on'> | null;
  height?: number;
  /** the room the data card leaves the chart, px (2D --pz-room): never taller than it */
  room?: number;
}

/** The chart at t seconds after the change (t is where the heads stand; before the change, 0). */
export function evGraphFrame(inp: EvInput, t: number, c: ChartCtx): Frame {
  const { spec } = inp, f = c.type.sm, w = Math.max(160, c.w), h = Math.round(Math.max(8 * f, heldToRoom(inp.height ?? evHeight(w, f), inp.room, f)!));
  const x = spec.lines.map((k) => LINE[k]?.[4] ?? 1);
  const before = [inp.before[0] * x[0]!, inp.before[1] * x[1]!] as const;
  const endv = inp.end?.every(Number.isFinite) ? ([inp.end[0] * x[0]!, inp.end[1] * x[1]!] as const) : null;
  const scales = eventScales(spec, inp.before, inp.end ?? null);
  const G = evGeo(spec, scales, w, h, f), { L, R, T, B, FB, PB } = G, X = (s: number) => evX(G, s);
  const H = { host: 'flowtime' };
  const lk = (key: string, state: Record<string, unknown> = {}, tone?: string): Look => look(c, H, key, state, tone ? { c: tone } : {});
  const run = inp.run && inp.run.on ? inp.run : null, on = !!run;
  const shapes: Shape[] = [];
  const say = (px: number, py: number, s: string, l: Look, o: Partial<TextShape> = {}): void => {
    shapes.push({ k: 'text', x: px, y: py, s, size: l.size ?? f, weight: l.weight, color: l.fill!, ...(l.halo ? { halo: l.halo } : {}), ...(l.upper ? { upper: true } : {}), ...(l.ls ? { ls: l.ls } : {}), ...o });
  };
  // the panel, from just under the legend to the foot (plotPanel: its corners 10 px, less on a small plot)
  const top = G.keyH + 0.1 * f, ph = h - top, pr = Math.max(0, Math.min(10, w / 4, ph / 4));
  shapes.push({ k: 'rect', x: 0, y: top, w, h: ph, r: pr, fill: lk('plot.bg').fill! });

  const bands = [PB, FB] as const;
  const lines = spec.lines.map((k, j) => ({ k, j, c: tokOf(LINE[k]![3]), unit: LINE[k]![1], d: LINE[k]![2], Y: evY(bands[j]!, scales[j]!) }));
  const boxes: (readonly [number, number, number, number])[] = [];
  // Each axis: the left (the lower line) draws its tints first and its gridlines; the right keeps its cut-offs as dashed lines only, no tint. Both draw their cut-offs' lines and numbers
  // on their own side, a number dropped where it would touch another.
  lines.forEach((l) => {
    const sc = scales[l.j]!, left = l.j === 0, px = left ? L - 6 : R + 6, anchor = left ? 'end' : 'start', taken: number[] = [];
    const room = (y: number) => taken.every((q) => Math.abs(q - y) >= 1.15 * f);
    for (const z of left ? sc.zones : []) {
      const y0 = l.Y(z.b), y1 = l.Y(z.a), zl = z.target ? lk('cv.zone.fill') : lk('co.z', { rate: z.rate });
      shapes.push({ k: 'rect', x: L, y: y0, w: Math.max(1, R - L), h: Math.max(0, y1 - y0), fill: fillOf(zl) });
    }
    for (const cut of sc.cuts) {
      const y = l.Y(cut.v), tgt = sc.zones.some((z) => z.target);
      if (tgt) { const e = lk('cv.zone.edge'); shapes.push({ k: 'line', x1: L, x2: R, y1: y, y2: y, pen: { color: e.stroke!, w: e.width!, dash: e.dash } }); }
      else { const g = lk('plot.grid.line', { cut: true, rate: cut.rate }); shapes.push({ k: 'line', x1: L, x2: R, y1: y, y2: y, pen: { color: g.stroke!, w: g.width!, dash: g.dash } }); }
      // (The goal's name inside its band, under its edge, where the band is tall enough; else its number in the margin, green.)
      const zoneH = l.Y(sc.min) - y;
      if (tgt && zoneH >= 1.25 * f) {
        const tag = (hx: number, v: number, q: (typeof lines)[number]) => { const tw = evCw(withUnit(v, q.d, q.unit), f * 1.1, true), hy = q.Y(v); return [hx - tw - 0.6 * f, hx + tw + 0.6 * f, hy - 1.8 * f, hy - 0.4 * f] as const; };
        const name = `Variceal <${fmtN(cut.v)}`;
        const at = goalSpot(L, R, f, y, l.Y(sc.min), lines.map((q) => q.Y(before[q.j]!)), endv ? lines.map((q) => q.Y(endv[q.j]!)) : undefined,
          { w: evCw(name, f), start: lines.map((q) => tag(X(0), before[q.j]!, q)), end: lines.map((q) => tag(R, (endv || before)[q.j]!, q)) });
        say(at[0], at[2], name, lk('cv.zone.t'), { anchor: at[1] });
      } else if (room(y)) { taken.push(y); say(px, y + 0.35 * f, fmtN(cut.v), lk('cv.tc', { tc: cut.rate === 'ok' ? '' : cut.rate }), { anchor }); }
    }
    for (const v of [sc.max, sc.min]) {
      const y = l.Y(v);
      if (left) { const g = lk('plot.grid.line', { cut: false }); shapes.push({ k: 'line', x1: L, x2: R, y1: y, y2: y, pen: { color: g.stroke!, w: g.width! } }); }
      if (room(y)) say(px, y + 0.35 * f, fmtN(v), lk('time.grid.text', {}, l.c), { anchor });
      if (room(y)) taken.push(y);
      if (!left) boxes.push([R + 6, R + 6 + evCw(fmtN(v), f), y - 0.45 * f, y + 0.55 * f]);
    }
  });
  // The legend: each line's swatch, name and unit; the lower line's on the left, the upper's on the right (or under it).
  G.keysL.forEach((k, j) => {
    const right = j > 0 && G.oneRow, y = (j && !G.oneRow ? G.rowH : 0) + 0.75 * f, x0 = right ? G.w : 0, kc = tokOf(k.c);
    const kl = lk('time.key.line', {}, kc), kt = lk('time.key.text', {}, kc), ku = lk('time.key.unit');
    shapes.push({ k: 'line', x1: x0 + (right ? -16 : 0), x2: x0 + (right ? 0 : 16), y1: y, y2: y, pen: { color: kl.stroke!, w: kl.width!, cap: kl.cap } });
    if (right) { say(x0 - 22, y + 0.36 * f, k.name, kt, { anchor: 'end' }); say(x0 - 22 - cwReal(k.name, f, true) - cwReal(' ', f), y + 0.36 * f, k.unit, { ...ku, size: f }, { anchor: 'end' }); }
    else { say(x0 + 22, y + 0.36 * f, k.name, kt); say(x0 + 22 + cwReal(k.name, f, true), y + 0.36 * f, ` ${k.unit}`, { ...ku, size: f }); }
  });
  // The clock under the plot, "Before" (only where it fits over its seconds), and the change: a dashed line at 0 with its word.
  const axis = lk('time.axis.line');
  shapes.push({ k: 'line', x1: L, x2: R, y1: B, y2: B, pen: { color: axis.stroke!, w: axis.width! } });
  for (let s = -PRE_S; s <= EVENT_S + 1e-9; s += TICK_S) say(X(s), B + 1.25 * f, s > 0 ? `+${s}` : s < 0 ? `−${-s}` : '0', lk('time.tk'), { anchor: 'middle' });
  say(R + G.half, B + 1.25 * f, 's', lk('plot.ax'), { anchor: 'start' });
  const x0 = X(0), preW = x0 - X(-PRE_S);
  if (evCw('Before', f, true) + 8 <= preW) say((X(-PRE_S) + x0) / 2, T - 0.6 * f, 'Before', lk('ft.t', { meal: false }), { anchor: 'middle' });
  const ev = lk('ft.meal');
  shapes.push({ k: 'line', x1: x0, x2: x0, y1: T - 1.5 * f, y2: B, pen: { color: ev.stroke!, w: ev.width!, dash: ev.dash } });
  say(x0 + 6, T - 0.6 * f, spec.word, lk('ft.t', { meal: true }));
  // The lines up to t s: the flat stretch before the change, each point passed, then the head, its value over it.
  const n = run?.n ?? 0, pts = run?.pts;
  let m = 0;
  while (m < n && pts![3 * m]! < t) m++;
  const heads = lines.map((l) => {
    const b = l.Y(before[l.j]!), P: number[] = [X(-PRE_S), b, X(0), b];
    if (on) for (let q = 0; q < m; q++) P.push(X(pts![3 * q]!), l.Y(pts![3 * q + 1 + l.j]!));
    const v = valAt(run, before, l.j, t), hx = X(on ? t : 0), hy = l.Y(v);
    if (on && t > 0) P.push(hx, hy);
    const ln = lk('plot.line', {}, l.c);
    shapes.push({ k: 'path', pts: P, pen: { color: ln.stroke!, w: ln.width!, cap: ln.cap, join: ln.join } });
    return { l, v, hx, hy };
  });
  const valIdx: number[] = [];
  heads.forEach(({ l, v, hx, hy }) => {
    const txt = withUnit(v, l.d, l.unit), tw = evCw(txt, f * 1.1, true), left = headLeft(hx, hy, tw, f, w, boxes);
    const dot = lk('ft.dot', {}, l.c), vl = lk('ft.v', { off: false }, l.c);
    shapes.push({ k: 'circle', cx: hx, cy: hy, r: Math.max(4, f * 0.42), fill: dot.fill, pen: { color: dot.stroke!, w: dot.width! } });
    valIdx.push(shapes.length);
    shapes.push({ k: 'text', x: hx + (left ? -0.6 : 0.6) * f, y: hy - 0.7 * f, s: txt, size: vl.size!, weight: vl.weight, color: vl.fill!, anchor: left ? 'end' : 'start', ...(vl.halo ? { halo: vl.halo } : {}) });
  });
  // (Two heads close together: the lower band's value goes under its head, clear of the other.)
  if (Math.abs(heads[0]!.hy - heads[1]!.hy) < 1.4 * f) { const s = shapes[valIdx[0]!] as TextShape; shapes[valIdx[0]!] = { ...s, y: heads[0]!.hy + 1.5 * f }; }
  return { w, h, shapes, label: evLabel(spec, before, heads.map((q) => q.v), on, t) };
}
