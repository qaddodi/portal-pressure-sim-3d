// Made-up series for the gallery and the tests (specimen numbers, not a patient's): what the worker would hand back for a sweep, as the 2D code reads it.
import type { ChartCtx } from '../Chart.tsx';
import type { Frame } from '../scene.ts';
import * as P from './curve-pure.generated.js';
import * as C from './course-pure.generated.js';
import { curveFrame, type CurveTool } from './frame.ts';
import { courseFrame } from './course-frame.ts';
import { goalOf, type Fp, type State } from './data.ts';

const st = (fp: Fp): State => ({ fp });
const smooth = (t: number) => t * t * (3 - 2 * t);

/** A sweep's states from a function of the setting, one per point of every sweep (own first, then each `against`). */
export const sweepStates = (t: CurveTool, f: (x: number, sweep: number) => Fp): State[] => {
  const sweeps = 1 + P.againstsOf(t).length;
  const n = P.xKeyOf(t) && Array.isArray(t.points) ? t.points.length : P.curveXs(t).length;
  return Array.from({ length: sweeps }, (_, h) => Array.from({ length: n }, (__, i) => { const xs = P.curveXs(t); return st(f(xs[i] ?? i, h)); })).flat();
};

export const TIPS_TOOL: CurveTool = { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'] };
export const tipsSpecimen = (c: ChartCtx): Frame => {
  const t = TIPS_TOOL, ser = P.curveSeries(t, sweepStates(t, (d) => ({ ppg: 15.5 - (d - 6) * 1.05, liver: 78 - (d - 6) * 5 })));
  const fp = { ppg: 11.2, liver: 58 }, params = { tips: { d: 9 } };
  return curveFrame({ tool: t, ser, goal: goalOf(t, ser, { fp, params }) }, c).frame;
};

export const AGAINST_TOOL: CurveTool = { kind: 'curve', param: 'splanchnicTone', from: 0.6, to: 1.4, step: 0.1, lines: ['hvpg'], against: [{ label: 'Carvedilol', params: { drugs: { carvedilol: true } }, own: 'No drug' }] };
export const againstSpecimen = (c: ChartCtx): Frame => {
  const t = AGAINST_TOOL, ser = P.curveSeries(t, sweepStates(t, (x, h) => ({ hvpg: 6 + (x - 0.6) * 13 - (h ? 1.6 + (x - 0.6) * 2.4 : 0) })));
  return curveFrame({ tool: t, ser, goal: goalOf(t, ser, { fp: { hvpg: 13.9 }, params: { splanchnicTone: 1.1 } }) }, c).frame;
};

export const RELATION_TOOL: CurveTool = { kind: 'curve', x: 'lsm', param: 'cirrhosis', from: 0.2, to: 1, step: 0.1, lines: ['hvpg'], xCuts: [15, 25], cuts: [5, 10],
  dots: [{ slide: 'a', name: 'Early' }, { slide: 'b', name: 'Compensated' }, { slide: 'c', name: 'Decompensated' }], walk: true };
export const relationSpecimen = (c: ChartCtx): Frame => {
  const t = RELATION_TOOL, ser = P.curveSeries(t, sweepStates(t, (x) => ({ lsm: 5 + x * 38 + x * x * 12, hvpg: 2 + x * 22 - x * x * 4 })));
  const dots = [{ ...t.dots[0], fp: { lsm: 9, hvpg: 4.5 } }, { ...t.dots[1], fp: { lsm: 18, hvpg: 9.5 } }, { ...t.dots[2], fp: { lsm: 33, hvpg: 17 } }];
  return curveFrame({ tool: t, ser, dots, goal: goalOf(t, ser, { fp: { lsm: 33, hvpg: 17 }, params: {} }) }, c).frame;
};

export const COURSE_TOOL: Record<string, unknown> = {
  kind: 'course', reading: 'asc', wait: 14, after: 28,
  then: [{ name: 'Diuretics', params: { diuretics: true } }, { name: 'Diuretics + TIPS', params: { diuretics: true, tips: { on: true } } }],
  words: { event: 'Tap', before: 'Tense belly', start: 'Treatment starts', rise: 'Refills', axis: 'Weeks after the tap', label: 'Ascites, liters', title: 'Ascites after the tap', short: 'After the tap' },
};
/** The course's series for a made-up tap: the belly refills over the wait, then each treatment parts from it. */
export const courseSeriesSpecimen = (t: Record<string, unknown> = COURSE_TOOL) => {
  const c = C.courseOf(t), asc = (ml: number) => st({ asc: ml });
  const head = [asc(7000), ...Array.from({ length: c.wait + 1 }, (_, d) => asc(500 + 2400 * smooth(d / c.wait)))];
  const tail = c.then.flatMap((_: unknown, j: number) => Array.from({ length: c.after }, (__, i) => asc(2900 - (j ? 2300 : 1500) * smooth((i + 1) / c.after))));
  return C.courseSeries(t, head, tail);
};
export const courseSpecimen = (c: ChartCtx): Frame => courseFrame({ tool: COURSE_TOOL, ser: courseSeriesSpecimen() }, c).frame;
export const courseWaitingSpecimen = (c: ChartCtx): Frame => courseFrame({ tool: COURSE_TOOL, ser: null }, c).frame;
