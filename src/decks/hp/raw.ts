// The 12 decks H to P as the copy wrote them (nothing laid over them). Read them through source.ts `loadSource`, which lays the 3D overlay on (decks/overlay.ts).
import type { CopiedDeck } from './types.ts';

/** One loader per deck, so the bundler makes one small chunk per deck and the menu never pays for decks nobody opens. */
export const HP_LOADERS: Record<string, () => Promise<CopiedDeck>> = {
  hvpg: () => import('./data/hvpg.copied.ts').then((m) => m.DECK),
  hyperdynamic: () => import('./data/hyperdynamic.copied.ts').then((m) => m.DECK),
  kidney: () => import('./data/kidney.copied.ts').then((m) => m.DECK),
  'landmark-trials': () => import('./data/landmark-trials.copied.ts').then((m) => m.DECK),
  lobule: () => import('./data/lobule.copied.ts').then((m) => m.DECK),
  masld: () => import('./data/masld.copied.ts').then((m) => m.DECK),
  'meso-rex': () => import('./data/meso-rex.copied.ts').then((m) => m.DECK),
  ncph: () => import('./data/ncph.copied.ts').then((m) => m.DECK),
  'next-bleed': () => import('./data/next-bleed.copied.ts').then((m) => m.DECK),
  outflow: () => import('./data/outflow.copied.ts').then((m) => m.DECK),
  pregnancy: () => import('./data/pregnancy.copied.ts').then((m) => m.DECK),
  prehepatic: () => import('./data/prehepatic.copied.ts').then((m) => m.DECK),
};

