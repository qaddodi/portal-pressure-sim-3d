// Every set of words a compare button can put on a card (Plan 45): the card holds them all in one cell (TeachingCard `.pz-vars`) so its height is decided once, before it shows. Pure, so a test can count them from the deck data.
import type { Deck, Slide } from '../../decks/schema.ts';
import { variantWords, speaks, type CompareOpt } from '../../decks/controls.ts';

export type Words = { title: string; line: string; kicker: string; site?: string };
export const idOf = (w: { title: string; line: string }) => `${w.title}\u0001${w.line}`;
/** Every set of words the slide's compare buttons can put on this card, the slide's own first (Plan 45: a card's box is decided once, before it shows, so a press never changes its height).
 *  Only a row where some button speaks brings words (controls-run.ts pickCompare); a lens, a gate and an instrument option never do. Pure, so a test can count them from the deck data. */
export function variantsOf(slide: Slide, deck?: Deck): Words[] {
  const own: Words = { title: slide.title, line: slide.line, kicker: slide.kicker, ...(slide.site ? { site: slide.site } : {}) };
  const opts: CompareOpt[] = slide.controls?.compare?.opts ?? [];
  if (!speaks(opts)) return [own];
  const out = [own];
  for (const o of opts) {
    if (o.how === 'lens' || o.gate || o.tool) continue;
    const at = o.slide ? deck?.slides.find((x) => x.id === o.slide) ?? null : null;
    const w = variantWords(slide, o, at);
    if (!out.some((x) => idOf(x) === idOf(w))) out.push(w);
  }
  return out;
}

