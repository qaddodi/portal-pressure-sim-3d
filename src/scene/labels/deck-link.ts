// The talk tells the labels two things: which parts of the figure the slide's words point at (its `terms` field), and which catheter
// reading the slide is at. Both follow the presenter's position; nothing else here reads a deck.
import { useUi } from '../../ui/ui-store.ts';
import { viewAt, lastSlideShot, lastCath, type Stop } from '../../ui/deck/presenter-machine.ts';
import type { CathState, Slide } from '../../decks/schema.ts';
import { stationsOfTerms } from './stations.ts';
import { useLabels } from './store.ts';

/** What the labels show at a position: the stations the slide names, and the catheter state. The case card (a beat before the slide) names
 *  nothing and shows no reading: nothing has been measured yet. The quick check keeps the result on the figure. */
export function labelsAt(stops: Stop[], pos: { stop: number; beat: number }): { named: Set<string>; cath: CathState | null } {
  if (!stops.length) return { named: new Set(), cath: null };
  const s = stops[pos.stop];
  if (s.kind === 'check') return { named: new Set(), cath: lastCath(stops) ?? null };
  const v = viewAt(stops, pos, lastSlideShot(stops));
  if (!v.slide || v.words === 'case') return { named: new Set(), cath: null };
  return { named: namedBy(v.slide), cath: v.cath };
}

export const namedBy = (slide: Slide): Set<string> => stationsOfTerms(Object.values(slide.terms ?? {}));

export function linkLabelsToDeck(): () => void {
  const sync = () => {
    const { stops, pos } = useUi.getState();
    const next = labelsAt(stops, pos);
    const cur = useLabels.getState();
    const same = cur.cath === next.cath && cur.named.size === next.named.size && [...next.named].every((x) => cur.named.has(x));
    if (!same) cur.set(next);
  };
  sync();
  return useUi.subscribe((s, p) => { if (s.pos !== p.pos || s.stops !== p.stops) sync(); });
}
