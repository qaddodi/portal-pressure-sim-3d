// The ONE way a built-in deck's data is read: its copy (the 2D deck, character for character) with the 3D overlay laid on (decks/overlay.ts). Every consumer that wants a deck's slides as
// data (the presenter, the baked charts, the tests, the capture tools) calls `loadSource(id)`; the per-batch tables below are the copies' own lazy loaders and nothing else reads them.
import type { CopiedDeck } from './hp/types.ts';
import { AG_LOADERS, AG_IDS } from './ag/raw.ts';
import { HP_LOADERS } from './hp/raw.ts';
import { RW_LOADERS } from './rw/copied/index.ts';
import { withOverlay } from './overlay.ts';

const RAW: Readonly<Record<string, () => Promise<unknown>>> = { ...AG_LOADERS, ...HP_LOADERS, ...RW_LOADERS };

/** Every built-in deck id (the copies' own order: A to G, H to P, R to W; the menu's order is the registry's). */
export const SOURCE_IDS: readonly string[] = [...AG_IDS, ...Object.keys(HP_LOADERS), ...Object.keys(RW_LOADERS)];
export const isSource = (id: string): boolean => id in RAW;

/** A built-in deck as the 3D app holds it: the copy with the overlay on. Read it, never change it (a copy is made when anything is laid over it). */
export async function loadSource(id: string): Promise<CopiedDeck> {
  const raw = RAW[id];
  if (!raw) throw new Error(`"${id}" is not a built-in deck`);
  return withOverlay((await raw()) as CopiedDeck);
}
