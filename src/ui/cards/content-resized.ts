// A card whose own words change size (the quick check opens or shuts an answer) tells its frame in the same task, before the frame is painted.
//
// Root cause of the glitchy answer reveal (Mohammad, 27 Nov: "doesn't transition smoothly between open and close,
// the text gets bigger faster than the card"): the frame learned of a change in its words only from its ResizeObserver,
// and 261e0c78 moved that pass into a timer (fit-later.ts: no write inside the observer's own delivery), so the frame's
// growth glide began at least a frame after the answer was laid out. For that first painted frame the answer stood at
// full height outside a card still at its old height; the frame then re-centred a frame late, under rows that had begun
// to ease by a share (g) CheckCard had guessed the frame would already have moved. Three pieces (frame, rows, answer)
// ran on one duration but not from one frame.
//
// The rule: whoever changes the card's words from inside a React commit says so here, in its layout effect. The frame measures there and then (CardFrame growNow / shrinkNow), so by the time the
// effect reads where the rows stand, the frame is already at its final height and place, and every row's way is simply where it stood less where it stands (`flipOffsets`), with no guess.

/** The event a card's content sends, bubbling to the frame that measures it. */
export const CONTENT_RESIZED = 'pz-content-resized';

/** Tell the card holding `from` that its content has just changed size. Call it in a layout effect, after the commit and before anything is read back. */
export function tellCardResized(from: Element | null | undefined): void {
  from?.dispatchEvent(new CustomEvent(CONTENT_RESIZED, { bubbles: true }));
}

/** The way each row eases: from where it stood (`from`, tops before the change) to where it stands now (`now`); a way of a pixel or less is not played. */
export function flipOffsets(from: readonly number[], now: readonly number[]): number[] {
  return now.map((n, i) => {
    const dy = (from[i] ?? n) - n;
    return Math.abs(dy) > 1 ? dy : 0;
  });
}

/** The share of the glide an answer's words wait before they come in (the card's edge reaches them first). */
export const ANSWER_IN_AT = 0.35;
/** The share of the glide the words take to go when it shuts (they are gone before the frame is much smaller). */
export const ANSWER_OUT_BY = 0.35;
