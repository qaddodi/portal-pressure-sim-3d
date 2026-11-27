// The HVPG deck as the 3D app plays it: all 13 slides of the 2D deck, in the 2D order but for the PPG slide,
// which plays after the two EUS slides (a review's move, MOVE_AFTER in scripts/source-edits.mjs).
// The four slides of the first slice (route, free, wedge, hvpg) keep their plates:
// a named camera shot, the catheter and the ladder card (hvpg.copied.ts, written by scripts/copy-decks.mjs, plus the 3D fields below). Their words are the planned deck's.
// The other nine are planned from the 2D deck's own fields by batch B13b (src/decks/hp), exactly as every other ported deck; their numbers, like the slice's, come from each slide's own state.

import { HVPG_COPIED } from './hvpg.copied.ts';
import type { Deck, Slide, ShotName } from './schema.ts';
import { DECK as HVPG_2D } from './hp/data/hvpg.copied.ts';
import { toDeck } from './hp/deck.ts';
import { withOverlay } from './overlay.ts';

interface Plate { shot: ShotName; model?: { preset: string } }

/** What the 3D adds to each copied slide. The route slide has no data card (nothing is measured yet). */
const THREE_D: Record<string, Plate> = {
  route: { shot: 'route', model: { preset: 'csph' } },   // (the patient the talk opens on, as the 2D deck's `preset`)
  // (the three catheter slides carry the HVPG monitor, not a pressures ladder: 2D's card for them is the one instrument, so the free and the wedge slide are the SAME card and the tracing runs on across the Next that inflates the balloon, card-keep.js)
  free: { shot: 'free' },
  wedge: { shot: 'wedge' },
  hvpg: { shot: 'hvpg' },
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
  const full = toDeck(withOverlay(HVPG_2D));
  // (the slice's slides keep their plates; the fields the cards carry beyond the words come from the 2D deck's own slide: the level tab, the guidelines side by side, the causes, the beats)
  const CARD_FIELDS = ['site', 'rail', 'sides', 'pill', 'causes', 'causesHead', 'beats', 'tool'] as const;   // ('tool': the HVPG monitor the free, wedge and result slides ask for; the slice's plates left it out, so its card was the pressures alone)
  // (the slice's words are the planned deck's, never a second copy: a review's edit to a slide's words (scripts/source-edits.mjs) reaches the one copy only, so the slice read the old text until now)
  const WORDS = ['kicker', 'title', 'line', 'notes', 'ask', 'caveat', 'cite', 'vignette', 'question'] as const;
  for (const [id, p] of plates) {
    const f = full.slides.find((x) => x.id === id);
    if (f) for (const k of [...CARD_FIELDS, ...WORDS]) if (k in f) (p as unknown as Record<string, unknown>)[k] = f[k as keyof typeof f];
  }
  for (const id of plates.keys()) if (!full.slides.some((s) => s.id === id)) throw new Error(`the slice's slide "${id}" is not in the 2D deck`);
  // (the quick check is the 2D deck's four questions: the check card pages them on an iPhone on its side, cards/CheckCard.tsx)
  return { ...full, slides: full.slides.map((s) => plates.get(s.id) ?? s) };
})();
