// The albumin that goes with a paracentesis, as ONE rule: every place that states a dose reads it from here. The Tests card's Paracentesis row and its switch tip
// (ui/tests/abdomen/model.ts), a slide's "L removed" lines on that card, and the words of a deck slide whose model drains the belly (decks/ag/albumin-amend.ts).
// Baveno VIII Table 3 names large-volume paracentesis as an indication for short-term albumin; the dose, 6 to 8 g per liter removed once more than 5 L is removed and
// optional under that, is AASLD 2021 (named in the speaker notes only). tests/lvp-albumin.test.ts holds the rule and every deck's paracentesis to it.

/** More than this many liters taken off at one tap is a large-volume paracentesis. */
export const LVP_OVER_L = 5;
/** Grams of albumin for each liter removed, the low and the high end. */
export const ALBUMIN_PER_L = [6, 8] as const;

/** The litres as the cards print them (one decimal), so the dose is worked from the very number written beside it. */
export const litres1 = (L: number): number => Math.max(0, Math.round(L * 10) / 10);

/** The albumin for a tap of `removedL` liters, in whole grams [low, high]; null at 5 L or less (optional). */
export function lvpAlbumin(removedL: number): readonly [number, number] | null {
  const r = litres1(removedL);
  return r > LVP_OVER_L ? [Math.round(r * ALBUMIN_PER_L[0]), Math.round(r * ALBUMIN_PER_L[1])] : null;
}

/** "36 to 48 g" for a 6 L tap; null when albumin is optional. */
export function lvpAlbuminText(removedL: number): string | null {
  const d = lvpAlbumin(removedL);
  return d ? `${d[0]} to ${d[1]} g` : null;
}

/** The rule in words, as a slide outlines it: "6 to 8 g". */
export const PER_L_TEXT = `${ALBUMIN_PER_L[0]} to ${ALBUMIN_PER_L[1]} g`;
