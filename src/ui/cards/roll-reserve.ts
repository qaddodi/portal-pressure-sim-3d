// A reading's width is fixed for the slide (Plan 45): its arrival ("…" → "9.8 mmHg"), its ticks ("9.8" → "10.2") and a slider never re-wrap the words around it. The Roll's sizer holds this text,
// not the shown one: every digit is a zero (the digits are tabular: one width each), a whole part under two digits gets a second, a value that can be negative has a minus slot, and a reading
// not yet known ("…") reserves a typical value and its unit. Pure; tests/roll-reserve.test.ts pins it.
import { TILE } from '../charts/tiles.generated.ts';
import { VALUE_PENDING } from '../text/tokens.ts';

/** The readings that can come out below zero (a difference of two pressures): they hold a minus sign's room. */
export const SIGNED: ReadonlySet<string> = new Set(['dipsDp', 'eus', 'hvpg', 'ppg', 'rpp']);
const MINUS = '−';
/** The least digits in a whole part: a blood pressure reads three ("120/80 (93)"), the platelets' thousands three ("150,000"), every other reading two. */
const leastDigits = (key?: string): number => (key === 'map' || key === 'plt' ? 3 : 2);

/** What else a reading's box has to hold on this slide.
 *  `seen`: the texts the reading takes on the slide (a time-lapse's two ends and every day of its chart): the box is as wide as the widest of them and no wider, so no padding stands after a reading that never gets that long
 *  ("16.5 mmHg,   the serum albumin falls and 3.8 L   of ascites", recompensation 4, review bbe955e5).
 *  `minus`: whether a reading that can go below zero holds a minus slot while it is not negative (only a slider or a strain can take it there; false on every other slide: "1.4 mmHg   and varices are rare", varices 8). */
export interface ReserveOpts { seen?: readonly string[]; minus?: boolean; /** the slider can only raise the reading (fibrosis, cirrhosis), so no minus slot stands in front of it, but it still holds two whole digits (a slider can reach 10) */ raises?: boolean }

/** The slider parameters that only push pressure up from where the slide starts: a reading they drive never goes below zero, so it holds no minus slot ("6.1 mmHg.      An LSM", Stiffness 3, capture 572259fd). */
export const RAISING: ReadonlySet<string> = new Set(['cirrhosis']);
/** Whether a slide's controls can only raise its readings: a slider whose every parameter is in RAISING, and no strain. */
export const raisesOnly = (ctl?: { whatIf?: { paths: readonly string[] }; strain?: unknown }): boolean => !!ctl?.whatIf && !ctl.strain && ctl.whatIf.paths.length > 0 && ctl.whatIf.paths.every((p) => RAISING.has(p));

/** `still`: no control on the slide can bring a very different reading (no slider, hold-to-strain, time-lapse or patient switch), so a shown reading reserves only its own width: the padding (a second digit, a minus slot)
 *  is for a reading that can change its size, and left after one that cannot it reads as a gap before the next word, "18.2 mmHg   to" and "1.1 L   of ascites" (TIPS Doppler review, 23 Nov 2026).
 *  A reading not yet in reserves its typical value, so its arrival does not re-wrap the line. */
export function reserveOf(text: string, key?: string, whole = false, still = false, opts: ReserveOpts = {}): string {
  if (still && text !== VALUE_PENDING) return text;
  const unit = key ? (TILE as Record<string, { u?: string } | undefined>)[key]?.u ?? '' : '';
  const slot = opts.minus === false || opts.raises ? '' : key && SIGNED.has(key) ? MINUS : '';
  if (text === VALUE_PENDING) {
    if (key === 'plt') return '000,000/µL';
    if (key === 'map') return `000/000 (000) ${unit}`;
    const d = (TILE as Record<string, { d?: number } | undefined>)[key ?? '']?.d, dot = d === 0 || whole ? '' : '.0';
    return `${slot}${'0'.repeat(leastDigits(key))}${dot}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
  }
  const zeros = (t: string) => t.replace(/\d/g, '0');
  // (the widest text the reading takes on the slide, digits as zeros: every digit is one width)
  if (opts.seen?.length) return [text, ...opts.seen].map(zeros).reduce((a, b) => (b.length > a.length ? b : a));
  // (an index out of 1 never has a second whole digit: a padded one stood after "0.80 /1." as a gap, tips-complete 10, audit f9a5d2e0)
  // (exact: with no slider or strain on the slide (`minus: false`) and no list of what the reading takes, the values it can show are the one it shows, so it holds its own digits and nothing more:
  //  "9.0 mmHg,   but" closes up; a slider or strain (`minus` not false) can reach 10, so it holds the second digit; an index out of 1 never has one)
  const least = unit === '/1' || (opts.minus === false && leastDigits(key) === 2) ? 1 : leastDigits(key);
  // a whole part (a digit run not after a decimal point) is padded to the least; a decimal part keeps the digits its tile prints; a grouped number's later groups are three digits already
  const body = text.replace(/[-−]/g, '').replace(/(^|[^\d.,])(\d+)/g, (_m, pre: string, d: string) => `${pre}${'0'.repeat(Math.max(least, d.length))}`).replace(/\d/g, '0');
  return `${/^[-−]/.test(text) ? MINUS : slot}${body}`;
}

/** The texts a reading's box has to hold when every one of them is known (`seen`: the values it takes on this slide, a time-lapse's days among them): the box is as wide as the widest of THEM, measured as they stand, so the
 *  digits can be proportional and a "1" takes the room of a "1", not of a "0" ("1 6.8 mmHg", "11.1  mmHg": a tabular "1" is a cell 0.2 em wider than its ink, and the zeros of the sizer stood wider than the shown digits, Precipitants 3, capture 6ec6d323).
 *  `undefined` where the values are not all known (a slider can reach any): the box then holds its zero-filled reserve, as before. */
export function altsOf(text: string, still = false, opts: ReserveOpts = {}): string[] | undefined {
  if (still || text === VALUE_PENDING || !opts.seen?.length) return undefined;
  const all = [...new Set([text, ...opts.seen])].filter((t) => t !== VALUE_PENDING);
  return all.length ? all : undefined;
}
