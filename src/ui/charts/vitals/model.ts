// The vitals monitor as a frame (2D vitals-monitor.js, vitals-gl.js): a black bedside monitor with the schematic EKG strip across the top and up to three vital signs under it as large
// numbers (hr, map, co, hb). The numbers are the model's own mean over a breath (or a slide's settled ones); a reading past its cut-off takes the monitor's alarm colour. The pressure is
// written as at the bedside, 120/80 (93). hold: true adds a rail under the numbers with both carvedilol hold lines of Baveno VIII 4.6 (MAP 65, systolic 90); rail: 'hb' puts a
// hemoglobin rail under a shown hemoglobin instead, with Baveno VIII 5.4's target 7 to 8 shaded and one word for where the number stands. A pure function of what it is given: the
// card keeps the eased numbers, the held alarm flags and the strip's points.
import { MAP_BETA_CUT, SBP_BETA_CUT } from '../../../engine/hales/portal/kidney-cuts.js';
import { TRANSFUSE, TRANSFUSE_WORDS, transfuseBand } from '../../../engine/hales/portal/transfusion-cuts.js';
import { VITALS, vitalReading, TO_SHOW } from '../../tests/copied/vital-read.copied.js';
import type { Rgba } from '../colour.ts';
import { fmt } from '../fmt.ts';
import { measure } from '../measure.ts';
import type { Palette } from '../palette.ts';
import type { Frame, Shape } from '../scene.ts';

export const VITALS_DEFAULT = ['hr', 'map', 'hb'];
export const BOX_BELOW = 4, RAIL_GAP = 7;
export const RAIL_LO = 40, RAIL_HI = 150, RAIL_H = 29;
export const HB_LO = 4, HB_HI = 14;
export const SPAN_S = 6;
export const STRIP_MAX = 110;
export const PAD = 14;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Where a MAP stands on the rail, 0 to 1. */
export const railAt = (v: number) => clamp((v - RAIL_LO) / (RAIL_HI - RAIL_LO), 0, 1);
/** Where a hemoglobin stands on its rail, 0 to 1. */
export const hbAt = (v: number) => clamp((v - HB_LO) / (HB_HI - HB_LO), 0, 1);

/** The vitals a slide asks for: up to three of the four the monitor knows, in the order given; the default otherwise. */
export function vitalsShown(t: { show?: unknown } | null | undefined): string[] {
  const ids = (Array.isArray(t?.show) ? (t!.show as unknown[]) : []).filter((id, i, a): id is string => typeof id === 'string' && ['hr', 'map', 'co', 'hb'].includes(id) && a.indexOf(id) === i).slice(0, 3);
  return ids.length ? ids : VITALS_DEFAULT;
}

/** A slide's fingerprint as the metrics the vitals read (VITALS[].v falls back to the flat keys). */
export const metricsOfFp = (fp: Record<string, unknown>) => ({
  map: fp.map as number, sbp: (fp.sbp as number | undefined) ?? NaN, dbp: (fp.dbp as number | undefined) ?? NaN, hr: fp.hr as number, co: fp.co as number, ra: fp.ra as number,
  blood: { hb: fp.hb as number, hbSettled: (fp.hbTo as number | undefined) ?? NaN },
});

/** One reading to print: its short name, the number as eased, the unit, the decimals and whether it is past its cut-off. s and dia: the pressure's systolic and diastolic. */
export interface Cell { id: string; k: string; title: string; u: string; d: number; v: number; s: number; dia: number; bad: boolean }
type Vital = (typeof VITALS)[number];
const defOf = (id: string): Vital => VITALS.find((v: Vital) => v.id === id)!;

/** The cells to print: each vital with the bottom bar's hold and hysteresis (`xs` keeps each vital's state between calls). With no metrics yet, the names alone. */
export function vitalCells(m: unknown, ids: readonly string[], xs: Map<string, { v: Vital; cell?: Cell }>, running: boolean, now: number): Cell[] {
  return ids.map((id) => {
    const def = defOf(id);
    if (!m) return { id, k: def.k, title: def.title, u: def.u, d: def.d, v: NaN, s: NaN, dia: NaN, bad: false };
    let x = xs.get(id);
    if (!x) xs.set(id, (x = { v: def }));
    const r = vitalReading(x, m, running, now) as { v: number; bad: boolean; s: number; d: number };
    return { id, k: def.k, title: def.title, u: def.u, d: def.d, v: r.v, s: r.s, dia: r.d, bad: r.bad };
  });
}

export interface Strip { x: readonly number[]; v: readonly number[]; x1: number }
export interface VitalsSpec {
  ids: readonly string[];
  cells: readonly Cell[];
  hold?: boolean;
  rail?: 'hb' | null;
  /** where the hemoglobin is heading (a ring on its rail) */
  toHb?: number;
  strip?: Strip | null;
}

export interface Layout { w: number; h: number; pad: number; ew: number; eh: number; top: number; bot: number; y0: number; big: number; cols: number[]; rail: number }
const small = (b: number) => Math.max(12, Math.round(b * 0.55));
const widthOf = (s: string, size: number, wt: number) => measure(s, size, wt);

/** The size and place of everything, from the box's width and the cells' words. The numbers are sized from the width first and the strip takes what the card's height allows (up to 110 px). */
export function vitalsLayout(w: number, cells: readonly Pick<Cell, 'id' | 'u' | 'd'>[], rail: boolean): Layout {
  const pad = PAD, ew = w - 2 * pad, n = Math.max(1, cells.length);
  const need = (c: Pick<Cell, 'id' | 'u' | 'd'>, b: number) => (c.id === 'map' ? widthOf('888/88', b, 700) + widthOf('(88)', small(b), 700) + 4 : widthOf(c.d ? '88.8' : '888', b, 700)) + widthOf(c.u, 12, 500) + 16;
  const needAll = (b: number) => cells.reduce((a, c) => a + need(c, b), 0);
  let big = Math.round(clamp(Math.min((ew / n) * 0.42, 46), 22, 46));
  while (!(needAll(big) <= ew || big <= 14)) big -= 2;
  const spare = Math.max(0, ew - needAll(big)) / n;
  const cols: number[] = [];
  for (let i = 0, x = pad; i < cells.length; i++) { cols.push(x); x += need(cells[i]!, big) + spare; }
  const rl = rail ? RAIL_H : 0, eh = w < 340 ? 84 : STRIP_MAX;
  const bot = pad + eh, y0 = bot + 12, h = pad + eh + 12 + 18 + big + pad + rl;
  return { w, h, pad, ew, eh, top: pad, bot, y0, big, cols, rail: rail ? y0 + 12 + 6 + big + BOX_BELOW + RAIL_GAP : 0 };
}

/** The words of the pressure: systolic/diastolic with the mean beside, or the number alone. */
export const printed = (c: Cell): { main: string; mean: string } => {
  if (!Number.isFinite(c.v)) return { main: '—', mean: '' };
  if (c.id === 'map' && Number.isFinite(c.s) && Number.isFinite(c.dia)) return { main: `${fmt(c.s, 0)}/${fmt(c.dia, 0)}`, mean: `(${fmt(c.v, 0)})` };
  return { main: fmt(c.v, c.d), mean: '' };
};

/** The reading's words for a screen reader. */
export function vitalsLabel(cells: readonly Cell[]): string {
  return `Vital signs: ${cells.map((c) => { const p = printed(c); return `${c.title} ${Number.isFinite(c.v) ? (c.id === 'map' ? `${p.main} (${p.mean.slice(1, -1)})` : p.main) : 'not available'} ${c.u}${c.bad ? ', past its limit' : ''}`; }).join('; ')}.`;
}

const tint = (c: Rgba, k: number): Rgba => [c[0], c[1], c[2], c[3] * k];

export function vitalsFrame(spec: VitalsSpec, w: number, pal: Palette): Frame {
  const cells = spec.cells, hold = spec.hold === true, hbRail = spec.rail === 'hb' && !hold;
  const railOn = (hold && cells.some((c) => c.id === 'map')) || (hbRail && cells.some((c) => c.id === 'hb'));
  const L = vitalsLayout(Math.max(120, Math.round(w)), cells, railOn);
  const { pad, ew, eh, top, bot, y0, big } = L;
  const bg = pal.tok('mon-bg'), text = pal.tok('mon-text'), bright = pal.tok('mon-bright'), alarm = pal.tok('mon-alarm'), grid = pal.tok('mon-grid'), ecg = pal.tok('mon-ecg'), art = pal.tok('mon-ok');   // (the pressure's ink: the clinical arterial-line red said "worse" beside a healthy MAP of 90, and the sentence's green (albumin 10, 23 Nov review); red here is the alarm alone)
  const shapes: Shape[] = [];
  shapes.push({ k: 'rect', x: 0, y: 0, w: L.w, h: L.h, r: 12, fill: bg, key: 'monitor' });
  shapes.push({ k: 'rect', x: pad, y: Math.round(bot - 6), w: ew, h: 1, fill: grid, key: 'baseline' });
  shapes.push({ k: 'text', x: pad, y: top + 11, s: 'EKG', size: 12, weight: 600, color: text, key: 'ekg-name' });
  const st = spec.strip;
  if (st && st.x.length > 1) {
    const p: number[] = [];
    for (let i = 0; i < st.x.length; i++) p.push(pad + ((st.x[i]! - (st.x1 - SPAN_S)) / SPAN_S) * ew, bot - 6 - ((st.v[i]! + 0.3) / 1.3) * (eh - 22));
    shapes.push({ k: 'clip', x: pad, y: top, w: ew, h: eh });
    shapes.push({ k: 'path', pts: p, pen: { color: ecg, w: 1.6, join: 'round', cap: 'round' }, key: 'ekg-line' });
    shapes.push({ k: 'unclip' });
  }
  const ink = (id: string) => (id === 'hr' ? ecg : id === 'map' ? art : bright);
  cells.forEach((c, i) => {
    const x = L.cols[i]!, by = y0 + 12 + 6 + big, col = ink(c.id), p = printed(c), sm = small(big);
    const rw = widthOf(c.id === 'map' && p.mean ? '888/88' : c.d ? '88.8' : '888', big, 700), nw = widthOf(p.main, big, 700), mw = p.mean ? widthOf('(88)', sm, 700) + 4 : 0;
    shapes.push({ k: 'text', x, y: y0 + 12, s: c.k, size: 12, weight: 600, color: c.bad ? alarm : col === bright ? text : col, key: `k-${c.id}` });
    // the number stands in the room of the widest it can be, flush to its right edge, so the unit never moves as a reading changes;
    // an alarm is red digits and a red unit on the dark screen, no filled box (owner, 27 Nov, L5)
    shapes.push({ k: 'text', x: x + rw - nw, y: by, s: p.main, size: big, weight: 600, color: c.bad ? alarm : col, key: `v-${c.id}` });
    if (p.mean) shapes.push({ k: 'text', x: x + rw + 4, y: by, s: p.mean, size: sm, weight: 600, color: c.bad ? alarm : col, key: `m-${c.id}` });
    shapes.push({ k: 'text', x: x + rw + mw + 5, y: by, s: c.u, size: 12, weight: 500, color: c.bad ? alarm : text, key: `u-${c.id}` });
  });
  const mi = hold ? cells.findIndex((c) => c.id === 'map') : -1;
  if (mi >= 0 && L.rail) {
    const c = cells[mi]!, ry = L.rail, cutX = pad + railAt(MAP_BETA_CUT) * ew, sbpX = pad + railAt(SBP_BETA_CUT) * ew;
    shapes.push({ k: 'rect', x: pad, y: ry + 4, w: ew, h: 3, r: 1.5, fill: grid, key: 'rail' });
    if (Number.isFinite(c.s) && Number.isFinite(c.dia)) {
      const a = pad + railAt(Math.round(c.dia)) * ew, b = pad + railAt(Math.round(c.s)) * ew;
      shapes.push({ k: 'rect', x: a, y: ry + 3, w: Math.max(2, b - a), h: 5, r: 2.5, fill: c.bad ? alarm : art, key: 'rail-bar' });
    }
    shapes.push({ k: 'rect', x: cutX - 1, y: ry, w: 2, h: 11, r: 1, fill: alarm, key: 'cut-map' });
    shapes.push({ k: 'rect', x: sbpX - 1, y: ry, w: 2, h: 11, r: 1, fill: alarm, key: 'cut-sbp' });
    if (Number.isFinite(c.v)) shapes.push({ k: 'rect', x: pad + railAt(Math.round(c.v)) * ew - 5, y: ry + 0.5, w: 10, h: 10, r: 5, fill: c.bad ? alarm : art, key: 'rail-dot' });
    const a = `MAP <${MAP_BETA_CUT}`, b = `Sys <${SBP_BETA_CUT}`;
    shapes.push({ k: 'text', x: cutX - widthOf(a, 12, 500) - 5, y: ry + 22, s: a, size: 12, weight: 500, color: text, key: 'cut-map-name' });
    shapes.push({ k: 'text', x: sbpX + 5, y: ry + 22, s: b, size: 12, weight: 500, color: text, key: 'cut-sbp-name' });
  }
  const hi = hbRail ? cells.findIndex((c) => c.id === 'hb') : -1;
  if (hi >= 0 && L.rail) {
    const c = cells[hi]!, ry = L.rail, vh = Number.isFinite(c.v) ? Math.round(c.v * 10) / 10 : NaN, col = c.bad ? alarm : bright;
    const loX = pad + hbAt(TRANSFUSE.lo) * ew, hiX = pad + hbAt(TRANSFUSE.hi) * ew;
    shapes.push({ k: 'rect', x: pad, y: ry + 4, w: ew, h: 3, r: 1.5, fill: grid, key: 'rail' });
    shapes.push({ k: 'rect', x: loX, y: ry + 1, w: hiX - loX, h: 9, r: 2, fill: tint(ecg, 0.35), key: 'target' });
    shapes.push({ k: 'rect', x: loX - 1, y: ry, w: 2, h: 11, r: 1, fill: ecg, key: 'target-lo' });
    shapes.push({ k: 'rect', x: hiX - 1, y: ry, w: 2, h: 11, r: 1, fill: ecg, key: 'target-hi' });
    const to = spec.toHb ?? NaN;
    if (Number.isFinite(to) && Number.isFinite(vh) && Math.abs(to - vh) >= TO_SHOW) {
      const cx = pad + hbAt(to) * ew;
      shapes.push({ k: 'rect', x: cx - 5, y: ry + 0.5, w: 10, h: 10, r: 5, fill: col, key: 'heading' });
      shapes.push({ k: 'rect', x: cx - 3.2, y: ry + 2.3, w: 6.4, h: 6.4, r: 3.2, fill: bg, key: 'heading-hole' });
    }
    if (Number.isFinite(vh)) shapes.push({ k: 'rect', x: pad + hbAt(vh) * ew - 5, y: ry + 0.5, w: 10, h: 10, r: 5, fill: col, key: 'rail-dot' });
    const t7 = String(TRANSFUSE.lo), t8 = String(TRANSFUSE.hi);
    shapes.push({ k: 'text', x: loX - widthOf(t7, 12, 500) - 4, y: ry + 22, s: t7, size: 12, weight: 500, color: text, key: 'lo' });
    shapes.push({ k: 'text', x: hiX + 4, y: ry + 22, s: t8, size: 12, weight: 500, color: text, key: 'hi' });
    if (Number.isFinite(vh)) {
      const band = transfuseBand(vh) as keyof typeof TRANSFUSE_WORDS, word = TRANSFUSE_WORDS[band];
      shapes.push({ k: 'text', x: pad + ew - widthOf(word, 12, 600), y: ry + 22, s: word, size: 12, weight: 600, color: band === 'below' ? alarm : band === 'in' ? ecg : text, key: 'word' });
    }
  }
  return { w: L.w, h: L.h, shapes, label: vitalsLabel(cells), scrolls: true };
}
