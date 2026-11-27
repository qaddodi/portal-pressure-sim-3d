// What the 3D app adds to a slide, in ONE place. A deck is copied from the 2D app word for word and never edited (the scripts' --check fails on any difference), so everything the 3D app
// adds to a slide sits here, keyed by "deck/slide", and is merged onto the slide's own fields when the deck loads (`withOverlay`, called by source.ts for every deck, whoever wrote it).
// A slide then carries its 3D additions as ordinary fields (`frame`, `also`, `scores`, `split`, `interact`), and nothing downstream looks a deck or a slide up by name: a deck you author
// yourself writes the same fields and gets the same behaviour. Word amendments (a line that disagrees with its own card) are the AMEND functions below, applied in the same pass.
//
// Rules held by tests/deck-overlay.test.ts: every key names a slide that exists; every field is one of OVERLAY_FIELDS; applying the overlay twice changes nothing; a deck that is loaded
// any other way has no overlay fields at all unless its author wrote them.
import type { CopiedDeck, CopiedSlide } from './hp/types.ts';
import { FRAME_FIXES, type FrameFix } from './overlay/frames.ts';
import { SCORES, type SlideScores } from './overlay/scores.ts';
import type { SplitSlide } from './split-slides.ts';
import type { Interact } from './interact.ts';
import { amendAscites } from './ag/ascites-amend.ts';
import { amendAlbumin } from './ag/albumin-amend.ts';
import { amendControls } from './overlay/controls.ts';
import { amendLadder } from './overlay/ladder.ts';
import { amendInstruments } from './overlay/instruments.ts';

/** The 3D fields a slide may carry beyond the 2D deck's own. */
export interface SlideOverlay {
  /** a second level tab beside the slide's `site` (a level id) */
  also?: string;
  /** the camera policy of a slide framed on its subject (overlay/frames.ts) */
  frame?: FrameFix;
  /** the liver-function card under the criteria */
  scores?: SlideScores;
  /** the split orbit: the healthy liver on the left, this slide's patient on the right */
  split?: SplitSlide;
  /** a question the room answers before the model reveals (decks/interact.ts) */
  interact?: Interact;
}
export const OVERLAY_FIELDS = ['also', 'frame', 'scores', 'split', 'interact'] as const satisfies readonly (keyof SlideOverlay)[];

/** Slides about two levels at once: the second level's tab beside the first (the 2D deck names one level per slide). Prehepatic 13: carvedilol is the cirrhosis beta-blocker (Baveno VIII), so the
 *  sinusoidal pressure problem carries a prehepatic clot (owner, 25 Nov). */
const ALSO: Readonly<Record<string, string>> = { 'prehepatic/carv': 'pre' };

// The split orbit's slides (empty since 24 Nov: Mohammad took it off HVPG slide 7, which stays in the lobule, and slide 11, "not a good use of Split View").
// Add a line `'deck/slide': { label, against }`.
const SPLIT: Readonly<Record<string, SplitSlide>> = {};

/** Questions inside the talk, by slide (decks/interact.ts). No clinical wording lives here until the owner has approved it. */
const INTERACT: Readonly<Record<string, Interact>> = {};

const put = <K extends keyof SlideOverlay>(out: Record<string, SlideOverlay>, field: K, table: Readonly<Record<string, SlideOverlay[K]>>): void => {
  for (const [key, v] of Object.entries(table)) (out[key] ??= {})[field] = v;
};
/** Every 3D addition, by "deck/slide". */
export const OVERLAY: Readonly<Record<string, SlideOverlay>> = (() => {
  const out: Record<string, SlideOverlay> = {};
  put(out, 'also', ALSO); put(out, 'frame', FRAME_FIXES); put(out, 'scores', SCORES); put(out, 'split', SPLIT); put(out, 'interact', INTERACT);
  return out;
})();

/** Word amendments by deck: the copy stays the 2D deck character for character; these make a slide agree with itself, anchored on its words (a test fails when a re-copy moves an anchor). */
const AMEND: Readonly<Record<string, (c: CopiedDeck) => CopiedDeck>> = { ascites: amendAscites, albumin: amendAlbumin };

/** The deck with the 3D additions merged onto its slides (a copy; the loaded module is never changed). A key that names a slide the deck does not have is an error, so a re-copy that drops
 *  or renames a slide cannot leave an addition pointing at nothing. */
export function withOverlay(c0: CopiedDeck): CopiedDeck {
  const c1 = AMEND[c0.id] ? AMEND[c0.id]!(c0) : c0;
  // (the controls' changes, for every deck: decks/overlay/controls.ts)
  // (and the pressure ladder in place of side-by-side station tiles: decks/overlay/ladder.ts; then a tiles-only card's instrument, by slide: decks/overlay/instruments.ts)
  const c = amendInstruments(amendLadder(amendControls(c1)));
  const mine = Object.entries(OVERLAY).filter(([k]) => k.startsWith(`${c.id}/`));
  if (!mine.length) return c;
  const ids = new Set(c.slides.map((s) => s.id));
  for (const [k] of mine) if (!ids.has(k.slice(c.id.length + 1))) throw new Error(`the 3D overlay has an entry for "${k}", and deck "${c.id}" has no such slide`);
  const by = new Map(mine.map(([k, v]) => [k.slice(c.id.length + 1), v] as const));
  return { ...c, slides: c.slides.map((s): CopiedSlide => (by.has(s.id) ? { ...s, ...by.get(s.id) } : s)) };
}
