// The first slice's claims (S1: the HVPG deck), derived from the deck the 3D app plays (src/decks/*.ts), never typed. Added by B1 so the ?parity page does not read
// 0 for what is already on the screen; the slice's owners may take this file over. A slide is claimed while the deck has it, so a slide dropped from the deck leaves the score.
import { HVPG_DECK } from '../decks/hvpg.ts';
import type { Claim } from './claim.ts';

const DECKS = [HVPG_DECK];
export const claims: readonly Claim[] = DECKS.flatMap((d) => [
  // (the deck row is B13b's: the deck has all 2D slides now, and is wired when each is; the slice claims the slides it drew itself, the ones with a named shot)
  ...d.slides.filter((s) => !s.scene).map((s) => ({ id: `slide:${d.id}/${s.id}`, wired: true })),
]);
