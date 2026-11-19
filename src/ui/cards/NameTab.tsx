import { UI } from '../strings.generated.ts';
import { tabName } from '../../decks/outline.ts';
import type { Deck } from '../../decks/schema.ts';

/** The deck's short name in a tab at the card's top right corner (the 2D app's `.pz-tabname`): a darker patch of the card's own glass, flush with its top and right
 *  edges, only its bottom left corner rounded. It sits in the card's top padding, so it never meets the title. The outline names the talk in full instead. */
export function NameTab({ deck }: { deck: Pick<Deck, 'id' | 'title' | 'head'> }) {
  const known = (UI.decks as readonly { id: string; head?: string | null }[]).find((d) => d.id === deck.id)?.head ?? null;
  const name = tabName(deck, known);
  return name ? <><span className="dk-tab" aria-hidden="true">{name}</span><span className="dk-tabgap" aria-hidden="true" /></> : null;
}
