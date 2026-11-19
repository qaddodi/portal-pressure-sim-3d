// "Why?" (2D why.js): one causal sentence, a contribution waterfall and the formula, for a number the model made. The rows, as a pure function of the worker's `explain` answer.
import { fmt } from '../charts/fmt.ts';

export interface Contribution { label: string; delta: number; other?: boolean }
export interface Explanation { label: string; sentence: string; unit: string; digits: number; total: number; contributions: Contribution[]; formula?: string }
export interface WfRow { key: string; short: string; full: string; left: string; width: string; kind: 'up' | 'down' | 'other'; value: string }

/** A short name on the row ("Cirrhosis"), the full one with its amount in the tooltip ("Cirrhosis 85%"). */
export const shortLabel = (l: string) => l.replace(/\s[+×]?[\d.]+(\s?(%|mm|mL|L|g\/dL))?$/, '');

export function waterfall(r: Explanation): WfRow[] {
  const maxAbs = Math.max(1e-6, ...r.contributions.map((c) => Math.abs(c.delta)), Math.abs(r.total));
  const tiny = Math.pow(10, -r.digits) * 0.5;
  const shown: Contribution[] = r.contributions.filter((c) => Math.abs(c.delta) >= tiny).slice(0, 8);
  // The changes reverted one at a time do not add up to the whole (they interact): the rest is a row of its own, so the bars always sum to the change shown above them.
  const rest = r.total - shown.reduce((a, c) => a + c.delta, 0);
  if (shown.length && Math.abs(rest) >= Math.max(tiny, 0.05 * Math.abs(r.total))) shown.push({ label: WHY.other, delta: rest, other: true });
  return shown.map((c, i) => {
    const w = (Math.abs(c.delta) / maxAbs) * 50;
    return { key: `${i}:${c.label}`, short: shortLabel(c.label), full: c.label, left: c.delta >= 0 ? '50%' : `${50 - w}%`, width: `${Math.max(1, w)}%`, kind: c.other ? 'other' : c.delta >= 0 ? 'up' : 'down', value: (c.delta >= 0 ? '+' : '−') + fmt(Math.abs(c.delta), r.digits) };
  });
}

/** The words, from 2D why.js; tests/compare-words.test.ts finds each in the 2D source when PPS_2D_REPO points at a checkout. */
export const WHY = {
  title: 'Why?', calculating: 'Calculating the contributions…', failed: 'The model could not calculate this right now.', other: 'Interaction and other',
  waterfall: (unit: string) => `Contribution of each change · ${unit}`,
  note: 'Estimated by reverting each change on its own. Red raises the value, blue lowers it, gray is the interaction between changes and other effects.',
} as const;
