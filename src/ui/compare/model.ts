// The Compare table and the two state cards, as pure functions (2D compare.js): the rows in the readouts' teaching order, the number each prints, and the change column.
import { fmt, fmtG } from '../charts/fmt.ts';
import { liveBalance } from './balance-hold.ts';
import { CMP } from './words.ts';
// @ts-ignore the pinned engine copy is plain JS
import { wallShare } from '../../engine/hales/portal/wall-read.js';

type M = Record<string, any>;   // the metrics object of a frame (hales-engine computeMetrics)

export const GROUPS: readonly (readonly [string, number])[] = [['Pressure', 3], ['Flow', 3], ['Consequences', 2], ['Systemic', 3]];
export const ROWS: readonly (readonly [string, (m: M, live?: boolean) => number, number, string])[] = [
  ['HVPG', (m) => m.hvpg, 1, 'mmHg'], ['Portal pressure', (m) => m.pv, 1, 'mmHg'], ['PPG (PV − IVC)', (m) => m.ppg, 1, 'mmHg'], ['Portal flow', (m) => m.pvFlow, 1, 'L/min'],
  ['Hepatic perfusion', (m) => m.liverPerfPct, 0, '%'], ['Shunt fraction', (m) => m.shuntFraction * 100, 0, '%'], ['Varix wall stress (model)', (m) => wallShare(m.varix) * 100, 0, '%'],
  ['Ascites formation', (m, live) => (live ? liveBalance(m.ascites.ratePerDay) : Math.round(m.ascites.ratePerDay / 100) * 100), 0, 'mL/day'],
  ['Right atrial pressure', (m) => m.ra, 1, 'mmHg'], ['MAP', (m) => m.map, 0, 'mmHg'], ['Cardiac output', (m) => m.co, 1, 'L/min'],
];

/** The first four labels, then how many more. */
export function describe(labels: readonly string[]): string {
  if (!labels.length) return CMP.noChanges;
  let text = labels[0] ?? '';
  for (let i = 1; i < labels.length && i < 4; i++) text += ' · ' + (labels[i] ?? '');
  return labels.length > 4 ? text + ` · +${labels.length - 4} more` : text;
}

export interface DiffRow { label: string; unit: string; a: string; b: string; cls: 'd same' | 'd up' | 'd down'; tri: '' | '▲' | '▼'; text: string }

/** Every row: then (A), now (B) and the change. `live`: the "now" column takes the steady hundred for the ascites rate. */
export function diffRows(A: M, B: M, live = true): DiffRow[] {
  return ROWS.map(([label, get, d, unit]) => {
    const a = get(A), b = get(B, live), dd = b - a;
    const same = Math.abs(dd) < Math.pow(10, -d) * 0.5, f = unit === 'mL/day' ? fmtG : fmt;   // (a daily volume takes its thousands comma, as the lymph tile does)
    return { label, unit, a: f(a, d), b: f(b, d), cls: `d ${same ? 'same' : dd > 0 ? 'up' : 'down'}` as DiffRow['cls'], tri: same ? '' : dd > 0 ? '▲' : '▼', text: same ? '—' : `${dd > 0 ? '+' : '−'}${f(Math.abs(dd), d)}` };
  });
}
