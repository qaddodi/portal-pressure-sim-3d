// The HVPG deck as the 3D app plays it: all 13 slides of the 2D deck, in the 2D order. The four slides of the first slice (route, free, wedge, hvpg) keep their plates:
// a named camera shot, the catheter and the ladder card (hvpg.copied.ts, written by scripts/copy-decks.mjs, plus the 3D fields below). The other nine are planned from the
// 2D deck's own fields by batch B13b (src/decks/hp), exactly as every other ported deck; their numbers, like the slice's, come from each slide's own state.

import { HVPG_COPIED } from './hvpg.copied.ts';
import type { Deck, Slide, ShotName, ReadingKey } from './schema.ts';
import { DECK as HVPG_2D } from './hp/data/hvpg.copied.ts';
import { toDeck } from './hp/deck.ts';

interface Plate { shot: ShotName; ladder?: { rows: ReadingKey[]; result?: 'hvpg' }; model?: { preset: string } }

/** What the 3D adds to each copied slide. The ladder grows with the teaching: the free slide shows what is free, the wedge adds the wedged
 *  pressure, the result slide adds the subtraction. The route slide has no data card (nothing is measured yet). */
const THREE_D: Record<string, Plate> = {
  route: { shot: 'route', model: { preset: 'csph' } },   // (the patient the talk opens on, as the 2D deck's `preset`)
  free: { shot: 'free', ladder: { rows: ['ivc', 'fhvp'] } },
  wedge: { shot: 'wedge', ladder: { rows: ['ivc', 'fhvp', 'whvp'] } },
  hvpg: { shot: 'hvpg', ladder: { rows: ['whvp', 'fhvp', 'ivc'], result: 'hvpg' } },
};

/** The shot of the title stop (the whole plate, settling slowly) and of the quick check (the figure stays where the result left it). */
export const TITLE_SHOT: ShotName = 'title';

const mutable = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const HVPG_DECK: Deck = (() => {
  const c = mutable(HVPG_COPIED) as unknown as { slides: Omit<Slide, 'shot'>[] };
  const plates = new Map(c.slides.map((s) => {
    const plate = THREE_D[s.id];
    if (!plate) throw new Error(`hvpg.ts has no 3D fields for slide "${s.id}"`);
    return [s.id, { ...s, ...plate } as Slide];
  }));
  const full = toDeck(HVPG_2D);
  for (const id of plates.keys()) if (!full.slides.some((s) => s.id === id)) throw new Error(`the slice's slide "${id}" is not in the 2D deck`);
  // (the quick check is the 2D deck's four questions: the check card pages them on an iPhone on its side, cards/CheckCard.tsx)
  return { ...full, slides: full.slides.map((s) => plates.get(s.id) ?? s) };
})();
