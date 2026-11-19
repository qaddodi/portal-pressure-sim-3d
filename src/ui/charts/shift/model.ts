// The change from healthy (2D: tool-shift.js, host 'shift'; looks: chart-looks/shift.js, plot.js, time.js, talk.js). One chart that holds across a talk's slides: the x axis is the
// talk's states in order, one slot each, fixed from the first slide; a slot shows only once its slide is reached. Upper panel: the cardiac output, the systemic vascular resistance,
// the MAP and the blood volume as % of the first state (healthy), on one axis, with a dashed line at 100%. Lower panel: the portal pressure (mmHg, left axis) and the splanchnic
// arterial inflow (L/min, right axis), each fitted to its own line (pairScales). Each line is smooth through its states and never overshoots one (a monotone cubic); a time-lapse's
// stretch is the model's own day-by-day trail. The slide's `key` lights the lines it teaches (the others stay, faint). The right column names every line with its value.
// This file is the pure part: every number below is the 2D file's, lifted, with the DOM and the svg-gl calls taken out (the frame is shift/frame.ts).
import { pairScales, type Scale } from '../plot/scales.ts';
import { READING_COLOUR } from '../plot/reading-colours.generated.js';

export type Readings = Readonly<Record<string, number>>;
/** A trail row: [day, ...the SHIFT_KEYS' values]. */
export type TrailRow = readonly number[];
export type Trail = readonly TrailRow[];
export interface Stage { j: number; k: number; start: boolean; name: string }
/** The slide fields the chart reads: tool.kind 'shift', tick (the state's name), lapse { from, to }, title. */
export interface ShiftSlide { tool?: { kind?: string } | null; lapse?: { from?: string; to?: string } | null; tick?: string; title?: string; key?: string | readonly string[]; whatIf?: unknown }

// The readings: [key, short name, unit, decimals]. The upper panel's read as % of the first state.
export const SHIFT_TOP = ['co', 'svr', 'map', 'bv'] as const;
export const SHIFT_LOW = ['pv', 'spl'] as const;
export const SHIFT_KEYS: readonly string[] = [...SHIFT_TOP, ...SHIFT_LOW];
export const SHIFT_LINE: Record<string, readonly [name: string, unit: string, decimals: number]> = {
  co: ['CO', '%', 0], svr: ['SVR', '%', 0], map: ['MAP', '%', 0], bv: ['Volume', '%', 0],
  pv: ['Portal', 'mmHg', 1], spl: ['Inflow', 'L/min', 2],
};
/** A reading's colour token (reading-colours.js, the one table), without the leading dashes. */
export const shiftColour = (k: string): string => (READING_COLOUR as Record<string, string>)[k]!.replace(/^--/, '');
export const SHIFT_MIN = 12;   // (px on the screen: the smallest the chart's words are drawn)
export const SEG = 10;   // (points drawn between two states)
export const LAPSE_PTS = 60;   // (points a time-lapse's stretch is drawn with, from its trail)
export const MOVED = 0.004;   // (a share of a reading: the state has moved off the one before once any reading has moved by more)
const isTop = (k: string) => (SHIFT_TOP as readonly string[]).includes(k);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** The deck's states on the chart, in order: [{ j (the slide that brings it), k (its state), start (a time-lapse's first day), name }]. stateOf: the slide index → its state key (the deck's own). */
export function shiftStages(slides: readonly (ShiftSlide | null | undefined)[] | null | undefined, stateOf?: readonly number[] | null): Stage[] {
  const out: Stage[] = [], seen = new Set<number>();
  (slides || []).forEach((s, j) => {
    if (s?.tool?.kind !== 'shift') return;
    const k = stateOf ? stateOf[j]! : j;
    if (seen.has(k)) return;
    seen.add(k);
    if (s.lapse) out.push({ j, k, start: true, name: s.lapse.from || 'Before' });
    out.push({ j, k, start: false, name: s.tick || s.lapse?.to || s.title || `Slide ${j + 1}` });
  });
  return out;
}
/** A trail row ([day, ...SHIFT_KEYS]) as readings. */
export const rowVals = (r: TrailRow | null | undefined): Record<string, number> | null => (r ? Object.fromEntries(SHIFT_KEYS.map((k, i) => [k, r[i + 1]!])) : null);
/** What a slide's state holds for the chart: its fingerprint, the time-lapse's trail, and the state the days start from. */
export interface StageState { fp?: Readings | null; trail?: Trail | null; start?: { fp?: Readings | null } | null }
/** A stage's readings from its slide's state: a time-lapse's first day is its trail's first row (else its start state). */
export function stageVals(stage: Stage, st: StageState | null | undefined): Readings | null {
  if (!st) return null;
  const v = stage.start ? (st.trail?.length ? rowVals(st.trail[0]) : st.start?.fp) : st.fp;
  return v && SHIFT_KEYS.every((k) => Number.isFinite(v[k])) ? v : null;
}
/** Whether readings b have moved off readings a (any by more than MOVED of a's). */
export const movedFrom = (a: Readings | null | undefined, b: Readings | null | undefined): boolean => !!a && !!b && SHIFT_KEYS.some((k) => Math.abs(b[k]! - a[k]!) > MOVED * Math.max(Math.abs(a[k]!), 1e-6));

export interface TopScale { min: number; max: number; step: number; ticks: number[] }
/** The upper panel's axis over the % values vs (100 always a tick): steps of 20, 25 or 50, as the span needs. */
export function topScale(vs: readonly number[]): TopScale {
  const lo0 = Math.min(100, ...vs), hi0 = Math.max(100, ...vs), span = hi0 - lo0;
  const step = span > 130 ? 50 : span > 100 ? 25 : 20;   // (steps that 100 is a multiple of, so the healthy line is always a gridline)
  const min = 100 - Math.ceil((100 - (lo0 - 0.06 * span)) / step) * step, max = 100 + Math.ceil((hi0 + 0.06 * span - 100) / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(v);
  return { min, max, step, ticks };
}
/** Points along a monotone cubic through (xs, ys) (Fritsch-Carlson: smooth, and never past a state's own value), seg points between each two; one stretch per two states (each starts at its first state). */
export function monotone(xs: readonly number[], ys: readonly number[], seg = SEG): [number, number][][] {
  const n = xs.length;
  if (n < 2) return [];
  const d: number[] = [], m: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / ((xs[i + 1]! - xs[i]!) || 1e-9));
  m[0] = d[0]!; m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i]! / d[i]!, b = m[i + 1]! / d[i]!, s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]!; m[i + 1] = t * b * d[i]!; }
  }
  const out: [number, number][][] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1]! - xs[i]!, pts: [number, number][] = [[xs[i]!, ys[i]!]];
    for (let q = 1; q <= seg; q++) {
      const t = q / seg, t2 = t * t, t3 = t2 * t;
      const y = (2 * t3 - 3 * t2 + 1) * ys[i]! + (t3 - 2 * t2 + t) * h * m[i]! + (-2 * t3 + 3 * t2) * ys[i + 1]! + (t3 - t2) * h * m[i + 1]!;
      pts.push([xs[i]! + t * h, y]);
    }
    out.push(pts);
  }
  return out;
}
/** A trail cut down to about n rows, its first and last kept. */
export function thin(trail: Trail | null | undefined, n = LAPSE_PTS): TrailRow[] {
  if (!trail || trail.length <= n) return trail ? [...trail] : [];
  const out: TrailRow[] = [], step = (trail.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(trail[Math.round(i * step)]!);
  return out;
}
/** The right column's labels, top to bottom, never closer than gap, inside [lo, hi]: ys in, placed ys out (same order). */
export function spread(ys: readonly number[], gap: number, lo: number, hi: number): number[] {
  const ord = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]), at: number[] = new Array(ys.length);
  let prev = -Infinity;
  for (const [y, i] of ord) { const p = Math.max(y, prev + gap, lo); at[i] = p; prev = p; }
  // (pushed past the bottom: the run is moved up as a whole, never under the panel)
  const over = Math.max(0, prev - hi);
  if (over) for (let i = 0; i < at.length; i++) at[i]! -= over;
  return at;
}
/** The names under the lower panel to keep, right to left, the last always: each clear of the one after it (talk-trace.js keepClear). */
export function keepClear(xs: readonly number[], ws: readonly number[], W: number, gap = 8): Set<number> {
  const kept = new Set<number>();
  for (let i = xs.length - 1, edge = Infinity; i >= 0; i--) {
    const half = ws[i]! / 2;
    if (i === xs.length - 1 || (xs[i]! + half + gap <= edge && xs[i]! - half >= 0 && xs[i]! + half <= W)) { kept.add(i); edge = xs[i]! - half; }
  }
  return kept;
}
/** A reading as the right column and the label print it: % rounded, the others to their decimals. */
export const fmtV = (k: string, v: number): string => (SHIFT_LINE[k]![1] === '%' ? `${Math.round(v)}%` : v.toFixed(SHIFT_LINE[k]![2]));

/** What the chart is told: the deck's states and their readings, where the talk is, and what the slide asks of it. */
export interface ShiftInput {
  stages: readonly Stage[];
  /** each stage's readings (null: its slide's state is not worked out yet) */
  vals: readonly (Readings | null)[];
  /** each stage's time-lapse trail (the state of the slide that brings it), null for none */
  trails?: readonly (Trail | null | undefined)[];
  /** the slide the talk is at (ctx.index) */
  at: number;
  /** the lines the slide teaches (its `key`): the others are faint; none: all lit */
  lit?: readonly string[];
  /** the slide has a what-if slider: the last state's reading moves a ring, the dot stays */
  whatIf?: boolean;
  /** the slide's readings as the model eases or a slider moves them (the tiles' own numbers) */
  live?: Readings | null;
  /** the slide is a time-lapse not yet played: its last state waits for its days */
  waitDays?: boolean;
}
/** A time-lapse playing: i the stage the days end at, its trail, shown (0 to 1) how far the days have played. */
export interface LapseState { i: number; trail: Trail; shown: number }

export const litOf = (lit: readonly string[] | undefined, k: string) => !lit || !lit.length || lit.includes(k);
/** The stage a time-lapse's days end at: the stage that ends a lapse (its own first day the stage before), at or after slide `from`. */
export const endsLapse = (stages: readonly Stage[], q: number) => q > 0 && !stages[q]!.start && stages[q - 1]!.start && stages[q - 1]!.k === stages[q]!.k;
export const lapseStage = (stages: readonly Stage[], from: number): number => stages.findIndex((s, q) => endsLapse(stages, q) && s.j >= from);
/** The last stage the slide has reached, -1 for none. */
export function reached(stages: readonly Stage[], vals: readonly (Readings | null)[], at: number): number {
  let q = 0;
  while (q < stages.length && stages[q]!.j <= at && vals[q]) q++;
  return q - 1;
}
/** The stage a pinned reading belongs to (2D pin): only the state this slide brings follows the model, or the last one under a what-if slider; never the first. -1: it is not taken. */
export function pinStage(inp: ShiftInput): number {
  const i = reached(inp.stages, inp.vals, inp.at), s = inp.stages[i];
  if (!s || i < 1 || !(inp.whatIf || (s.j === inp.at && !s.start))) return -1;
  return i;
}
/** How many stages show now: those whose slide has been reached; the one this slide brings only once the readings have moved off the one before. */
export function shownCount(inp: ShiftInput, lapse: LapseState | null, liveAt: number): number {
  const { stages, vals, at } = inp, top = reached(stages, vals, at), live = inp.live ?? null;
  let n = 0;
  while (n <= top) {
    const s = stages[n]!;
    if (lapse && n === lapse.i) break;   // (the days' last state: drawn as they play)
    if (s.j === at && endsLapse(stages, n) && inp.waitDays) break;   // (the time-lapse waits for its days to play)
    // (the state this slide brings: shown once the readings have left the one before; a question holds them there until its answer plays)
    if (s.j === at && !s.start && n > 0 && live && liveAt === n && !movedFrom(vals[n - 1], live)) break;
    n++;
  }
  return n;
}

export interface Geo { w: number; h: number; f: number; L: number; R: number; colX: number; T1: number; B1: number; T2: number; B2: number; X: (i: number) => number; nameY: number; numR: number }
/** The geometry for a box w x h in type f; `measure(text, size, weight)` is the word's width. */
export function shiftGeo(w: number, h: number, f: number, nStages: number, tw: (t: string, size: number, weight: number) => number): Geo {
  const labels = SHIFT_KEYS.map((k) => tw(SHIFT_LINE[k]![0], f, 700) + 5 + tw(k === 'pv' ? '88.8' : k === 'spl' ? '8.88' : '188%', f, 500));
  const colW = 12 + Math.max(...labels), colX = w - colW - 2;
  const numL = Math.max(tw('140', f, 500), tw('30', f, 500)) + 12, numR = tw('1.50', f, 500) + 10;
  const L = numL, R = colX - numR - 8;
  const nameH = f + 8, B2 = h - nameH - 4, T1 = f + 10, gap = 2 * f + 6;
  const avail = Math.max(4 * f, B2 - T1 - gap), B1 = T1 + 0.58 * avail, T2 = B1 + gap;
  const pad = Math.max(8, 0.8 * f), N = Math.max(nStages, 2);
  const X = (i: number) => L + pad + (R - L - 2 * pad) * i / (N - 1);
  return { w, h, f, L, R, colX, T1, B1, T2, B2, X, nameY: h - 6, numR };
}
export interface Scales { top: TopScale; pvs: Scale; spls: Scale }
/** The scales from every stage the deck has (the shown and those to come), so they never change from slide to slide. */
export function shiftScales(inp: ShiftInput): Scales {
  const { stages, vals } = inp, ref = vals[0]!;
  const pct = (v: Readings, k: string) => 100 * v[k]! / ref[k]!;
  const top: number[] = [], pv: number[] = [], spl: number[] = [];
  for (let i = 0; i < stages.length; i++) { const v = vals[i]; if (v) { for (const k of SHIFT_TOP) top.push(pct(v, k)); pv.push(v.pv!); spl.push(v.spl!); } }
  for (let i = 0; i < stages.length; i++) {
    const tr = stages[i]!.start ? null : inp.trails?.[i];
    if (tr) for (const r of tr) { const v = rowVals(r)!; for (const k of SHIFT_TOP) top.push(pct(v, k)); pv.push(v.pv!); spl.push(v.spl!); }
  }
  const [Lsc, Usc] = pairScales(pv, spl, { pad: 0.12 }, { pad: 0.15 });
  return { top: topScale(top), pvs: Lsc, spls: Usc };
}
/** A reading's y in its panel. */
export function shiftY(G: Geo, S: Scales, ref: Readings, k: string, v: number): number {
  if (isTop(k)) { const p = 100 * v / ref[k]!; return G.B1 - (G.B1 - G.T1) * (p - S.top.min) / (S.top.max - S.top.min); }
  const sc = k === 'pv' ? S.pvs : S.spls;
  return G.B2 - (G.B2 - G.T2) * (v - sc.min) / (sc.max - sc.min);
}
/** The points of a stretch that ends at a time-lapse's last day: the model's own days, from the trail, up to `upTo` (0 to 1) of them. */
export function lapsePts(G: Geo, S: Scales, ref: Readings, k: string, i: number, trail: Trail, upTo = 1): [number, number][] {
  const rows = thin(trail), x0 = G.X(i - 1), x1 = G.X(i), d1 = rows.at(-1)?.[0] || 1, col = SHIFT_KEYS.indexOf(k) + 1, out: [number, number][] = [];
  for (const r of rows) { const t = r[0]! / d1; if (t > upTo + 1e-9) break; out.push([x0 + (x1 - x0) * t, shiftY(G, S, ref, k, r[col]!)]); }
  return out;
}
/** The head of a playing time-lapse at share k (0 to 1) of its days, on line `k`: the trail's points passed, then the head between the rows either side of it, and the value there. */
export function lapseHead(G: Geo, S: Scales, ref: Readings, key: string, i: number, trail: Trail, k: number): { pts: [number, number][]; hx: number; hy: number; v: number } {
  const rows = thin(trail), nr = rows.length, d1 = rows.at(-1)?.[0] || 1, day = k * d1, x0 = G.X(i - 1), x1 = G.X(i), col = SHIFT_KEYS.indexOf(key) + 1;
  let r = 0;
  while (r < nr - 1 && rows[r + 1]![0]! < day) r++;
  const a = rows[r]!, b = rows[r + 1 < nr ? r + 1 : r]!, t = b[0]! > a[0]! ? clamp((day - a[0]!) / (b[0]! - a[0]!), 0, 1) : 0, hx = x0 + (x1 - x0) * Math.min(1, day / d1);
  const pts: [number, number][] = [];
  for (let j = 0; j <= r && j < nr; j++) pts.push([x0 + (x1 - x0) * rows[j]![0]! / d1, shiftY(G, S, ref, key, rows[j]![col]!)]);
  const v = a[col]! + (b[col]! - a[col]!) * t, hy = shiftY(G, S, ref, key, v);
  pts.push([hx, hy]);
  return { pts, hx, hy, v };
}
