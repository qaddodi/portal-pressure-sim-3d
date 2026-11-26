// The decks of batch B13b (2D decks whose ids run from H to P), loaded one at a time: a deck's data is read only when it is opened.
import { HP_DECKS } from './ids.copied.ts';
import type { CopiedDeck } from './types.ts';
import { HP_LOADERS } from './raw.ts';
import { loadSource } from '../source.ts';

export { HP_DECKS };
export const HP_IDS: readonly string[] = HP_DECKS.map((d) => d.id);

export { HP_LOADERS } from './raw.ts';

export const isHpDeck = (id: string) => id in HP_LOADERS;
/** A deck of H to P with the 3D overlay laid on (source.ts). */
export const loadHpDeck = (id: string): Promise<CopiedDeck> => { if (!isHpDeck(id)) throw new Error(`"${id}" is not a deck of batch B13b`); return loadSource(id) as Promise<CopiedDeck>; };
