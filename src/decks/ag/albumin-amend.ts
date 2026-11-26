// The 3D app's amendments to the copied albumin deck (the copy stays the 2D deck character for character; these are laid on when it loads, by slide id, as ascites-amend.ts does,
// and tests/lvp-albumin.test.ts fails if a re-copy moves the words they anchor on).
//
// Albumin 3 is titled large-volume paracentesis, and the owner asked it to drain 6 L so the slide shows the dose rule at work (36 to 48 g, 26 Nov). ONE number says how much: LVP_ML.
// The model's tap, the litres in the line, the grams in the line and in the notes are all made from it and from the shared dose rule (decks/lvp-albumin.ts); the Tests card's
// "L removed" count reads the model's own two states (ui/tests/abdomen/model.ts tapDrainL), so it says the same.
//
// In the model tense ascites settles at about 5.9 L at a serum albumin of 2.4 g/dL, too little to take 6 L from. The case's albumin falls to 2.2 g/dL instead (owner's choice, 26 Nov):
// the belly then holds about 6.6 L and the pressures barely move (HVPG 15.3, was 15.8). The vignette says the same number as the ramp.
import { PER_L_TEXT, lvpAlbuminText } from '../lvp-albumin.ts';

type Loose = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any

/** The volume Albumin 3's paracentesis drains, in mL: the one source of the slide's litres and grams. */
export const LVP_ML = 6000;
/** The case's serum albumin after its four months off diuretics (g/dL): where the first slide's ramp ends and what its vignette says. */
export const CASE_ALBUMIN = 2.2;

const L = LVP_ML / 1000, dose = lvpAlbuminText(L)!;

/** What each amendment says, kept apart so the test can read them. */
export const AMEND = {
  ramp: { slide: 'ind', key: 'albumin', to: CASE_ALBUMIN },
  vignette: { slide: 'ind', from: 'his serum albumin is 2.4 g/dL.', to: `his serum albumin is ${CASE_ALBUMIN} g/dL.` },
  tap: { slide: 'tap', mL: LVP_ML },
  line: {
    slide: 'tap',
    from: 'LVP drains the ascites to {asc}. After a paracentesis of more than 5 L, albumin is recommended at {6 to 8 g} per liter removed.',
    to: `LVP drains ${L} L, leaving {asc}. Above 5 L, albumin is recommended at {${PER_L_TEXT}} per liter removed: ${dose} here.`,
  },
  notes: { slide: 'tap', from: 'which is about 30 to 40 g after the 5.1 L drained here;', to: `which is ${dose} after the ${L} L drained here;` },
} as const;

/** The deck with the amendments laid on a copy (the copied module is never changed). A slide or an anchor that is not there is left alone. */
export function amendAlbumin<D extends { slides: readonly unknown[] }>(deck: D): D {
  // (a deep copy, as plain data: the copied module is never changed)
  const d: D = JSON.parse(JSON.stringify(deck)), slides = d.slides as Loose[];
  const by = (id: string) => slides.find((s) => s.id === id);

  const r = AMEND.ramp, ramp = by(r.slide)?.ramp?.[r.key];
  if (Array.isArray(ramp) && ramp.length === 2) ramp[1] = r.to;

  const t = by(AMEND.tap.slide);
  if (t?.action?.kind === 'paracentesis') t.action.mL = AMEND.tap.mL;

  for (const [w, field] of [[AMEND.vignette, 'vignette'], [AMEND.line, 'line'], [AMEND.notes, 'notes']] as const) {
    const s = by(w.slide);
    if (s && typeof s[field] === 'string' && s[field].includes(w.from)) s[field] = s[field].replace(w.from, w.to);
  }
  return d;
}
