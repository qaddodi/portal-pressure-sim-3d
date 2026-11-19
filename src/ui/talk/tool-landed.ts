// Whether a slide's `tool` kind plays from a slide: the one answer the three readiness tables read (decks/ag/needs.ts, decks/hp/hooks.ts, decks/rw/hooks-builtin.ts).
// A chart kind is landed when the chart registry says it is done (model, card, tests, gallery specimen: ui/charts/registry.ts); an instrument kind when its entry of ui/talk/instruments.ts says it
// plays (the pane that carries it from the slide is named there as evidence). The 2D `course` tool is the curve chart's second mode. Never a bare `true`.
import { CHARTS } from '../charts/registry.ts';
import { instrumentOf } from './instruments.ts';

const CHART_OF: Record<string, string> = { course: 'curve' };
export const chartDone = (kind: string): boolean => CHARTS.some((c) => c.kind === (CHART_OF[kind] ?? kind) && c.status === 'done');
/** The file that carries the kind from a slide to the screen (a chart's card or an instrument's pane), or null while it does not play. */
export function toolEvidence(kind: string): string | null {
  if (chartDone(kind)) return 'src/ui/charts/registry.ts';
  const e = instrumentOf(kind);
  return e && e.status === 'plays' ? e.evidence : null;
}
export const toolLanded = (kind: string): boolean => toolEvidence(kind) != null;
