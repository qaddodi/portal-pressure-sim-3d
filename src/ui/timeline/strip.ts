// The strip over the timeline list (docs/approved/timeline-story.md, option A): one reading along the whole course, the chapters as bands, a line at each key moment, the medicines as
// bars under it and the day numbers at its foot. The days are paced as the Over time chart paces them (bigtime/pace.ts): a busy stretch gets room. The playhead is not drawn here: it is
// a layer of its own over the chart, moved by a transform (the one clock), so a scroll never rebuilds this frame. Pure: the story's data in, a frame for the chart GPU out.
import { measure } from '../charts/measure.ts';
import { pen, type Frame, type Shape } from '../charts/scene.ts';
import type { ChartCtx } from '../charts/Chart.tsx';
import { valueAt, type Series } from '../bigtime/record.ts';
import { paceOf, type Pace } from '../bigtime/pace.ts';
import { colourOf, inkOf } from '../bigtime/frame.ts';
import type { MedBar } from '../bigtime/marks.ts';
import type { Chapter, Tone } from './story.ts';

/** the readings the strip can draw: id (the measure's), name, unit, colour token, scale to the unit, decimals, and the line a gradient is judged by */
export const STRIP_METRICS = [
  { id: 'ppg', name: 'PPG', unit: 'mmHg', tok: 'tr-ppg', k: 1, dp: 1, ref: 12 },
  { id: 'hvpg', name: 'HVPG', unit: 'mmHg', tok: 'tr-hvpg', k: 1, dp: 1, ref: 12 },
  { id: 'asc', name: 'Ascites', unit: 'L', tok: 'asc', k: 1, dp: 1, ref: null },
  { id: 'shunt', name: 'Shunt', unit: '%', tok: 'shunt', k: 100, dp: 0, ref: null },
] as const;
export type StripMetric = (typeof STRIP_METRICS)[number]['id'];

export interface StripIn {
  series: Readonly<Record<string, Series | undefined>>;
  metric: StripMetric;
  chapters: readonly Chapter[];
  /** the key moments' days and tones (a line each) */
  marks: readonly { day: number; tone: Tone }[];
  meds: readonly MedBar[];
  /** the whole course, in days */
  full: readonly [number, number];
  /** the day the figure is at when it is not the last (the days after it are the future, dimmed), else null */
  cut: number | null;
}

/** the strip's sides: the plot runs from L to w - R (the playhead layer stands over the same span) */
export const STRIP_PAD = { L: 12, R: 12 } as const;
const FS = 12, PLOT = 76, TOP = 8, MED_H = 22, AXIS_H = 20;

/** where a day sits along the strip, 0 at the start and 1 at today: the paced axis, from the key days (the scene and the playhead both read it) */
export function stripAxis(keyDays: readonly number[], full: readonly [number, number]): { pace: Pace; frac(day: number): number } {
  const pace = paceOf(keyDays, full), a = pace.at(full[0]), span = Math.max(1e-9, pace.at(full[1]) - a);
  return { pace, frac: (d) => Math.max(0, Math.min(1, (pace.at(d) - a) / span)) };
}

export function stripScene(inp: StripIn, c: ChartCtx): Frame {
  const W = c.w, shapes: Shape[] = [], m = STRIP_METRICS.find((x) => x.id === inp.metric)!;
  const s = inp.series[m.id];
  const label = `${m.name} over the course, Day ${Math.round(inp.full[0])} to ${Math.round(inp.full[1])}, with ${inp.marks.length} key moments`;
  const meds = inp.meds.filter((b) => b.spans.length);
  const H = TOP + PLOT + (meds.length ? meds.length * MED_H + 4 : 0) + AXIS_H;
  if (W < 60) return { w: W, h: H, shapes, label };
  const { L, R } = STRIP_PAD, axis = stripAxis(inp.marks.map((k) => k.day), inp.full);
  const X = (d: number) => L + axis.frac(d) * (W - L - R);
  const t3 = c.pal.tok('text-3'), grid = c.pal.tok('grid'), surface = c.pal.tok('surface'), base = TOP + PLOT;
  // the chapters: every other one a faint band, so where one ends shows without a word
  inp.chapters.forEach((ch, i) => { if (i % 2) shapes.push({ k: 'rect', x: X(ch.from), y: TOP, w: Math.max(1, X(ch.to) - X(ch.from)), h: PLOT, fill: c.pal.alpha(c.pal.tok('text'), 0.045) }); });
  // the scale: the line's own top (a gradient's at least 16, so 12 sits low; ascites at least 4 L; the shunt in %)
  let max = m.id === 'shunt' ? 100 : m.id === 'asc' ? 4 : 16;
  if (s && m.id !== 'shunt') for (const v of s.y) max = Math.max(max, Math.ceil((v * m.k) / 4) * 4);
  const Y = (v: number) => base - 4 - (Math.max(0, Math.min(max, v * m.k)) / max) * (PLOT - 10);
  for (let g = 0; g <= 2; g++) { const y = base - 4 - (g / 2) * (PLOT - 10); shapes.push({ k: 'line', x1: L, y1: y, x2: W - R, y2: y, pen: pen(c.pal.alpha(grid, g ? 0.6 : 1), 1) }); }
  if (m.ref != null && m.ref < max) {
    const y = Y(m.ref / m.k), danger = c.pal.tok('danger');
    shapes.push({ k: 'line', x1: L, y1: y, x2: W - R, y2: y, pen: pen(c.pal.alpha(danger, 0.75), 1, { dash: [3, 4] }) });
    shapes.push({ k: 'text', x: L + 2, y: y - 4, s: `${m.name} ${m.ref}`, size: FS, weight: 600, color: inkOf(c.pal, 'danger'), halo: { color: surface, w: 3 } });
  }
  // the key moments, behind the line
  const toneCol = (t: Tone) => (t === 'danger' ? c.pal.tok('danger') : t === 'ok' ? c.pal.tok('ok') : t === 'change' ? c.pal.tok('accent') : t === 'caution' ? c.pal.tok('caution') : t3);
  for (const k of inp.marks) shapes.push({ k: 'line', x1: X(k.day), y1: TOP, x2: X(k.day), y2: base, pen: pen(c.pal.alpha(toneCol(k.tone), 0.5), k.tone === 'change' ? 1.5 : 1) });
  // the line (an area under it for a volume), each point where the paced axis puts its day
  const col = colourOf(c.pal, m.tok);
  if (s && s.x.length > 1) {
    const pts: number[] = [];
    for (let i = 0; i < s.x.length; i++) pts.push(X(s.x[i]!), Y(s.y[i]!));
    if (m.id === 'asc') {
      const top: number[] = [], bottom: number[] = [];
      for (let i = 0; i < pts.length; i += 2) { top.push(pts[i]!, pts[i + 1]!); bottom.push(pts[i]!, base - 4); }
      shapes.push({ k: 'band', top, bottom, fill: c.pal.alpha(col, 0.18) });
    }
    shapes.push({ k: 'path', pts, pen: pen(col, 2, { cap: 'round', join: 'round' }) });
  } else if (s && s.x.length === 1) shapes.push({ k: 'circle', cx: X(s.x[0]!), cy: Y(s.y[0]!), r: 3, fill: col });
  // the future: what comes after the moment the figure is at, under a veil
  if (inp.cut != null && inp.cut < inp.full[1]) shapes.push({ k: 'rect', x: X(inp.cut), y: TOP, w: W - R - X(inp.cut), h: PLOT, fill: c.pal.alpha(surface, 0.55) });
  // the medicines: the name over a 4 px bar from the day it was started to the day it was stopped
  const accent = c.pal.tok('accent');
  meds.forEach((b, i) => {
    const y0 = base + 4 + i * MED_H;
    let last = -1e9;
    for (const sp of b.spans) {
      const xa = X(sp.from), xb = sp.to == null ? W - R : X(sp.to);
      shapes.push({ k: 'rect', x: xa, y: y0 + 14, w: Math.max(3, xb - xa), h: 4, r: 2, fill: c.pal.alpha(accent, 0.8) });
      const w = measure(b.name, FS, 600), tx = Math.min(Math.max(L, xa), W - R - w);
      if (tx >= last) { shapes.push({ k: 'text', x: tx, y: y0 + 11, s: b.name, size: FS, weight: 600, color: inkOf(c.pal, 'accent') }); last = tx + w + 8; }
    }
  });
  // the days: a few round numbers that do not crowd one another
  const span = inp.full[1] - inp.full[0], step = [5, 10, 20, 30, 50, 60, 100, 120, 200, 365].find((k) => span / k <= 6) ?? 365;
  let lastX = -1e9;
  const tick = (d: number) => {
    const x = X(d), w = measure(String(d), FS, 500);
    if (x - lastX < w + 14) return;
    shapes.push({ k: 'text', x: Math.min(W - R - w / 2, Math.max(L + w / 2, x)), y: H - 5, s: String(d), size: FS, color: t3, anchor: 'middle' }); lastX = x;
  };
  for (let d = Math.ceil(inp.full[0] / step) * step; d <= inp.full[1]; d += step) tick(d);
  return { w: W, h: H, shapes, label };
}

/** the strip's reading at a day, in its unit ("16.4 mmHg"), or null */
export function stripReading(series: StripIn['series'], metric: StripMetric, day: number): string | null {
  const m = STRIP_METRICS.find((x) => x.id === metric)!, v = valueAt(series[m.id], day);
  return v == null ? null : `${(v * m.k).toFixed(m.dp)} ${m.unit}`;
}
