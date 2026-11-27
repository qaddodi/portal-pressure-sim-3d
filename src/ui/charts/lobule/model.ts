// Across the lobule (tool kind 'lobule'; owner approved the mock 27 Nov, instrument-cards-27nov/lobule-strip.png): one strip from the portal tract to the central vein, cut in three by the
// zones, that the slide's own Oxygen / Pressure buttons switch. Oxygen: the blood loses oxygen as it crosses, so zone 3 is injured first. Pressure: the model's pressure at the three stations
// the 3D lobule reads (the portal vein, the mid-sinusoid, the central vein: fingerprint pv, sin, cv), drawn as a line inside the strip, the three numbers under it and one sentence on where the
// pressure falls. Pure: numbers in, layout out (tests/charts-lobule.test.ts).
import type { Measure } from '../flows/layout.ts';
import { wrapWords } from '../trial/model.ts';

export type LobuleView = 'oxygen' | 'pressure';
/** The three pressures, mmHg: the portal vein (the strip's portal end), the sinusoid at its middle, the central vein (its other end). */
export interface LobulePressures { pv: number | null; sin: number | null; cv: number | null }
export interface LobuleIn extends LobulePressures { view: LobuleView }

/** The lenses whose figure the pressure view stands beside (the pressure family: the vessels are coloured by a pressure or its change). */
const PRESSURE_LENSES: ReadonlySet<string> = new Set(['pressure', 'drop', 'heat', 'delta', 'since']);
/** The view the strip shows: the figure's own lens when it is oxygen or a pressure lens (the slide's Oxygen / Pressure buttons set it, so the card follows them with no control of
 *  its own); any other lens (Origin on Dual blood supply 3) shows the slide's `rest` view, pressure where the slide names none. */
export function viewOf(lens: string | null | undefined, rest: unknown): LobuleView {
  if (lens === 'oxygen') return 'oxygen';
  if (lens && PRESSURE_LENSES.has(lens)) return 'pressure';
  return rest === 'oxygen' ? 'oxygen' : 'pressure';
}

/** Under this many mmHg from the portal vein to the central vein the lobule costs the blood little pressure (a healthy liver's whole portal pressure gradient is ≤5 mmHg). */
export const LITTLE = 5;
export type Fall = 'little' | 'portal' | 'sinusoid';
/** Where the pressure falls across the lobule: little at all, mostly from the portal tract to the mid-sinusoid (presinusoidal resistance), or mostly from there to the central vein. */
export function fallOf(p: LobulePressures): Fall | null {
  const { pv, sin, cv } = p;
  if (!Number.isFinite(pv) || !Number.isFinite(sin) || !Number.isFinite(cv)) return null;
  if (pv! - cv! < LITTLE) return 'little';
  return pv! - sin! >= sin! - cv! ? 'portal' : 'sinusoid';
}
/** The sentence under the numbers, by where the fall lies. */
export const FALL_WORDS: Readonly<Record<Fall, string>> = {
  little: 'Little pressure is lost crossing the lobule',
  portal: 'The fall sits at the portal tract, before the sinusoids',
  sinusoid: 'The fall sits at the narrowed sinusoids, before the central vein',
};

export const fmtP = (v: number | null): string => (Number.isFinite(v) ? `${v! < -0.05 ? '−' : ''}${Math.abs(v!).toFixed(1)} mmHg` : '—');

/** The chart in a sentence (a screen reader's). */
export function lobuleWords(a: LobuleIn): string {
  if (a.view === 'oxygen') return 'Across the lobule, oxygen falls from the portal tract (zone 1, most oxygen) to the central vein (zone 3, least oxygen): zone 3 is injured first.';
  const f = fallOf(a);
  return `Across the lobule, pressure ${fmtP(a.pv)} at the portal tract, ${fmtP(a.sin)} mid-sinusoid, ${fmtP(a.cv)} at the central vein.${f ? ` ${FALL_WORDS[f]}.` : ''}`;
}

/** The words' looks: [weight, size in em of the card's type size], never under 12 px. */
export const TYPE = { name: [600, 1], zone: [500, 0.92], end: [500, 0.92], hurt: [600, 0.92], num: [600, 1.18], say: [500, 0.92] } as const satisfies Record<string, readonly [number, number]>;
export type Word = keyof typeof TYPE;
export const sizeOf = (w: Word, f: number): number => Math.max(12, Math.round(TYPE[w][1] * f * 10) / 10);
/** The most lines the sentence takes; the box keeps room for the longest sentence at this width, so neither a new patient nor a switch of view changes the card's height. */
export const SAY_LINES = 3;

export interface LText { x: number; y: number; t: string; word: Word; anchor: 'start' | 'middle' | 'end'; /** shown in this view only; null in both */ only: LobuleView | null }
export interface LobuleLayout {
  W: number; H: number;
  /** the strip */
  strip: { x: number; y: number; w: number; h: number; r: number };
  /** the two zone lines' x */
  zones: [number, number];
  /** the pressure line's three points (portal, mid, central), in the strip; null without the three numbers */
  dots: [number, number][] | null;
  /** the bracket under zone 3: x0, x1, its top y and its depth */
  bracket: { x0: number; x1: number; y: number; d: number };
  /** every word, both views' (a word of the other view stands where it would and is drawn clear, so a switch fades one into the other) */
  texts: LText[];
  /** the sentence's lines (SAY_LINES of them, the unused ones empty) */
  say: string[];
  fall: Fall | null;
}

/** The pressure scale inside the strip: 0 at its foot, `hi` at its top (never under 25 mmHg, so a healthy lobule's small fall reads as small). */
export const scaleTop = (p: LobulePressures): number => Math.max(25, ...[p.pv, p.sin, p.cv].filter((v): v is number => Number.isFinite(v)).map((v) => v + 2));

/** The strip's drawing at width W and card type size f. */
export function lobuleLayout(W: number, f: number, meas: Measure, a: LobuleIn): LobuleLayout {
  const px = (w: Word) => sizeOf(w, f), wt = (w: Word) => TYPE[w][0];
  const texts: LText[] = [];
  const say = (x: number, y: number, t: string, word: Word, anchor: LText['anchor'], only: LobuleView | null = null) => texts.push({ x, y, t, word, anchor, only });
  // the ends' names over the strip
  let y = 0;
  say(0, y, 'Portal tract', 'name', 'start'); say(W, y, 'Central vein', 'name', 'end');
  y += px('name') * 1.25 + f * 0.4;
  const sh = Math.max(32, Math.round(f * 2.9)), strip = { x: 0, y, w: W, h: sh, r: Math.round(sh * 0.3) };
  y += sh + f * 0.45;
  const zones: [number, number] = [W / 3, (2 * W) / 3];
  ['Zone 1', 'Zone 2', 'Zone 3'].forEach((z, i) => say((W * (i + 0.5)) / 3, y, z, 'zone', 'middle'));
  y += px('zone') * 1.2 + f * 0.6;
  const row = y;
  // oxygen: the ends' words, and the bracket under zone 3 with what follows from it
  say(0, row, 'Most oxygen', 'end', 'start', 'oxygen'); say(W, row, 'Least oxygen', 'end', 'end', 'oxygen');
  const by = row + px('end') * 1.25 + f * 0.25, d = Math.max(5, Math.round(f * 0.45));
  const bracket = { x0: zones[1] + 6, x1: W - 6, y: by, d };
  say((bracket.x0 + bracket.x1) / 2, by + d + f * 0.4, 'Injured first', 'hurt', 'middle', 'oxygen');
  const oxyFoot = by + d + f * 0.4 + px('hurt') * 1.2;
  // pressure: the three numbers and the sentence
  say(0, row, fmtP(a.pv), 'num', 'start', 'pressure'); say(W / 2, row, fmtP(a.sin), 'num', 'middle', 'pressure'); say(W, row, fmtP(a.cv), 'num', 'end', 'pressure');
  const sy = row + px('num') * 1.3 + f * 0.35, lh = px('say') * 1.35;
  const fall = fallOf(a);
  const lines = fall ? wrapWords(FALL_WORDS[fall], W, px('say'), wt('say'), meas, SAY_LINES) : [];
  const most = Math.max(1, ...Object.values(FALL_WORDS).map((s) => wrapWords(s, W, px('say'), wt('say'), meas, SAY_LINES).length));
  const sayLines = Array.from({ length: SAY_LINES }, (_, i) => lines[i] ?? '');
  sayLines.forEach((l, i) => say(W / 2, sy + i * lh, l, 'say', 'middle', 'pressure'));
  const pFoot = sy + most * lh;
  // the line inside the strip: the portal and central dots a little in from the ends, the middle one mid-sinusoid (the middle of zone 2)
  let dots: [number, number][] | null = null;
  if (Number.isFinite(a.pv) && Number.isFinite(a.sin) && Number.isFinite(a.cv)) {
    const top = scaleTop(a), inset = Math.max(6, sh * 0.16), span = sh - 2 * inset;
    const Y = (v: number) => strip.y + sh - inset - (Math.min(Math.max(v, 0), top) / top) * span;
    const ex = Math.max(8, strip.r * 0.75);
    dots = [[ex, Y(a.pv!)], [W / 2, Y(a.sin!)], [W - ex, Y(a.cv!)]];
  }
  return { W, H: Math.ceil(Math.max(oxyFoot, pFoot) + 2), strip, zones, dots, bracket, texts, say: sayLines, fall };
}
