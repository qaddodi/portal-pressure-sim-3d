// The change-from-healthy chart as a frame (2D: tool-shift.js build(); looks: chart-looks/shift.js, plot.js, time.js, talk.js). Everything that decides a place is shift/model.ts.
import type { ChartCtx } from '../Chart.tsx';
import type { Rgba } from '../colour.ts';
import { look, type Look } from '../looks.ts';
import { measure } from '../measure.ts';
import type { Frame, Shape } from '../scene.ts';
import {
  SHIFT_KEYS, SHIFT_LINE, SHIFT_LOW, SHIFT_TOP, SHIFT_MIN, endsLapse, fmtV, keepClear, lapseHead, lapsePts, litOf, monotone, pinStage, rowVals, shiftColour, shiftGeo, shiftScales, shiftY,
  shownCount, spread, thin, type Geo, type LapseState, type Readings, type Scales, type ShiftInput, type Trail,
} from './model.ts';

const isTop = (k: string) => (SHIFT_TOP as readonly string[]).includes(k);
const faint = (c: Rgba | undefined, k: number | undefined): Rgba | undefined => (c && k !== undefined ? [c[0], c[1], c[2], c[3] * k] : c);
const plotR = (w: number, h: number) => Math.max(0, Math.min(10, w / 4, h / 4));
const tw = (t: string, size: number, weight = 600) => measure(t, size, weight);

export interface ShiftSpec extends ShiftInput {
  /** a time-lapse playing: its stretch is drawn from its trail to `shown` of its days, the lines' heads on it */
  lapse?: LapseState | null;
  /** the box's height, px (the card gives it; the 2D fallback is 220) */
  height?: number;
}
export interface ShiftOut { frame: Frame; G: Geo; S: Scales; /** how many states show */ n: number }

/** The text of the chart in a sentence: each state shown with its six readings. */
export function shiftLabel(inp: ShiftInput, n: number, at: (i: number) => Readings): string {
  const ref = inp.vals[0]!;
  return 'Change from healthy: ' + inp.stages.slice(0, n).map((s, i) => `${s.name}, ${SHIFT_KEYS.map((k) => `${SHIFT_LINE[k]![0]} ${fmtV(k, isTop(k) ? 100 * at(i)[k]! / ref[k]! : at(i)[k]!)}${SHIFT_LINE[k]![1] === '%' ? '' : ` ${SHIFT_LINE[k]![1]}`}`).join(', ')}`).join('; ');
}

export function shiftFrame(spec: ShiftSpec, c: ChartCtx): ShiftOut {
  const { stages, vals, trails = [], lapse = null } = spec;
  const f = Math.max(SHIFT_MIN, c.type.sm), w = Math.max(200, c.w), h = Math.max(9 * f, spec.height ?? 220);
  const H = { host: 'shift', px: f };
  const lk = (key: string, state: Record<string, unknown> = {}, tone?: string): Look => look(c, H, key, state, tone ? { c: tone } : {});
  if (!vals[0]) return { frame: { w, h, shapes: [], label: 'Change from healthy' }, G: shiftGeo(w, h, f, stages.length, tw), S: null as unknown as Scales, n: 0 };
  const ref = vals[0]!;
  const G = shiftGeo(w, h, f, stages.length, tw), S = shiftScales(spec);
  const liveAt = pinStage(spec), ringOn = !!spec.whatIf;
  const n = shownCount(spec, lapse, liveAt);
  const live = spec.live && liveAt === n - 1 && !ringOn ? spec.live : null;   // (the last state follows the model when the readings move it)
  const at = (i: number): Readings => (i === n - 1 && live ? live : vals[i]!);
  const shapes: Shape[] = [];
  const say = (x: number, y: number, s: string, l: Look, o: Partial<Extract<Shape, { k: 'text' }>> = {}) => {
    shapes.push({ k: 'text', x, y, s, size: l.size ?? f, weight: l.weight, color: l.fill!, ...(l.halo ? { halo: l.halo } : {}), ...(l.upper ? { upper: true } : {}), ...(l.ls ? { ls: l.ls } : {}), ...o });
  };
  const panel = (y0: number, y1: number) => { const hh = y1 - y0 + 12; shapes.push({ k: 'rect', x: 0, y: y0 - 6, w: G.w, h: hh, r: plotR(G.w, hh), fill: lk('plot.bg').fill }); };
  panel(G.T1, G.B1); panel(G.T2, G.B2);
  const yTop = (v: number) => G.B1 - (G.B1 - G.T1) * (v - S.top.min) / (S.top.max - S.top.min);
  const showTick = (sc: { ticks: number[] }, Y: (v: number) => number, j: number) => j === 0 || j === sc.ticks.length - 1 || (Y(sc.ticks[0]!) - Y(sc.ticks[1]!)) >= 1.15 * f;
  const lowY = (sc: { min: number; max: number }) => (v: number) => G.B2 - (G.B2 - G.T2) * (v - sc.min) / (sc.max - sc.min);
  const pvY = lowY(S.pvs), splY = lowY(S.spls);
  // The upper panel's grid, its numbers on the left, the 100% line dashed, the panel's name over its numbers.
  const grid = lk('plot.grid.line'), ref100 = lk('shift.ref');
  S.top.ticks.forEach((v, j) => {
    const y = yTop(v);
    if (v === 100) shapes.push({ k: 'line', x1: G.L, x2: G.R, y1: y, y2: y, pen: { color: ref100.stroke!, w: ref100.width!, dash: ref100.dash } });
    else shapes.push({ k: 'line', x1: G.L, x2: G.R, y1: y, y2: y, pen: { color: grid.stroke!, w: grid.width! } });
    if (showTick(S.top, yTop, j) || v === 100) say(G.L - 6, y + 0.35 * f, String(v), lk('plot.grid.text'), { anchor: 'end' });
  });
  say(4, G.T1 - 10, '% of healthy', lk('shift.panel'));
  // The lower panel: the gridlines of the portal pressure's axis, its numbers on the left in its colour, the inflow's on the right in its own.
  const fine = S.spls.ticks.some((t) => Math.abs(t * 10 - Math.round(t * 10)) > 1e-6);
  S.pvs.ticks.forEach((v, j) => {
    shapes.push({ k: 'line', x1: G.L, x2: G.R, y1: pvY(v), y2: pvY(v), pen: { color: grid.stroke!, w: grid.width! } });
    if (showTick(S.pvs, pvY, j)) say(G.L - 6, pvY(v) + 0.35 * f, String(+v.toFixed(1)), lk('time.grid.text', {}, shiftColour('pv')), { anchor: 'end' });
    if (showTick(S.spls, splY, j) && S.spls.ticks[j] != null) say(G.R + 6, pvY(v) + 0.35 * f, S.spls.ticks[j]!.toFixed(fine ? 2 : 1), lk('time.grid.text', {}, shiftColour('spl')), { anchor: 'start' });
  });
  say(4, G.T2 - 10, 'mmHg', lk('shift.panel'));
  say(G.R + G.numR, G.T2 - 10, 'L/min', lk('shift.panel'), { anchor: 'end' });
  // A faint upright line at each state shown, through both panels.
  const mark = lk('talk.mark.line');
  for (let i = 0; i < n; i++) shapes.push({ k: 'line', x1: G.X(i), x2: G.X(i), y1: G.T1 - 2, y2: G.B2 + 2, pen: { color: mark.stroke!, w: mark.width!, dash: mark.dash } });
  // The lines: one piece a stretch, so a slide's new stretch is a new piece and the old ones stay paired (they hold still).
  const heads: Record<string, { hx: number; hy: number; v: number }> = {};
  for (const k of SHIFT_KEYS) {
    const tone = shiftColour(k), dim = !litOf(spec.lit, k), st = { dim };
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < n; i++) { xs.push(G.X(i)); ys.push(shiftY(G, S, ref, k, at(i)[k]!)); }
    const segs = monotone(xs, ys), ln = lk('shift.line', st, tone);
    const pen = (l: Look) => ({ color: faint(l.stroke, l.opacity)!, w: l.width!, cap: l.cap, join: l.join });
    for (let i = 1; i < n; i++) {
      const tr = endsLapse(stages, i) ? trails[i] : null;
      const pts = tr?.length ? lapsePts(G, S, ref, k, i, tr) : segs[i - 1]!;
      shapes.push({ k: 'path', pts: pts.flat(), pen: pen(ln) });
    }
    if (lapse) {
      // the days' stretch from the trail up to the head, and the head's dot on its end
      const hd = lapseHead(G, S, ref, k, lapse.i, lapse.trail, lapse.shown);
      shapes.push({ k: 'path', pts: hd.pts.flat(), pen: pen(ln) });
      heads[k] = hd;
    }
    const dot = lk('shift.dot', st, tone), dotFill = faint(dot.fill, dot.opacity), dotPen = { color: faint(dot.stroke, dot.opacity)!, w: dot.width! };
    for (let i = 0; i < n; i++) shapes.push({ k: 'circle', cx: xs[i]!, cy: ys[i]!, r: i === n - 1 && !lapse ? 4.5 : 3.25, fill: dotFill, pen: dotPen });
    if (ringOn && n && spec.live && !lapse) {
      const rg = lk('shift.ring', st, tone);
      shapes.push({ k: 'circle', cx: xs[n - 1]!, cy: shiftY(G, S, ref, k, spec.live[k]!), r: 4.5, fill: faint(rg.fill, rg.opacity), pen: { color: faint(rg.stroke, rg.opacity)!, w: rg.width! } });
    }
    if (heads[k]) shapes.push({ k: 'circle', cx: heads[k]!.hx, cy: heads[k]!.hy, r: 4.5, fill: dotFill, pen: dotPen });
  }
  // The right column: every line's short name and its value at the last state (the ring's, the head's), spread so none touch.
  const endVals = (k: string) => (lapse ? heads[k]?.v ?? null : ringOn && spec.live ? spec.live[k]! : n ? at(n - 1)[k]! : null);
  const endY = (k: string) => { const v = lapse ? rowVals(lapse.trail.at(-1))![k]! : endVals(k); return v == null ? null : shiftY(G, S, ref, k, v); };
  for (const [keys, lo, hi] of [[SHIFT_TOP, G.T1 + 0.4 * f, G.B1 - 0.2 * f], [SHIFT_LOW, G.T2 + 0.4 * f, G.B2 - 0.2 * f]] as const) {
    const ys = keys.map((k) => endY(k) ?? (lo + hi) / 2), at2 = spread(ys, 1.2 * f, lo, hi);
    keys.forEach((k, q) => {
      const tone = shiftColour(k), st = { dim: !litOf(spec.lit, k) }, y = at2[q]!, v = endVals(k), name = SHIFT_LINE[k]![0], x = G.colX + 12;
      const sw = lk('shift.swatch', st, tone);
      shapes.push({ k: 'rect', x: G.colX, y: y - 1.5, w: 8, h: 3, r: 1.5, fill: faint(sw.fill, sw.opacity) });
      say(x, y + 0.35 * f, name, lk('shift.lbl.n', st));
      say(x + tw(name, f, 700) + 5, y + 0.35 * f, v == null ? '' : fmtV(k, isTop(k) ? 100 * v / ref[k]! : v), lk('shift.lbl.v', st));
    });
  }
  // The states' names under the lower panel: the last shown always, the others where they stand clear.
  const m = lapse ? lapse.i + 1 : n, xs = Array.from({ length: m }, (_, i) => G.X(i)), names = stages.slice(0, m).map((s) => s.name);
  const keep = keepClear(xs, names.map((t, i) => tw(t, 0.92 * f, i === m - 1 ? 700 : 500)), G.R + G.numR);
  names.forEach((t, i) => {
    if (!keep.has(i)) return;
    const l = lk('shift.stage', { now: i === m - 1 });
    say(xs[i]!, G.nameY, t, { ...l, size: l.size ?? 0.92 * f }, { anchor: i === 0 && xs[i]! - tw(t, 0.92 * f) / 2 < 2 ? 'start' : 'middle' });
  });
  return { frame: { w: G.w, h: G.h, shapes, label: shiftLabel(spec, n, at) }, G, S, n };
}

export type { Trail };
export { thin };
