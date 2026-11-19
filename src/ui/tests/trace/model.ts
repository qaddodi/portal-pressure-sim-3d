// Pressure over time as a chart frame (2D pressure-time.js, the Tests > Pressure > Over time pane): the portal circulation's pressures as lines over the last
// 10 s (every heartbeat and breath), the last two minutes (a band from trough to peak around the mean) or the disease clock's days (one point a day), the HVPG on its
// own lane under them read against its cut-offs, and over the last beats a schematic EKG strip timed to the model's own heart. The changes the learner made and the
// events the model raised are marked where they happened, and a crosshair (hover, or a drag on a touch screen) reads every trace at one moment. A pure function of the
// record, the choice and the box: the same inputs give the same frame, so a test reads the lanes, the lines and the words without a browser.
import type { Frame, Shape } from '../../charts/scene.ts';
import type { Palette } from '../../charts/palette.ts';
import type { Rgba } from '../../charts/colour.ts';
import { withAlpha } from '../../charts/colour.ts';
import { fmt } from '../../charts/fmt.ts';
import { measure } from '../../charts/measure.ts';
import { HVPG_CUTS, hvpgSev, HVPG_WORDS, BLEED_WORD } from '../../../engine/hales/portal/pressure-cuts.js';
import { laneRoom } from '../copied/trace-lanes.copied.js';
import { ekgSeries } from '../copied/ekg.copied.js';
import { limitLabelX } from '../copied/limit-label.copied.js';
import { wrapLabel } from '../copied/wrap-label.copied.js';
import type { Channel, DayPoint } from '../feed.ts';

export type TraceId = 'CONF' | 'whvp' | 'RHV' | 'RA' | 'IVCS' | 'VAR' | 'SV' | 'SMV';
export interface TraceDef {
  id: TraceId; label: string; abbr: string; short: string;
  /** the chart token (2D `--tr-*`) */
  tok: string; hide: 'pv' | 'trueHVPG' | 'ra'; on: boolean;
  /** the metrics field of the live reading written at the line's end (none: the line's own last second) */
  day: string | null;
}
// (2D TRACES. The splenic and mesenteric traces wear the figure's origin colours, #7D5CDB and #E69929 in every look: tokens.css --origin-spleen, --origin-smv.)
export const TRACES: readonly TraceDef[] = [
  { id: 'CONF', label: 'Portal vein', abbr: 'PV', short: 'Portal', tok: 'tr-pv', hide: 'pv', on: true, day: 'pv' },
  { id: 'whvp', label: 'Wedged hepatic (WHVP)', abbr: 'WHVP', short: 'Wedged', tok: 'tr-wedge', hide: 'trueHVPG', on: true, day: 'whvp' },
  { id: 'RHV', label: 'Free hepatic (FHVP)', abbr: 'FHVP', short: 'Free', tok: 'tr-hv', hide: 'trueHVPG', on: true, day: 'fhvp' },
  { id: 'RA', label: 'Right atrium', abbr: 'RA', short: 'RA', tok: 'tr-ra', hide: 'ra', on: false, day: 'ra' },
  { id: 'IVCS', label: 'IVC', abbr: 'IVC', short: 'IVC', tok: 'tr-ivc', hide: 'ra', on: false, day: 'ivc' },
  { id: 'VAR', label: 'Esophageal varix', abbr: 'Varix', short: 'Varix', tok: 'tr-var', hide: 'pv', on: false, day: null },
  { id: 'SV', label: 'Splenic vein', abbr: 'SV', short: 'Splenic', tok: 'tr-sv', hide: 'pv', on: false, day: 'sv' },
  { id: 'SMV', label: 'Superior mesenteric vein', abbr: 'SMV', short: 'SMV', tok: 'tr-smv', hide: 'pv', on: false, day: null },
];
const ORIGIN: Record<string, Rgba> = { 'tr-sv': [0x7d / 255, 0x5c / 255, 0xdb / 255, 1], 'tr-smv': [0xe6 / 255, 0x99 / 255, 0x29 / 255, 1] };
export const traceColour = (pal: Palette, tok: string): Rgba => (pal.has(tok) ? pal.tok(tok) : ORIGIN[tok]!);
export const traceInk = (pal: Palette, tok: string): Rgba => (pal.has(`${tok}-ink`) ? pal.tok(`${tok}-ink`) : traceColour(pal, tok));
export const TRACE_OF = Object.fromEntries(TRACES.map((t) => [t.id, t])) as Record<TraceId, TraceDef>;

export type Range = 'beats' | 'minutes' | 'days';
/** the range's id, its name, and the seconds on screen (the days: none, the chart shows the days kept) */
export const RANGES: readonly (readonly [Range, string, number])[] = [['beats', '10 s', 10], ['minutes', '2 min', 120], ['days', 'Days', 0]];
export const SMOOTH_S = 6;
export const LAG_S = 0.12;
/** seconds of samples the 10 s range keeps in view of its scale, of bins the 2 min range does (2D FINE_S, COARSE_S), and the width of a bin */
export const FINE_S = 22, COARSE_S = 140, BIN = 0.25;
/** the seconds the EKG strip shows over the days' trend (2D BEAT_CARD_S) */
export const STRIP_S = 5;
/** a marker label's row height and the rows there are room for (2D ROW, MAX_ROWS) */
export const ROW = 13, MAX_ROWS = 4;

/** What the frame reads from: the kept record (`feed`), as arrays. */
export interface Record_ {
  t: ArrayLike<number>;
  ch: Record<Channel, ArrayLike<number>>;
  binT: ArrayLike<number>;
  bin: Record<Channel, { lo: ArrayLike<number>; hi: ArrayLike<number>; mean: ArrayLike<number> }>;
  /** when each beat began (the beat clock) */
  beats: ArrayLike<number>;
  /** the Days chart's points, and each trace's calmed trend (the model's own: trail-calm.js); a record with no days has none */
  days?: readonly DayPoint[];
  calm?: (key: string) => { x: number[]; mid: number[] } | null;
}
/** What a timeline entry gives a marker (2D timeline.entries()): where it happened, its words and, for an event, its severity. */
export interface Mark { kind: string; day: number; t?: number; label?: string; sev?: string }
export interface TraceView {
  range: Range;
  chosen: ReadonlySet<TraceId>;
  smooth: boolean; ekg: boolean; lane: boolean;
  /** model time at the right edge */
  head: number;
  /** the readings written at the lines' ends (the tiles' own numbers); a missing one reads the line's last second */
  ends: Readonly<Partial<Record<TraceId | 'hvpg', number>>>;
  hvpg: number; hr: number;
  /** readouts the case leaves unmeasured (2D hiddenSet) */
  hidden?: ReadonlySet<string>;
  /** the crosshair's x in px inside the box (null: none) */
  cross?: number | null;
  /** the changes and events to mark (the timeline's entries), and the day the model is on (the seconds' ranges mark that day's alone) */
  marks?: readonly Mark[];
  dayNow?: number;
  /** a time-lapse over a Days chart whose EKG strip goes on sweeping: the strip's own right edge (model seconds) */
  stripHead?: number;
}
export interface TraceBox { w: number; h: number; pal: Palette; /** the words' size, px */ fs: number }
/** The y range each lane draws at: eased by the caller (2D ease()). */
export type Ease = (lane: 'pressure' | 'hvpg', lo: number, hi: number) => readonly [number, number];
export const noEase: Ease = (_l, lo, hi) => [lo, hi];

const LIMITS: readonly (readonly [number, string])[] = [[HVPG_CUTS.amber, ''], [HVPG_CUTS.red, `${HVPG_WORDS.danger[0]} ${HVPG_CUTS.red}`], [HVPG_CUTS.bleed, `${BLEED_WORD} ${HVPG_CUTS.bleed}`]];
const AX_BEATS = (s: number) => `−${s} s`;
const AX_MIN = (s: number) => (s % 60 === 0 ? `−${s / 60} min` : `−${s} s`);
const nice = (span: number, n = 4) => { const raw = Math.max(1e-6, span / n); const p = 10 ** Math.floor(Math.log10(raw)); const r = raw / p; return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p; };
/** The word of an HVPG: its band's short word, with the bleed line's risk (2D wordOf). */
export const BLEED_BAND = `${HVPG_WORDS.danger[0]} · ${BLEED_WORD.toLowerCase()}`;
export const hvpgWordOf = (v: number): string => (v >= HVPG_CUTS.bleed ? BLEED_BAND : HVPG_WORDS[hvpgSev(v) as 'ok'][0]);
export const sevTok = (v: number): 'ok' | 'caution' | 'danger' => hvpgSev(v) as 'ok';

/** The traces the lane draws: chosen, and measurable in this case. */
export function activeTraces(v: Pick<TraceView, 'chosen' | 'hidden'> & { range?: Range }): TraceDef[] {
  return TRACES.filter((t) => v.chosen.has(t.id) && !v.hidden?.has(t.hide) && (v.range !== 'days' || t.day));
}

/** One series in pixels-ready numbers: x (model seconds), the mean (or the line) and, on the two-minute range, the trough and the peak. */
export interface Series { x: number[]; mid: number[]; lo?: number[]; hi?: number[] }

// the first index with a[i] >= v, and the first with a[i] > v
function lowerBound(a: ArrayLike<number>, v: number): number { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m]! < v) lo = m + 1; else hi = m; } return lo; }
function upperBound(a: ArrayLike<number>, v: number): number { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m]! <= v) lo = m + 1; else hi = m; } return lo; }

/** A trailing mean over the last `w` seconds of a series' values (2D smoothed(): the mean of the samples in (x − w, x], NaN skipped). */
export function trailing(x: ArrayLike<number>, v: ArrayLike<number>, w: number): number[] {
  const out: number[] = new Array(x.length);
  let j = 0, sum = 0, n = 0;
  for (let i = 0; i < x.length; i++) {
    const q = v[i]!;
    if (!Number.isNaN(q)) { sum += q; n++; }
    while (x[j]! < x[i]! - w) { if (!Number.isNaN(v[j]!)) { sum -= v[j]!; n--; } j++; }
    out[i] = n ? sum / n : NaN;
  }
  return out;
}
/** The mean twice over (2D: `secs`, then half of it): one pass leaves a ripple of the breathing rhythm at the newest end. */
export const smoothed = (x: ArrayLike<number>, v: ArrayLike<number>, secs: number): number[] => trailing(x, trailing(x, v, secs), secs / 2);

/** A series thinned to about two points to a pixel column (a pulsatile trace has thousands of samples; 2D line()'s stride), its last point kept. */
function thin(s: Series, px: number): Series {
  const n = s.x.length, stride = Math.max(1, Math.floor(n / Math.max(40, px * 2)));
  if (stride === 1) return s;
  const x: number[] = [], mid: number[] = [];
  for (let i = 0; i < n; i += stride) { x.push(s.x[i]!); mid.push(s.mid[i]!); }
  if ((n - 1) % stride) { x.push(s.x[n - 1]!); mid.push(s.mid[n - 1]!); }
  return { x, mid };
}

/** The record's samples (the 10 s range) or its finished quarter-second bins (the 2 min range; the bin still filling has few samples and would wiggle at the tail) in
 *  [x0, x1], as they are; the days are the calmed trend (the last point the live reading). */
function rawSeries(rec: Record_, key: Channel, range: Range, x0: number, x1: number): Series {
  if (range === 'beats') {
    const t = rec.t, v = rec.ch[key];
    const from = t.length ? Math.max(x0 - 0.05, t[t.length - 1]! - FINE_S) : x0;
    const i0 = lowerBound(t, from), i1 = upperBound(t, x1);
    const x: number[] = [], mid: number[] = [];
    for (let i = i0; i < i1; i++) { x.push(t[i]!); mid.push(v[i]!); }
    return { x, mid };
  }
  if (range === 'minutes') {
    const T = rec.binT, b = rec.bin[key], x: number[] = [], mid: number[] = [], lo: number[] = [], hi: number[] = [];
    const j0 = lowerBound(T, Math.max(x0 - BIN, T.length ? T[T.length - 1]! - COARSE_S : x0));
    for (let j = j0; j < T.length - 1; j++) {
      if (T[j]! + BIN / 2 > x1) break;
      if (b.mean[j] !== b.mean[j]) continue;
      x.push(T[j]! + BIN / 2); mid.push(b.mean[j]!); lo.push(b.lo[j]!); hi.push(b.hi[j]!);
    }
    return { x, mid, lo, hi };
  }
  const days = rec.days ?? [], x: number[] = [], mid: number[] = [], c = rec.calm?.(key) ?? null;
  if (!c) { for (const d of days) if (d.v[key] != null && d.day >= x0) { x.push(d.day); mid.push(d.v[key]!); } return { x, mid }; }
  const n = c.x.length;
  for (let i = 0; i < n; i++) if (c.x[i]! >= x0) { x.push(c.x[i]!); mid.push(i === n - 1 ? days[days.length - 1]!.v[key]! : c.mid[i]!); }   // (today's point stays the live reading)
  return { x, mid };
}

/** The Smooth series: the mean over the whole record kept (so the left edge is not a short window), cut to where the average is complete (2D series()). */
function smoothSeries(rec: Record_, key: Channel, range: Range, x1: number): Series {
  const raw = rawSeries(rec, key, range, -Infinity, x1);
  const mid = smoothed(raw.x, raw.mid, SMOOTH_S);
  const from = (raw.x[0] ?? 0) + SMOOTH_S * 1.5;
  const k = lowerBound(raw.x, from);
  return { x: raw.x.slice(k), mid: mid.slice(k) };
}

/** The series of a channel in [x0, x1] for a range (2D series()). The 10 s range is the samples themselves (thinned to what a line of `px` pixels can show); the 2 min range
 *  is the quarter-second bins (trough, peak, mean); the days are one point a day. `smooth` is the mean alone, averaged (not on the days). */
export function seriesOf(rec: Record_, key: Channel, range: Range, x0: number, x1: number, smooth: boolean, px: number): Series {
  if (smooth && range !== 'days') {
    const s = smoothSeries(rec, key, range, x1), k = lowerBound(s.x, x0 - 0.05);
    return thin({ x: s.x.slice(k), mid: s.mid.slice(k) }, px);
  }
  const s = rawSeries(rec, key, range, x0, x1);
  return range === 'beats' ? thin(s, px) : s;
}

/** The mean over the last second of a series (2D recent()); on the days, the last day. */
export function recent(s: Series, days = false): number {
  const n = s.x.length;
  if (!n) return NaN;
  if (days) return s.mid[n - 1]!;
  const from = s.x[n - 1]! - 1;
  let sum = 0, k = 0;
  for (let i = n - 1; i >= 0 && s.x[i]! >= from; i--) if (!Number.isNaN(s.mid[i]!)) { sum += s.mid[i]!; k++; }
  return k ? sum / k : s.mid[n - 1]!;
}
/** The value of a series at x (the nearest sample, none when there is no sample within 3% of the span; 2D at()). */
export function at(s: Series, x: number, span: number): number | null {
  if (!s.x.length) return null;
  let lo = 0, hi = s.x.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s.x[m]! < x) lo = m; else hi = m; }
  const i = Math.abs(s.x[lo]! - x) < Math.abs(s.x[hi]! - x) ? lo : hi;
  return Math.abs(s.x[i]! - x) > span * 0.03 ? null : s.mid[i]!;
}

/** The lowest and highest reading a lane's scale is chosen from (2D): the whole record up to the right edge, not only the window on screen, so the scale holds still while the trace scrolls. */
export function extentOf(rec: Record_, key: Channel, range: Range, smooth: boolean, x1: number, shown: Series): [number, number] {
  let mn = Infinity, mx = -Infinity;
  if (range === 'beats' && !smooth) {
    const t = rec.t, v = rec.ch[key], n = upperBound(t, x1), from = t.length ? lowerBound(t, t[t.length - 1]! - FINE_S) : 0;
    for (let i = from; i < n; i++) { const a = v[i]!; if (a < mn) mn = a; if (a > mx) mx = a; }
  } else if (range === 'minutes' && !smooth) {
    const s = rawSeries(rec, key, 'minutes', -Infinity, x1);
    for (let i = 0; i < s.x.length; i++) { if (s.lo![i]! < mn) mn = s.lo![i]!; if (s.hi![i]! > mx) mx = s.hi![i]!; }
  } else {
    const s = range === 'days' ? shown : smoothSeries(rec, key, range, x1);
    for (let i = 0; i < s.x.length; i++) { const a = s.mid[i]!; if (a < mn) mn = a; if (a > mx) mx = a; }
  }
  return [mn, mx];
}

export interface Lane { key: 'ekg' | 'pressure' | 'hvpg'; top: number; bot: number; lo: number; hi: number; tick: number }
export interface TraceOut {
  frame: Frame;
  /** the plot's left edge and width, the window and where the lanes stand (a test, and the crosshair, read these) */
  L: number; plotW: number; x0: number; x1: number; lanes: Lane[];
  ends: { lane: Lane['key']; label: string; v: number; y: number }[];
  /** the markers drawn (their dot's place, the label's words, how many changes it stands for) and the crosshair's card (a test reads these) */
  marks: { x: number; y: number; label: string; n: number; sev: string | null }[];
  cross: { x: number; when: string; rows: { label: string; v: number }[] } | null;
}

/** The pressure lane's and the HVPG lane's y range for the data they hold (2D): the pressures start at zero when they are all above it, with a tenth of the span as room; the HVPG lane
 *  runs from zero to a multiple of 4 above the peak, never under 16. */
export function targetRange(key: 'pressure' | 'hvpg', mn: number, mx: number): [number, number] {
  if (!Number.isFinite(mn)) { mn = 0; mx = 10; }
  if (key === 'hvpg') return [0, Math.max(16, Math.ceil((mx + 3) / 4) * 4)];
  const pad = Math.max(1.5, (mx - mn) * 0.1);
  return [Math.max(mn >= 0 ? 0 : -Infinity, mn - pad), mx + pad];
}

/** The markers in the window (2D markers()): the seconds' ranges mark the model's day alone, at the second it happened; the days mark every day, at its day. */
function marksIn(view: TraceView, x0: number, x1: number): { x: number; label: string; sev: string | null }[] {
  const out: { x: number; label: string; sev: string | null }[] = [];
  for (const e of view.marks ?? []) {
    if (e.kind === 'start') continue;
    let x: number;
    if (view.range === 'days') x = e.day + (e.t || 0) / 86400;
    else { if (e.day !== view.dayNow) continue; x = e.t!; }
    if (x == null || !(x >= x0 && x <= x1)) continue;
    out.push({ x, label: e.label || '', sev: e.kind === 'event' ? (e.sev === 'info' ? null : e.sev ?? null) : null });
  }
  return out;
}
interface Group { xx: number; label: string; sev: string | null; n: number; row: number; lines: string[] | null; toRight: boolean }
/** Markers a few pixels apart (several changes made at once) share one dot and one label ("… +2"). Each label takes the highest row where it clears the labels already
 *  placed, right of its dot or else left of it; a long label wraps between words onto the rows below. With no row free the marker keeps its line and a dot at the top of the plot,
 *  unlabelled (2D layoutMarkers). */
export function layoutMarkers(marks: readonly { x: number; label: string; sev: string | null }[], X: (t: number) => number, right: number, fs: number): { groups: Group[]; rows: number } {
  const groups: Group[] = [];
  for (const m of marks) {
    const xx = Math.round(X(m.x)) + 0.5, last = groups[groups.length - 1];
    if (last && xx - last.xx < 6) { last.n++; if (!last.sev && m.sev) last.sev = m.sev; continue; }
    groups.push({ xx, label: m.label, sev: m.sev, n: 1, row: -1, lines: null, toRight: false });
  }
  const spans: { x0: number; x1: number; row: number }[] = [];
  const maxW = Math.min(170, (right - 40) * 0.6), width = (t: string) => measure(t, fs, 600);
  for (const g of groups) {
    const lab = g.label ? (g.n > 1 ? `${g.label} +${g.n - 1}` : g.label) : g.n > 1 ? `${g.n} changes` : '';
    const fit = lab ? (wrapLabel(lab, maxW, width) as { lines: string[]; w: number } | null) : null;
    if (!fit) continue;
    const tw = fit.w, n = fit.lines.length;
    place: for (let r = 0; r + n <= MAX_ROWS; r++) for (let side = 0; side < 2; side++) {
      const toRight = side === 0, x0 = toRight ? g.xx - 4 : g.xx - 11 - tw, x1 = toRight ? g.xx + 7 + tw : g.xx + 4;
      if (x1 > right || x0 < 8) continue;
      if (spans.some((q) => q.row >= r && q.row < r + n && x0 < q.x1 + 8 && x1 > q.x0 - 8)) continue;
      g.row = r; g.lines = fit.lines; g.toRight = toRight;
      for (let i = 0; i < n; i++) spans.push({ x0, x1, row: r + i });
      break place;
    }
  }
  let rows = groups.length ? 1 : 0;
  for (const g of groups) rows = Math.max(rows, g.row + (g.lines ? g.lines.length : 1));
  return { groups, rows };
}

/** The frame. */
export function traceFrame(rec: Record_, view: TraceView, box: TraceBox, ease: Ease = noEase): TraceOut {
  const { w, h, pal, fs } = box;
  const surf2 = pal.tok('surface-2'), text = pal.tok('text'), muted = pal.tok('text-2'), faint = pal.tok('text-3'), gridOn = pal.tok('border-strong');
  const danger = pal.tok('danger'), caution = pal.tok('caution');
  const shapes: Shape[] = [];
  const out: TraceOut = { frame: { w, h, shapes, label: 'Pressure over time' }, L: 36, plotW: 0, x0: 0, x1: 0, lanes: [], ends: [], marks: [], cross: null };
  shapes.push({ k: 'rect', x: 0, y: 0, w, h, r: Math.min(10, h / 4), fill: surf2, key: 'panel' });
  const hidden = view.hidden, showHvpg = !hidden?.has('trueHVPG'), days = view.range === 'days';
  const traces = activeTraces(view);
  const centred = (s: string, y: number, key: string) => shapes.push({ k: 'text', x: w / 2, y, s, size: fs, weight: 500, color: faint, anchor: 'middle', baseline: 'middle', key });
  const narrow = w < 460, tiny = w < 300 && (h - 52) * 0.55 >= traces.length * 27;   // (tiny: a tablet's card with its tiles beside; each end's name goes under its value)
  const L = 36, R = tiny ? 62 : narrow ? 94 : 104, B = 24, GAP = 16, EGAP = 16;
  const plotW = Math.max(40, w - L - R);
  let x0: number, x1: number, xNow: number;
  if (days) {
    const d = rec.days ?? [];
    if (d.length < 2) {
      centred('Advance the disease clock (+1 wk, +1 mo, +6 mo)', h / 2 - 8, 'empty-1'); centred('to follow pressure over days and months.', h / 2 + 12, 'empty-2');
      return out;
    }
    x1 = xNow = d[d.length - 1]!.day;
    x0 = Math.max(d[0]!.day, x1 - 730);
    if (x1 - x0 < 14) x0 = x1 - 14;
  } else {
    xNow = x1 = view.head; x0 = x1 - (view.range === 'beats' ? 10 : 120);
  }
  if (!traces.length && !showHvpg) { centred('Choose a trace below.', h / 2, 'empty'); return out; }
  const X = (t: number) => L + ((t - x0) / (x1 - x0)) * plotW;
  out.L = L; out.plotW = plotW; out.x0 = x0; out.x1 = x1;

  // markers: learner changes and events, where they happened; their labels stack in up to three rows and the plot starts below them
  const mk = layoutMarkers(marksIn(view, x0, x1), X, w - 8, fs), mRows = mk.rows;
  const T0 = Math.max(30, 30 + mRows * ROW);
  // lanes (trace-lanes.js): the EKG strip (the last beats only, or sweeping on over a time-lapse's days) over the pressures over the HVPG lane; where the room is short the strip
  // goes first, then the lane. The strip stands at the very top when no marker labels need the space there, so it never sits under them.
  const wantLane = showHvpg && (view.lane || !traces.length), wantEkg = (view.range === 'beats' || (days && view.stripHead != null)) && view.ekg;
  const ask = { pressure: traces.length > 0, hvpg: wantLane, gap: GAP, egap: EGAP, two: 0.64 };
  let plan = wantEkg ? laneRoom(h - (mRows ? T0 : 10) - B, { ...ask, ekg: true }) as { ekg: number; pressure: number; hvpg: number } : null;
  let T: number;
  if (plan?.ekg) T = mRows ? T0 : 10; else { T = T0; plan = laneRoom(h - T - B, { ...ask, ekg: false }) as { ekg: number; pressure: number; hvpg: number }; }
  const lanes: Lane[] = [];
  let ey = T, ekgLane: Lane | null = null, presLane: Lane | null = null, hvLane: Lane | null = null;
  if (plan!.ekg) { ekgLane = { key: 'ekg', top: ey, bot: ey + plan!.ekg, lo: -0.3, hi: 1, tick: 1 }; ey += plan!.ekg + EGAP; }
  if (plan!.pressure) { presLane = { key: 'pressure', top: ey, bot: ey + plan!.pressure, lo: 0, hi: 10, tick: 5 }; lanes.push(presLane); ey += plan!.pressure + GAP; }
  if (plan!.hvpg) { hvLane = { key: 'hvpg', top: ey, bot: ey + plan!.hvpg, lo: 0, hi: 16, tick: 4 }; lanes.push(hvLane); }
  out.lanes = ekgLane ? [ekgLane, ...lanes] : lanes;

  // the data, and each lane's range
  const px = plotW;
  const data = new Map<string, Series>();
  for (const t of traces) data.set(t.id, seriesOf(rec, t.id as Channel, view.range, x0, x1, view.smooth, px));
  data.set('hvpg', seriesOf(rec, 'hvpg', view.range, x0, x1, view.smooth, px));
  for (const lane of lanes) {
    const keys = lane.key === 'pressure' ? traces.map((t) => t.id as string) : ['hvpg'];
    let mn = Infinity, mx = -Infinity;
    for (const k of keys) {
      const [a, b] = extentOf(rec, k as Channel, view.range, view.smooth, x1, data.get(k)!);
      if (a < mn) mn = a; if (b > mx) mx = b;
    }
    let [lo, hi] = targetRange(lane.key as 'pressure' | 'hvpg', mn, mx);
    [lo, hi] = ease(lane.key as 'pressure' | 'hvpg', lo, hi);
    lane.lo = lo; lane.hi = hi; lane.tick = nice(hi - lo, lane.bot - lane.top > 120 ? 4 : 2);
  }
  const Yof = (lane: Lane) => (v: number) => lane.bot - ((v - lane.lo) / (lane.hi - lane.lo)) * (lane.bot - lane.top);
  const clipTo = (lane: Lane): Shape => ({ k: 'clip', x: L, y: lane.top - 2, w: plotW, h: lane.bot - lane.top + 4 });
  const pts = (s: Series, Y: (v: number) => number): number[] => { const p: number[] = []; for (let i = 0; i < s.x.length; i++) { const y = s.mid[i]!; if (y === y) p.push(X(s.x[i]!), Y(y)); } return p; };
  const hv = Math.max(0, Number.isFinite(view.ends.hvpg) ? view.ends.hvpg! : view.hvpg);
  const sev = pal.tok(sevTok(hv));
  const text12 = (x: number, y: number, s: string, color: Rgba, o: Partial<Extract<Shape, { k: 'text' }>> = {}) => { shapes.push({ k: 'text', x, y, s, size: fs, weight: 500, color, baseline: 'middle', ...o }); };
  const cx = view.cross != null && view.cross >= L && view.cross <= L + plotW ? view.cross : null;
  const xAtCross = cx != null ? x0 + ((cx - L) / plotW) * (x1 - x0) : null;
  const crossRows: { label: string; v: number; c: Rgba; y: number }[] = [];

  // grid, and the HVPG lane's cut-offs with their names
  for (const lane of lanes) {
    const Y = Yof(lane);
    for (let v = Math.ceil(lane.lo / lane.tick) * lane.tick; v <= lane.hi + 1e-9; v += lane.tick) {
      const yy = Math.round(Y(v)) + 0.5;
      shapes.push({ k: 'line', x1: L, y1: yy, x2: L + plotW, y2: yy, pen: { color: withAlpha(gridOn, 0.7), w: 1 } });
      if (lane.key === 'hvpg' && !narrow && Math.abs(v - HVPG_CUTS.red) < 1e-9) continue;   // (the CSPH line carries its own number)
      text12(L - 6, yy, fmt(v, lane.tick < 1 ? 1 : 0), faint, { anchor: 'end' });
    }
    if (lane.key !== 'hvpg') continue;
    const roomy = lane.bot - lane.top > 90;
    const labs: { s: string; y: number }[] = [];
    shapes.push(clipTo(lane));
    for (const [v, label] of LIMITS) {
      if (v > lane.hi || (v === HVPG_CUTS.amber && !roomy)) continue;
      const yy = Math.round(Y(v)) + 0.5, red = v >= HVPG_CUTS.red;
      shapes.push({ k: 'line', x1: L, y1: yy, x2: L + plotW, y2: yy, pen: { color: withAlpha(red ? danger : caution, red ? 0.5 : 0.35), w: 1, dash: [3, 4] } });
      if (label && !narrow && (roomy || v === HVPG_CUTS.red)) labs.push({ s: label, y: yy });
    }
    let prev: { x1: number; y: number } | null = null;
    for (const lb of labs) {
      const tw = measure(lb.s, fs, 600), lx = limitLabelX(prev, lb.y, L + 6) as number;
      shapes.push({ k: 'text', x: lx + 4, y: lb.y, s: lb.s, size: fs, weight: 600, color: danger, baseline: 'middle', halo: { color: surf2, w: 6 } });
      prev = { x1: lx + tw + 8, y: lb.y };
    }
    shapes.push({ k: 'unclip' });
  }

  // the lines
  const endsRaw: { lane: Lane; label: string; v: number; y: number; c: Rgba; ink: Rgba }[] = [];
  for (const lane of lanes) {
    const Y = Yof(lane);
    shapes.push(clipTo(lane));
    if (lane.key === 'hvpg') {
      const s = data.get('hvpg')!;
      if (s.x.length > 1) {
        const line = pts(s, Y);
        if (line.length >= 4) {
          // the area under the line fades from the status colour at the lane's top to nothing at its foot (2D's gradient, as stacked slabs)
          const SLABS = 8, laneH = lane.bot - lane.top;
          for (let q = 0; q < SLABS; q++) {
            const a = lane.top + (laneH * q) / SLABS, b = lane.top + (laneH * (q + 1)) / SLABS;
            const topY = line.map((v, i) => (i % 2 ? Math.min(Math.max(v, a), b) : v));
            shapes.push({ k: 'band', top: topY, bottom: line.map((v, i) => (i % 2 ? b : v)), fill: withAlpha(sev, 0.14 * (1 - (q + 0.5) / SLABS)), key: `hvpg-area-${q}` });
          }
          if (s.lo) shapes.push({ k: 'band', top: pts({ x: s.x, mid: s.hi! }, Y), bottom: pts({ x: s.x, mid: s.lo }, Y), fill: withAlpha(text, 0.1), key: 'hvpg-band' });
          shapes.push({ k: 'path', pts: line, pen: { color: text, w: 1.75, join: 'round', cap: 'round' }, key: 'hvpg-line' });
        }
        const e = days ? recent(s, true) : hv;
        endsRaw.push({ lane, label: 'HVPG', v: e, y: Y(e), c: text, ink: muted });
      }
    } else {
      const sw = data.get('whvp'), sf = data.get('RHV');
      if (sw && sf && sw.x.length > 1 && sw.x.length === sf.x.length && traces.some((t) => t.id === 'whvp') && traces.some((t) => t.id === 'RHV')) {
        const a = pts(sw, Y), b = pts(sf, Y);
        if (a.length === b.length && a.length >= 4) shapes.push({ k: 'band', top: a, bottom: b, fill: withAlpha(sev, 0.1), key: 'hvpg-between' });
      }
      for (const t of traces) {
        const s = data.get(t.id)!;
        if (s.x.length < 1) continue;
        const c = traceColour(pal, t.tok);
        if (s.lo) shapes.push({ k: 'band', top: pts({ x: s.x, mid: s.hi! }, Y), bottom: pts({ x: s.x, mid: s.lo }, Y), fill: withAlpha(c, 0.16), key: `${t.id}-band` });
        const line = pts(s, Y);
        if (line.length >= 4) shapes.push({ k: 'path', pts: line, pen: { color: c, w: t.id === 'CONF' ? 2 : 1.75, join: 'round', cap: 'round' }, key: `${t.id}-line` });
        if (days && s.x.length < 60) for (let i = 0; i < s.x.length; i++) {
          const yv = s.mid[i]!;
          if (yv !== yv) continue;
          shapes.push({ k: 'circle', cx: X(s.x[i]!), cy: Y(yv), r: 4, fill: surf2 }, { k: 'circle', cx: X(s.x[i]!), cy: Y(yv), r: 2.6, fill: c });
        }
        const live = view.ends[t.id];
        const e = days ? recent(s, true) : Number.isFinite(live) ? live! : recent(s);
        if (Number.isFinite(e)) endsRaw.push({ lane, label: t.abbr, v: e, y: Y(e), c, ink: traceInk(pal, t.tok) });
      }
    }
    shapes.push({ k: 'unclip' });
    if (xAtCross != null) for (const k of lane.key === 'pressure' ? traces.map((t) => t.id as string) : ['hvpg']) {
      const v = at(data.get(k)!, xAtCross, x1 - x0);
      if (v == null) continue;
      const t = TRACE_OF[k as TraceId];
      crossRows.push({ label: t ? t.short : 'HVPG', v, c: t ? traceColour(pal, t.tok) : text, y: Y(v) });
    }
  }

  // the EKG strip: a schematic rhythm laid over the model's own beats, one QRS to a beat; its end reading is the heart rate. Over the days' trend of a time-lapse it keeps
  // its own window, the last few seconds of the sweep that goes on.
  if (ekgLane && rec.t.length > 1) {
    const { top, bot } = ekgLane, sd = days, xs1 = sd ? view.stripHead! : x1, xs0 = sd ? xs1 - STRIP_S : x0;
    const e = ekgSeries(rec.beats as number[], Math.max(xs0, rec.t[0]!), xs1, 60 / (view.hr > 20 ? view.hr : 70));
    const Ye = (v: number) => bot - 3 - ((v + 0.3) / 1.3) * (bot - top - 6);   // (the S wave's dip to the R peak fill the lane)
    const Xe = sd ? (t: number) => L + ((t - xs0) / STRIP_S) * plotW : X;
    if (e.x.length > 1) {
      const p: number[] = [];
      for (let i = 0; i < e.x.length; i++) p.push(Xe(e.x[i]!), Ye(e.v[i]!));
      shapes.push({ k: 'clip', x: L, y: top - 2, w: plotW, h: bot - top + 4 });
      shapes.push({ k: 'path', pts: p, pen: { color: text, w: 1.5, join: 'round', cap: 'round' }, key: 'ekg-line' });
      shapes.push({ k: 'unclip' });
    }
    const mid = Math.round((top + bot) / 2);
    text12(8, mid, 'EKG', faint);
    if (Number.isFinite(view.hr)) endsRaw.push({ lane: ekgLane, label: 'HR', v: view.hr, y: mid, c: text, ink: muted });
  }
  text12(8, (lanes[0] ? lanes[0].top : T) - (ekgLane ? 8 : 12), 'mmHg', faint);
  if (lanes.length > 1) text12(8, lanes[1]!.top - 10, 'HVPG, mmHg', faint);

  // markers: a dotted line from each one's dot down through the lanes, its label beside the dot on a halo (the dotted lines of other markers pass behind it)
  const allTop = out.lanes[0]!.top, allBot = out.lanes[out.lanes.length - 1]!.bot;
  const markTok = (sv: string | null) => (sv && pal.has(sv) ? pal.tok(sv) : pal.tok('accent'));
  for (const g of mk.groups) {
    const y = g.row >= 0 ? 14 + g.row * ROW : allTop - 8;
    shapes.push({ k: 'line', x1: g.xx, y1: y + 4, x2: g.xx, y2: allBot, pen: { color: withAlpha(markTok(g.sev), 0.55), w: 1, dash: [2, 3] }, key: 'mark-line' });
  }
  for (const g of mk.groups) {
    const y = g.row >= 0 ? 14 + g.row * ROW : allTop - 8, c = markTok(g.sev);
    shapes.push({ k: 'circle', cx: g.xx, cy: y, r: 3, fill: c, key: 'mark-dot' });
    out.marks.push({ x: g.xx, y, label: g.lines ? g.lines.join(' ') : '', n: g.n, sev: g.sev });
    if (!g.lines) continue;
    g.lines.forEach((ln, i) => shapes.push({ k: 'text', x: g.toRight ? g.xx + 7 : g.xx - 7, y: y + i * ROW + 0.5, s: ln, size: fs, weight: 600, color: muted, anchor: g.toRight ? 'start' : 'end', baseline: 'middle', halo: { color: surf2, w: 4 }, key: 'mark-label' }));
  }

  // the readings at the right edge, nudged apart where they would collide, one column to a lane (2D)
  for (const lane of out.lanes) {
    const es = endsRaw.filter((e) => e.lane === lane).sort((a, b) => a.y - b.y);
    for (let i = 1; i < es.length; i++) es[i]!.y = Math.max(es[i]!.y, es[i - 1]!.y + (tiny ? 27 : 15));
    const over = es.length ? Math.min(es[es.length - 1]!.y - lane.bot, es[0]!.y - (lane.top + 4)) : 0;
    if (over > 0) for (const e of es) e.y -= over;
    const dec = (e: { label: string }) => (e.label === 'HR' ? 0 : 1);
    let colW = 0;
    if (!tiny) for (const e of es) colW = Math.max(colW, measure(fmt(e.v, dec(e)), 12.5, 600));
    for (const e of es) {
      const yy = Math.max(lane.top + 4, e.y);
      shapes.push({ k: 'rect', x: L + plotW + 4, y: yy - 1.5, w: 10, h: 3, r: 1.5, fill: e.c });
      if (tiny) shapes.push({ k: 'text', x: L + plotW + 17, y: yy, s: fmt(e.v, dec(e)), size: 12.5, weight: 600, color: text, baseline: 'middle' });
      else shapes.push({ k: 'text', x: L + plotW + 17 + colW, y: yy, s: fmt(e.v, dec(e)), size: 12.5, weight: 600, color: text, anchor: 'end', baseline: 'middle' });
      shapes.push({ k: 'text', x: tiny ? L + plotW + 17 : L + plotW + 20 + colW, y: tiny ? yy + 12 : yy, s: e.label, size: fs, weight: 600, color: e.c === text ? muted : e.ink, baseline: 'middle' });
      out.ends.push({ lane: lane.key, label: e.label, v: e.v, y: yy });
    }
  }

  // the time axis
  if (days) {
    const step = nice(x1 - x0, narrow ? 3 : 5);
    for (let d = Math.ceil(x0 / step) * step; d <= x1 + 1e-9; d += step) { const xx = X(d); if (xx > L + 20 && xx < L + plotW - 30) text12(xx, h - 8, `Day ${Math.round(d)}`, faint, { anchor: 'middle' }); }
    text12(L + plotW, h - 8, `Day ${Math.round(x1)}`, muted, { anchor: 'end' });
  } else {
    const step = view.range === 'beats' ? (narrow ? 5 : 2) : (narrow ? 60 : 30), name = view.range === 'beats' ? AX_BEATS : AX_MIN;
    for (let s = step; xNow - s > x0 + 1e-9; s += step) {
      const xx = X(xNow - s);
      if (xx < L + 12) break;
      text12(xx, h - 8, name(s), faint, { anchor: 'middle' });
    }
    const nowX = X(xNow);
    text12(Math.min(nowX, L + plotW), h - 8, 'now', muted, { anchor: nowX > L + plotW - 14 ? 'end' : 'middle' });
  }

  // the crosshair and its readout card: every trace at the one moment, the time as words
  if (cx != null && crossRows.length) {
    const lx = Math.round(cx) + 0.5;
    shapes.push({ k: 'line', x1: lx, y1: allTop, x2: lx, y2: allBot, pen: { color: withAlpha(text, 0.3), w: 1 }, key: 'cross-line' });
    for (const r of crossRows) shapes.push({ k: 'circle', cx, cy: r.y, r: 4.5, fill: surf2, key: 'cross-ring' }, { k: 'circle', cx, cy: r.y, r: 3, fill: r.c, key: 'cross-dot' });
    const when = days ? `Day ${Math.round(xAtCross!)}` : Math.abs(xNow - xAtCross!) < 0.05 ? 'now' : `${fmt(xNow - xAtCross!, view.range === 'beats' ? 1 : 0)} s ago`;
    const rowH = 18, padX = 10;
    let cw = measure(when, fs, 600);
    for (const r of crossRows) cw = Math.max(cw, measure(`${r.label}  ${fmt(r.v, 1)}`, fs, 500) + 14);
    cw += padX * 2;
    const ch = 12 + rowH * (crossRows.length + 1);
    let bx = cx + 14; if (bx + cw > L + plotW) bx = cx - 14 - cw;
    const by = Math.min(Math.max((lanes[0] ?? out.lanes[0]!).top, 4), h - ch - 4);
    const black: Rgba = [0, 0, 0, 1];
    for (const [grow, a] of [[10, 0.03], [6, 0.04], [3, 0.05]] as const) shapes.push({ k: 'rect', x: bx - grow + 0, y: by - grow + 4, w: cw + grow * 2, h: ch + grow * 2, r: 10 + grow, fill: withAlpha(black, a), key: 'cross-shadow' });
    shapes.push({ k: 'rect', x: bx, y: by, w: cw, h: ch, r: 10, fill: pal.tok('surface'), pen: { color: pal.tok('grid'), w: 1 }, key: 'cross-card' });
    text12(bx + padX, by + 18, when, muted, { weight: 600, key: 'cross-when' });
    crossRows.forEach((r, i) => {
      const yy = by + 18 + rowH * (i + 1);
      shapes.push({ k: 'rect', x: bx + padX - 1, y: yy - 5.5, w: 9, h: 3, r: 1.5, fill: r.c });
      text12(bx + padX + 12, yy, r.label, muted);
      text12(bx + cw - padX, yy, fmt(r.v, 1), text, { weight: 600, anchor: 'end' });
    });
    out.cross = { x: cx, when, rows: crossRows.map((r) => ({ label: r.label, v: r.v })) };
  }
  out.frame = { w, h, shapes, label: traceLabel(view, hv, traces) };
  return out;
}

/** The chart in a sentence for a screen reader. */
export function traceLabel(view: Pick<TraceView, 'range'>, hv: number, traces: readonly TraceDef[]): string {
  const when = view.range === 'beats' ? 'the last 10 seconds' : view.range === 'minutes' ? 'the last 2 minutes' : 'the days of the disease clock';
  const names = traces.map((t) => t.label).join(', ');
  return `Pressure over ${when}${names ? `: ${names}` : ''}. HVPG ${fmt(hv, 1)} mmHg, ${hvpgWordOf(hv)}.`;
}
