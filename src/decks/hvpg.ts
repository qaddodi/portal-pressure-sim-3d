// The HVPG deck as the 3D app plays it: the 2D deck's words (hvpg.copied.ts, written by scripts/copy-decks.mjs) plus the
// 3D fields: the camera shot of each slide and which readings its ladder card shows.

import { HVPG_COPIED } from './hvpg.copied.ts';
import type { Deck, Slide, ShotName, ReadingKey } from './schema.ts';

interface Plate { shot: ShotName; ladder?: { rows: ReadingKey[]; result?: 'hvpg' } }

/** What the 3D adds to each copied slide. The ladder grows with the teaching: the free slide shows what is free, the wedge adds the wedged
 *  pressure, the result slide adds the subtraction. The route slide has no data card (nothing is measured yet). */
const THREE_D: Record<string, Plate> = {
  route: { shot: 'route' },
  free: { shot: 'free', ladder: { rows: ['ivc', 'fhvp'] } },
  wedge: { shot: 'wedge', ladder: { rows: ['ivc', 'fhvp', 'whvp'] } },
  hvpg: { shot: 'hvpg', ladder: { rows: ['whvp', 'fhvp', 'ivc'], result: 'hvpg' } },
};

/** The shot of the title stop (the whole plate, settling slowly) and of the quick check (the figure stays where the result left it). */
export const TITLE_SHOT: ShotName = 'title';

const mutable = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const HVPG_DECK: Deck = (() => {
  const c = mutable(HVPG_COPIED) as unknown as Omit<Deck, 'slides'> & { slides: Omit<Slide, 'shot'>[] };
  return {
    ...c,
    slides: c.slides.map((s) => {
      const plate = THREE_D[s.id];
      if (!plate) throw new Error(`hvpg.ts has no 3D fields for slide "${s.id}"`);
      return { ...s, ...plate } as Slide;
    }),
  };
})();
