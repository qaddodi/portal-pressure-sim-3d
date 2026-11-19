// The words a compare button has put on the teaching card (2D variantWords): a button that switches the patient brings its own title and line, so the card never describes the other
// patient. Held for one slide; a new slide, or the slide's own button, puts the slide's words back. The card reads it (ui/cards/TeachingCard.tsx).
import { create } from 'zustand';
import type { VariantWords } from '../../decks/controls.ts';

interface Variant { key: string | null; words: VariantWords | null; set(key: string, words: VariantWords | null): void }
export const useVariant = create<Variant>((set) => ({ key: null, words: null, set: (key, words) => set({ key, words }) }));
/** The words this slide shows now: the pressed button's, or null for the slide's own. */
export const variantOf = (key: string): VariantWords | null => { const v = useVariant.getState(); return v.key === key ? v.words : null; };
