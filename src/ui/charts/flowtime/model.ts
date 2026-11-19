// Two readings over time on one chart (2D: flow-time.js, the presenter's flow-time tool): the portal pressure and flow around a meal, or two of a slide's readings over the days of its
// time-lapse. Two y-axes (the lower line on the left, the upper on the right), each fitted tight to its own line. Pure: the series, the scales, the geometry and where the first values stand.
import { READING_COLOUR as RC } from '../plot/reading-colours.generated.js';
import { decOf, pairScales, yOf, niceStep, type Scale, type ScaleOpt } from '../plot/scales.ts';
import { placeStarts, type Box } from '../plot/labels.ts';
import { measure } from '../measure.ts';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const tokOf = (v: string) => v.replace(/^--/, '');
export const cw = (t: string, f: number, bold = false) => measure(t, f, bold ? 700 : 500);

export const MINUTES = { from: -10, rise: 30, end: 40 };
export interface Axis { from: number; rise: number; end: number }
interface LineOpt extends ScaleOpt { given?: boolean; base?: number }
type LineDef = readonly [name: string, unit: string, decimals: number, colour: string, mult?: number, opt?: LineOpt];
/** The lines a chart can plot (fingerprint keys): name, unit, decimals, colour token, a scale on the model's value and options. */
export const LINE: Record<string, LineDef> = {
  pv: ['Portal pressure', 'mmHg', 1, tokOf(RC.pv)], ppg: ['PPG', 'mmHg', 1, tokOf(RC.ppg)], pvFlow: ['Portal flow', 'L/min', 1, tokOf(RC.pvFlow)],
  sin: ['Sinusoids', 'mmHg', 1, tokOf(RC.sin)], asc: ['Ascites', 'L', 1, tokOf(RC.asc), 0.001],
  hvpg: ['HVPG', 'mmHg', 1, tokOf(RC.hvpg)], varix: ['Varix', 'mm', 1, tokOf(RC.varix)],
  wt: ['Body weight', '% of start', 0, tokOf(RC.wt), 1, { given: true, base: 100, scale: [84, 100, 4] }], lsm: ['Stiffness', 'kPa', 1, tokOf(RC.lsm), 1, { pad: 0.15 }],
  ssm: ['Spleen stiffness', 'kPa', 1, tokOf(RC.ssm), 1, { pad: 0.15 }], salb: ['Albumin', 'g/dL', 1, tokOf(RC.salb), 1, { pad: 0.2 }],
  rpp: ['Abdominal perfusion pressure', 'mmHg', 0, tokOf(RC.rpp)], he: ['Encephalopathy risk', 'index', 2, tokOf(RC.he), 1, { pad: 0.2 }],
  gv: ['Fundal varix', 'mm', 1, tokOf(RC.gv)], liver: ['Sinusoidal flow', '%', 0, tokOf(RC.liver), 1, { pad: 0.2 }], map: ['Mean arterial pressure', 'mmHg', 0, tokOf(RC.map)], co: ['Cardiac output', 'L/min', 1, tokOf(RC.co), 1, { pad: 0.2 }],
};
export const MEAL_LINES = ['pv', 'pvFlow'] as const;
const opt = (k: string): LineOpt => LINE[k]?.[5] || {};
export const modelLines = (lines: readonly string[]) => lines.filter((k) => !opt(k).given);
export const trailKeys = (tool: { lines?: readonly string[] } | null | undefined) => (tool?.lines ? modelLines(tool.lines) : true);
export const withUnit = (v: number, d: number, unit: string) => `${v.toFixed(d)}${unit[0] === '%' ? '%' : ` ${unit}`}`;

export type Trail = readonly (readonly number[])[];
export interface FlowSeries { min: number[]; pv: number[]; flow: number[]; pScale: Scale; fScale: Scale; ax: Axis }
export interface FlowView { scales?: Record<string, readonly [number, number, number]>; before?: Record<string, number> }

/** trail: [[day, ...the model's lines], ...] → the series one value a step from ax.from to ax.end, each one's scale, and the axis. */
export function flowTimeSeries(trail: Trail | null | undefined, clock: 'meal' | 'days' = 'meal', lines: readonly string[] = MEAL_LINES, given: Record<string, number> | null = null, view: FlowView | null = null): FlowSeries | null {
  const model = modelLines(lines), col = (k: string) => 1 + model.indexOf(k);
  const pts = (trail || []).filter((r) => r && model.every((k) => Number.isFinite(r[col(k)])));
  if (pts.length < 2 || lines.some((k) => opt(k).given && !Number.isFinite(given?.[k]))) return null;
  const d0 = pts[0]![0]!, span = Math.max(1e-6, pts.at(-1)![0]! - d0);
  const ax: Axis = clock === 'days' ? { from: 0, rise: Math.max(1, Math.round(span)), end: Math.max(1, Math.round(span)) } : MINUTES;
  const x = lines.map((k) => LINE[k]?.[4] ?? 1);
  const at = (j: number, m: number) => {
    const p = clamp(m / ax.rise, 0, 1), k = lines[j]!;
    if (opt(k).given) return (((opt(k).base || 0) - (opt(k).base ? 1 : -1) * given![k]! * p) * x[j]!);
    const d = d0 + span * p, i = clamp(pts.findIndex((r) => r[0]! >= d), 1, pts.length - 1);
    const f = clamp((d - pts[i - 1]![0]!) / Math.max(1e-9, pts[i]![0]! - pts[i - 1]![0]!), 0, 1);
    return (pts[i - 1]![col(k)]! + (pts[i]![col(k)]! - pts[i - 1]![col(k)]!) * f) * x[j]!;
  };
  const min = Array.from({ length: ax.end - ax.from + 1 }, (_, k) => ax.from + k);
  const lead = clock === 'days' && view?.before && lines.every((k) => Number.isFinite(view.before![k])) ? 1 : 0;
  const col0 = (j: number) => Array.from({ length: min.length }, (_, k) => (k < lead ? view!.before![lines[j]!]! * x[j]! : at(j, min[k]!)));
  const pv = col0(0), flow = col0(1);
  const o = (j: number): LineOpt => (view?.scales?.[lines[j]!] ? { ...opt(lines[j]!), scale: view.scales[lines[j]!] } : opt(lines[j]!));
  const [pScale, fScale] = pairScales(pv, flow, o(0), o(1), !opt(lines[0]!).given && !opt(lines[1]!).given && LINE[lines[0]!]?.[1] === LINE[lines[1]!]?.[1]);
  return { min, pv, flow, pScale, fScale, ax };
}
/** The chart's own reading of each model line at share p (0 to 1) of its time-lapse: the trail's value there, the number its head prints. */
export function trailReading(trail: Trail | null | undefined, lines: readonly string[], p: number): Record<string, number> | null {
  const model = modelLines(lines), col = (k: string) => 1 + model.indexOf(k);
  const pts = (trail || []).filter((r) => r && model.every((k) => Number.isFinite(r[col(k)])));
  if (pts.length < 2 || !model.length) return null;
  const d0 = pts[0]![0]!, span = Math.max(1e-6, pts.at(-1)![0]! - d0), d = d0 + span * clamp(p, 0, 1), i = clamp(pts.findIndex((r) => r[0]! >= d), 1, pts.length - 1);
  const f = clamp((d - pts[i - 1]![0]!) / Math.max(1e-9, pts[i]![0]! - pts[i - 1]![0]!), 0, 1), out: Record<string, number> = {};
  for (const k of model) out[k] = pts[i - 1]![col(k)]! + (pts[i]![col(k)]! - pts[i - 1]![col(k)]!) * f;
  return out;
}

export interface KeyInfo { c: string; name: string; unit: string; w: number }
export const legendOf = (keys: readonly string[], f: number): KeyInfo[] => keys.map((key) => { const [name, unit, , c] = LINE[key]!; return { c, name, unit, w: 22 + cw(name, f, true) + 6 + cw(unit, f) }; });
const bandRoom = (rxN: number, f: number) => (rxN ? (1.4 + 0.32 * rxN) * f : 0);
export const rxGap = (rxN: number, f: number) => (rxN ? Math.max(3, f * 0.3) + 2 : 0);
/** The height the chart wants at width w in type f: room for both lines, its legend, clock and treatment bars. */
export function flowTimeHeight(w: number, f: number, keys: readonly string[] = MEAL_LINES, bandEm = 0): { min: number; preferred: number } {
  const legend = legendOf(keys, f), rows = legend[0]!.w + legend[1]!.w + 2 * f <= w ? 1 : 2, bands = bandEm * f;
  return { min: (rows * 1.5 + 1.9 + 1.7 + 6) * f + bands, preferred: Math.max(0.6 * w, 15 * f) + bands };
}
export interface Geo { w: number; h: number; f: number; half: number; meal: boolean; keysL: KeyInfo[]; oneRow: boolean; rowH: number; keyH: number; L: number; R: number; T: number; B: number; ix: number; iy: number; FB: [number, number]; PB: [number, number] }
/** The geometry for a chart w × h px in type f px (see flow-time.js flowGeo). */
export function flowGeo(ser: FlowSeries, clock: 'meal' | 'days', keys: readonly string[], rxN: number, w: number, h: number, f: number): Geo {
  const meal = clock !== 'days', keysL = legendOf(keys, f), ax = ser.ax;
  const oneRow = keysL[0]!.w + keysL[1]!.w + 2 * f <= w, rowH = 1.5 * f, legH = (oneRow ? 1 : 2) * rowH;
  const tw = (sc: Scale) => Math.max(...sc.ticks.map((v) => cw(v.toFixed(decOf(sc)), f)));
  const half = cw(`+${ax.end}`, f) / 2 + 6, L = Math.ceil(tw(ser.pScale) + 14 + rxGap(rxN, f)), R = Math.floor(w - Math.max(tw(ser.fScale) + 14, half + (meal ? 3 : 4) * f * 0.78 + 10));
  const T = legH + 1.9 * f, B = h - 1.7 * f - bandRoom(rxN, f), ph = Math.max(2 * f, B - T), ix = Math.max(4, f * 0.42) + 5, iy = 0.55 * f;
  return { w, h, f, half, meal, keysL, oneRow, rowH, keyH: legH, L, R, T, B, ix, iy, FB: [T, T + ph - iy], PB: [T, T + ph - iy] };
}
export const xAt = (G: Geo, ax: Axis, m: number) => G.L + G.ix + ((G.R - G.L - 2 * G.ix) * (m - ax.from)) / (ax.end - ax.from);
export const showsOf = (sc: Scale, Y: (v: number) => number, f: number) => {
  const gap = Math.abs(Y(sc.ticks[0]!) - Y(sc.ticks.at(-1)!)) / Math.max(1, sc.ticks.length - 1);
  return (j: number) => gap >= 1.3 * f || j === sc.ticks.length - 1 || (j === 0 && gap * (sc.ticks.length - 1) >= 1.3 * f);
};
function numberBoxes(G: Geo, sc: Scale, Y: (v: number) => number, side: 0 | 1, rxN: number): Box[] {
  const show = showsOf(sc, Y, G.f), x = side ? G.R + 6 : G.L - 6 - rxGap(rxN, G.f);
  return sc.ticks.flatMap((v, j) => { if (!show(j)) return []; const t = cw(v.toFixed(decOf(sc)), G.f), y = Y(v); return [[side ? x : x - t, side ? x + t : x, y - 0.45 * G.f, y + 0.55 * G.f] as Box]; });
}
/** [key, scale name, , colour, name, unit, decimals] per line: the lower line is 'pv' on the left axis, the upper 'flow' on the right. */
export type LineRow = readonly [slot: 'pv' | 'flow', scale: 'pScale' | 'fScale', null, colour: string, name: string, unit: string, decimals: number];
export const linesOf = (keys: readonly string[]): LineRow[] => keys.map((key, j) => { const [name, unit, d, c] = LINE[key]!; return j ? (['flow', 'fScale', null, c, name, unit, d] as const) : (['pv', 'pScale', null, c, name, unit, d] as const); });

export interface StartPlan { ls: { k: 'pv' | 'flow'; unit: string; d: number; Y: (v: number) => number }[]; own: [number, number, number][]; circles: [number, number, number][]; right: Box[]; starts: { x: number; y: number; box: Box; txt: string; r: number }[]; left: Box[]; rects: Box[] }
/** Everything the first values and head labels keep clear of, and where the first values stand. */
export function startPlan(G: Geo, ser: FlowSeries, LINES: readonly LineRow[], rxN: number): StartPlan {
  const f = G.f, ax = ser.ax, rs = Math.max(3, f * 0.3) + 2, rd = Math.max(4, f * 0.42) + 2;
  const ls = LINES.map(([k, s, , , , unit, d]) => ({ k, unit, d, Y: yOf(k === 'flow' ? G.FB : G.PB, ser[s]) }));
  const left = numberBoxes(G, ser.pScale, ls[0]!.Y, 0, rxN), right = numberBoxes(G, ser.fScale, ls[1]!.Y, 1, rxN);
  const x0 = xAt(G, ax, ax.from), x1 = xAt(G, ax, ax.end), xm = xAt(G, ax, 0), rects: Box[] = [...left, ...right], soft: Box[] = [];
  const lines = ls.map((l) => ser.min.map((m, j) => [xAt(G, ax, m), l.Y(ser[l.k][j]!)] as [number, number]));
  if (G.meal) {
    const fw = cw('Fasting', f, true), mw = cw('Meal', f, true), ty = G.T - 0.6 * f;
    rects.push([(x0 + xm) / 2 - fw / 2, (x0 + xm) / 2 + fw / 2, ty - 0.78 * f, ty + 0.25 * f], [xm + 6, xm + 6 + mw, ty - 0.78 * f, ty + 0.25 * f]);
    soft.push([xm - 1, xm + 1, G.T - 1.5 * f, G.B]);
  }
  const own = ls.map((l) => [x0, l.Y(ser[l.k][0]!), rs] as [number, number, number]), circles = [...own, ...ls.map((l) => [x1, l.Y(ser[l.k].at(-1)!), rd] as [number, number, number])];
  const txt = ls.map((l) => withUnit(ser[l.k][0]!, l.d, l.unit));
  const at = placeStarts({ f, area: [3, G.w - 3, G.keyH + 0.1 * f + 3, G.B - 1], texts: txt, own, circles, lines, rects, soft, width: (t) => cw(t, f, true) });
  return { ls, own, circles, right, left, rects, starts: at.map((a, i) => ({ x: a.x, y: a.y, box: a.box, txt: txt[i]!, r: rs })) };
}
/** Whether a line's value goes left of its head: when drawn right of it, it would run off the chart or onto a number in the right margin. */
export function headLeft(hx: number, hy: number, tw: number, f: number, w: number, boxes: readonly Box[] = []): boolean {
  const x0 = hx + 0.6 * f, x1 = x0 + tw, y1 = hy - 0.7 * f + 0.25 * f, y0 = y1 - 1.1 * f;
  if (x1 > w) return true;
  for (const q of boxes) if (x0 < q[1] && q[0] < x1 && y0 < q[3] && q[2] < y1) return true;
  return false;
}
/** The clock's tick marks: every 10 min on the meal clock, else a nice step that leaves room for the numbers. */
export function clockTicks(G: Geo, ax: Axis): number[] {
  const step = G.meal ? 10 : niceStep(ax.end / Math.max(2, Math.min(4, Math.floor((G.R - G.L) / (4 * G.f)))));
  const out: number[] = [];
  for (let m = ax.from; m <= ax.end + 1e-9; m += step) out.push(m);
  return out;
}
export { yOf, decOf };
