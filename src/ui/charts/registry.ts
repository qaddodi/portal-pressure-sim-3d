// Every chart look of the 2D app and where it stands here (parity-plan batch B10). The inventory test prints the score ("x of y"); a chart is "done"
// when its model, its card and its tests are in and a specimen of it is in the gallery (?charts).
import type { ChartCtx } from './Chart.tsx';
import type { Frame } from './scene.ts';
import { ZONES, zonesFrame } from './criteria/zones.ts';

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

const todo = (kind: string, what: string, slides?: number): ChartKind => ({ kind, what, slides, status: 'todo', specimens: [] });

export const CHARTS: ChartKind[] = [
  { kind: 'criteria', what: 'Guideline rule list with live rows, or the Baveno VIII zones graph', slides: 50, status: 'done',
    specimens: [{ id: 'zones', label: 'Stiffness and platelets zones (Baveno VIII)', build: (c) => zonesFrame(ZONES['first-visit']!, c, 'Stiffness and platelets zones') }] },
  todo('ladder', 'Pressure ladder: bars along one axis and the HVPG subtraction (already a card, src/ui/cards)'),
  todo('flowtime', 'Lines over days: HVPG, varix, ascites, liver flow', 43),
  todo('profile', 'Pressure profile along the circuit', 33),
  todo('path', 'Guideline path map', 33),
  todo('curve', 'One quantity against another, or a parameter sweep, with its course', 25),
  todo('trial', 'A trial: arms, shares, effect, fit to the patient', 18),
  todo('flows', 'Portal blood bar: where the blood goes', 12),
  todo('lumen', 'A vessel cross-section: open, clot, stent', 7),
  todo('evgraph', 'Event graph: PPG and a second line after an event', 8),
  todo('forest', 'Forest plot of trials'),
  todo('plane', 'Two-quantity plane with zones (CSPH plane, stiffness × platelets)'),
  todo('fluid', 'Starling forces and the fluid window', 2),
  todo('saag', 'SAAG and protein plane'),
  todo('shift', 'Change from healthy'),
  todo('stiffness', 'Stiffness bar under the FibroScan number', 8),
  todo('stent', 'Stent pictures: drop, trace, waist'),
  todo('timeline', 'The model timeline with two clocks'),
  todo('small', 'Small multiples: the phone grid of cases'),
  todo('trace', 'The course on one chart (talk trace)', 5),
];

export const chartScore = () => ({ done: CHARTS.filter((c) => c.status === 'done').length, of: CHARTS.length });
