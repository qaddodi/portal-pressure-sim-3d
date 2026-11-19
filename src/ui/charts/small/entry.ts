// The registry entry of the small chart: all four patients on one chart (2D visual: 'allpatients'), the HVPG over two years with the CSPH line and a key of the HVPG,
// the stiffness and the platelets before treatment, at 1 year and at 2 years. Specimens are made-up numbers, not patients.
import type { ChartKind } from '../registry.ts';
import { allPatientsFrame } from './frame.ts';
import { MONTHS, type Patient, type Series } from './model.ts';

/** One made-up patient: HVPG, stiffness and platelets easing from `a` to `b` over `months` (a year more at the same pace when pace: the model's second year). */
const made = (name: string, c: string, a: [number, number, number], b: [number, number, number], o: { clear?: string; pace?: boolean; months?: number } = {}): Patient => {
  const end = o.months ?? 24;
  return { name, c, clear: o.clear ?? 'Resolved', pace: !!o.pace, pts: MONTHS.filter((m) => m <= end).map((m) => { const t = m / end, e = t * t * (3 - 2 * t); return { m, hvpg: a[0] + (b[0] - a[0]) * e, lsm: a[1] + (b[1] - a[1]) * e, plt: a[2] + (b[2] - a[2]) * e }; }) };
};
const FOUR: Series = [
  made('Hepatitis C', 's1', [12.6, 21, 128], [8.4, 13.5, 151]),
  made('Higher start', 's2', [17.8, 34, 96], [13.1, 27, 108], { clear: 'Resolved' }),
  made('MASLD', 's3', [11.2, 18.5, 142], [7.9, 12, 160], { pace: true }),
  made('Alcohol', 's4', [14.9, 26, 88], [9.6, 16, 121]),
];
const FOOT = ['Made-up numbers for the look; * the second year is the model carried on at the pace of the first.'];

export const smallEntry: ChartKind = {
  kind: 'small', what: 'All four patients on one chart: HVPG over two years with the CSPH line and a key (visual: allpatients)', slides: 1, status: 'done',
  specimens: [
    { id: 'four', label: 'Four patients, the HVPG over two years and the key', build: (c) => allPatientsFrame(FOUR, FOOT, c).frame },
    { id: 'waiting', label: 'The frame alone, while the numbers are worked out', build: (c) => allPatientsFrame(null, [], c).frame },
    { id: 'year', label: 'Patients with one year in the deck', build: (c) => allPatientsFrame(FOUR.map((p, i) => (i < 2 ? made(p.name, p.c, [p.pts[0]!.hvpg, p.pts[0]!.lsm, p.pts[0]!.plt], [p.pts.at(-1)!.hvpg, p.pts.at(-1)!.lsm, p.pts.at(-1)!.plt], { months: 12 }) : p)), [], c).frame },
  ],
};
