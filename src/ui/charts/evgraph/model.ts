// The procedure's graph (2D: event-graph.js, the slide instrument tool { kind: 'evgraph' }): what a TIPS, BRTO or BATO does to two of the slide's readings, drawn as it happens.
// The same chart as the time-lapse graph (flowtime): the same plot, legend, lines, heads and looks, on a clock of its own: seconds of the model's clock around the moment the procedure
// changes the patient (0): PRE_S seconds before it, EVENT_S after. Pure: the spec, the scales (each fixed before anything is drawn, so nothing moves while the line runs), the
// geometry, and the run of points the model gives after the change. Lifted from event-graph.js (names and numbers are the 2D file's).
import { lcFirst } from '../../../engine/hales/portal/lc-first.js';
import { PPG_CUTS } from '../../../engine/hales/portal/pressure-cuts.js';
import { SCALE, RATE, PRESS } from '../../deck/from2d/table-marks.js';
import { LINE, withUnit } from '../flowtime/model.ts';
import { END_APART, STRETCH_MAX } from '../plot/scales.ts';
import { measure } from '../measure.ts';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// (The clock: seconds before the change, seconds after it, the step between the clock's numbers.)
export const PRE_S = 5, EVENT_S = 20, TICK_S = 5;
/** What the change is called over its line, for each procedure that makes one (a measurement, EUS-PPG, changes nothing and has no graph). */
export const EVENT_WORD: Record<string, string> = { tips: 'Stent open', tipscoil: 'Stent open', tipscoilin: 'Coils in', brto: 'Shunt occluded', brtoC6: 'Shunt occluded', bato: 'Varices obliterated' };

// proc-anim.js: the spec a slide's `procedure` plays ('brto', or { kind: 'brto', target: 'C6' } -> 'brtoC6').
const PLUG_TARGETS: Record<string, Record<string, string>> = { brto: { C5: 'brto', C6: 'brtoC6' }, tips: { C1a: 'tipscoil' } };
const PLUG_STENTED: Record<string, string> = { tipscoil: 'tipscoilin' };
export type Procedure = string | { kind: string; target?: string | null; stented?: boolean } | null | undefined;
export function procKindOf(proc: Procedure): string | null {
  const kind = typeof proc === 'string' ? proc : proc?.kind;
  if (!kind) return null;
  const t = typeof proc === 'object' && proc ? proc.target : null;
  const k = t == null ? kind : PLUG_TARGETS[kind]?.[t] || `${kind}:${t}`;
  return typeof proc === 'object' && proc?.stented && PLUG_STENTED[k] ? PLUG_STENTED[k]! : k;
}

/** The slide fields the graph reads (the 2D slide's). */
export interface EvSlide { procedure?: Procedure; visual?: unknown; lapse?: unknown; graph?: false | readonly string[]; tiles?: readonly string[] | { keys?: readonly string[] } }
export interface EvSpec { kind: string; word: string; lines: [string, string]; /** the PPG's goal after a TIPS, mmHg, on the line that has it */ target: number | null }

const isP = (k: string) => LINE[k]?.[1] === 'mmHg';
const NO_F = Object.freeze({});
const ORDER: Record<string, number> = { ok: 0, mid: 1, hi: 2 };
const rateAt = (k: string, v: number): string | null => { const r = (RATE as unknown as Record<string, (v: number, f: object) => readonly [string | null, string]>)[k]?.(v, NO_F)?.[0]; return r != null && r in ORDER ? r : null; };
const tilesOf = (s: EvSlide): readonly string[] => (Array.isArray(s.tiles) ? s.tiles : (s.tiles as { keys?: readonly string[] } | undefined)?.keys ?? []);

/** The two lines a procedure slide's graph plots, [lower, upper] (a pressure takes the lower place), or null when it has none. */
export function eventLines(s: EvSlide | null | undefined): [string, string] | null {
  if (!s || s.visual || s.lapse || s.graph === false || !EVENT_WORD[procKindOf(s.procedure) ?? '']) return null;
  const want = Array.isArray(s.graph) ? s.graph : tilesOf(s);
  const keys = want.filter((k, j) => LINE[k] && !LINE[k]![5]?.given && (SCALE as Record<string, unknown>)[k] && want.indexOf(k) === j).slice(0, 2);
  if (keys.length < 2) return null;
  return (isP(keys[1]!) && !isP(keys[0]!) ? [keys[1]!, keys[0]!] : [keys[0]!, keys[1]!]);
}

/** The slide's graph: { kind, word, lines, target }, or null. */
export function eventGraphOf(s: EvSlide | null | undefined): EvSpec | null {
  const lines = eventLines(s), kind = procKindOf(s?.procedure);
  return lines && kind ? { kind, word: EVENT_WORD[kind]!, lines, target: (kind === 'tips' || kind === 'tipscoil' || kind === 'tipscoilin') && lines[0] === 'ppg' ? PPG_CUTS.red : null } : null;
}

const NICE = [1, 2, 2.5, 5, 10];
const niceStep = (raw: number) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9)))); return NICE.find((s) => s * p >= raw - 1e-9)! * p; };
export interface EvZone { a: number; b: number; rate: string | null; target?: boolean }
export interface EvCut { v: number; rate: string | null }
export interface EvScale { min: number; max: number; cuts: EvCut[]; zones: EvZone[] }
/**
 * A line's scale, fixed before it is drawn: { min, max, cuts, zones } in the units the chart prints. vals: the values it will show (where it starts, where it ends, in the model's
 * units). A pressure runs from zero; the rest from its tile's scale start. The top is the first round number over the highest value with room for its head, and over the cut-off it
 * is judged by. Cuts: the tile's own (a pressure's red one only); zones: the stretches between them that rate amber or red, tinted. target: a goal below which the line should land.
 */
export function eventScale(k: string, vals: readonly (number | undefined)[], target: number | null = null, room = 1): EvScale {
  const sc = (SCALE as unknown as Record<string, [number, number, number[]]>)[k]!, x = LINE[k]?.[4] ?? 1, pr = isP(k) || PRESS.has(k);
  const min = pr ? 0 : sc[0];
  const shown = vals.filter((v): v is number => Number.isFinite(v)).map((v) => v * x);
  const cutsAll = sc[2].filter((c) => c > min);
  const cutsIn = pr ? cutsAll.slice(-1) : cutsAll;
  const need = min + (Math.max(min + 1e-6, ...shown.map((v) => v * 1.12), ...(target ? [target * 1.25] : cutsIn.map((c) => c * 1.15))) - min) * room;
  const step = niceStep((need - min) / 5), max = Math.ceil((need - min) / step - 1e-9) * step + min;
  if (target) return { min, max, cuts: [{ v: target, rate: 'ok' }], zones: [{ a: min, b: target, rate: 'ok', target: true }] };
  const eps = (max - min) * 1e-4;
  const cuts = cutsIn.filter((c) => c < max).map((c) => {
    const a = rateAt(k, (c - eps) / x), b = rateAt(k, (c + eps) / x);
    return { v: c, rate: ORDER[a ?? ''] !== undefined && ORDER[a!]! >= (ORDER[b ?? ''] ?? -1) ? a : b };
  }).filter((c) => c.rate && c.rate !== 'ok');
  const edges = [min, ...cuts.map((c) => c.v), max];
  const zones = edges.slice(0, -1).map((a, j) => ({ a, b: edges[j + 1]!, rate: rateAt(k, (a + edges[j + 1]!) / 2 / x) })).filter((z) => z.rate === 'mid' || z.rate === 'hi');
  return { min, max, cuts, zones };
}

/** The graph's two scales, [lower line's, upper's], for a spec and where its lines start (b) and are expected to end (end: or null). When the two lines would END on nearly one spot
 *  (closer than END_APART of the plot's height), ONE axis gets more room over its line, in round steps, until they stand clear; never squeezed past STRETCH_MAX of its own fit. */
export function eventScales(spec: EvSpec, b: readonly number[], end: readonly number[] | null = null): [EvScale, EvScale] {
  const x = spec.lines.map((k) => LINE[k]?.[4] ?? 1);
  const mk = (j: 0 | 1, room = 1) => eventScale(spec.lines[j], [b[j], end?.[j]], j === 0 ? spec.target : null, room);
  const sc: [EvScale, EvScale] = [mk(0), mk(1)];
  if (!end || !end.every(Number.isFinite)) return sc;
  const fr = (j: number, S: EvScale[], v: number) => (v * x[j]! - S[j]!.min) / (S[j]!.max - S[j]!.min), apart = (S: EvScale[]) => Math.abs(fr(0, S, end[0]!) - fr(1, S, end[1]!));
  if (apart(sc) >= END_APART) return sc;
  let best: { S: [EvScale, EvScale]; span: number } | null = null;
  for (const j of (spec.target ? [1] : [1, 0]) as (0 | 1)[]) {
    for (const room of [1.25, 1.5, 2, 2.5, 3]) {
      const S: [EvScale, EvScale] = j ? [sc[0], mk(1, room)] : [mk(0, room), sc[1]], span = (S[j].max - S[j].min) / (sc[j].max - sc[j].min);
      if (span > STRETCH_MAX) break;
      const a = apart(S);
      if (a >= END_APART) { if (!best || span < best.span - 1e-9) best = { S, span }; break; }
    }
  }
  return best ? best.S : sc;
}

/** How far the graph's readings have taken the settled state's numbers t s after the change (0 to 1): none for the first 70% of its seconds, then a smooth glide, whole at the end. */
export function endMix(t: number, secs: number): number {
  const k = Math.min(1, Math.max(0, (t / secs - 0.7) / 0.3));
  return k * k * (3 - 2 * k);
}
/** What the graph is handed for the model's reading f at t s: the two lines' values, taken toward the settled state's numbers at the end (event-graph's caller, presenter-case.js evRun). */
export function evSample(spec: EvSpec, t: number, f: Readonly<Record<string, number | null | undefined>>, settled: Readonly<Record<string, number | null | undefined>> | null): [number, number] {
  const [a, b] = spec.lines, e = settled, w = e && Number.isFinite(e[a]) && Number.isFinite(e[b]) ? endMix(t, EVENT_S) : 0;
  const fa = f[a] as number, fb = f[b] as number;
  return w ? [fa + ((e![a] as number) - fa) * w, fb + ((e![b] as number) - fb) * w] : [fa, fb];
}

/** Where the goal's name ("Variceal <12") goes in its band: [x, anchor, baseline y]: the first spot no line stands in (the left under the band's edge, the right, then low in the band). */
export function goalSpot(L: number, R: number, f: number, edge: number, bottom: number, starts: readonly number[], ends: readonly number[] = starts,
  o: { w: number; start: readonly (readonly number[])[]; end: readonly (readonly number[])[] } | null = null): [number, 'start' | 'end', number] {
  const free = (levels: readonly number[], yb: number) => levels.every((v) => v < yb - 1.1 * f || v > yb + 0.4 * f);
  const clear = (side: 'start' | 'end', x: number, yb: number) => !o?.w || !o[side]?.some(([a, b, c, d]) => a! < (side === 'start' ? x + o.w : x) && b! > (side === 'start' ? x : x - o.w) && c! < yb + 0.3 * f && d! > yb - 0.9 * f);
  const spots: [number, 'start' | 'end', number, readonly number[]][] = [[L + 0.5 * f, 'start', edge + 1.0 * f, starts], [R - 0.5 * f, 'end', edge + 1.0 * f, ends], [L + 0.5 * f, 'start', bottom - 0.5 * f, starts], [R - 0.5 * f, 'end', bottom - 0.5 * f, ends]];
  const at = spots.find(([x, side, yb, lv], i) => (i < 2 || bottom - edge >= 2.6 * f) && free(lv, yb) && clear(side, x, yb)) || spots[0]!;
  return [at[0], at[1], at[2]];
}

// ── The run: the points after the change ──
export const CAP = 600;   // (points kept after the change: a poll every 100 ms for EVENT_S, with room to spare; past it the newest overwrite the last)
/** The points after the change, [t, lower, upper] in the printed units, n of them; on: the change has happened. Mutable (the live model pushes into it); listeners hear each push. */
export class EvRun {
  pts = new Float64Array(3 * CAP);
  n = 0;
  on = false;
  private fns = new Set<() => void>();
  readonly lines: readonly [string, string];
  constructor(lines: readonly [string, string]) { this.lines = lines; }
  /** The change has happened: the seconds after it start from here. */
  start() { this.n = 0; this.on = true; this.fire(); }
  /** Back before the change: what was drawn after it goes. */
  reset() { this.n = 0; this.on = false; this.fire(); }
  /** A live reading t s after the change: v0, v1 the model's values of the two lines (model units). */
  push(t: number, v0: number, v1: number) {
    if (!this.on || !(t > 0) || !Number.isFinite(v0) || !Number.isFinite(v1)) return;
    if (this.n && t <= this.pts[3 * (this.n - 1)]!) return;
    const i = Math.min(this.n, CAP - 1) * 3;
    this.pts[i] = Math.min(t, EVENT_S); this.pts[i + 1] = v0 * (LINE[this.lines[0]]![4] ?? 1); this.pts[i + 2] = v1 * (LINE[this.lines[1]]![4] ?? 1);
    if (this.n < CAP) this.n++;
    this.fire();
  }
  /** The run as drawn, to show again whole (null before the change). */
  kept(): { pts: Float64Array; n: number } | null { return this.on && this.n ? { pts: this.pts.slice(0, 3 * this.n), n: this.n } : null; }
  /** A run played through before comes back whole. */
  restore(k: { pts: Float64Array; n: number } | null) { if (!k) return; this.pts.set(k.pts.subarray(0, 3 * k.n)); this.n = k.n; this.on = true; this.fire(); }
  /** The newest point's time: where the heads glide to. */
  get goal() { return this.on && this.n ? this.pts[3 * (this.n - 1)]! : 0; }
  subscribe(fn: () => void) { this.fns.add(fn); return () => { this.fns.delete(fn); }; }
  private fire() { for (const f of this.fns) f(); }
}

/** The value of line j at t (before the change, or with no point yet: where it started; between two points, straight between them). before: printed units. */
export function valAt(run: Pick<EvRun, 'pts' | 'n' | 'on'> | null, before: readonly number[], j: number, t: number): number {
  if (!run || !run.on || run.n === 0 || t <= 0) return before[j]!;
  const { pts, n } = run;
  if (t <= pts[0]!) { const k = t / Math.max(1e-9, pts[0]!); return before[j]! + (pts[1 + j]! - before[j]!) * k; }
  let i = 0;
  while (i < n - 1 && pts[3 * (i + 1)]! <= t) i++;
  if (i >= n - 1) return pts[3 * (n - 1) + 1 + j]!;
  const a = 3 * i, b = a + 3, k = (t - pts[a]!) / Math.max(1e-9, pts[b]! - pts[a]!);
  return pts[a + 1 + j]! + (pts[b + 1 + j]! - pts[a + 1 + j]!) * k;
}

// ── The layout ──
// A word's width as Inter sets it (measure.ts), as every other chart lays its words out. 2D's event-graph.js guessed `length * f * 0.6`, 'near enough' for its SVG text; the GPU chart's words are the real
// glyphs, and the guess put the last value ("32%", bold) 3.7 px past the box's right edge on a narrow card, cut off.
const cw = (t: string, f: number, b?: boolean | number) => measure(t, f, b ? 700 : 500);
export { cw as evCw };
export const fmtN = (v: number) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(1));
export interface EvKey { c: string; name: string; unit: string; w: number }
export interface EvGeo { w: number; h: number; f: number; half: number; keysL: EvKey[]; oneRow: boolean; rowH: number; keyH: number; L: number; R: number; T: number; B: number; FB: [number, number]; PB: [number, number] }
/** The geometry for a chart w × h px in type f px: the legend, the plot (both axes its full height), the clock under it. */
export function evGeo(spec: EvSpec, scales: readonly [EvScale, EvScale], w: number, h: number, f: number): EvGeo {
  const keysL = spec.lines.map((key) => { const [name, unit, , c] = LINE[key]!; return { c, name, unit, w: 22 + cw(name, f, true) + 6 + cw(unit, f) }; });
  const oneRow = keysL[0]!.w + keysL[1]!.w + 2 * f <= w, rowH = 1.5 * f, keyH = (oneRow ? 1 : 2) * rowH;
  const numW = (sc: EvScale) => Math.max(cw(fmtN(sc.min), f), cw(fmtN(sc.max), f), ...sc.cuts.map((c) => cw(fmtN(c.v), f, true)));
  const half = cw(`+${EVENT_S}`, f) / 2 + 6, L = Math.ceil(numW(scales[0]) + 14), R = Math.floor(w - Math.max(numW(scales[1]) + 14, half + f * 0.78 + 10));
  const T = keyH + 1.9 * f, B = h - 1.7 * f, ph = Math.max(4 * f, B - T);
  return { w, h, f, half, keysL, oneRow, rowH, keyH, L, R, T, B, FB: [T, T + ph], PB: [T, T + ph] };
}
export const evX = (G: EvGeo, t: number) => G.L + (G.R - G.L) * (clamp(t, -PRE_S, EVENT_S) + PRE_S) / (EVENT_S + PRE_S);
export const evY = (band: readonly [number, number], sc: EvScale) => (v: number) => band[1] - (band[1] - band[0]) * clamp((v - sc.min) / (sc.max - sc.min), 0, 1);
/** The height the chart takes at width w in type f (the flow-time chart's box: its card sizes it as that one). */
export const evHeight = (w: number, f: number) => Math.max(0.6 * w, 15 * f);

/** The chart in a sentence (event-graph.js paint's aria-label): "PPG and sinusoidal flow, 12 s after stent open: PPG 19.3 mmHg to 11.2 mmHg, …". */
export function evLabel(spec: EvSpec, before: readonly number[], vals: readonly number[], on: boolean, t: number): string {
  const ds = spec.lines.map((k) => LINE[k]![2]), us = spec.lines.map((k) => LINE[k]![1]);
  let label = `${LINE[spec.lines[0]]![0]} and ${lcFirst(LINE[spec.lines[1]]![0])}, ${on ? `${fmtN(Math.round(t))} s after` : 'before'} ${lcFirst(spec.word)}: `;
  for (let j = 0; j < 2; j++) label += `${j ? ', ' : ''}${LINE[spec.lines[j]!]![0]} ${on ? `${withUnit(before[j]!, ds[j]!, us[j]!)} to ` : ''}${withUnit(vals[j]!, ds[j]!, us[j]!)}`;
  return label;
}
