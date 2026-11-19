// B13a (deck port, decks A to G): the 14 decks the 2D app names albumin to gradients and their 167 slides.
//   present  the deck's or slide's words, model steps, camera and dependency list are in the 3D app, copied from the 2D deck
//   wired    it also plays: every feature the slide needs has landed (decks/ag/needs.ts says which has not, and whose batch owns it)
// Derived from the copied decks, never typed apart from them. The Circuit-view slides wait on batch B7, the data card on B12, the charts on B10 and so on; each hook
// flips in the owning batch's push and the slides that waited for it turn wired with no change here.
import { rowId, type Claim } from './claim.ts';
import { plate } from '../decks/ag/index.ts';
import { ALBUMIN } from '../decks/ag/albumin.copied.ts';
import { ASCITES } from '../decks/ag/ascites.copied.ts';
import { BUDD_CHIARI } from '../decks/ag/budd-chiari.copied.ts';
import { CARVEDILOL } from '../decks/ag/carvedilol.copied.ts';
import { CAUSE_TREATED } from '../decks/ag/cause-treated.copied.ts';
import { CHOOSE_TREATMENT } from '../decks/ag/choose-treatment.copied.ts';
import { CIRCUIT } from '../decks/ag/circuit.copied.ts';
import { CIRCULATION } from '../decks/ag/circulation.copied.ts';
import { DAY } from '../decks/ag/day.copied.ts';
import { DOPPLER } from '../decks/ag/doppler.copied.ts';
import { ENCEPHALOPATHY } from '../decks/ag/encephalopathy.copied.ts';
import { ENDOSCOPY } from '../decks/ag/endoscopy.copied.ts';
import { GASTRIC_VARICES } from '../decks/ag/gastric-varices.copied.ts';
import { GRADIENTS } from '../decks/ag/gradients.copied.ts';

const DECKS = [ALBUMIN, ASCITES, BUDD_CHIARI, CARVEDILOL, CAUSE_TREATED, CHOOSE_TREATMENT, CIRCUIT, CIRCULATION, DAY, DOPPLER, ENCEPHALOPATHY, ENDOSCOPY, GASTRIC_VARICES, GRADIENTS];

export const claims: Claim[] = DECKS.flatMap((deck) => {
  const plated = plate(deck);
  const slides = plated.plates.map((p) => ({ id: rowId('slide', `${deck.id}/${p.slide.id}`), wired: p.waiting.length === 0 }));
  return [{ id: rowId('deck', deck.id), wired: slides.every((s) => s.wired) }, ...slides];
});
