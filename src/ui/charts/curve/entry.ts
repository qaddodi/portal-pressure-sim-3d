// The registry entry of the curve chart (one file per chart, so the threads that port the charts never edit the same lines of registry.ts).
// To finish the chart: give it specimens and set status 'done' (the registry test then judges every specimen in every look at four widths).
import type { ChartKind } from '../registry.ts';

export const curveEntry: ChartKind = { kind: 'curve', what: 'One quantity against another, or a parameter sweep, with its course', slides: 25, status: 'todo', specimens: [] };
