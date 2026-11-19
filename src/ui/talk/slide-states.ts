// What the model reads at each slide of a talk: its fingerprint (hvpg, whvp, fhvp, pv, ivc, ra, ppg …), worked out off screen in a chain, each slide from the one before it
// (the 2D presenter's `sequence`). The handout prints these in the words; the summary table's rows read them. A slide with no `model` is the patient the slide before had.
import { engine } from '../../engine/index.ts';
import type { Deck, Slide } from '../../decks/schema.ts';

export type Fp = Record<string, number | null>;
const stepOf = (s: Slide) => (s.model ? { preset: s.model.preset, ...(s.model.params ? { params: s.model.params } : {}), ...(s.model.days != null ? { presetDays: s.model.days } : {}) } : {});

const cache = new Map<string, Promise<Fp[]>>();
const known = new Map<string, Fp[]>();
/** The numbers at each slide of the deck once they have been worked out (null before): what a card reads on the spot. */
export const fpsNow = (deck: Deck): Fp[] | null => known.get(deck.id) ?? null;
/** The fingerprint at each of the deck's slides (the opening and the quick check have none: index 0 is the first slide). Kept per deck, so a second ask is free. */
export function slideFps(deck: Deck): Promise<Fp[]> {
  const key = deck.id + JSON.stringify(deck.slides.map((s) => s.model ?? null));
  let p = cache.get(key);
  if (!p) { p = engine().sequence(deck.slides.map(stepOf)).then((r) => { const fps = r.map((x) => x?.fp ?? {}); known.set(deck.id, fps); return fps; }); cache.set(key, p); p.catch(() => cache.delete(key)); }
  return p;
}
