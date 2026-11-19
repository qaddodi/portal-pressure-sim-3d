// The registry entry of the evgraph chart (one file per chart, so the threads that port the charts never edit the same lines of registry.ts).
// Specimens: made-up numbers that show the look, never a patient (a stent opening on a decompensated liver; a shunt closing on a gastric varix).
import type { ChartKind } from '../registry.ts';
import { evGraphFrame } from './frame.ts';
import { EVENT_S, EvRun, eventGraphOf, type EvSpec } from './model.ts';

const must = (s: EvSpec | null): EvSpec => s!;
const TIPS = must(eventGraphOf({ procedure: 'tips', tiles: ['ppg', 'liver'] }));
const BRTO = must(eventGraphOf({ procedure: 'brto', tiles: ['ppg', 'gv'] }));

/** A run on the model's own course: each line eases from its start to its end as the splanchnic blood drains (a fall of a few seconds), read every 0.5 s up to `upTo` seconds. */
function runOf(spec: EvSpec, a: [number, number], b: [number, number], upTo = EVENT_S, tau = 3.2): EvRun {
  const r = new EvRun(spec.lines);
  r.start();
  for (let t = 0.5; t <= upTo + 1e-9; t += 0.5) { const k = 1 - Math.exp(-t / tau); r.push(t, a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k); }
  return r;
}
const T0: [number, number] = [19.3, 61], T1: [number, number] = [11, 32];
const G0: [number, number] = [16.9, 6.8], G1: [number, number] = [18, 0.4];

export const evgraphEntry: ChartKind = {
  kind: 'evgraph', what: 'Event graph: PPG and a second line after an event', slides: 8, status: 'done',
  specimens: [
    { id: 'tips-before', label: 'Before the stent opens (PPG and sinusoidal flow)', build: (c) => evGraphFrame({ spec: TIPS, before: T0, end: T1 }, 0, c) },
    { id: 'tips-mid', label: 'Seven seconds after the stent opens', build: (c) => evGraphFrame({ spec: TIPS, before: T0, end: T1, run: runOf(TIPS, T0, T1, 7) }, 7, c) },
    { id: 'tips-done', label: 'The whole run, with the goal band', build: (c) => evGraphFrame({ spec: TIPS, before: T0, end: T1, run: runOf(TIPS, T0, T1) }, EVENT_S, c) },
    { id: 'brto-done', label: 'After a shunt is occluded: the PPG creeps up, the fundal varix closes', build: (c) => evGraphFrame({ spec: BRTO, before: G0, end: G1, run: runOf(BRTO, G0, G1) }, EVENT_S, c) },
  ],
};
