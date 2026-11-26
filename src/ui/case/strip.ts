// The case bar's strip (docs/approved/play-the-case.md, "The bar"): History's strip, made small. The same paced days (timeline/strip.ts stripAxis, from the key moments), the chapters as
// faint bands, the reading's line, a line at each stop and the medicines as thin bars under it, and a short name over each stop's line, no dots. What is played and the playhead are
// not drawn here: they are a layer over the chart moved by a transform (CaseBar.tsx), so the days running never rebuild this frame. Pure: the story's data in, a frame out.
import { measure } from '../charts/measure.ts';
import { pen, type Frame, type Shape } from '../charts/scene.ts';
import type { ChartCtx } from '../charts/Chart.tsx';
import { colourOf } from '../bigtime/frame.ts';
import type { MedBar } from '../bigtime/marks.ts';
import type { Series } from '../bigtime/record.ts';
import type { Chapter, Tone } from '../timeline/story.ts';
import { STRIP_METRICS, stripAxis, type StripMetric } from '../timeline/strip.ts';
import { nearestStop } from './stops.ts';
import type { Stop } from './types.ts';

/** The strip's sizes: the names' row over the plot (none on a phone), the medicines' rows under it, the side pads (the playhead layer stands over the same span). */
export const CASE_STRIP = { NAMES: 18, MED_ROW: 5, PAD: 2, FS: 12 } as const;

export interface CaseStripIn {
  series: Readonly<Record<string, Series | undefined>>;
  metric: StripMetric;
  chapters: readonly Chapter[];
  /** the key moments' days (the paced axis is History's, from them) */
  keyDays: readonly number[];
  stops: readonly { day: number; tone: Tone; short: string }[];
  meds: readonly MedBar[];
  full: readonly [number, number];
  /** the stop the case is at or last left: its name is the darkest; the ones before it are played */
  at: number;
  /** the strip's height, px, and whether it has the names' row */
  h: number;
  names: boolean;
}

/** Where a day sits along the strip (0..1), and the day at a place: History's paced axis, so the bar's strip and History's agree. */
export function caseAxis(keyDays: readonly number[], full: readonly [number, number]): { frac(day: number): number; dayAt(f: number): number } {
  const a = stripAxis(keyDays, full), p = a.pace, lo = p.at(full[0]), span = Math.max(1e-9, p.at(full[1]) - lo);
  return { frac: a.frac, dayAt: (f) => Math.max(full[0], Math.min(full[1], p.day(lo + Math.max(0, Math.min(1, f)) * span))) };
}

/** The stop the playhead stands nearest when let go at `f` (0..1 along the strip). */
export function stopAtFrac(stops: readonly Stop[], axis: { dayAt(f: number): number }, f: number): number {
  return nearestStop(stops, axis.dayAt(f));
}

/** The names over the stops' lines: each centred on its line (the first starts at it), held inside the strip, and one that would touch the name before it is left out
 *  (the stop the case is at never is). NaN for a name left out. */
export function placeNames(items: readonly { x: number; w: number; first?: boolean; keep?: boolean }[], W: number, gap = 4): number[] {
  const xs = items.map((it) => Math.max(0, Math.min(W - it.w, it.first ? it.x : it.x - it.w / 2)));
  const shown = new Set<number>();
  const keep = items.findIndex((it) => it.keep);
  if (keep >= 0) shown.add(keep);
  let last = -1e9;
  for (let i = 0; i < items.length; i++) {
    if (i === keep) { last = xs[i]! + items[i]!.w; continue; }
    const next = keep > i ? xs[keep]! : Infinity;
    if (xs[i]! < last + gap || xs[i]! + items[i]!.w + gap > next) continue;
    shown.add(i); last = xs[i]! + items[i]!.w;
  }
  return items.map((_, i) => (shown.has(i) ? xs[i]! : NaN));
}

export function caseStripScene(inp: CaseStripIn, c: ChartCtx): Frame {
  const W = c.w, H = inp.h, shapes: Shape[] = [];
  const m = STRIP_METRICS.find((x) => x.id === inp.metric)!, s = inp.series[m.id];
  const label = `${m.name} over the case, Day ${Math.round(inp.full[0])} to ${Math.round(inp.full[1])}, with ${inp.stops.length} stops`;
  if (W < 60) return { w: W, h: H, shapes, label };
  const meds = inp.meds.filter((b) => b.spans.length).slice(0, 3);
  const { NAMES, MED_ROW, PAD, FS } = CASE_STRIP;
  const top = inp.names ? NAMES : 2, medH = meds.length ? meds.length * MED_ROW + 4 : 2, ph = Math.max(12, H - top - medH), base = top + ph;
  const axis = stripAxis(inp.keyDays, inp.full), X = (d: number) => PAD + axis.frac(d) * (W - 2 * PAD);
  const t3 = c.pal.tok('text-3');
  inp.chapters.forEach((ch, i) => { if (i % 2) shapes.push({ k: 'rect', x: X(ch.from), y: top, w: Math.max(1, X(ch.to) - X(ch.from)), h: ph, fill: c.pal.alpha(c.pal.tok('text'), 0.045) }); });
  // the scale: as History's strip (a gradient at least 16, so its line of 12 sits low)
  let max = m.id === 'shunt' ? 100 : m.id === 'asc' ? 4 : 16;
  if (s && m.id !== 'shunt') for (const v of s.y) max = Math.max(max, Math.ceil((v * m.k) / 4) * 4);
  const Y = (v: number) => base - 2 - (Math.max(0, Math.min(max, v * m.k)) / max) * (ph - 4);
  if (m.ref != null && m.ref < max) shapes.push({ k: 'line', x1: PAD, y1: Y(m.ref / m.k), x2: W - PAD, y2: Y(m.ref / m.k), pen: pen(c.pal.alpha(c.pal.tok('danger'), 0.6), 1, { dash: [3, 4] }) });
  const toneCol = (t: Tone) => (t === 'danger' ? c.pal.tok('danger') : t === 'ok' ? c.pal.tok('ok') : t === 'change' ? c.pal.tok('accent') : t === 'caution' ? c.pal.tok('caution') : t3);
  // a line at each stop between the start and today (the strip's own ends are those two)
  for (const st of inp.stops) {
    if (st.day <= inp.full[0] || st.day >= inp.full[1]) continue;
    shapes.push({ k: 'line', x1: X(st.day), y1: top, x2: X(st.day), y2: base, pen: pen(c.pal.alpha(toneCol(st.tone), 0.55), st.tone === 'change' ? 1.5 : 1) });
  }
  const col = colourOf(c.pal, m.tok);
  if (s && s.x.length > 1) {
    const pts: number[] = [];
    for (let i = 0; i < s.x.length; i++) pts.push(X(s.x[i]!), Y(s.y[i]!));
    shapes.push({ k: 'path', pts, pen: pen(col, 2, { cap: 'round', join: 'round' }) });
  }
  // the medicines: a thin bar each, from the day it was started to the day it was stopped (their names are History's; here the bar under the line says when)
  const accent = c.pal.tok('accent');
  meds.forEach((b, i) => {
    for (const sp of b.spans) {
      const xa = X(sp.from), xb = sp.to == null ? W - PAD : X(sp.to);
      shapes.push({ k: 'rect', x: xa, y: base + 4 + i * MED_ROW, w: Math.max(3, xb - xa), h: 3, r: 1.5, fill: c.pal.alpha(accent, i ? 0.5 : 0.8) });
    }
  });
  if (inp.names) {
    const items = inp.stops.map((st, i) => ({ x: X(st.day), w: measure(st.short, FS, 600), first: i === 0, keep: i === inp.at }));
    const xs = placeNames(items, W);
    inp.stops.forEach((st, i) => {
      const x = xs[i]!;
      if (!Number.isFinite(x)) return;
      const cur = i === inp.at, done = i < inp.at;
      shapes.push({ k: 'text', x, y: 12, s: st.short, size: FS, weight: 600, color: cur ? c.pal.tok('text') : done ? c.pal.tok('text-2') : t3, key: `n${i}` });
    });
  }
  return { w: W, h: H, shapes, label };
}
