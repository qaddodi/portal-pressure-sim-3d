// The ONE state a slide on show stands at: its own computed state, or, while one of its controls is pressed (a compare button, the beta-blocker response, a what-if slider), the state that press made.
//
// The wrong source (26 Nov 2026, Landmark trials 3, PREDESCI): a press put the live model and the data card in the pressed patient, but the words, the figure's
// callouts, the tiles and the figure's cards read the slide's own state from the deck's results. "None" redrew the HVPG tracing at 10.6 while the callouts and
// the line still said 9.8, and to the eye the buttons did nothing (Mohammad: "Those buttons change nothing. What's the point?"). Every reader of the slide on
// show takes its state through `withVariant`, so a press moves every number on the screen together (tests/shown-state.test.ts).
import { useMemo } from 'react';
import { useVariant, type VariantState } from './variant-words.ts';
import { copiedOf } from '../../decks/hp/deck.ts';

type Res = { fp?: unknown; params?: unknown };
interface VariantNow { key: string | null; state: VariantState | null }

/** The slide (its index in the deck's results) a pressed control stands on, with the state it made; null while every slide shows its own. */
export function variantAt(deckId: string, v: VariantNow = useVariant.getState()): { i: number; state: VariantState } | null {
  if (!v.key || !v.state?.fp || !v.key.startsWith(`${deckId}/`)) return null;
  const id = v.key.slice(deckId.length + 1), i = copiedOf(deckId)?.slides.findIndex((s) => s.id === id) ?? -1;
  return i >= 0 ? { i, state: v.state } : null;
}

/** The deck's results with the pressed slide's state in place of its own (the same array back when nothing is pressed). */
export function withVariant<T extends Res>(deckId: string, results: readonly (T | undefined)[] | undefined, v: VariantNow = useVariant.getState()): readonly (T | undefined)[] | undefined {
  const at = variantAt(deckId, v), r = at ? results?.[at.i] : undefined;
  if (!at || !r || !results) return results;
  const out = results.slice();
  out[at.i] = { ...r, fp: at.state.fp, params: at.state.params ?? r.params };
  return out;
}

/** One slide's shown state. */
export function shownResult<T extends Res>(deckId: string, results: readonly (T | undefined)[] | undefined, i: number, v?: VariantNow): T | undefined {
  return withVariant(deckId, results, v)?.[i];
}

/** `withVariant` for a component: re-read when a control is pressed or let go. */
export function useShown<T extends Res>(deckId: string, results: readonly (T | undefined)[] | undefined): readonly (T | undefined)[] | undefined {
  const key = useVariant((s) => s.key), state = useVariant((s) => s.state);
  return useMemo(() => withVariant(deckId, results, { key, state }), [deckId, results, key, state]);
}

/** A slide other than the pressed one is on show (another slide, the title, the quick check): the press belongs to the slide it was made on, so it is let go. */
export function releaseVariantOff(key: string | null): void {
  const v = useVariant.getState();
  if (v.key && v.key !== key && (v.state || v.words)) v.set(v.key, null, null);
}
