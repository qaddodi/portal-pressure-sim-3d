// The registry entry of the fluid chart (one file per chart, so the threads that port the charts never edit the same lines of registry.ts).
// To finish the chart: give it specimens and set status 'done' (the registry test then judges every specimen in every look at four widths).
import type { ChartKind } from '../registry.ts';

export const fluidEntry: ChartKind = { kind: 'fluid', what: 'Starling forces and the fluid window', slides: 2, status: 'todo', specimens: [] };
