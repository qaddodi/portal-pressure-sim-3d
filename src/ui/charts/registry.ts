// Every chart look of the 2D app and where it stands here (parity-plan batch B10). The inventory test prints the score ("x of y"); a chart is "done"
// when its model, its card and its tests are in and a specimen of it is in the gallery (?charts).
import type { ChartCtx } from './Chart.tsx';
import type { Frame } from './scene.ts';
import { ZONES, zonesFrame } from './criteria/zones.ts';
import { flowsFrame } from './flows/frame.ts';
import { ROUTES, LIVER, OTHER, type Part } from './flows/parts.ts';
import { trialFrame } from './trial/frame.ts';
import { TRIALS } from './trial/trials.generated.ts';
import type { Fit } from './trial/model.ts';
import { stiffFrame } from './stiff/frame.ts';
import { saagFrame } from './saag/frame.ts';
import { readingOf, type Pt } from './saag/model.ts';
import { forestFrame, armsFrame } from './forest/frame.ts';
import { lumenFrame } from './lumen/frame.ts';
import { flowTimeFrame } from './flowtime/frame.ts';
import { flowTimeSeries, MEAL_LINES } from './flowtime/model.ts';
import { ladderEntry } from './ladder/entry.ts';
import { profileEntry } from './profile/entry.ts';
import { pathEntry } from './path/entry.ts';
import { curveEntry } from './curve/entry.ts';
import { evgraphEntry } from './evgraph/entry.ts';
import { planeEntry } from './plane/entry.ts';
import { fluidEntry } from './fluid/entry.ts';
import { shiftEntry } from './shift/entry.ts';
import { stentEntry } from './stent/entry.ts';
import { timelineEntry } from './timeline/entry.ts';
import { smallEntry } from './small/entry.ts';
import { traceEntry } from './trace/entry.ts';
import { vitalsEntry } from './vitals/entry.ts';
import { wallsEntry } from './walls/entry.ts';
import { menuEntry } from './menu/entry.ts';
import { scoresEntry } from './scores/entry.ts';
import { lobuleEntry } from './lobule/entry.ts';

/** A smooth made-up time-lapse for a gallery specimen: [day, a, b] rows rising (or falling) along an ease. Specimens show a look, not a patient. */
const specimenTrail = (days: number, a: [number, number], b: [number, number]) => Array.from({ length: 61 }, (_, i) => { const t = i / 60, e = t * t * (3 - 2 * t); return [days * t, a[0] + (a[1] - a[0]) * e, b[0] + (b[1] - b[0]) * e]; });
const MEAL = flowTimeSeries(specimenTrail(30, [8, 12.4], [1.1, 1.6]), 'meal')!;
const DAYS = flowTimeSeries(specimenTrail(180, [14, 9], [22, 11]), 'days', ['hvpg', 'lsm'])!;

const SAAG_PTS: Pt[] = [
  { name: 'Cirrhosis', saag: 2.1, tp: 1.4, own: true, modeled: true }, { name: 'Right heart failure', saag: 2.0, tp: 3.9, own: false, modeled: true },
  { name: 'Peritoneal disease', saag: 0.6, tp: 3.8, own: false, modeled: false },
];

const part = (id: string, pct: number): Part => {
  const r = id === 'liver' ? LIVER : id === 'other' ? OTHER : ROUTES.find((x) => x[0] === id)!;
  return { id, name: r[1], tone: r[2], pct };
};
const SPLIT = [part('liver', 62), part(ROUTES[0]![0], 21), part(ROUTES[1]![0], 11), part('other', 6)];
const trialSpecimen = (id: string, fit: Fit | null, label: string): Specimen => ({ id: `${id}${fit ? '-' + fit.verdict : ''}`, label, build: (c) => trialFrame(TRIALS[id]!, fit, c) });

export interface Specimen { id: string; label: string; build(c: ChartCtx): Frame }
export interface ChartKind {
  /** the 2D tool kind or chart look (src/ui/decks/*.js `tool: { kind }`, the Tests card's pictures) */
  kind: string;
  /** what it is, in the 2D app's words */
  what: string;
  /** slides of the 2D decks that use it (from the plan's count) */
  slides?: number;
  status: 'done' | 'todo';
  specimens: Specimen[];
}


export const CHARTS: ChartKind[] = [
  { kind: 'criteria', what: 'Guideline rule list with live rows, or the Baveno VIII zones graph', slides: 50, status: 'done',
    specimens: [{ id: 'zones', label: 'Stiffness and platelets zones (Baveno VIII)', build: (c) => zonesFrame(ZONES['first-visit']!, c, 'Stiffness and platelets zones') }] },
  ladderEntry,
  { kind: 'flowtime', what: 'Lines over days: HVPG, varix, ascites, liver flow', slides: 43, status: 'done',
    specimens: [{ id: 'meal', label: 'Portal pressure and flow around a meal (specimen numbers)', build: (c) => flowTimeFrame({ ser: MEAL, clock: 'meal', keys: MEAL_LINES }, MEAL.ax.end, c).frame },
      { id: 'meal-mid', label: 'The same, with the lines half drawn', build: (c) => flowTimeFrame({ ser: MEAL, clock: 'meal', keys: MEAL_LINES }, 12, c).frame },
      { id: 'days', label: 'HVPG and stiffness over six months, with two treatments (specimen numbers)', build: (c) => flowTimeFrame({ ser: DAYS, clock: 'days', keys: ['hvpg', 'lsm'], rx: ['carvedilol', 'diuretics'] }, DAYS.ax.end, c).frame }] },
  profileEntry,
  pathEntry,
  curveEntry,
  { kind: 'trial', what: 'A trial: arms, shares, effect, fit to the patient', slides: 18, status: 'done',
    specimens: [trialSpecimen(Object.keys(TRIALS)[0]!, null, 'A trial, as the Tests card shows it'), trialSpecimen(Object.keys(TRIALS)[0]!, { verdict: 'no', rows: [{ rule: 'Child-Pugh B or C', state: 'no', value: 'A' }] }, 'On a slide: the patient does not fit'),
      trialSpecimen(Object.keys(TRIALS)[1]!, { verdict: 'fits', met: 3, of: 3, rows: [] }, 'On a slide: the patient fits')] },
  { kind: 'flows', what: 'Portal blood bar: where the blood goes', slides: 12, status: 'done',
    specimens: [{ id: 'portal', label: 'Where the portal blood goes (cirrhosis)', build: (c) => flowsFrame({ of: 'portal', parts: SPLIT, healthy: [part('liver', 100)], tiers: null }, c).frame }] },
  { kind: 'lumen', what: 'A vessel cross-section: open, clot, stent', slides: 7, status: 'done',
    specimens: [{ id: 'open', label: 'Open portal vein', build: (c) => lumenFrame({ vessel: 'PV_TRUNK', stenosis: 0, thrombus: 0, stent: false }, c) },
      { id: 'clot', label: 'Partly occluded by a clot', build: (c) => lumenFrame({ vessel: 'PV_TRUNK', stenosis: 0.1, thrombus: 0.55, stent: false }, c) },
      { id: 'stent', label: 'A stent, narrowed at its distal end', build: (c) => lumenFrame({ vessel: 'TIPS', stenosis: 0.4, thrombus: 0, stent: true, site: 'distal' }, c) }] },
  evgraphEntry,
  { kind: 'forest', what: 'Forest plot of trials', status: 'done',
    specimens: [{ id: 'all', label: 'Every trial on one scale', build: (c) => forestFrame(Object.values(TRIALS), c).frame },
      { id: 'picked', label: 'Four trials fit the patient; one is picked', build: (c) => { const ids = Object.keys(TRIALS); return forestFrame(Object.values(TRIALS), c, { highlight: ids.slice(0, 4), selected: ids[1] }).frame; } },
      { id: 'arms', label: 'One trial\'s arms as bars', build: (c) => armsFrame(Object.values(TRIALS)[0]!, c) }] },
  planeEntry,
  fluidEntry,
  { kind: 'saag', what: 'SAAG and protein plane', status: 'done',
    specimens: [{ id: 'plane', label: 'SAAG against ascitic protein, with a reading', build: (c) => saagFrame(SAAG_PTS, c, { read: readingOf(2.1, 1.4) }) }, { id: 'empty', label: 'No patient with fluid to tap', build: (c) => saagFrame([], c) }] },
  shiftEntry,
  { kind: 'stiffness', what: 'Stiffness bar under the FibroScan number', slides: 8, status: 'done',
    specimens: [{ id: 'liver', label: 'Liver, 20 kPa, platelets 128', build: (c) => stiffFrame({ lsm: 20, plt: 128, note: true }, c) }, { id: 'spleen', label: 'Spleen, 64 kPa', build: (c) => stiffFrame({ lsm: 64, organ: 'spleen', note: true }, c) },
      { id: 'congested', label: 'Congested liver: the rules do not apply', build: (c) => stiffFrame({ lsm: 18, plt: 140, ctx: 'congested', note: true }, c) }] },
  stentEntry,
  timelineEntry,
  smallEntry,
  traceEntry,
  vitalsEntry,
  wallsEntry,
  menuEntry,
  scoresEntry,
  lobuleEntry,
];

export const chartScore = () => ({ done: CHARTS.filter((c) => c.status === 'done').length, of: CHARTS.length });
