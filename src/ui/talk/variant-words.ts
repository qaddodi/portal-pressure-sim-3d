// The words a compare button has put on the teaching card (2D variantWords): a button that switches the patient brings its own title and line, so the card never describes the other
// patient. Held for one slide; a new slide, or the slide's own button, puts the slide's words back. The card reads it (ui/cards/TeachingCard.tsx).
import { create } from 'zustand';
import type { VariantWords } from '../../decks/controls.ts';

/** The state a compare button put the model in (its fingerprint and parameters, worked out off screen): every chart of the slide reads THIS patient, not the slide's own, so a chart never
 *  shows the other patient while the figure and the card show this one (Mohammad, 21 Nov: "normal heart yet the ladder continues to read bad heart"). */
export interface VariantState { fp: Record<string, number | null>; params?: unknown }
interface Variant { key: string | null; words: VariantWords | null; state: VariantState | null; set(key: string, words: VariantWords | null, state?: VariantState | null): void }
export const useVariant = create<Variant>((set) => ({ key: null, words: null, state: null, set: (key, words, state = null) => set({ key, words, state }) }));
/** The words this slide shows now: the pressed button's, or null for the slide's own. */
export const variantOf = (key: string): VariantWords | null => { const v = useVariant.getState(); return v.key === key ? v.words : null; };
/** The state the pressed compare button put this slide's model in, or null while the slide's own is showing. */
export const variantStateOf = (key: string): VariantState | null => { const v = useVariant.getState(); return v.key === key ? v.state : null; };
/** Where a slide's what-if slider stands (the value being dragged to), for the instruments that reshape with it: the Doppler's trace
 *  blends beat shapes by this value (ui/tests/doppler/shape-bank.ts). Reset when the card comes up. */
export const useSliderAt = create<{ key: string | null; x: number }>(() => ({ key: null, x: 0 }));
