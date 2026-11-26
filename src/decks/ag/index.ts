// Decks A to G (batch B13a): the 14 decks the 2D app names albumin to gradients, 167 slides, as the 3D app holds them. The words and the model's steps are copied
// (scripts/copy-decks-ag.mjs); the camera, the dependency list and the numbers are derived from them (shots.ts, needs.ts, steps.ts, tokens.ts). A deck loads on its
// own (a dynamic import), so the app opens without carrying 14 decks, and a deck opens as soon as the presenter asks for it.
import type { CopiedDeck, CopiedSlide } from './types.ts';
import { slideShots, type ShotSpec } from './shots.ts';
import { needsOf, waitingOn, type Owner } from './needs.ts';
import { stepsOf, stateOf, type ModelStep } from './steps.ts';

import { AG_IDS, type AgId } from './raw.ts';
import { loadSource } from '../source.ts';
export { AG_IDS, type AgId };

export const isAgDeck = (id: string): id is AgId => (AG_IDS as readonly string[]).includes(id);
/** A deck of A to G with the 3D overlay laid on (source.ts). */
export const loadAgDeck = (id: AgId): Promise<CopiedDeck> => loadSource(id) as Promise<CopiedDeck>;

/** A slide as the 3D app plays it: the 2D slide, and what the scene and the other batches take from it. */
export interface Plate {
  slide: CopiedSlide;
  /** The camera of the slide (and of a time-lapse's push, and of each scale of a scale switch). */
  shots: ReturnType<typeof slideShots>;
  /** Every need of the slide, and who owns each. */
  needs: string[];
  /** The needs whose features have not landed: the slide is present, and wired when this is empty. */
  waiting: { id: string; owner: Owner; what: string }[];
}

export interface Plated {
  deck: CopiedDeck;
  steps: ModelStep[];
  /** slide i shows the engine state of slide `stateOf[i]` */
  stateOf: number[];
  plates: Plate[];
}

export function plate(deck: CopiedDeck): Plated {
  const plates = deck.slides.map((slide): Plate => { const needs = needsOf(slide); return { slide, shots: slideShots(slide), needs, waiting: waitingOn(needs) }; });
  return { deck, steps: stepsOf(deck.slides), stateOf: stateOf(deck.slides), plates };
}

export type { ShotSpec };
