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

export function reserveOf(text: string, key?: string, whole = false): string {
  const unit = key ? (TILE as Record<string, { u?: string } | undefined>)[key]?.u ?? '' : '';
  const sign = key && SIGNED.has(key) ? MINUS : '';
  if (text === VALUE_PENDING) {
    if (key === 'plt') return '000,000/µL';
    if (key === 'map') return `000/000 (000) ${unit}`;
    const d = (TILE as Record<string, { d?: number } | undefined>)[key ?? '']?.d, dot = d === 0 || whole ? '' : '.0';
    return `${sign}${'0'.repeat(leastDigits(key))}${dot}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
  }
  const least = leastDigits(key);
  // a whole part (a digit run not after a decimal point) is padded to the least; a decimal part keeps the digits its tile prints; a grouped number's later groups are three digits already
  const body = text.replace(/[-−]/g, '').replace(/(^|[^\d.,])(\d+)/g, (_m, pre: string, d: string) => `${pre}${'0'.repeat(Math.max(least, d.length))}`).replace(/\d/g, '0');
  return `${sign}${body}`;
}
