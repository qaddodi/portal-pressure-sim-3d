// The six ladders (2D: visual: 'ladders', presenter-question.js laddersGrid and tool-profile.js createProfileStrip): each case's Gut to heart pressures on one line with the
// red blocks where the pressure falls, the stations named once over the six under the sinusoidal brace, and each case's HVPG and PPG as pills. The profile chart in a wide
// screen's cell is the `profile` chart; what is here is the grid, the strips, the names strip and the rows.
// The profile itself (the stations, a fingerprint's readings, the blocks, the names' fit, the pills) is the profile chart's own model (../profile/model.ts) and its number
// formatters are ../readings.ts: ONE source for the chart, the strip and the pills. (This file once held a second copy of the 2D tool's pure parts, whose "closed" wedge reading
// and whole-number pills printed schistosomiasis 8 where the chart printed 9: capture 36b7deac.)
import * as P from '../profile/model.ts';
import { causeFit as causeFit0 } from './cause-fit.generated.js';
import { stationTexts } from '../readings.ts';

/** A fingerprint (the engine's: the tile keys in engine units, and `at.P` the model's node pressures). */
export type Fp = P.Fp;
export type Profile = P.Prof;
export type Pill = ReturnType<typeof P.pillReadings>[number];
export interface Fit { names: string[]; rows: number; dx: number[]; low: boolean[] }
export type TextWidth = (t: string, weight?: number) => number;

export const STATIONS = P.STATIONS;
export const BRACE_NAME = P.BRACE_NAME;
export const NUM_PAD = P.NUM_PAD;
export const BLOCK_FALL = P.BLOCK_FALL;
export const LIVER_STATIONS = ['RPV', 'CV_R'] as const;
export const profileOf = P.profileOf;
export const blocksOf = P.blocksOf;
export const blockSpan = P.blockSpan;
export const zoneSpans = P.zoneSpans;
export const nameFit = P.nameFit as (slot: number, tw: TextWidth) => Fit;
export const braceD = P.braceD;
export const pillReadings = P.pillReadings;
export const whole = P.whole;
export const causeFit = causeFit0 as (size: number, width: number, room: number, floor: number) => { size: number; under: boolean };
/** The look key of each zone's tint, in zoneSpans' order (pre, liver, post). */
export const ZONE_LOOK = ['prof.zone.pre', 'prof.zone.liver', 'prof.zone.post'] as const;
/** What a screen reader hears at each station (the wedged reading named). */
export const SPOKEN: Record<string, string> = P.SPOKEN;

/** The stations' x: slot px apart, each centred in its slot (a strip leaves 10 px at the right). */
export const slotOf = (w: number) => { const slot = (w - 10) / STATIONS.length; return { slot, x: (i: number) => slot * (i + 0.5) }; };

export interface StripLayout { w: number; h: number; cy: number; slot: number; x(i: number): number; labels: string[]; segs: [number, number][]; blocks: [number, number][]; zones: [number, number][]; label: string }
/** One case on one line at w px and type f px (2D drawStrip): the readings, the line between them (it stops NUM_PAD px short of each), the red blocks and the zones' tints. */
export function stripLayout(w: number, f: number, fp: Fp, healthy: Fp | null, tw: TextWidth): StripLayout | null {
  const p = profileOf(fp);
  if (!p) return null;
  const hl = profileOf(healthy), n = p.v.length - 1, { slot, x } = slotOf(w);
  const h = Math.ceil(1.9 * f), cy = h / 2, labels = stationTexts(p), hw = labels.map((t) => tw(t, 700) / 2);
  const segs = p.v.slice(0, n).map((_, i) => [x(i) + hw[i]! + NUM_PAD, x(i + 1) - hw[i + 1]! - NUM_PAD] as [number, number]);
  const blocks = blocksOf(p, hl).map((i) => blockSpan(x(i), slot, tw));
  const zones = zoneSpans().map(([a, b]) => [x(a) - slot / 2 + 0.5, slot * (b - a + 1) - 1] as [number, number]);
  return { w, h, cy, slot, x, labels, segs, blocks, zones, label: `Pressure from gut to heart: ${STATIONS.map((s, i) => `${SPOKEN[s]} ${labels[i]}`).join(', ')} mmHg.` };
}

/** A case's strip in a sentence, for a screen reader. */
export const stripLabel = (fp: Fp | null | undefined): string => { const p = profileOf(fp); return p ? `Pressure from gut to heart: ${STATIONS.map((s, i) => `${SPOKEN[s]} ${whole(p.v[i]!)}`).join(', ')} mmHg.` : 'Pressure from gut to heart: not available'; };

export interface NamesLayout { w: number; h: number; ends: number; base: number; fit: Fit; slot: number; x(i: number): number; brace: { xa: number; xb: number; d: number; textX: number } | null }
/** The stations named once over the six (2D drawStrip with namesOnly): the names under the sinusoidal brace. */
export function namesLayout(w: number, f: number, tw: TextWidth): NamesLayout {
  const { slot, x } = slotOf(w), fit = nameFit(slot, tw), ends = 1.85 * f, base = ends + 1.05 * f;
  const h = Math.ceil(base + (fit.rows - 1) * 1.25 * f + 0.3 * f);
  const i0 = STATIONS.indexOf(LIVER_STATIONS[0]), i1 = STATIONS.indexOf(LIVER_STATIONS[1]);
  return { w, h, ends, base, fit, slot, x, brace: i0 >= 0 ? { xa: x(i0) - 0.42 * slot, xb: x(i1) + 0.42 * slot, d: 0.55 * f, textX: (x(i0) + x(i1)) / 2 } : null };
}

/** braceD's quadratic path as a polyline [x, y, …] (the brace's M, Q and L), each curve cut into about 3 px chords. */
export function braceLine(d: string, flipAt?: number): number[] {
  const out: number[] = [], re = /([MQL])([^MQL]*)/g;
  let m: RegExpExecArray | null, cx = 0, cy = 0;
  const fy = (y: number) => (flipAt === undefined ? y : flipAt - y);
  while ((m = re.exec(d))) {
    const n = m[2]!.trim().split(/[\s,]+/).map(Number);
    if (m[1] === 'Q') {
      const [x1, y1, x2, y2] = n as [number, number, number, number], k = Math.max(3, Math.ceil(Math.hypot(x2 - cx, y2 - cy) / 3));
      for (let i = 1; i <= k; i++) { const t = i / k, u = 1 - t; out.push(u * u * cx + 2 * u * t * x1 + t * t * x2, fy(u * u * cy + 2 * u * t * y1 + t * t * y2)); }
      cx = x2; cy = y2;
    } else { cx = n[0]!; cy = n[1]!; out.push(cx, fy(cy)); }
  }
  return out;
}

// ── the rows: which patients the grid shows (2D presenter-question.js rowsOf) ──
/** A row of the slide's `of`: a slide of the deck by id (or { id, name }), or a patient no slide shows ({ preset, params, relax, name }); `at` shows another patient under the slide's name. */
export type OfRow = string | { id?: string; name?: string; short?: string; kicker?: string; title?: string; site?: string; preset?: string; params?: unknown; relax?: number; presetDays?: number; at?: { preset?: string; params?: unknown; relax?: number } };
export interface LadderRow { id: string | null; name: string; kicker: string; title: string; site: string | null; f: Fp }
interface SlideLike { id: string; kicker?: string; title?: string; site?: string; [k: string]: unknown }

/** The extra patient a row asks for (a row of its own, or a row's `at`): the step the engine runs from a fresh model, or null for a plain slide row. */
export function extraStep(o: OfRow): { preset?: string; params?: unknown; relax?: number; presetDays?: number } | null {
  if (typeof o === 'string') return null;
  const s = o.at ?? (o.id ? null : o);
  return s ? { ...(s.preset ? { preset: s.preset } : {}), ...(s.params ? { params: s.params } : {}), ...(s.relax ? { relax: s.relax } : {}), ...('presetDays' in s && typeof s.presetDays === 'number' && s.presetDays ? { presetDays: s.presetDays } : {}) } : null;
}
/** The slide's rows with their numbers. fps: the deck's states, [outline, slide 0, slide 1, …] (rw/numbers.ts deckFingerprints); extras: the fingerprints of the rows that asked for a patient of their own, in row order. A row whose numbers are not in is left out. */
export function rowsOf(of: readonly OfRow[], slides: readonly SlideLike[], fps: readonly (Fp | undefined)[], extras: readonly (Fp | undefined)[]): LadderRow[] {
  const out: LadderRow[] = [];
  let e = 0;
  for (const o of of) {
    const id = typeof o === 'string' ? o : o.id ?? null, x = typeof o === 'object' ? o : {}, ex = extraStep(o) ? extras[e++] : undefined;
    const i = id ? slides.findIndex((s) => s.id === id) : -1, sl = i >= 0 ? slides[i]! : null;
    const f = ex ?? (i >= 0 ? fps[i + 1] : undefined);
    if (!f) continue;
    const title = x.title ?? sl?.title ?? '';
    out.push({ id, name: x.name || title, kicker: x.kicker ?? sl?.kicker ?? '', title, site: x.site ?? sl?.site ?? null, f });
  }
  return out;
}
/** The heading over a row's name (2D table-marks.js headOf: a site's "Intrahepatic · " is left off, its colour says it). */
export const headOf = (r: { kicker?: string }) => (r.kicker || '').replace('Intrahepatic · ', '');
