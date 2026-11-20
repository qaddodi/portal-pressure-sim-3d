import { UI } from '../strings.generated.ts';
import { tabName } from '../../decks/outline.ts';
import type { Deck } from '../../decks/schema.ts';

/** The deck's short name in a tab at the card's top right corner (the 2D app's `.pz-tabname`): a darker patch of the card's own glass (2D's `.pz-tabname`, sized by its `--pz-tabh`), flush with its top and right
 *  edges, only its bottom left corner rounded. It sits in the card's top padding, so it never meets the title. The outline names the talk in full instead. */
export const nameTabOf = (deck: Pick<Deck, 'id' | 'title' | 'head'>): string | null => {
  const known = (UI.decks as readonly { id: string; head?: string | null }[]).find((d) => d.id === deck.id)?.head ?? null;
  return tabName(deck, known);
};
/** `air` (the words' card): the half tab of air under it. A panel (the quick check) has its own top padding for the tab (`.pz-panel.tabbed`), so it takes none. */
export function NameTab({ deck, air = true }: { deck: Pick<Deck, 'id' | 'title' | 'head'>; air?: boolean }) {
  const name = nameTabOf(deck);
  return name ? <><span className="pz-tabname" aria-hidden="true">{name}</span>{air && <span className="dk-tabgap" aria-hidden="true" />}</> : null;
}
