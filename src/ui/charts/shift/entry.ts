// The registry entry of the shift chart (one file per chart, so the threads that port the charts never edit the same lines of registry.ts).
import type { ChartKind } from '../registry.ts';
import { shiftFrame } from './frame.ts';
import type { Readings, Stage, Trail } from './model.ts';

// Made-up readings that rise and fall the way the circulation does from healthy to cirrhosis (a specimen shows a look, not a patient).
const V = (co: number, svr: number, map: number, bv: number, pv: number, spl: number): Readings => ({ co, svr, map, bv, pv, spl });
const STAGES: Stage[] = [
  { j: 0, k: 0, start: false, name: 'Healthy' }, { j: 1, k: 1, start: false, name: 'Compensated' }, { j: 2, k: 2, start: false, name: 'Decompensated' },
  { j: 3, k: 3, start: true, name: 'Before carvedilol' }, { j: 3, k: 3, start: false, name: 'On carvedilol' },
];
const HEALTHY = V(5.4, 1180, 92, 5000, 7.5, 1.05), COMP = V(6.6, 900, 88, 5400, 13, 1.5), DECOMP = V(7.8, 650, 78, 5900, 19, 2.1);
const ON_RX = V(7.1, 700, 76, 5800, 15.5, 1.8);
const KEYS = ['co', 'svr', 'map', 'bv', 'pv', 'spl'] as const;
const trail: Trail = Array.from({ length: 41 }, (_, i) => { const t = i / 40, e = t * t * (3 - 2 * t); return [90 * t, ...KEYS.map((k) => DECOMP[k]! + (ON_RX[k]! - DECOMP[k]!) * e)]; });
const shows = (n: number, o: { at: number; lit?: string[]; k?: number; live?: Readings }) => (c: Parameters<typeof shiftFrame>[1]) => {
  const vals = [HEALTHY, COMP, DECOMP, DECOMP, ON_RX].slice(0, n), stages = STAGES.slice(0, n);
  return shiftFrame({ stages, vals, trails: stages.map((s, i) => (i === 4 ? trail : null)), at: o.at, lit: o.lit, live: o.live, lapse: o.k === undefined ? null : { i: 4, trail, shown: o.k } }, c).frame;
};

export const shiftEntry: ChartKind = {
  kind: 'shift', what: 'Change from healthy', slides: undefined, status: 'done',
  specimens: [
    { id: 'two', label: 'Healthy, then compensated cirrhosis (specimen numbers)', build: shows(2, { at: 1 }) },
    { id: 'three', label: 'Three states, the slide teaches the portal pressure and the inflow', build: shows(3, { at: 2, lit: ['pv', 'spl'] }) },
    { id: 'lapse', label: 'A time-lapse half played, its days drawn as the model made them', build: shows(5, { at: 3, k: 0.5 }) },
  ],
};
