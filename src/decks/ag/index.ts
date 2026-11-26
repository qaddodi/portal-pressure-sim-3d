// Decks A to G (batch B13a): the 14 decks the 2D app names albumin to gradients, 167 slides, as the 3D app holds them. The words and the model's steps are copied
// (scripts/copy-decks-ag.mjs); what a slide needs is read from one table for every deck (decks/hp/hooks.ts), and the camera and numbers are planned by the one planner. A deck loads on its
// own (a dynamic import), so the app opens without carrying 14 decks, and a deck opens as soon as the presenter asks for it.
import type { CopiedDeck } from './types.ts';

import { AG_IDS, type AgId } from './raw.ts';
import { loadSource } from '../source.ts';
export { AG_IDS, type AgId };

export const isAgDeck = (id: string): id is AgId => (AG_IDS as readonly string[]).includes(id);
/** A deck of A to G with the 3D overlay laid on (source.ts). */
export const loadAgDeck = (id: AgId): Promise<CopiedDeck> => loadSource(id) as Promise<CopiedDeck>;
