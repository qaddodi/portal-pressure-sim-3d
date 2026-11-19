// The all-patients chart (2D: visual-allpatients.js, visual: 'allpatients'): the typed face of the 2D app's own pure model (allpatients-model.js, copied by
// scripts/copy-chart-small.mjs) and the smooth line the 2D chart draws (tool-course.js smoothPath, copied the same way), flattened to the points a frame draws.
import * as M from './allpatients-model.generated.js';
import { smoothPath as smoothD } from './smooth.generated.js';

export interface Pt { m: number; hvpg: number; lsm: number; plt: number }
export interface Patient { name: string; c: string; clear: string; pace: boolean; pts: Pt[] }
export type Series = Patient[];
export interface Cohort { name: string; c: string; slides: string[]; pace: boolean; clear: string }
export interface Step { preset?: string; presetDays?: number; params?: unknown; action?: unknown; days?: number; relax?: number; ramp?: unknown; fine?: boolean; trail?: string[]; restart?: boolean }
/** A word on the chart: the patient, the value and where it stands. */
export interface Word { p: Patient; v: number; x: number; y: number }
export interface KeyHead { y: number; colR: number[]; texts: string[] }
export interface KeyBlock { p: Patient; x: number; y: number; w: number; colR: number[]; nameY: number; headY: number; rows: { k: string; label: string; y: number }[]; head?: KeyHead }
export interface Geo {
  phone: boolean; W: number; H: number; f: number; lh: number; r: number; cap: number; foot: number;
  note: { x: number; y: number; lines: string[]; lh: number };
  py: number; B: number; T: number; L: number; R: number; plotW: number; chartH: number; lo: number; hi: number;
  X(m: number): number; Y(v: number): number; ticks: number[]; xt: [number, string][]; end: number; blockH: number; lead: number; span: number;
  words: { start: Word[]; year1: Word[]; year2: Word[] };
  key: { head: KeyHead | null; blocks: KeyBlock[] };
}
type Slide = Record<string, unknown> & { id: string };
export interface DeckLike { slides?: Slide[] }

export const KEYS = M.KEYS as string[];
export const MONTHS = M.MONTHS as number[];
export const CUT = M.CUT as number;
export const PHONE_W = M.PHONE_W as number;
export const dayOf = M.dayOf as (m: number) => number;
export const cohortOf = M.cohortOf as (s: unknown) => Cohort[];
export const cohortSteps = M.cohortSteps as (s: unknown, deck: DeckLike | null | undefined) => { steps: Step[]; spans: [number, number][] } | null;
export const seriesOf = M.seriesOf as (s: unknown, deck: DeckLike | null | undefined, outs: unknown[]) => Series | null;
export const at = M.at as (p: Patient, m: number, k: string) => number | null;
export const verdictOf = M.verdictOf as (p: Patient) => { text: string; ok: boolean };
export const worstFirst = M.worstFirst as (ser: Series) => Series;
export const fmtOf = M.fmtOf as (k: string) => (v: number) => string;
export const dodge = M.dodge as <T extends { y: number }>(items: T[], gap: number, lo?: number, hi?: number) => (T & { ly: number })[];
export const wrap = M.wrap as (text: string, px: number, f: number) => string[];
/** The geometry for a card W px wide (2D layout()). ser null: the frame alone (no words, no key). */
export const layout = M.layout as (W: number, ser: Series | null, foot?: string[]) => Geo;

/** smoothPath's path string flattened to a polyline [x0, y0, x1, y1, …]: each cubic cut into chords of about `step` px. */
export function flatten(d: string, step = 3): number[] {
  const out: number[] = [];
  const re = /([MLC])([^MLC]*)/g;
  let m: RegExpExecArray | null, cx = 0, cy = 0;
  while ((m = re.exec(d))) {
    const n = m[2]!.trim().split(/[\s,]+/).map(Number);
    if (m[1] === 'C') {
      const [x1, y1, x2, y2, x3, y3] = n as [number, number, number, number, number, number];
      const k = Math.max(2, Math.ceil(Math.hypot(x3 - cx, y3 - cy) / step));
      for (let i = 1; i <= k; i++) {
        const t = i / k, u = 1 - t;
        out.push(u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
      cx = x3; cy = y3;
    } else { cx = n[0]!; cy = n[1]!; out.push(cx, cy); }
  }
  return out;
}
/** A smooth line through [x, y] points as a polyline (2D smoothPath, then flattened). */
export const smoothPts = (pts: readonly (readonly [number, number])[]): number[] => (pts.length < 2 ? pts.flat() : flatten((smoothD as (p: unknown, j?: boolean) => string)(pts)));

/** The chart in a sentence (2D: the svg's aria-label). */
export function allPatientsWords(ser: Series | null): string {
  if (!ser) return 'HVPG over two years, four patients: calculating';
  const fmt = fmtOf('hvpg');
  return `HVPG over two years: ${ser.map((p) => `${p.name} ${p.pts.filter((q) => [0, 12, 24].includes(q.m)).map((q) => fmt(q.hvpg)).join(', ')}`).join('; ')} mmHg, before, at 1 year and at 2 years`;
}
