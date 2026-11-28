// A procedure slide's graph card waits for the procedure (Mohammad, 28 Nov): while the stent, the coils or the glue go in, the graph says nothing yet, so the card stays off the screen and the
// figure has the room. It eases in at its final size once the procedure is done, to show the fall. Only the procedure graph (`tool.kind` 'evgraph') is gated: it is the card that reads the change.
import type { Deck, Slide } from '../../decks/schema.ts';
import { copiedSlideOf } from '../../scene/labels/deck-link.ts';
import { eventGraphOf } from '../charts/evgraph/model.ts';
import type { ProcState } from '../deck/procs-state.ts';


/** Whether the slide's data card is the procedure's graph, which comes in only once the procedure is done. */
export function gatedSlide(deck: Deck, slide: Slide | null | undefined): boolean {
  if (!slide) return false;
  const copied = copiedSlideOf(deck.id, slide), tool = copied?.tool ?? slide.tool;
  return (tool as { kind?: string } | null | undefined)?.kind === 'evgraph' && !!eventGraphOf({ ...slide, ...copied } as Parameters<typeof eventGraphOf>[0]);
}

/** The procedure of this slide is over (or cannot play on this patient, so there is nothing to wait for): the graph card may stand. */
export const procOver = (p: Pick<ProcState, 'key' | 'phase' | 'why'>, key: string): boolean => p.key === key && (p.phase === 'done' || !!p.why);
