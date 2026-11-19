// Pressure over time as a chart frame (2D pressure-time.js, the Tests > Pressure > Over time pane): the portal circulation's pressures as lines over the last
// 10 s (every heartbeat and breath) or the last two minutes (a band from trough to peak around the mean), the HVPG on its own lane under them read against its
// cut-offs, and over the last beats a schematic EKG strip timed to the model's own heart. A pure function of the record, the choice and the box: the same
// inputs give the same frame, so a test reads the lanes, the lines and the words without a browser.
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
import type { Channel } from '../feed.ts';

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

export type Range = 'beats' | 'minutes';
export const RANGES: readonly (readonly [Range, string, number])[] = [['beats', '10 s', 10], ['minutes', '2 min', 120]];
export const SMOOTH_S = 6;
export const LAG_S = 0.12;

/** What the frame reads from: the kept record (`feed`), as arrays. */
export interface Record_ {
  t: ArrayLike<number>;
  ch: Record<Channel, ArrayLike<number>>;
  binT: ArrayLike<number>;
  bin: Record<Channel, { lo: ArrayLike<number>; hi: ArrayLike<number>; mean: ArrayLike<number> }>;
  /** when each beat began (the beat clock) */
  beats: ArrayLike<number>;
}
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
export function activeTraces(v: Pick<TraceView, 'chosen' | 'hidden'>): TraceDef[] {
  return TRACES.filter((t) => v.chosen.has(t.id) && !v.hidden?.has(t.hide));
}

/** One series in pixels-ready numbers: x (model seconds), the mean (or the line) and, on the two-minute range, the trough and the peak. */
export interface Series { x: number[]; mid: number[]; lo?: number[]; hi?: number[] }

// the first index with a[i] >= v
function lowerBound(a: ArrayLike<number>, v: number): number { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m]! < v) lo = m + 1; else hi = m; } return lo; }

/** A running mean over `w` seconds of a series' mid values on bins `dt` apart, run twice (one pass leaves a ripple of the breathing rhythm; 2D smoothed()). */
export function smoothed(x: ArrayLike<number>, v: ArrayLike<number>, secs: number): number[] {
  const pass = (src: ArrayLike<number>, half: number): number[] => {
    const out: number[] = new Array(src.length);
    let a = 0, b = 0, sum = 0, n = 0;
    for (let i = 0; i < src.length; i++) {
      while (b < src.length && x[b]! <= x[i]! + half) { const q = src[b]!; if (q === q) { sum += q; n++; } b++; }
      while (a < b && x[a]! < x[i]! - half) { const q = src[a]!; if (q === q) { sum -= q; n--; } a++; }
      out[i] = n ? sum / n : NaN;
    }
    return out;
  };
  return pass(pass(v, secs / 2), secs / 4);
}

/** The series of a channel in [x0, x1] for a range (2D series()). The beats range is the samples themselves (thinned to what a line of `px` pixels can show);
 *  the minutes range is the quarter-second bins (trough, peak, mean). `smooth` is the mean alone, averaged. */
export function seriesOf(rec: Record_, key: Channel, range: Range, x0: number, x1: number, smooth: boolean, px: number): Series {
  if (range === 'beats' && !smooth) {
    const t = rec.t, v = rec.ch[key];
    const i0 = Math.max(0, lowerBound(t, x0) - 1), i1 = Math.min(t.length, lowerBound(t, x1 + 1e-9) + 1);
    const n = Math.max(0, i1 - i0), stride = Math.max(1, Math.ceil(n / Math.max(40, px * 1.5)));
    const x: number[] = [], mid: number[] = [];
    for (let i = i0; i < i1; i += stride) { x.push(t[i]!); mid.push(v[i]!); }
    return { x, mid };
  }
  const T = rec.binT, b = rec.bin[key];
  const j0 = Math.max(0, lowerBound(T, smooth ? x0 - SMOOTH_S * 1.5 : x0 - 0.25) - 1), j1 = Math.min(T.length, lowerBound(T, x1 + 0.25));
  const x: number[] = [], mid: number[] = [], lo: number[] = [], hi: number[] = [];
  for (let j = j0; j < j1; j++) { x.push(T[j]! + 0.125); mid.push(b.mean[j]!); lo.push(b.lo[j]!); hi.push(b.hi[j]!); }
  if (smooth) {
    const sm = smoothed(x, mid, SMOOTH_S);
    const k = lowerBound(x, x0);
    return { x: x.slice(k), mid: sm.slice(k) };
  }
  const k = lowerBound(x, x0);
  return { x: x.slice(k), mid: mid.slice(k), lo: lo.slice(k), hi: hi.slice(k) };
}

/** The mean over the last second of a series (2D recent()). */
export function recent(s: Series): number {
  const n = s.x.length;
  if (!n) return NaN;
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

export interface Lane { key: 'ekg' | 'pressure' | 'hvpg'; top: number; bot: number; lo: number; hi: number; tick: number }
export interface TraceOut {
  frame: Frame;
  /** the plot's left edge and width, the window and where the lanes stand (a test, and the crosshair, read these) */
  L: number; plotW: number; x0: number; x1: number; lanes: Lane[];
  ends: { lane: Lane['key']; label: string; v: number; y: number }[];
}

/** The pressure lane's and the HVPG lane's y range for the data they hold (2D): the pressures start at zero when they are all above it, with a tenth of the span as room; the HVPG lane
 *  runs from zero to a multiple of 4 above the peak, never under 16. */
export function targetRange(key: 'pressure' | 'hvpg', mn: number, mx: number): [number, number] {
  if (!Number.isFinite(mn)) { mn = 0; mx = 10; }
  if (key === 'hvpg') return [0, Math.max(16, Math.ceil((mx + 3) / 4) * 4)];
  const pad = Math.max(1.5, (mx - mn) * 0.1);
  return [Math.max(mn >= 0 ? 0 : -Infinity, mn - pad), mx + pad];
}

/** The frame. */
export function traceFrame(rec: Record_, view: TraceView, box: TraceBox, ease: Ease = noEase): TraceOut {
  const { w, h, pal, fs } = box;
  const surf2 = pal.tok('surface-2'), text = pal.tok('text'), muted = pal.tok('text-2'), faint = pal.tok('text-3'), gridOn = pal.tok('border-strong');
  const danger = pal.tok('danger'), caution = pal.tok('caution');
  const shapes: Shape[] = [];
  const out: TraceOut = { frame: { w, h, shapes, label: 'Pressure over time' }, L: 36, plotW: 0, x0: 0, x1: 0, lanes: [], ends: [] };
  shapes.push({ k: 'rect', x: 0, y: 0, w, h, r: Math.min(10, h / 4), fill: surf2, key: 'panel' });
  const hidden = view.hidden, showHvpg = !hidden?.has('trueHVPG');
  const traces = activeTraces(view);
  if (!traces.length && !showHvpg) {
    shapes.push({ k: 'text', x: w / 2, y: h / 2, s: 'Choose a trace below.', size: fs, weight: 500, color: faint, anchor: 'middle', baseline: 'middle', key: 'empty' });
    return out;
  }
  const narrow = w < 460;
  const L = 36, R = narrow ? 94 : 104, B = 24, GAP = 16, EGAP = 16;
  const plotW = Math.max(40, w - L - R);
  const span = view.range === 'beats' ? 10 : 120;
  const x1 = view.head, x0 = x1 - span;
  const X = (t: number) => L + ((t - x0) / (x1 - x0)) * plotW;
  out.L = L; out.plotW = plotW; out.x0 = x0; out.x1 = x1;

  // lanes (trace-lanes.js): the EKG strip over the pressures over the HVPG lane; where the room is short the strip goes first, then the lane
  const wantLane = showHvpg && (view.lane || !traces.length), wantEkg = view.range === 'beats' && view.ekg;
  const T = 30;
  const plan = laneRoom(h - T - B, { ekg: wantEkg, pressure: traces.length > 0, hvpg: wantLane, gap: GAP, egap: EGAP, two: 0.64 }) as { ekg: number; pressure: number; hvpg: number };
  const lanes: Lane[] = [];
  let ey = T, ekgLane: Lane | null = null, presLane: Lane | null = null, hvLane: Lane | null = null;
  if (plan.ekg) { ekgLane = { key: 'ekg', top: ey, bot: ey + plan.ekg, lo: -0.4, hi: 1.1, tick: 1 }; ey += plan.ekg + EGAP; }
  if (plan.pressure) { presLane = { key: 'pressure', top: ey, bot: ey + plan.pressure, lo: 0, hi: 10, tick: 5 }; lanes.push(presLane); ey += plan.pressure + GAP; }
  if (plan.hvpg) { hvLane = { key: 'hvpg', top: ey, bot: ey + plan.hvpg, lo: 0, hi: 16, tick: 4 }; lanes.push(hvLane); }
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
      const s = data.get(k)!;
      for (let i = 0; i < s.x.length; i++) { const a = s.lo ? s.lo[i]! : s.mid[i]!, b = s.hi ? s.hi[i]! : s.mid[i]!; if (a < mn) mn = a; if (b > mx) mx = b; }
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
          shapes.push({ k: 'band', top: line, bottom: line.map((v, i) => (i % 2 ? Y(0) : v)), fill: withAlpha(sev, 0.12), key: 'hvpg-area' });
          if (s.lo) shapes.push({ k: 'band', top: pts({ x: s.x, mid: s.hi! }, Y), bottom: pts({ x: s.x, mid: s.lo }, Y), fill: withAlpha(text, 0.1), key: 'hvpg-band' });
          shapes.push({ k: 'path', pts: line, pen: { color: text, w: 1.75, join: 'round', cap: 'round' }, key: 'hvpg-line' });
        }
        endsRaw.push({ lane, label: 'HVPG', v: hv, y: Y(hv), c: text, ink: muted });
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
        const live = view.ends[t.id];
        const e = Number.isFinite(live) ? live! : recent(s);
        if (Number.isFinite(e)) endsRaw.push({ lane, label: t.abbr, v: e, y: Y(e), c, ink: traceInk(pal, t.tok) });
      }
    }
    shapes.push({ k: 'unclip' });
  }

  // the EKG strip: a schematic rhythm laid over the model's own beats, one QRS to a beat; its end reading is the heart rate
  if (ekgLane && rec.t.length > 1) {
    const { top, bot } = ekgLane, e = ekgSeries(rec.beats as number[], Math.max(x0, rec.t[0]!), x1, 60 / (view.hr > 20 ? view.hr : 70));
    const Ye = (v: number) => bot - ((v - ekgLane!.lo) / (ekgLane!.hi - ekgLane!.lo)) * (bot - top);
    if (e.x.length > 1) {
      const p: number[] = [];
      for (let i = 0; i < e.x.length; i++) p.push(X(e.x[i]!), Ye(e.v[i]!));
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

  // the readings at the right edge, nudged apart where they would collide, one column to a lane (2D)
  for (const lane of out.lanes) {
    const es = endsRaw.filter((e) => e.lane === lane).sort((a, b) => a.y - b.y);
    for (let i = 1; i < es.length; i++) es[i]!.y = Math.max(es[i]!.y, es[i - 1]!.y + 15);
    const over = es.length ? Math.min(es[es.length - 1]!.y - lane.bot, es[0]!.y - (lane.top + 4)) : 0;
    if (over > 0) for (const e of es) e.y -= over;
    const dec = (e: { label: string }) => (e.label === 'HR' ? 0 : 1);
    let colW = 0;
    for (const e of es) colW = Math.max(colW, measure(fmt(e.v, dec(e)), 12.5, 600));
    for (const e of es) {
      const yy = Math.max(lane.top + 4, e.y);
      shapes.push({ k: 'rect', x: L + plotW + 4, y: yy - 1.5, w: 10, h: 3, r: 1.5, fill: e.c });
      shapes.push({ k: 'text', x: L + plotW + 17 + colW, y: yy, s: fmt(e.v, dec(e)), size: 12.5, weight: 600, color: text, anchor: 'end', baseline: 'middle' });
      shapes.push({ k: 'text', x: L + plotW + 20 + colW, y: yy, s: e.label, size: fs, weight: 600, color: e.c === text ? muted : e.ink, baseline: 'middle' });
      out.ends.push({ lane: lane.key, label: e.label, v: e.v, y: yy });
    }
  }

  // the time axis
  const xNow = x1, step = view.range === 'beats' ? (narrow ? 5 : 2) : (narrow ? 60 : 30), name = view.range === 'beats' ? AX_BEATS : AX_MIN;
  for (let s = step; xNow - s > x0 + 1e-9; s += step) {
    const xx = X(xNow - s);
    if (xx < L + 12) break;
    text12(xx, h - 8, name(s), faint, { anchor: 'middle' });
  }
  const nowX = X(xNow);
  text12(Math.min(nowX, L + plotW), h - 8, 'now', muted, { anchor: nowX > L + plotW - 14 ? 'end' : 'middle' });
  out.frame = { w, h, shapes, label: traceLabel(view, hv, traces) };
  return out;
}

/** The chart in a sentence for a screen reader. */
export function traceLabel(view: Pick<TraceView, 'range'>, hv: number, traces: readonly TraceDef[]): string {
  const when = view.range === 'beats' ? 'the last 10 seconds' : 'the last 2 minutes';
  const names = traces.map((t) => t.label).join(', ');
  return `Pressure over ${when}${names ? `: ${names}` : ''}. HVPG ${fmt(hv, 1)} mmHg, ${hvpgWordOf(hv)}.`;
}
