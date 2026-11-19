// The decks of batch B13b (2D decks whose ids run from H to P), loaded one at a time: a deck's data is read only when it is opened.
import { HP_DECKS } from './ids.copied.ts';
import type { CopiedDeck } from './types.ts';

export { HP_DECKS };
export const HP_IDS: readonly string[] = HP_DECKS.map((d) => d.id);

/** One loader per deck, so the bundler makes one small chunk per deck and the menu never pays for decks nobody opens. */
const LOADERS: Record<string, () => Promise<{ DECK: CopiedDeck }>> = {
  hvpg: () => import('./data/hvpg.copied.ts'),
  hyperdynamic: () => import('./data/hyperdynamic.copied.ts'),
  kidney: () => import('./data/kidney.copied.ts'),
  'landmark-trials': () => import('./data/landmark-trials.copied.ts'),
  lobule: () => import('./data/lobule.copied.ts'),
  masld: () => import('./data/masld.copied.ts'),
  'meso-rex': () => import('./data/meso-rex.copied.ts'),
  ncph: () => import('./data/ncph.copied.ts'),
  'next-bleed': () => import('./data/next-bleed.copied.ts'),
  outflow: () => import('./data/outflow.copied.ts'),
  pregnancy: () => import('./data/pregnancy.copied.ts'),
  prehepatic: () => import('./data/prehepatic.copied.ts'),
};

export const isHpDeck = (id: string) => id in LOADERS;
export async function loadHpDeck(id: string): Promise<CopiedDeck> {
  const load = LOADERS[id];
  if (!load) throw new Error(`"${id}" is not a deck of batch B13b`);
  return (await load()).DECK;
}
