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
export interface ReserveOpts { seen?: readonly string[]; minus?: boolean }

/** `still`: no control on the slide can bring a very different reading (no slider, hold-to-strain, time-lapse or patient switch), so a shown reading reserves only its own width: the padding (a second digit, a minus slot)
 *  is for a reading that can change its size, and left after one that cannot it reads as a gap before the next word, "18.2 mmHg   to" and "1.1 L   of ascites" (TIPS Doppler review, 23 Nov 2026).
 *  A reading not yet in reserves its typical value, so its arrival does not re-wrap the line. */
export function reserveOf(text: string, key?: string, whole = false, still = false, opts: ReserveOpts = {}): string {
  if (still && text !== VALUE_PENDING) return text;
  const unit = key ? (TILE as Record<string, { u?: string } | undefined>)[key]?.u ?? '' : '';
  const slot = opts.minus === false ? '' : key && SIGNED.has(key) ? MINUS : '';
  if (text === VALUE_PENDING) {
    if (key === 'plt') return '000,000/µL';
    if (key === 'map') return `000/000 (000) ${unit}`;
    const d = (TILE as Record<string, { d?: number } | undefined>)[key ?? '']?.d, dot = d === 0 || whole ? '' : '.0';
    return `${slot}${'0'.repeat(leastDigits(key))}${dot}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
  }
  const zeros = (t: string) => t.replace(/\d/g, '0');
  // (the widest text the reading takes on the slide, digits as zeros: every digit is one width)
  if (opts.seen?.length) return [text, ...opts.seen].map(zeros).reduce((a, b) => (b.length > a.length ? b : a));
  const least = leastDigits(key);
  // a whole part (a digit run not after a decimal point) is padded to the least; a decimal part keeps the digits its tile prints; a grouped number's later groups are three digits already
  const body = text.replace(/[-−]/g, '').replace(/(^|[^\d.,])(\d+)/g, (_m, pre: string, d: string) => `${pre}${'0'.repeat(Math.max(least, d.length))}`).replace(/\d/g, '0');
  return `${/^[-−]/.test(text) ? MINUS : slot}${body}`;
}
