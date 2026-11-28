// P-20 of the 28 Nov 2026 production review: the speaker notes read the model through the same braces as the slide's words ({hvpg}, {asc}, {hvpg@high}), so an engine retune
// moves the notes with the card. Each patch swaps a hand-typed reading of the model for its token. The numbers that are not the model's (a guideline threshold, a trial result, a
// chart's own sweep) stay typed and are listed with their reason in tests/notes-numbers-allowed.json. Registered in scripts/source-edits.mjs (SOURCE_PATCHES, so a re-copy from 2D
// keeps them) and in scripts/apply-reviewer-edits.mjs (brings the copied files up to date). Same grammar as source-edits.mjs.
const P = (deck, at, from, to) => ({ deck, at, from, to });

export const NOTES_TOKENS_28NOV = [
  // the slide's own patient
  P('encephalopathy', 'slides.srs.notes', 'a mean velocity of about −3 cm/s', 'a mean velocity of about {pvVel}'),
  P('ncph', 'slides.relation.notes', 'a PPG of 16 mmHg and a spleen of 17 cm at an LSM of 6 kPa', 'a PPG of {ppg} and a spleen of 17 cm at an LSM of {lsm}'),
  P('kidney', 'slides.path-carv.notes', 'His blood pressure is about 112/63 mmHg with a MAP of 79 mmHg, from the model.', 'His blood pressure, with the MAP in brackets, is {map}, from the model.'),
  P('ascites', 'slides.tense.notes', 'about 6 L of ascites', 'about {asc} of ascites'),
  P('circulation', 'slides.flowres.notes', 'The healthy liver carries about 1.1 L/min at a PPG near 4 mmHg.', 'The healthy liver carries about {pvFlow@inflow} at a PPG near {ppg@inflow}.'),
  P('circulation', 'slides.flowres.notes', 'at a PPG over 13 mmHg', 'at a PPG of {ppg}'),
  P('doppler', 'slides.probe.notes', 'gives flow, about 1 L/min in health', 'gives flow, about {pvFlow} in health'),
  P('doppler', 'slides.relation.notes', 'is still 24 cm/s at 11.1 mmHg', 'is still {pvVel} at {hvpg}'),
  P('endoscopy', 'slides.relation.notes', 'about 7 mm across at rest', 'about {varix} across at rest'),
  P('stiffness', 'slides.path.notes', 'the LSM is about 21 kPa and the platelet count about 160,000/µL', 'the LSM is {lsm} and the platelet count about {plt}'),
  P('stiffness', 'slides.path.notes', 'her SSM of about 35 kPa', 'her SSM of {ssm}'),
  P('stiffness', 'slides.aasld.notes', 'her LSM is about 21 kPa and her platelet count about 160,000/µL', 'her LSM is {lsm} and her platelet count about {plt}'),
  P('recompensation', 'slides.path-stopcarv.notes', 'his HVPG of 11.1 mmHg', 'his HVPG of {hvpg@csph}'),
  P('recompensation', 'slides.path-stopcarv.notes', 'His LSM of 23.7 kPa and SSM of about 49 kPa', 'His LSM of {lsm} and SSM of {ssm}'),
  P('recompensation', 'slides.relation.notes', 'to an HVPG of 16.5 mmHg, an LSM of 40.6 kPa and platelets of 56,000/µL', 'to an HVPG of {hvpg@ascites}, an LSM of {lsm@ascites} and platelets of {plt@ascites}'),
  P('recompensation', 'slides.relation.notes', 'to 11.1 mmHg, exactly where he began at 11.1 mmHg', 'to {hvpg@csph}, exactly where he began at {hvpg@csph}'),
  P('recompensation', 'slides.relation.notes', 'he is at 11.1 mmHg off diuretics', 'he is at {hvpg@csph} off diuretics'),
  P('ten-years', 'slides.d365.notes', 'to 13.0 mmHg', 'to {hvpg}'),
  P('ten-years', 'slides.bleed.notes', 'his HVPG, about 15 mmHg,', 'his HVPG, about {hvpg},'),
  P('tipping', 'slides.nocsph.notes', 'has an HVPG of 12 mmHg', 'has an HVPG of {hvpg}'),
  P('same-gradient', 'slides.shunt.notes', 'The catheter reads the same 12 mmHg as', 'The catheter reads the same {hvpg} as'),
  P('pregnancy', 'slides.delivery.notes', 'her platelets of about 87,000/µL', 'her platelets of about {plt}'),
  P('sites', 'slides.postsin.notes', 'with an HVPG of about 11 mmHg', 'with an HVPG of about {hvpg}'),
  P('ncph', 'slides.path-psvdscope.notes', 'his spleen stiffness is about 60 kPa', 'his spleen stiffness is about {ssm}'),
  P('tips-candidacy', 'slides.price.notes', 'the ascites falls to 0.6 L at two months', 'the ascites falls to {asc} at two months'),
  P('tips-complete', 'slides.price.notes', 'the ascites falls to 0.6 L at two months', 'the ascites falls to {asc} at two months'),
  P('tips-candidacy', 'slides.price.notes', 'The 28% is the flow through the sinusoids', 'The {liver} is the flow through the sinusoids'),
  P('tips-candidacy', 'slides.price.notes', 'the shunt fraction, 92% here.', 'the shunt fraction, {shunt} here.'),
  P('tips-complete', 'slides.price.notes', 'The 28% is the flow through the sinusoids', 'The {liver} is the flow through the sinusoids'),
  P('tips-complete', 'slides.price.notes', 'the shunt fraction, 92% here.', 'the shunt fraction, {shunt} here.'),
  P('shunts', 'slides.wide.notes', 'dilated to 12 mm', 'dilated to {tipsLumen}'),
  P('tips-complete', 'slides.diameter.notes', 'dilated to 12 mm', 'dilated to {tipsLumen}'),
  P('tips-doppler', 'slides.jet.notes', 'here 10 mm in diameter', 'here {tipsLumen} in diameter'),
  P('tips-complete', 'slides.waist.notes', 'narrowed to 6 mm in the middle', 'narrowed to {tipsLumen} in the middle'),
  // another slide of the same talk (the card there reads the same number)
  P('cause-treated', 'slides.allpatients.notes', 'at 14.3 mmHg', 'at {hvpg@high}'),
  P('cause-treated', 'slides.relation.notes', 'at an HVPG of 14.3 mmHg against 11.1', 'at an HVPG of {hvpg@high} against {hvpg@before}'),
  P('cause-treated', 'slides.relation.notes', 'she ends at 10.5 mmHg while he ends at 6.8 mmHg', 'she ends at {hvpg@high2} while he ends at {hvpg@year2}'),
  P('next-bleed', 'slides.relation.notes', 'the varix is 5.3 mm; three sessions take it to 3.1 mm', 'the varix is {varix@after}; three sessions take it to {varix@bands}'),
  P('next-bleed', 'slides.relation.notes', 'the varix 2.9 mm', 'the varix {varix@both}'),
];
