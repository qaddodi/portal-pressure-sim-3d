// The registry entry of the ladder chart (one file per chart, so the threads that port the charts never edit the same lines of registry.ts).
// To finish the chart: give it specimens and set status 'done' (the registry test then judges every specimen in every look at four widths).
import type { ChartKind } from '../registry.ts';

export const ladderEntry: ChartKind = { kind: 'ladder', what: 'Pressure ladder: bars along one axis and the HVPG subtraction (already a card, src/ui/cards)', slides: undefined, status: 'todo', specimens: [] };
