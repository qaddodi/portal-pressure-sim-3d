// The registry entry of the trace chart (one file per chart, so the threads that port the charts never edit the same lines of registry.ts).
// Specimens: made-up readings that show the look, never a patient (a course from a diagnosis through carvedilol to a stent).
import type { ChartKind } from '../registry.ts';
import { traceFrame } from './frame.ts';
import type { TalkPoint } from './model.ts';

const pt = (n: number, tick: string, when: string, day: string, pv: number, whvp: number, fhvp: number, params: unknown = {}, mile?: string): TalkPoint =>
  ({ n, title: tick, tick, when, day, mile, params, fp: { pv, whvp, fhvp, hvpg: whvp - fhvp } });
const CARV = { drugs: { carvedilol: true } }, TIPS = { drugs: { carvedilol: true }, tips: { on: true } };
const COURSE: TalkPoint[] = [
  pt(1, 'Diagnosis', 'Day 0', 'Day 0', 21, 19, 5, {}, 'Dx'), pt(2, 'Baseline', 'Same day', 'Day 0', 21.5, 19.4, 5.2, {}),
  pt(3, 'Carvedilol', 'Day 30', 'Day 30', 18.2, 16.1, 5, CARV, 'Carvedilol'), pt(4, 'Bleed', 'Month 6', 'Month 6', 24, 21.5, 5.3, CARV, 'Bleed'),
  pt(5, 'The stent opens', 'Month 6', 'Month 6', 14.5, 13, 5.1, TIPS, 'TIPS'), pt(6, 'The bleeding has stopped', 'Year 1', 'Year 1', 13.6, 12, 5, TIPS),
];

export const traceEntry: ChartKind = {
  kind: 'trace', what: 'The course on one chart (talk trace)', slides: 5, status: 'done',
  specimens: [
    { id: 'course', label: 'The course on one chart: three pressures, the two gaps, the treatments', build: (c) => traceFrame({ pts: COURSE, bands: ['carvedilol', 'tips'] }, c) },
    { id: 'clot', label: 'Early in a talk, the first band named "clot"', build: (c) => traceFrame({ pts: COURSE.slice(0, 3), gap: 'clot', bands: ['carvedilol'] }, c) },
    { id: 'milestones', label: 'Milestones only: the HVPG alone over its cut-offs', build: (c) => traceFrame({ pts: COURSE, style: 'milestones', bands: ['carvedilol', 'tips'] }, c) },
    { id: 'one', label: 'The first state only', build: (c) => traceFrame({ pts: COURSE.slice(0, 1) }, c) },
  ],
};
