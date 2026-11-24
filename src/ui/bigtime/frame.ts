// The timeline chart as a frame (docs/approved/timeline-chart.md): stacked lanes on one day axis, the medicine bars above them, the event lines and their words, a crosshair that reads every lane.
// A pure function of its inputs and the box (layout from the F mocks, `gen3.mjs`): the lines are the chart GPU's, the words its text layer. Coordinates are CSS px in the box.
import type { ChartCtx } from '../charts/Chart.tsx';
import { contrast, type Rgba } from '../charts/colour.ts';
import { measure } from '../charts/measure.ts';
import { pen, type Frame, type Shape } from '../charts/scene.ts';
import type { Palette } from '../charts/palette.ts';
import { HVPG_CUTS } from '../../engine/hales/portal/pressure-cuts.js';
import { ASCITES_CUTS } from '../../engine/hales/portal/metrics.js';
import { FLOW_CUTS } from '../../engine/hales/portal/flow-cuts.js';
import { MEASURE_OF, HVPG, laneOf, type LaneId, type Measure } from './measures.ts';
import type { MarkLine, MedBar, Tone } from './marks.ts';
import { maxOf, pointsIn, tickStep, valueAt, type Series } from './record.ts';
import { paceOf, scaleWord } from './pace.ts';

export interface BigIn {
  /** the record by measure id, in the record's own units (a pressure in mmHg, ascites in L, the shunt as 0..1) */
  series: Readonly<Record<string, Series | undefined>>;
  /** the HVPG, or null while the model's true HVPG is not shown (Budd-Chiari) */
  hvpg: Series | null;
  /** the measures drawn, by id */
  on: readonly string[];
  lines: readonly MarkLine[];
  meds: readonly MedBar[];
  /** the whole run, and the days the chart shows */
  full: readonly [number, number];
  win: readonly [number, number];
  /** the day the crosshair is on, or null (the lane titles then read the newest day) */
  cursor: number | null;
  /** the box's height, px */
  h: number;
}

/** where things are in the box, for the card's pointer (a day from an x) */
export interface Geo {
  w: number; h: number; L: number; R: number; top: number; bottom: number;
  x0: number; x1: number;
  X(day: number): number; dayAt(x: number): number;
  lanes: readonly { id: LaneId; t: number; h: number }[];
}

const WEIGHT: Record<LaneId, number> = { p: 3, hvpg: 1.5, asc: 1.7, shunt: 1.7, co: 1.4 };
const ORDER: readonly LaneId[] = ['p', 'hvpg', 'asc', 'shunt', 'co'];
export const ROW_H = 17, MED_H = 24, AXIS_H = 24, GAP = 22;
/** the strip at the top of each lane that holds its title: the lines are drawn below it, so a title never sits on a curve */
export const TITLE_H = 20;

/** a measure's colour, and its ink for words (the palette's `-ink` twin where it has one; the shunt and the origin colours are the figure's own) */
export function colourOf(pal: Palette, tok: string): Rgba {
  if (pal.has(tok)) return pal.tok(tok);
  if (tok === 'shunt') return pal.dark ? [0xf0 / 255, 0x91 / 255, 0x4a / 255, 1] : [0xd9 / 255, 0x73 / 255, 0x1f / 255, 1];
  if (tok === 'asc') return pal.dark ? [0xa3 / 255, 0xc0 / 255, 0x60 / 255, 1] : [0x7a / 255, 0x93 / 255, 0x3f / 255, 1];
  if (tok === 'tr-sv') return [0x7d / 255, 0x5c / 255, 0xdb / 255, 1];
  if (tok === 'tr-smv') return [0xe6 / 255, 0x99 / 255, 0x29 / 255, 1];
  return pal.tok('text-2');
}
/** the colour as a word wears it: the palette's `-ink` twin, or the colour drawn toward the text colour just far enough to read on the card (4.5:1) */
export function inkOf(pal: Palette, tok: string): Rgba {
  if (pal.has(`${tok}-ink`)) return pal.tok(`${tok}-ink`);
  const c = colourOf(pal, tok), card = pal.tok('surface');
  for (let k = 100; k >= 0; k -= 8) { const m = k === 100 ? c : pal.mix('srgb', c, k, pal.tok('text'), 100 - k); if (contrast(m, card) >= 4.6) return m; }
  return pal.tok('text');
}
const toneInk = (pal: Palette, t: Tone): Rgba => (t === 'change' ? pal.tok('text') : t === 'ok' ? inkOf(pal, 'ok') : t === 'caution' ? inkOf(pal, 'caution') : t === 'danger' ? inkOf(pal, 'danger') : pal.tok('text-2'));

interface LaneSpec { id: LaneId; ms: readonly Measure[]; max: number; ticks: readonly number[]; tickWords?: (v: number) => string; cuts: readonly { v: number; word: string; below?: boolean; ink: 'text-2' | 'text-3' | 'danger' }[]; fill?: boolean; zone?: boolean }

const niceMax = (m: number, floor: number, step: number): number => Math.max(floor, Math.ceil((m * 1.12) / step) * step);
/** the HVPG lane's ticks: every 5 mmHg, every 10 when the lane is tall (a decompensated patient reads above 20) */
const hvpgTicks = (max: number): number[] => { const st = max > 30 ? 10 : 5; return Array.from({ length: Math.floor(max / st) + 1 }, (_, i) => i * st).filter((t) => t <= max - 2); };
function specOf(id: LaneId, inp: BigIn): LaneSpec | null {
  if (id === 'hvpg') {
    // the gradients' lane: the HVPG with its zones when it is on, the PPG and the EUS-PPG as lines of their own
    const hv = inp.on.includes('hvpg') ? inp.hvpg : null, gs = laneOf('hvpg').filter((m) => m.id !== 'hvpg' && inp.on.includes(m.id) && inp.series[m.id]);
    if (!hv && !gs.length) return null;
    const max = niceMax(Math.max(maxOf(hv), ...gs.map((m) => maxOf(inp.series[m.id]))), 16, 2);
    return { id, ms: gs, max, ticks: hvpgTicks(max), zone: !!hv, cuts: hv ? [{ v: HVPG_CUTS.bleed, word: `Bleed risk ${HVPG_CUTS.bleed}`, ink: 'danger' }, { v: HVPG_CUTS.red, word: `CSPH ${HVPG_CUTS.red}`, ink: 'danger', below: true }] : [] };
  }
  const ms = laneOf(id).filter((m) => inp.on.includes(m.id) && inp.series[m.id]);
  if (!ms.length) return null;
  const peak = Math.max(...ms.map((m) => maxOf(inp.series[m.id]) * (m.id === 'shunt' ? 100 : 1)));
  if (id === 'p') { const max = niceMax(peak, 24, 4); return { id, ms, max, ticks: max > 40 ? [0, 20, 40, 60].filter((t) => t <= max) : [0, 10, 20, 30].filter((t) => t <= max), cuts: [] }; }
  if (id === 'asc') { const max = niceMax(peak, 3, 1); return { id, ms, max, ticks: Array.from({ length: Math.floor(max) + 1 }, (_, i) => i).filter((t) => max <= 5 || t % 2 === 0), fill: true, cuts: [{ v: ASCITES_CUTS[1]! / 1000, word: `Grade 2 · ${ASCITES_CUTS[1]! / 1000} L`, ink: 'text-2' }, { v: ASCITES_CUTS[0]! / 1000, word: `Grade 1 · ${ASCITES_CUTS[0]! / 1000} L`, ink: 'text-3' }] }; }
  if (id === 'shunt') { const max = Math.min(100, niceMax(peak, 70, 10)); return { id, ms, max, ticks: [0, 20, 40, 60, 80, 100].filter((t) => t <= max), cuts: [{ v: FLOW_CUTS.shuntLarge * 100, word: `Large shunt ${Math.round(FLOW_CUTS.shuntLarge * 100)}%`, ink: 'text-2' }] }; }
  const max = niceMax(peak, 9, 3);
  return { id, ms, max, ticks: Array.from({ length: Math.floor(max / 3) + 1 }, (_, i) => i * 3), cuts: [] };
}

/** the words of a long label cut in two lines near the middle (an upright label on a phone) */
export function wrap2(t: string, fs: number, limit = 96): string[] {
  if (measure(t, fs, 500) < limit) return [t];
  const w = t.split(' ');
  let best = 1, bd = Infinity;
  for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length); if (d < bd) { bd = d; best = i; } }
  return [w.slice(0, best).join(' '), w.slice(best).join(' ')];
}

/** the room left of the plot (the lane's numbers) and right of it, by the chart's width: the strip under it keeps the same */
export const leadOf = (w: number): { L: number; R: number } => (w < 560 ? { L: 38, R: 8 } : { L: 40, R: 12 });

export function bigFrame(inp: BigIn, c: ChartCtx): { frame: Frame; geo: Geo } {
  const pal = c.pal, fs = Math.max(12, c.type.sm), W = Math.max(120, Math.round(c.w)), H = Math.max(160, Math.round(inp.h));
  const phone = W < 560;
  const { L, R } = leadOf(W), plotW = W - L - R;
  const [x0, x1] = inp.win, span = Math.max(1e-6, x1 - x0);
  // the days are paced by their events (pace.ts): X and dayAt look through the window onto one axis whose scale is constant inside each piece
  const pace = paceOf(inp.lines.map((e) => e.day), inp.full), p0 = pace.at(x0), pspan = Math.max(1e-6, pace.at(x1) - p0);
  const X = (d: number) => L + (pace.at(d) - p0) / pspan * plotW;
  const dayAt = (x: number) => pace.day(p0 + (x - L) / plotW * pspan);
  const axH = pace.flat ? AXIS_H : AXIS_H + 15;
  const text = pal.tok('text'), t2 = pal.tok('text-2'), t3 = pal.tok('text-3'), hair = pal.alpha(pal.tok('text'), 0.1), hair2 = pal.alpha(pal.tok('text'), 0.2);
  const halo = { color: pal.alpha(pal.tok('surface'), 0.92), w: 3.5 };
  const accent = pal.tok('accent');
  const shapes: Shape[] = [];
  const say = (s: Omit<Extract<Shape, { k: 'text' }>, 'k' | 'size' | 'halo'> & { size?: number; halo?: boolean }): void => { const { halo: h, size, ...rest } = s; shapes.push({ k: 'text', size: size ?? fs, ...(h === false ? {} : { halo }), ...rest }); };

  // ── what is in the window ──
  const lines = inp.lines.filter((e) => e.day >= x0 - 1e-6 && e.day <= x1 + 1e-6).sort((a, b) => a.day - b.day);
  const meds = inp.meds.filter((m) => m.spans.some((s) => (s.to ?? Infinity) >= x0 && s.from <= x1));
  // ── the words over the plot: event labels in rows (a wide card) or upright (a phone) ──
  type Placed = { e: MarkLine; x: number; r: number; w: number; xs?: number; lift?: number; ls?: string[] };
  const placed: Placed[] = [];
  let top: number;
  if (!phone) {
    const end: number[] = [], told = new Set<string>();
    for (const e of lines) {
      // the same event again (Ascites forming, four times) keeps its line and loses its words: the first one says it, History lists every day
      if (e.kind === 'event' && told.has(e.label)) { placed.push({ e, x: X(e.day), r: -1, w: 0 }); continue; }
      told.add(e.label);
      const w = measure(e.label, fs, e.tone === 'change' ? 600 : 500), x = Math.min(X(e.day) + 5, W - 6 - w);
      let r = 0; while (end[r] != null && end[r]! > x - 8) r++;
      end[r] = x + w; placed.push({ e, x, r, w });
    }
    top = 6 + Math.max(2, end.length) * ROW_H + 8;
  } else {
    // a phone sets each label at 45°, reading up and to the right from its line (owner, 24 Nov); labels whose lines are close are lifted along their lines until no two overlap
    const told = new Set<string>(), R2 = Math.SQRT1_2, boxes: { n0: number; n1: number; a0: number; a1: number }[] = [], lh = fs * 1.15;
    let band = 36;
    for (const e of lines) {
      if (e.kind === 'event' && told.has(e.label)) { placed.push({ e, x: X(e.day), r: -1, w: 0, xs: X(e.day), lift: 0, ls: [] }); continue; }
      told.add(e.label);
      // a long name breaks in two lines near its middle; the last line starts on the event's line, the first sits up and to the left of it
      const ls = wrap2(e.label, fs, 120), w = Math.max(...ls.map((l) => measure(l, fs, e.tone === 'change' ? 600 : 500))), len = w * R2, x = X(e.day), xs = Math.min(x + 2, W - 6 - len), up = (ls.length - 1) * lh;
      let lift = 0;
      for (;;) {   // the label's last line starts at (xs, base - lift): n runs across the label, a along it
        const n1 = (xs - lift) * R2 + lh * 0.7, n0 = n1 - up - lh * 1.6, a0 = (xs + lift) * R2, a1 = a0 + w + 6;
        if (!boxes.some((b) => n0 < b.n1 && n1 > b.n0 && a0 < b.a1 && a1 > b.a0)) { boxes.push({ n0, n1, a0, a1 }); break; }
        lift += 3;
      }
      placed.push({ e, x, r: 0, w, xs, lift, ls }); band = Math.max(band, lift + len + up * R2 + fs);
    }
    top = 10 + Math.ceil(band) + 12;
  }
  // ── lanes ──
  const specs = ORDER.map((id) => specOf(id, inp)).filter((s): s is LaneSpec => !!s);
  const medRows = meds.length, medsH = medRows ? medRows * MED_H + 6 : 0;
  const nL = Math.max(1, specs.length);
  const free = Math.max(60 * nL, H - top - medsH - axH - GAP * (nL - 1)), wsum = specs.reduce((a, s) => a + WEIGHT[s.id], 0) || 1;
  let y = top + medsH;
  const geoLanes = specs.map((s) => { const h = specs.length ? free * WEIGHT[s.id] / wsum : free, g = { s, t: y, h }; y += h + GAP; return g; });
  const bottom = specs.length ? y - GAP : top + medsH + free;
  const frame = (): Frame => ({ w: W, h: bottom + axH, shapes, label: '' });
  const geo: Geo = { w: W, h: bottom + axH, L, R, top, bottom, x0, x1, X, dayAt, lanes: geoLanes.map((g) => ({ id: g.s.id, t: g.t, h: g.h })) };

  // zones, grids, cut-offs
  for (const g of geoLanes) {
    const Y = (v: number) => g.t + g.h - v / g.s.max * (g.h - TITLE_H);
    if (g.s.zone) {
      const N = 40;
      for (let i = 0; i < N; i++) {
        const v0 = i / N * g.s.max, v1 = (i + 1) / N * g.s.max, v = (v0 + v1) / 2;
        const a = v < HVPG_CUTS.amber ? 0.08 : v < HVPG_CUTS.red ? 0.08 + (v - HVPG_CUTS.amber) / (HVPG_CUTS.red - HVPG_CUTS.amber) * 0.04 : v < HVPG_CUTS.bleed ? 0.12 + (v - HVPG_CUTS.red) / (HVPG_CUTS.bleed - HVPG_CUTS.red) * 0.04 : 0.16;
        const col = v < HVPG_CUTS.amber ? pal.tok('ok') : v < HVPG_CUTS.red ? pal.mix('srgb', pal.tok('ok'), 100 - (v - HVPG_CUTS.amber) / (HVPG_CUTS.red - HVPG_CUTS.amber) * 100, pal.tok('caution'), (v - HVPG_CUTS.amber) / (HVPG_CUTS.red - HVPG_CUTS.amber) * 100) : pal.tok('danger');
        shapes.push({ k: 'rect', x: L, y: Y(v1), w: plotW, h: Y(v0) - Y(v1), fill: pal.alpha(col, a * 1.6) });
      }
    }
    for (const t of g.s.ticks) {
      shapes.push({ k: 'line', x1: L, y1: Y(t), x2: W - R, y2: Y(t), pen: pen(hair, 1) });
      if (!(t === 0 && g !== geoLanes[geoLanes.length - 1])) say({ x: L - 8, y: Y(t), s: String(t), color: t3, anchor: 'end', baseline: 'middle', halo: false });
    }
    for (const cut of g.s.cuts) {
      const ink = cut.ink === 'danger' ? inkOf(pal, 'danger') : cut.ink === 'text-2' ? t2 : t3;
      shapes.push({ k: 'line', x1: L, y1: Y(cut.v), x2: W - R, y2: Y(cut.v), pen: pen(pal.alpha(ink, 0.75), 1, { dash: [2, 4] }) });
      say({ x: W - R - 4, y: Y(cut.v) + (cut.below ? 15 : -5), s: cut.word, color: ink, anchor: 'end', size: fs });
    }
  }
  // the x axis
  shapes.push({ k: 'line', x1: L, y1: bottom + 0.5, x2: W - R, y2: bottom + 0.5, pen: pen(hair2, 1) });
  const cx = inp.cursor == null ? null : X(inp.cursor);
  // the paced axis: pieces folded or opened by their events are hatched or warmed, each piece has its own ticks, and the scale is said under the axis
  const tint = pal.alpha(pal.tok('caution'), 0.07), hatch = pal.alpha(pal.tok('text'), 0.09), warm = inkOf(pal, 'caution');
  let lastLab = -1e9;
  for (const pc of pace.pieces) {
    const a = Math.max(pc.a, x0), b = Math.min(pc.b, x1);
    if (b <= a) continue;
    const xa = X(a), xb = X(b), wpx = xb - xa, y0 = top + medsH, hh = bottom - y0;
    if (!pace.flat && pc.w > 1.5) shapes.push({ k: 'rect', x: xa, y: y0, w: wpx, h: hh, fill: tint });
    if (!pace.flat && pc.w < 0.5) {
      for (let hx = xa - hh; hx < xb; hx += 12) {   // 45° strokes, cut to the piece by arithmetic (inside the plot, nothing leans out of it)
        const sa = Math.max(0, xa - hx), sb = Math.min(hh, xb - hx);
        if (sb > sa) shapes.push({ k: 'line', x1: hx + sa, y1: bottom - sa, x2: hx + sb, y2: bottom - sb, pen: pen(hatch, 1) });
      }
    }
    const step = tickStep(b - a, wpx, pace.flat ? 44 : 30);
    for (let d = Math.ceil(a / step - 1e-9) * step; d <= b + 1e-6; d += step) {
      const x = X(d);
      shapes.push({ k: 'line', x1: x, y1: bottom, x2: x, y2: bottom + 5, pen: pen(hair2, 1) });
      if (x - lastLab >= 36 && (cx == null || Math.abs(x - cx) > 30)) { say({ x, y: bottom + 19, s: String(Math.round(d)), color: t3, anchor: 'middle', halo: false }); lastLab = x; }
    }
    if (!pace.flat && wpx >= 56) say({ x: (xa + xb) / 2, y: bottom + 34, s: scaleWord(pc.w), color: pc.w > 1.5 ? warm : t3, anchor: 'middle', halo: false, size: fs });
  }
  // the medicine bars
  const barTop = top;
  meds.forEach((m, i) => {
    const y0 = barTop + i * MED_H;
    let last = -1e9;
    for (const s of m.spans) {
      if ((s.to ?? Infinity) < x0 || s.from > x1) continue;
      const xa = Math.max(L, X(s.from)), xb = s.to == null ? W - R : Math.min(W - R, X(s.to)), open = s.to == null;
      const fadeW = open ? Math.min(220, (xb - xa) * 0.22) : 0;
      shapes.push({ k: 'rect', x: xa, y: y0 + 15, w: Math.max(2, xb - xa - fadeW), h: 4, r: 2, fill: pal.alpha(accent, 0.8) });
      for (let k = 0; k < (fadeW > 0 ? 24 : 0); k++) { const fx = xb - fadeW + k * fadeW / 24; shapes.push({ k: 'rect', x: fx, y: y0 + 15, w: fadeW / 24, h: 4, fill: pal.alpha(accent, 0.8 * (1 - (k + 0.5) / 24)) }); }
      if (X(s.from) >= L) shapes.push({ k: 'line', x1: X(s.from), y1: y0 + 10, x2: X(s.from), y2: y0 + 24, pen: pen(accent, 1.5) });
      if (s.to != null && X(s.to) <= W - R) shapes.push({ k: 'line', x1: X(s.to), y1: y0 + 10, x2: X(s.to), y2: y0 + 24, pen: pen(accent, 1.5) });
      const tx = Math.max(L + 2, X(s.from) + 5);
      if (tx >= last) { say({ x: tx, y: y0 + 11, s: m.name, color: inkOf(pal, 'accent'), weight: 600 }); last = tx + measure(m.name, fs, 600) + 8; }
      if (s.to != null && X(s.to) < W - R - 60 && X(s.to) + 6 > last) say({ x: X(s.to) + 6, y: y0 + 11, s: 'stopped', color: t3 });
    }
  });
  // event lines (behind the traces), then the traces
  shapes.push({ k: 'clip', x: L, y: 0, w: plotW, h: bottom + 1 });
  for (const p of placed) {
    const ink = toneInk(pal, p.e.tone), line0 = p.r < 0 ? top - 6 : phone ? top - 8 - (p.lift ?? 0) - Math.max(0, p.x - (p.xs ?? p.x)) : p.r * ROW_H + 14;
    shapes.push({ k: 'line', x1: X(p.e.day), y1: Math.max(2, line0), x2: X(p.e.day), y2: bottom, pen: pen(pal.alpha(ink, p.e.tone === 'change' ? 0.85 : 0.55), p.e.tone === 'change' ? 1.6 : 1) });
  }
  for (const g of geoLanes) {
    const Y = (v: number) => g.t + g.h - Math.min(v, g.s.max * 1.02) / g.s.max * (g.h - TITLE_H);
    if (g.s.zone && inp.hvpg) { const pts = pointsIn(inp.hvpg, x0, x1, X, Y), col = colourOf(pal, HVPG.tok); shapes.push(pts.length >= 4 ? { k: 'path', pts, pen: pen(col, 2.2, { cap: 'round', join: 'round' }) } : { k: 'circle', cx: pts[0] ?? 0, cy: pts[1] ?? 0, r: 4, fill: col }); }
    for (const m of g.s.ms) {
      const s = inp.series[m.id]!, sc: Series = m.id === 'shunt' ? { x: s.x, y: s.y.map((v) => v * 100) } : s;
      const pts = pointsIn(sc, x0, x1, X, Y), col = colourOf(pal, m.tok);
      if (g.s.fill && pts.length >= 4) {
        const base = Y(0);
        for (let k = 0; k < 6; k++) { const f = (k + 1) / 6, mid: number[] = []; for (let i = 0; i < pts.length; i += 2) mid.push(pts[i]!, pts[i + 1]! + (base - pts[i + 1]!) * f); shapes.push({ k: 'band', top: pts, bottom: mid, fill: pal.alpha(col, 0.07) }); }
      }
      if (pts.length >= 4) shapes.push({ k: 'path', pts, pen: pen(col, 2.2, { cap: 'round', join: 'round' }) });
      else if (pts.length === 2) shapes.push({ k: 'circle', cx: pts[0]!, cy: pts[1]!, r: 4, fill: col });   // (one day only: where the reading stands)
    }
  }
  shapes.push({ k: 'unclip' });
  // lane titles: the name in plain weight and, with the crosshair on a day, that day's reading bold in the measure's ink (without one the title is the name alone: a reading at the left edge would be the newest day's, beside a line that starts somewhere else)
  const at = inp.cursor ?? inp.full[1];   // (the words of a reading, only when the crosshair is down)
  for (const g of geoLanes) {
    let x = L + 8;
    const hv = g.s.zone ? [{ name: HVPG.name, val: valueAt(inp.hvpg, at) == null ? null : valueAt(inp.hvpg, at)!.toFixed(1).replace('-', '−'), ink: inkOf(pal, HVPG.tok) }] : [];
    const parts: { name: string; val: string | null; ink: Rgba }[] = [...hv, ...g.s.ms.map((m) => { const v = valueAt(inp.series[m.id], at); return { name: m.short, val: v == null ? null : m.words(v), ink: inkOf(pal, m.tok) }; })];
    for (const p of parts) {
      const nm = `${p.name} `;
      say({ x, y: g.t + 14, s: nm, color: p.ink, weight: 500 }); x += measure(nm, fs, 500);
      if (p.val && inp.cursor != null) { say({ x, y: g.t + 14, s: p.val, color: p.ink, weight: 600 }); x += measure(p.val, fs, 600); }
      x += 18;
    }
  }
  // event words
  for (const p of placed) {
    const ink = toneInk(pal, p.e.tone), weight = p.e.tone === 'change' ? 600 : 500;
    if (!phone) { if (p.r >= 0) say({ x: p.x, y: p.r * ROW_H + 12, s: p.e.label, color: ink, weight }); }
    else if (p.r >= 0) (p.ls ?? []).forEach((l, i, a) => { const k = (a.length - 1 - i) * fs * 1.15 * Math.SQRT1_2; say({ x: (p.xs ?? p.x) - k, y: top - 8 - (p.lift ?? 0) - k, s: l, color: ink, weight, rot: -45, anchor: 'start' }); });
  }
  // the crosshair
  if (cx != null && inp.cursor != null) {
    shapes.push({ k: 'line', x1: cx, y1: phone ? top - 6 : top - 4, x2: cx, y2: bottom, pen: pen(pal.alpha(text, 0.5), 1) });
    for (const g of geoLanes) {
      const Y = (v: number) => g.t + g.h - Math.min(v, g.s.max * 1.02) / g.s.max * (g.h - TITLE_H);
      const dots: { v: number | null; col: Rgba }[] = [...(g.s.zone ? [{ v: valueAt(inp.hvpg, inp.cursor), col: colourOf(pal, HVPG.tok) }] : []),
        ...g.s.ms.map((m) => { const v = valueAt(inp.series[m.id], inp.cursor!); return { v: v == null ? null : m.id === 'shunt' ? v * 100 : v, col: colourOf(pal, m.tok) }; })];
      for (const d of dots) if (d.v != null) shapes.push({ k: 'circle', cx, cy: Y(d.v), r: 3.8, fill: d.col, pen: pen(pal.tok('surface'), 1.6) });
    }
    say({ x: cx, y: bottom + 19, s: `Day ${Math.round(inp.cursor)}`, color: text, weight: 600, anchor: 'middle' });
  }
  if (!specs.length) say({ x: L + plotW / 2, y: top + medsH + free / 2, s: 'Nothing chosen. Turn something on under What to graph.', color: t2, anchor: 'middle', size: fs });
  const f = frame();
  return { frame: { ...f, label: `Over time, day ${Math.round(x0)} to ${Math.round(x1)}: ${specs.map((s) => [...(s.zone ? ['HVPG'] : []), ...s.ms.map((m) => m.name)].join(', ')).join('; ')}.` }, geo };
}

/** The strip under the chart: the whole run as one thin line, the events as ticks, the window between its two grips. */
export function stripFrame(inp: BigIn, c: ChartCtx, lead: { L: number; R: number }): { frame: Frame; geo: { L: number; R: number; X(d: number): number; dayAt(x: number): number; h: number } } {
  const pal = c.pal, W = Math.max(120, Math.round(c.w)), H = 34, { L, R } = lead, pw = W - L - R;
  const [f0, f1] = inp.full, fs = Math.max(1e-6, f1 - f0);
  const X = (d: number) => L + (d - f0) / fs * pw, dayAt = (x: number) => f0 + (x - L) / pw * fs;
  const hair2 = pal.alpha(pal.tok('text'), 0.2), shapes: Shape[] = [];
  shapes.push({ k: 'line', x1: L, y1: H - 0.5, x2: W - R, y2: H - 0.5, pen: pen(hair2, 1) });
  for (const e of inp.lines) shapes.push({ k: 'line', x1: X(e.day), y1: 2, x2: X(e.day), y2: H, pen: pen(pal.alpha(toneInk(pal, e.tone), e.tone === 'change' ? 0.8 : 0.45), 1) });
  const lead1 = ['pv', 'wedge', 'hv', 'ivc', 'ra', 'var', 'sv', 'smv'].find((id) => inp.on.includes(id) && inp.series[id]);
  const s = lead1 ? inp.series[lead1]! : inp.hvpg;
  if (s && s.x.length > 1) {
    const peak = Math.max(1e-6, maxOf(s)), Y = (v: number) => H - 5 - v / peak * (H - 12);
    shapes.push({ k: 'path', pts: pointsIn(s, f0, f1, X, Y), pen: pen(pal.alpha(lead1 ? colourOf(pal, MEASURE_OF[lead1]!.tok) : colourOf(pal, HVPG.tok), 0.9), 1.4) });
  }
  const a = X(inp.win[0]), b = X(inp.win[1]), shade = pal.alpha(pal.tok('surface'), 0.62);
  if (a > L) shapes.push({ k: 'rect', x: L, y: 0, w: a - L, h: H, fill: shade });
  if (b < W - R) shapes.push({ k: 'rect', x: b, y: 0, w: W - R - b, h: H, fill: shade });
  shapes.push({ k: 'line', x1: a, y1: 0.5, x2: b, y2: 0.5, pen: pen(pal.alpha(pal.tok('text-3'), 0.6), 1) }, { k: 'line', x1: a, y1: H - 0.5, x2: b, y2: H - 0.5, pen: pen(pal.alpha(pal.tok('text-3'), 0.6), 1) });
  for (const x of [a, b]) shapes.push({ k: 'rect', x: x - 2.5, y: H / 2 - 11, w: 5, h: 22, r: 2.5, fill: pal.alpha(pal.tok('text-2'), 0.85) });
  return { frame: { w: W, h: H, shapes, label: 'The whole run, with the days shown between two handles.' }, geo: { L, R, X, dayAt, h: H } };
}
