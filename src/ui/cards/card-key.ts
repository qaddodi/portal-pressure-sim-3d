// A card's key names the card on screen, and everything the card layer keeps about it hangs on that key: the heights it measured, its pages, its ladder step, its fit, the box its frame locked.
// Slide ids are only unique inside a talk (the same id, "eus-ladder", "wedge", "summary", stands in several talks, and "title", "check" and the kept
// "ladder" card have no slide at all), so a key made of
// the slide id alone found another talk's numbers: a card was let in on a height measured for a different slide and then stood that tall (Mac 04.5 at the 461 px of 01.9, capture 3531bdfa).
// The key is therefore the talk and the slide, and the card's lock adds its width and step (CardFrame lockKey). Pure; tests/card-key-per-deck.test.ts.
export const cardKey = (deckId: string, key: string): string => `${deckId}/${key}`;

/** The key of the words card for a view: its kind and slide where the card is the slide's own (a teaching card, a case, a visual panel), else its kind
 *  alone (the outline, the quick check); always under its talk. */
export const wordsCardKey = (deckId: string, words: string, slideId?: string): string =>
  cardKey(deckId, slideId && (words === 'teach' || words === 'case' || words === 'visual') ? `${words}:${slideId}` : words);
