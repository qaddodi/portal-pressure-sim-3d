// The case bar's strip (docs/approved/play-the-case.md, "The bar"), made to read at a glance (owner, 26 Nov, on the iPhone: "the bottom timeline bar, what's going on with it?"; it
// drew History's reading line, its dashed threshold, the medicines' bars and a tick at each stop, small and unnamed). Now it says one thing: where the case is in its story.
//   - a rail along the paced days (History's axis, timeline/strip.ts stripAxis), broken at each chapter, so the chapters read as its parts;
//   - a notch at each stop, in its moment's colour (a bleed red, a treatment the accent), the stop the case is at taller;
//   - the stops' short names over the rail (a Mac, an iPad), and the chapters' names under it (every screen; on a phone the only words), the current one in ink;
//   - what is played is the rail in ink and the playhead, a layer over the rail moved by a transform (CaseBar.tsx), so the days running never rebuild this frame.
// The readings and the medicines stay History's (its strip and its cards). Pure: the story's data in, a frame out.
import { measure } from '../charts/measure.ts';
import { pen, type Frame, type Shape } from '../charts/scene.ts';
import type { ChartCtx } from '../charts/Chart.tsx';
import type { Chapter, Tone } from '../timeline/story.ts';
import { stripAxis } from '../timeline/strip.ts';
import { nearestStop } from './stops.ts';
import type { Stop } from './types.ts';

/** The strip's sizes: the stop names' row over the rail (none on a phone), the rail, the chapters' row under it, the side pads (the played rail and the playhead stand over the same span). */
/** the least clear air between two names over the rail, px (a gap of one space read "Start TIPS" as one phrase) */
export const NAME_GAP = 12;
export const CASE_STRIP = { NAMES: 18, RAIL: 4, NOTCH: 12, CHAPTERS: 17, PAD: 6, FS: 12, GAP: 3 } as const;
/** where the rail's middle stands, px from the strip's top (CaseBar.tsx lays the played rail and the playhead there) */
export const railY = (names: boolean): number => (names ? CASE_STRIP.NAMES : 0) + CASE_STRIP.NOTCH / 2 + 2;
/** the chapters' names' baseline, px from the strip's top */
export const chapterY = (names: boolean): number => railY(names) + CASE_STRIP.NOTCH / 2 + 3 + CASE_STRIP.FS;
/** The height the strip's drawing needs: down to the chapters' names' descenders. The bar gives it at least this (case/room.ts CASE_STRIP_H; tests/case-bar.test.ts). */
export const stripNeeds = (names: boolean): number => Math.ceil(chapterY(names) + CASE_STRIP.FS * 0.3);

export interface CaseStripIn {
  chapters: readonly Chapter[];
  /** the key moments' days (the paced axis is History's, from them) */
  keyDays: readonly number[];
  stops: readonly { day: number; tone: Tone; short: string }[];
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

/** The names over the stops' lines: each centred on its line (the first starts at it), held inside the strip, and one that would come within `gap` px of another is left out. The stop
 *  the case is at never is; then the names that say something (`low` is the start and today, which the chapters and the bar already say) win over each other left to right, and
 *  the low ones last. NaN for a name left out. */
export function placeNames(items: readonly { x: number; w: number; first?: boolean; keep?: boolean; low?: boolean }[], W: number, gap = NAME_GAP): number[] {
  const xs = items.map((it) => Math.max(0, Math.min(W - it.w, it.first ? it.x : it.x - it.w / 2)));
  const order = items.map((_, i) => i).sort((a, b) => Number(!items[a]!.keep) - Number(!items[b]!.keep) || Number(!!items[a]!.low) - Number(!!items[b]!.low) || a - b);
  const taken: number[] = [];
  for (const i of order) {
    const a = xs[i]!, b = a + items[i]!.w;
    if (!items[i]!.keep && taken.some((j) => a < xs[j]! + items[j]!.w + gap && xs[j]! < b + gap)) continue;
    taken.push(i);
  }
  const shown = new Set(taken);
  return items.map((_, i) => (shown.has(i) ? xs[i]! : NaN));
}

/** The stops' names as they stand on a strip `W` px wide: the box of each that is shown (null for one left out). One place for the drawing and the tests. */
export function stripNames(inp: Pick<CaseStripIn, 'keyDays' | 'full' | 'stops' | 'at'>, W: number): ({ x: number; w: number } | null)[] {
  const axis = stripAxis(inp.keyDays, inp.full), { PAD, FS } = CASE_STRIP;
  const items = inp.stops.map((st, i) => ({
    x: PAD + axis.frac(st.day) * (W - 2 * PAD), w: measure(st.short, FS, 600), first: i === 0, keep: i === inp.at, low: i === 0 || i === inp.stops.length - 1,
  }));
  const xs = placeNames(items, W);
  return items.map((it, i) => (Number.isFinite(xs[i]!) ? { x: xs[i]!, w: it.w } : null));
}

/** the chapter a day is in (the last that starts on or before it) */
export const chapterAt = (chapters: readonly { from: number }[], day: number): number => { let k = 0; chapters.forEach((c, i) => { if (day >= c.from) k = i; }); return k; };

export function caseStripScene(inp: CaseStripIn, c: ChartCtx): Frame {
  const W = c.w, H = inp.h, shapes: Shape[] = [];
  const cur = inp.stops[inp.at], chNow = chapterAt(inp.chapters, cur?.day ?? inp.full[0]);
  const chName = inp.chapters[chNow]?.label;
  const label = `The case from Day ${Math.round(inp.full[0])} to Day ${Math.round(inp.full[1])}: stop ${inp.at + 1} of ${inp.stops.length}${chName ? `, ${chName}` : ''}`;
  if (W < 60) return { w: W, h: H, shapes, label };
  const { RAIL, NOTCH, PAD, FS, GAP } = CASE_STRIP;
  const axis = stripAxis(inp.keyDays, inp.full), X = (d: number) => PAD + axis.frac(d) * (W - 2 * PAD);
  const ry = railY(inp.names), t3 = c.pal.tok('text-3'), faint = c.pal.alpha(c.pal.tok('text'), 0.16);
  // the rail, one piece a chapter (a small gap between them)
  const named = inp.chapters.filter((ch) => ch.to > ch.from);
  named.forEach((ch, i) => {
    const xa = X(ch.from) + (i ? GAP / 2 : 0), xb = X(ch.to) - (i < named.length - 1 ? GAP / 2 : 0);
    shapes.push({ k: 'rect', x: xa, y: ry - RAIL / 2, w: Math.max(1, xb - xa), h: RAIL, r: RAIL / 2, fill: faint, key: `r${i}` });
  });
  if (!named.length) shapes.push({ k: 'rect', x: PAD, y: ry - RAIL / 2, w: W - 2 * PAD, h: RAIL, r: RAIL / 2, fill: faint, key: 'r0' });
  // a notch at each stop, in its moment's colour; the stop the case is at, taller
  const toneCol = (t: Tone) => (t === 'danger' ? c.pal.tok('danger') : t === 'ok' ? c.pal.tok('ok') : t === 'change' ? c.pal.tok('accent') : t === 'caution' ? c.pal.tok('caution') : t3);
  inp.stops.forEach((st, i) => {
    const x = X(st.day), n = i === inp.at ? NOTCH + 4 : NOTCH;
    shapes.push({ k: 'rect', x: x - 1, y: ry - n / 2, w: 2, h: n, r: 1, fill: c.pal.alpha(toneCol(st.tone), i === inp.at ? 1 : 0.8), key: `s${i}` });
  });
  // the stops' names over the rail (not on a phone: too many for its width)
  if (inp.names) {
    const boxes = stripNames(inp, W);
    inp.stops.forEach((st, i) => {
      const x = boxes[i]?.x;
      if (x == null) return;
      shapes.push({ k: 'text', x, y: 12, s: st.short, size: FS, weight: 600, color: i === inp.at ? c.pal.tok('text') : i < inp.at ? c.pal.tok('text-2') : t3, key: `n${i}` });
    });
  }
  // the chapters' names under the rail, each from its start; the current one in ink and always shown
  if (named.length > 1 || named[0]?.label) {
    const cy = chapterY(inp.names);
    const items = named.map((ch, i) => ({ x: X(ch.from) + (i ? GAP : 0), w: measure(ch.label, FS, 500), first: true, keep: inp.chapters.indexOf(ch) === chNow }));
    const xs = placeNames(items, W, 10);
    named.forEach((ch, i) => {
      const x = xs[i]!;
      if (!Number.isFinite(x) || !ch.label) return;
      const now = inp.chapters.indexOf(ch) === chNow;
      shapes.push({ k: 'text', x, y: cy, s: ch.label, size: FS, weight: now ? 600 : 500, color: now ? c.pal.tok('text') : t3, key: `c${i}` });
    });
  }
  return { w: W, h: H, shapes, label };
}
