// A procedure's step callouts on the figure (2D proc-anim.js stepMark, `onMark`: "1 Needle in", "2 Stent", in the treatment's accent, at the vessel the step works on). They are the figure's own mark cards
// (figure-cards.ts, kind 'mark'): this stands them with the slide's, under ids of their own so a slide's link leaves them alone, and takes them away again.
import { useFigure } from './store.ts';
import type { FigCard } from './figure-cards.ts';

/** The callout 2D proc-anim.js `stepMarks` gives for a step: its words, the vessels it names (the first is where it stands), its kind (treat, note, block). */
export interface ProcMark { edges: readonly string[]; label: string; kind?: string; num?: string; word?: string; f?: number }

const MAX = 4, PREFIX = 'proc:';
const toneOf = (k?: string): string => (k === 'note' ? 'note' : k === 'block' ? 'block' : 'treat');

/** The cards for a step's callouts. */
export function markCards(marks: readonly ProcMark[]): FigCard[] {
  return marks.filter((m) => m.edges[0]).slice(0, MAX).map((m, i) => ({ id: `${PREFIX}${i}`, kind: 'mark' as const, text: m.label, tone: toneOf(m.kind), anchor: { edge: m.edges[0]! } }));
}

/** Puts a step's callouts on the figure (none: takes them away), keeping the slide's own cards. */
export function setProcMarks(marks: readonly ProcMark[]): void {
  const f = useFigure.getState();
  const rest = f.cards.filter((c) => !c.id.startsWith(PREFIX)), mine = markCards(marks);
  if (!mine.length && rest.length === f.cards.length) return;
  f.set({ cards: [...rest, ...mine] });
}
