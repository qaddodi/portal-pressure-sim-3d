// The registry entry of the vitals monitor (2D tool { kind: 'vitals' }, vitals-monitor.js). Specimens: made-up readings that show the look, never a patient.
import type { ChartKind } from '../registry.ts';
import { vitalsFrame, type Cell } from './model.ts';

const cell = (id: string, v: number, o: Partial<Cell> = {}): Cell => {
  const d = { hr: ['HR', 'Heart rate', '/min', 0], map: ['BP', 'Blood pressure', 'mmHg', 0], co: ['CO', 'Cardiac output', 'L/min', 1], hb: ['Hb', 'Hemoglobin', 'g/dL', 1] }[id]!;
  return { id, k: d[0] as string, title: d[1] as string, u: d[2] as string, d: d[3] as number, v, s: NaN, dia: NaN, bad: false, ...o };
};
const BEAT = (() => {
  const x: number[] = [], v: number[] = [];
  for (let t = 0; t <= 6; t += 0.02) { const ph = (t % 0.85) / 0.85; x.push(t); v.push(Math.exp(-(((ph - 0.02) / 0.0075) ** 2)) + 0.3 * Math.exp(-(((ph - 0.27) / 0.058) ** 2))); }
  return { x, v, x1: 6 };
})();

export const vitalsEntry: ChartKind = {
  kind: 'vitals', what: 'The bedside monitor: EKG strip over heart rate, pressure, output, hemoglobin', slides: 3, status: 'done',
  specimens: [
    { id: 'default', label: 'Heart rate, blood pressure, hemoglobin', build: (c) => vitalsFrame({ ids: ['hr', 'map', 'hb'], cells: [cell('hr', 78), cell('map', 88, { s: 118, dia: 72 }), cell('hb', 12.4)], strip: BEAT }, c.w, c.pal) },
    { id: 'output', label: 'Heart rate, blood pressure, cardiac output', build: (c) => vitalsFrame({ ids: ['hr', 'map', 'co'], cells: [cell('hr', 92), cell('map', 74, { s: 104, dia: 60 }), cell('co', 6.1)], strip: BEAT }, c.w, c.pal) },
    { id: 'hold', label: 'With the hold rail: MAP 65 and systolic 90 (Baveno VIII)', build: (c) => vitalsFrame({ ids: ['map', 'hr'], cells: [cell('map', 62, { s: 86, dia: 50, bad: true }), cell('hr', 104)], hold: true, strip: BEAT }, c.w, c.pal) },
    { id: 'alarm', label: 'After a large bleed: alarm red, the hemoglobin rail', build: (c) => vitalsFrame({ ids: ['hr', 'map', 'hb'], cells: [cell('hr', 118, { bad: true }), cell('map', 61, { s: 84, dia: 48, bad: true }), cell('hb', 6.4, { bad: true })], rail: 'hb', toHb: 5.2, strip: BEAT }, c.w, c.pal) },
  ],
};
