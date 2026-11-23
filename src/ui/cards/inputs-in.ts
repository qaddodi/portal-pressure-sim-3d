// A card never shows before its content (AGENTS.md, the bible). A slide's instrument draws from the numbers the second engine works out for it (decks/hp/calc.ts); until that
// slide's step is in, the chart has nothing to draw and the card was only its header with an empty body (circuit 3 and 4, the profile and the meal chart, 20 Nov: Mohammad, "this slide
// doesn't have the instrument card"). The slide's cards wait for the step; a slide that never gets one is let in after `GIVE_UP_MS`, so a stalled engine never hides the talk.
export const GIVE_UP_MS = 8000;

/** Whether the numbers the data card draws from are in. `index`: the slide whose instrument the card shows (-1: it shows none, or the deck keeps no states: nothing to wait for);
 *  `states`: the deck's steps worked out so far (slide i's at i). */
export const inputsIn = (index: number, states: readonly (unknown | undefined)[] | undefined): boolean => index < 0 || !!states?.[index];

/** The slide whose own state the WORDS card needs: a slide whose line prints a reading ({co}, {map}...) waits for its state, or the card shows "…" holes that roll in later (hyperdynamic 4, tips-complete 20: a quick Next, or a slow engine,
 *  showed "rises to …, yet the blood pressure is …"). -1: the line prints no reading of the slide's own, or the deck keeps no states. */
export const wordsStateIndex = (line: string | undefined, slideIndex: number, kept: boolean, hasReading: (line: string) => boolean): number => (kept && slideIndex >= 0 && !!line && hasReading(line) ? slideIndex : -1);
