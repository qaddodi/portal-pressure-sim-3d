// Batch B13b (decks H to P): the rows it has built, derived from the copied decks and what each slide needs, never typed.
//   present  the slide is in the 3D app with the 2D words, the model's numbers and a camera shot
//   wired    and every feature it needs has landed (src/decks/hp/hooks.ts names each need and its owner batch; a landing moves the score by itself)
// The first four HVPG slides (route, free, wedge, hvpg) are the slice's (s1.ts claims them); this file claims the deck row and the other nine.
import type { Claim } from './claim.ts';
import { HP_DECKS } from '../decks/hp/ids.copied.ts';
import { readiness } from '../decks/hp/hooks.ts';
import { DECK as HVPG } from '../decks/hp/data/hvpg.copied.ts';
import { DECK as HYPERDYNAMIC } from '../decks/hp/data/hyperdynamic.copied.ts';
import { DECK as KIDNEY } from '../decks/hp/data/kidney.copied.ts';
import { DECK as LANDMARK } from '../decks/hp/data/landmark-trials.copied.ts';
import { DECK as LOBULE } from '../decks/hp/data/lobule.copied.ts';
import { DECK as MASLD } from '../decks/hp/data/masld.copied.ts';
import { DECK as MESO_REX } from '../decks/hp/data/meso-rex.copied.ts';
import { DECK as NCPH } from '../decks/hp/data/ncph.copied.ts';
import { DECK as NEXT_BLEED } from '../decks/hp/data/next-bleed.copied.ts';
import { DECK as OUTFLOW } from '../decks/hp/data/outflow.copied.ts';
import { DECK as PREGNANCY } from '../decks/hp/data/pregnancy.copied.ts';
import { DECK as PREHEPATIC } from '../decks/hp/data/prehepatic.copied.ts';

const SLICE = new Set(['route', 'free', 'wedge', 'hvpg']);
const DECKS = [HVPG, HYPERDYNAMIC, KIDNEY, LANDMARK, LOBULE, MASLD, MESO_REX, NCPH, NEXT_BLEED, OUTFLOW, PREGNANCY, PREHEPATIC];

export const claims: readonly Claim[] = DECKS.flatMap((d) => [
  { id: `deck:${d.id}`, wired: d.slides.every((s) => d.id === 'hvpg' && SLICE.has(s.id) ? true : readiness(s).wired) },
  ...d.slides.filter((s) => !(d.id === 'hvpg' && SLICE.has(s.id))).map((s) => ({ id: `slide:${d.id}/${s.id}`, wired: readiness(s).wired })),
]);

export const DECK_COUNT = HP_DECKS.length;
