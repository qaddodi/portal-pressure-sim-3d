// The talk so far (2D: talk-trace.js, the slide tool { kind: 'trace', range: 'talk' }): the portal, wedged and free hepatic pressures at every state up to the slide, one point each,
// Mohammad's "Two gaps" chart (6 Nov 2026): one panel, PV and WHVP with the band between them shaded, the band between WHVP and FHVP shaded too (the HVPG), the stage names level over the
// plot, the treatments as thin neutral bars, the states of one visit under one bracket with a break between visits, and two rows of readings under the plot. Or the milestones style
// (the HVPG alone). Pure layout lifted from talk-trace.js (milePlaces, wrapName, visitsOf, visitUnits, daysOf, spanWords, rxBars, keepClear, layoutTalk) and talk-chain.js (talkChain);
// a word's width comes from the Inter advances (measure.ts), as 2D's glyph-measure does.
import { measure } from '../measure.ts';
import { traceWhen } from '../../tests/copied/trace-labels.copied.js';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** The wedged pressure's colour on the charts that draw it against the portal pressure (here and the parameter curve). */
export const WEDGE_C = '--s7';
export const LINES = [['pv', 'PV', '--tr-pv'], ['whvp', 'WHVP', WEDGE_C], ['fhvp', 'FHVP', '--text-3']] as const;
export const tokName = (v: string) => v.replace(/^--/, '');
export const textW = (t: string, f: number, wt = 600) => measure(t, f, wt);
export const f1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(1).replace('-', '−'));

export type Fp = Readonly<Record<string, number | null | undefined>>;
/** One state of the talk: what talkChain gives (n: its slide's number; tick: what happened there; mile: its milestone's short name; when: its time point; day: the deck's days so far). */
export interface TalkPoint { n: number; title: string; tick: string; mile?: string; when: string; day: string; fp: Fp; id?: string; params?: unknown }
export interface Run { key: string; name: string; tone: string; i0: number; i1: number }

export function milePlaces(xs: readonly number[], widths: readonly number[], W: number, gap = 10) {
  const ends: number[] = [], at = xs.map((x, i) => {
    const w = widths[i]!, mid = Math.min(Math.max(x, w / 2 + 4), W - w / 2 - 4);
    // (A name whose centre is near an edge is aligned to it, not centred over a line it would overhang: ending at W on the right, starting at 4 on the left.)
    const anchor = x + w / 2 > W ? 'end' as const : x - w / 2 < 4 ? 'start' as const : 'middle' as const, ax = anchor === 'end' ? W : anchor === 'start' ? 4 : x;
    let row = ends.findIndex((e) => mid - w / 2 >= e + gap);
    if (row < 0) row = ends.length;
    ends[row] = mid + w / 2;
    return { x: mid, row, anchor, ax, show: true };
  });
  return { at, rows: ends.length };
}

/** A stage's name set in its column: never cut short and never run past it, so a long name takes as many lines as its words need. A word wider than the column stands alone on its line. */
export function wrapName(text: string, colW: number, width: (t: string) => number): string[] {
  const lines: string[] = [];
  for (const w of String(text || '').trim().split(/\s+/).filter(Boolean)) {
    const t = lines.length ? `${lines.at(-1)} ${w}` : w;
    if (!lines.length) lines.push(w); else if (width(t) <= colW) lines[lines.length - 1] = t; else lines.push(w);
  }
  return lines;
}

/** The visits: each state's visit number, a state on the same day as the one before it joining that one's. */
export function visitsOf(pts: readonly { day?: string | number; when?: string | number }[]): number[] {
  const dayOf = (p: { day?: string | number; when?: string | number } | undefined) => p?.day ?? p?.when;
  const g: number[] = [];
  pts.forEach((p, i) => g.push(i && dayOf(p) != null && dayOf(p) === dayOf(pts[i - 1]) ? g[i - 1]! : (i ? g[i - 1]! + 1 : 0)));
  return g;
}
/** A state's x in units: one between the states of a visit, `apart` between visits (so the time between them reads as time). */
export function visitUnits(g: readonly number[], apart = 1.55): number[] { let a = 0; return g.map((v, i) => (i ? (a += v === g[i - 1] ? 1 : apart) : 0)); }
/** The days a time point names ("Day 30", "Month 4", "Year 2"), or null. */
export function daysOf(s: unknown): number | null {
  const m = /^(Day|Month|Year)\s+(\d+(?:\.\d+)?)$/.exec(String(s || '').trim());
  return m ? +m[2]! * (m[1] === 'Day' ? 1 : m[1] === 'Month' ? 30.4 : 365) : null;
}
/** The time between two visits in words: "180 d", "9 mo", "2 y". */
export const spanWords = (d: number) => (d % 365 === 0 ? `${d / 365} y` : d <= 200 ? `${Math.round(d)} d` : `${Math.round(d / 30.4)} mo`);

export interface RxBar { run: Run; a: number; b: number; more: boolean; row: number; nameX: number; anchor: 'start' | 'end' }
/** The treatment bars: each run a thin bar from the state it started at to its last, named at its start, an arrow at its end where it is still on at the last state. Packed on as few rows as keep the names and bars clear. */
export function rxBars(runs: readonly Run[], X: (i: number) => number, g: readonly number[], last: number, W: number, nameW: (t: string) => number, gap = 10): { bars: RxBar[]; rows: number } {
  const ends: number[] = [];
  const bars = runs.map((r): RxBar => {
    const s = r.i0 > 0 && g[r.i0] !== g[r.i0 - 1] ? r.i0 - 1 : r.i0, a = X(s), b = X(r.i1), more = r.i1 === last;
    const w = nameW(r.name), anchor = a + w > W - 2 ? 'end' as const : 'start' as const, nameX = anchor === 'end' ? W - 2 : a;
    const x0 = Math.min(a, anchor === 'end' ? W - 2 - w : a), x1 = Math.max(b + (more ? 8 : 0), anchor === 'end' ? W - 2 : a + w);
    let row = ends.findIndex((e) => x0 >= e + gap);
    if (row < 0) row = ends.length;
    ends[row] = x1;
    return { run: r, a, b, more, row, nameX, anchor };
  });
  return { bars, rows: ends.length };
}
/** The names to keep on one row, right to left, the last always: each clear of the one after it by gap px and inside [0, W]. */
export function keepClear(xs: readonly number[], ws: readonly number[], W: number, gap = 8): Set<number> {
  const kept = new Set<number>();
  for (let i = xs.length - 1, edge = Infinity; i >= 0; i--) {
    const half = ws[i]! / 2;
    if (i === xs.length - 1 || (xs[i]! + half + gap <= edge && xs[i]! - half >= 0 && xs[i]! + half <= W)) { kept.add(i); edge = xs[i]! - half; }
  }
  return kept;
}
/**
 * Where each reading of a row stands when it may use `lines` lines under the plot: 0 the row's own line, 1 the line beside it, -1 left out. The latest always stands on line 0; then the readings the words cite (`first`,
 * their indices), then the rest, right to left; each takes the line that alternates with the latest, else the other, and is left out only when both are crowded (each clear of every reading on its line by gap px, inside [0, W]).
 * With one line and nothing cited this is keepClear.
 */
export function rowPlaces(xs: readonly number[], ws: readonly number[], W: number, lines: 1 | 2, first: Iterable<number> = [], gap = 8): number[] {
  const last = xs.length - 1, at = xs.map(() => -1), placed: number[][] = [[], []];
  const clear = (i: number, l: number) => xs[i]! - ws[i]! / 2 >= 0 && xs[i]! + ws[i]! / 2 <= W && placed[l]!.every((j) => Math.abs(xs[i]! - xs[j]!) >= (ws[i]! + ws[j]!) / 2 + gap);
  const cited = new Set(first), order = [last, ...[...cited].filter((i) => i !== last && i >= 0 && i < last).sort((a, b) => b - a)];
  for (let i = last - 1; i >= 0; i--) if (!cited.has(i)) order.push(i);
  for (const i of order) {
    const pref = (last - i) % 2, tries = lines === 1 ? [0] : [pref, 1 - pref];
    const l = i === last ? 0 : tries.find((q) => clear(i, q));
    if (l == null) continue;
    at[i] = l; placed[l]!.push(i);
  }
  return at;
}
/** A step's ring on the steps header (its number inside): its radius, 10 px at 12. */
export const stepR = (fs: number) => Math.round(0.8 * fs);
/** The least height of the plot (three lines' names stacked at a line and a quarter each, with room above and below). */
export const plotMinOf = (fs: number) => 4.2 * fs;

export interface LayoutIn { pts: readonly TalkPoint[]; W: number; HT: number; fs: number; runs?: readonly Run[]; gapName?: string; tw?: (t: string, px: number, wt?: number) => number }
export type Layout = ReturnType<typeof layoutTalk>;
/**
 * The full chart's layout, from the states and the box: where every piece stands. W, HT: the box; fs: the type size (every word of the chart is that size, 12 px at least); runs: the
 * treatments' runs (rx-bands.js bandRuns). The box's height is the card's, so the chart budgets what it is given. Its parts, in the order they give way:
 *  1. The stage names stand level over the plot while they fit in the room the plot can spare ('names'). Else
 *  2. the steps ('steps'): each state a numbered ring on its line at the top of the plot, and the caption of the latest only.
 *  3. The two readings rows under the plot go one at a time (the gap row, then the HVPG row) when the plot would be under plotMinOf.
 */
export function layoutTalk({ pts, W, HT, fs, runs = [], gapName = 'PV − WHVP', tw = textW }: LayoutIn) {
  const n = pts.length, last = n - 1, narrow = W < 420, lineH = fs + 3;
  const g = visitsOf(pts), u = visitUnits(g), uMax = Math.max(u[last] ?? 0, 1e-9);
  // The scale: 0 to the next 5 over the highest reading (20 at least), the numbers 8 px inside the panel's left edge.
  const top = Math.max(20, ...pts.flatMap((p) => LINES.map(([k]) => p.fp[k] || 0)));
  const pMax = Math.ceil(top / 5) * 5, unitW = Math.ceil(tw('mmHg', fs, 500)) + 2, L = Math.max(Math.ceil(tw(String(pMax), fs, 500)) + 16, unitW + 8);
  // The right column: each line's name (and, with room, its last value), and the readings rows' names, each after a swatch.
  const vals = n ? LINES.map(([k, a]) => [a, f1(pts[last]!.fp[k])] as const) : [];
  const endW = Math.max(0, ...vals.map(([a, v]) => tw(a, fs, 700) + (narrow ? 0 : 4 + tw(v, fs, 500))));
  const rowName = narrow ? gapName.replace(/ − /g, '−') : gapName, rowW = Math.max(tw(rowName, fs, 500), tw('HVPG', fs, 500));
  const R = Math.floor(W - 8 - 12 - Math.max(endW, rowW) - 12);
  const pad = Math.max(10, 0.9 * fs), X = (i: number) => (n < 2 ? (L + R) / 2 : L + pad + ((R - L - 2 * pad) * u[i]!) / uMax);
  // The treatments, as bars under the names.
  const { bars, rows: rxRows } = rxBars(runs, X, g, last, W, (t) => tw(t, fs, 500));
  const room = rxRows * (fs + 10);
  // (From the plot's top to the box's foot: the time row, then the readings rows k of them: the baseline of the last is 12 px up from the foot.)
  const footer = (k: number) => fs + 22 + (k >= 1 ? fs + 10 : 0) + (k >= 2 ? fs + 7 : 0);
  const unitRoom = fs + 14, plotMin = plotMinOf(fs);

  // 1. The stage names, level over the plot: wrapped to two lines where a column is narrow, on as many rows as keep them clear.
  const colW = n < 2 ? R - L : Math.max(tw('Carvedilol', fs), Math.min(...pts.slice(1).map((_, i) => X(i + 1) - X(i))) - 8);
  const blocks = pts.map((p) => {
    let lines = wrapName(p.tick, colW, (t) => tw(t, fs));
    if (lines.length > 3) lines = wrapName(p.tick, 1.8 * colW, (t) => tw(t, fs));   // (a long name takes a wider column rather than a tall one)
    return { lines, w: Math.max(0, ...lines.map((t) => tw(t, fs))) };
  });
  // (Names stand on one row, each clear of the next. One that would crowd another is left out, and the latest always shows, on a second row if it must.)
  const mp = milePlaces(pts.map((_, i) => X(i)), blocks.map((b) => b.w), W - 2, 8);
  mp.at.forEach((a, i) => { a.show = a.row === 0 || i === last; if (i === last && a.row > 0) a.row = 1; });
  const rowsUsed = mp.at.some((a) => a.show && a.row > 0) ? 2 : 1;
  const rowLines = Array.from({ length: rowsUsed }, (_, r) => Math.max(1, ...blocks.filter((_, i) => mp.at[i]!.show && mp.at[i]!.row === r).map((b) => b.lines.length)));
  const rowTop = (r: number) => rowLines.slice(0, r).reduce((a, k) => a + k * lineH + 4, 0);
  const namesH = rowTop(rowsUsed);

  // 2. The steps: the latest state's name across the card after its ring, the ring of each state on the plot's top.
  const sr = stepR(fs), capX = 2 * sr + 8, cap = n && pts[last]!.tick ? wrapName(pts[last]!.tick, W - capX - 4, (t) => tw(t, fs)) : [];
  const stepsH = cap.length ? cap.length * lineH + 6 : 0;

  const plotFor = (head: number, k: number) => { const pTop = head + 4 + room + 4, T = pTop + unitRoom; return { pTop, T, B: HT - footer(k), k }; };
  // (The names stay only while every one is shown, none over three lines, and the plot keeps its room: else the steps.)
  const namesWhole = mp.at.every((a) => a.show) && blocks.every((b) => b.lines.length <= 3);
  let mode: 'names' | 'steps' = 'names', rows = 2, P = plotFor(namesH, 2);
  if (!namesWhole || P.B - P.T < plotMin) {
    mode = 'steps';
    for (const k of [2, 1, 0]) { rows = k; P = plotFor(stepsH, k); if (P.B - P.T >= plotMin) break; }
  }
  const { pTop, T } = P; let { B } = P;
  if (B - T < 2.4 * fs) B = T + 2.4 * fs;   // (a box too short for even the plot: it keeps a plot, and the words under it run past the foot)
  const ty = B + fs + 10, r1 = ty + fs + 10, r2 = r1 + fs + 7;
  const rowDefs: [string, number][] = rows === 2 ? [['gap', r1], ['hv', r2]] : rows === 1 ? [['hv', r1]] : [];
  const Y = (v: number) => B - ((B - T) * clamp(v, 0, pMax)) / pMax;
  const gStep = (B - T) / (pMax / 5) >= 1.5 * fs ? 5 : 10;
  // The lines' names at the right end, top to bottom, never touching, held inside the plot whatever the values.
  const ends = n ? LINES.map(([k, a, c]) => ({ a, c: c as string, v: f1(pts[last]!.fp[k]), y: Y(pts[last]!.fp[k] || 0) })).sort((p, q) => p.y - q.y) : [];
  ends.forEach((e, k) => { if (k) e.y = Math.max(e.y, ends[k - 1]!.y + 1.25 * fs); });
  if (ends.length) {
    const over = ends[ends.length - 1]!.y - (B - 0.2 * fs);
    if (over > 0) ends.forEach((e) => { e.y -= over; });
    const under = T + 0.2 * fs - ends[0]!.y;
    if (under > 0) ends.forEach((e) => { e.y += under; });
  }
  // Each step's ring on its line (one that would crowd its neighbour is left out, the latest always shown).
  const ringW = (i: number) => 2 * sr + 2 + (i >= 9 ? 4 : 0);
  const stepKept = mode === 'steps' ? keepClear(pts.map((_, i) => X(i)), pts.map((_, i) => ringW(i)), W, 2) : new Set<number>();
  const bottom = (rowDefs.length ? rowDefs.at(-1)![1] : ty) + 0.25 * fs;
  return {
    mode, rows, rowDefs, n, last, narrow, lineH, g, u, X, Y, L, R, pMax, unitW, gStep, pTop, T, B, ty, r1, r2, rowName, room, bars, rxRows,
    blocks, mp, rowsUsed, rowTop, namesH, cap, capX, stepsH, stepKept, ends, sx: R + 12, tx: R + 24, plot: B - T, bottom,
    headH: mode === 'names' ? namesH : stepsH, stripY: (mode === 'names' ? namesH : stepsH) + 4, stepY: pTop + 4 + sr, sr, footer,
  };
}

/** The height the full chart takes at width W in type fs for these states: the room above its plot and under it (the readings rows) plus a plot of about a third of the width (never under plotMinOf). */
export function talkHeight(pts: readonly TalkPoint[], W: number, fs: number, runs: readonly Run[] = [], gapName = 'PV − WHVP'): number {
  const lo = layoutTalk({ pts, W, HT: 4000, fs, runs, gapName }), plot = Math.max(plotMinOf(fs) * 1.5, 0.34 * W);
  return Math.ceil(lo.T + plot + lo.footer(lo.rows));
}

/** The milestones style's layout (talk-trace.js drawMiles): the HVPG alone. */
export function layoutMiles({ pts, W, HT, fs, runs = [], tw = textW }: LayoutIn) {
  const unitW = Math.ceil(tw('mmHg', fs, 500)) + 2, L = Math.max(Math.ceil(3.3 * fs) + 8, unitW + 8);
  const last = pts.length - 1, vfs = 1.5 * fs;
  const vw = Math.ceil(tw(f1(pts[last]?.fp.hvpg ?? 0), vfs, 700)), R = W - Math.max(Math.ceil(4 * 0.6 * vfs), vw + 4) - 14;   // (the end value's own width, so it stands inside the card with room to spare)
  // (Time between visits reads as distance, as on the full chart: the states of one visit stand close, a later visit further on.)
  const vis = visitsOf(pts), un = visitUnits(vis), uMax = un.at(-1) || 1, X = (i: number) => L + (R - L) * (pts.length < 2 ? 0.5 : un[i]! / uMax);
  const mi = pts.map((p, i) => (p.mile ? i : -1)).filter((i) => i >= 0);
  const { at, rows } = milePlaces(mi.map(X), mi.map((i) => tw(pts[i]!.mile!, fs)), R);
  // (The treatments: a bar each, packed on as few rows as keep them clear, between the names and the plot. The card does not grow for them.)
  const { bars, rows: bRows } = rxBars(runs, X, vis, last, W, (t) => tw(t, fs, 500));
  const rowH = fs + 8, nameY = (r: number) => 4 + fs + (rows - 1 - r) * rowH, T0 = 4 + rows * rowH + Math.ceil(0.6 * fs);
  const T = T0 + bRows * (fs + 10) + 0.6 * fs + 6, B = HT - fs - 16;
  const gMax = Math.max(15, Math.ceil(Math.max(0, ...pts.map((p) => p.fp.hvpg || 0)) / 5) * 5), Y = (v: number) => B - ((B - T) * clamp(v, 0, gMax)) / gMax;
  const ticks = Array.from({ length: gMax / 5 + 1 }, (_, k) => k * 5).filter((v, _k, a) => (B - T) / a.length >= 1.2 * fs || v % 10 === 0 || v === 5);
  // (The time under the line: at each milestone and the last point, where it keeps clear of its neighbour.)
  const whenW = (p: TalkPoint) => tw(p.when || String(p.n), fs, 500), named = new Set<number>();
  const list = [...new Set([...mi, last])].filter((i) => i >= 0).sort((a, b) => a - b);
  // (One name for a visit: two points of the same day never carry "Day 0" twice.)
  const visitNamed = new Set<number>();
  for (let k = list.length - 1, edge = Infinity; k >= 0; k--) {
    const i = list[k]!, half = whenW(pts[i]!) / 2;
    if (visitNamed.has(vis[i]!)) continue;
    if (X(i) + half + 8 <= edge && X(i) - half >= 0) { named.add(i); visitNamed.add(vis[i]!); edge = X(i) - half; }
  }
  return { unitW, L, R, vfs, vis, X, mi, at, rows, bars, bRows, rowH, nameY, T0, T, B, gMax, Y, ticks, named, last };
}
/** The milestones chart's height at width W: its names, bars and a plot of about a third of the width. */
export function milesHeight(pts: readonly TalkPoint[], W: number, fs: number, runs: readonly Run[] = []): number {
  const lo = layoutMiles({ pts, W, HT: 4000, fs, runs });
  return Math.ceil(lo.T + Math.max(plotMinOf(fs) * 1.5, 0.34 * W) + fs + 16);
}

// ── The chain: the states up to a slide (talk-chain.js) ──
/** The slide fields the chain reads (the 2D slide's). */
export interface TalkSlide { id?: string; title: string; tick?: string; milestone?: string; when?: string; days?: number; visual?: string }
/** The time point of state k, its days counted from slide index f0 + 1: "Day 30", "Month 10", "Year 2". */
export function whenOf(slides: readonly TalkSlide[], k: number, f0 = -1): string {
  const d = slides.slice(f0 + 1, k + 1).reduce((a, s) => a + (s.days || 0), 0);
  return d && d % 365 === 0 ? `Year ${d / 365}` : d <= 200 ? `Day ${d}` : `Month ${Math.round(d / 30.4)}`;
}
/** slides: the deck's; stateOf[j]: the slide whose state slide j shows; states[k].fp / .params: that state's readings. since: a slide's id (the trace's tool.since): the chart starts at that slide's
 *  state and counts its days from there. → [{ n, title, tick, mile, when, day, fp, id, params }] */
export function talkChain(slides: readonly (TalkSlide & { tick?: string })[], stateOf: readonly number[], states: readonly ({ fp?: Fp; params?: unknown } | undefined)[], i: number, since?: string | null): TalkPoint[] {
  let before: string | null = null;
  const f0 = since ? slides.findIndex((x, j) => j <= i && x.id === since) : -1, k0 = f0 >= 0 ? stateOf[f0]! : -1;
  return [...new Set(stateOf.slice(0, i + 1))].filter((k) => k >= k0 && slides[k]?.visual !== 'outline').map((k) => {
    const w = whenOf(slides, k, k0);
    const p: TalkPoint = {
      n: k + 1, title: slides[k]!.title, tick: slides.find((x, j) => stateOf[j] === k && x.tick)?.tick || slides[k]!.title,
      mile: slides.find((x, j) => stateOf[j] === k && x.milestone)?.milestone, when: traceWhen(slides[k]!.when, w, before), day: w,
      fp: states[k]?.fp as Fp, id: slides[k]!.id, params: states[k]?.params,
    };
    before = w;
    return p;
  });
}
