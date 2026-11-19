// The registry entry of the evgraph chart (one file per chart, so the threads that port the charts never edit the same lines of registry.ts).
// To finish the chart: give it specimens and set status 'done' (the registry test then judges every specimen in every look at four widths).
import type { ChartKind } from '../registry.ts';

export const evgraphEntry: ChartKind = { kind: 'evgraph', what: 'Event graph: PPG and a second line after an event', slides: 8, status: 'todo', specimens: [] };
