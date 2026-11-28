// Minor wording defects of the 28 Nov 2026 production review (RECS.md P-22, P-24, P-27, P-28), as source patches for the copied decks. Registered in scripts/source-edits.mjs
// (SOURCE_PATCHES, so a re-copy from 2D keeps them) and in scripts/apply-reviewer-edits.mjs (brings the copied files up to date). Same grammar as source-edits.mjs.
const P = (deck, at, from, to) => ({ deck, at, from, to });

export const NOTES_WORDING_28NOV = [
  // P-22: the varices notes cite Baveno VII; the talks follow Baveno VIII only
  P('varices', 'slides.gastric.notes', '(Baveno VII; AASLD 2024)', '(Baveno VIII; AASLD 2024)'),
  P('varices', 'slides.redwale.notes', '(AASLD 2024; Baveno VII)', '(AASLD 2024; Baveno VIII)'),
  P('varices', 'slides.primary.notes', '(Baveno VII; AASLD 2024)', '(Baveno VIII; AASLD 2024)'),
  P('varices', 'slides.secondary.notes', '(Baveno VII; AASLD 2024)', '(Baveno VIII; AASLD 2024)'),
  // P-24: a remark about the authoring source files reached the speaker
  P('pregnancy', 'slides.propranolol.notes', 'Neither guideline file lists neonatal monitoring', 'Neither Baveno VIII nor AASLD 2024 lists neonatal monitoring'),
  P('pregnancy', 'slides.delivery.notes', 'Neither guideline file gives the advice on forceps or vacuum', 'None of the guidance cited here gives the advice on forceps or vacuum'),
  P('outflow', 'slides.relation.notes', 'Neither guideline file gives a figure for how much congestion raises LSM.', 'Baveno VIII gives no figure for how much congestion raises LSM.'),
  // P-28: duplicated sentences
  // P-27: the fundal varix after obliteration reads "None", which mid-sentence read as a fault ("shrinks to None"); the sentence now says the varix reads it
  P('gastric-varices', 'slides.bato.line', 'the fundal varix shrinks to {gv}, as after BRTO.', 'the fundal varix reads {gv} afterward, as after BRTO.'),
];

/** The owner's clinical rulings C1 to C4 of the production review (28 Nov 2026, card answers: all the recommended option A). */
export const CLINICAL_28NOV = [
  // C1: the preemptive-TIPS HVPG criterion is ">20 mmHg" wherever Baveno VIII 5.31 is quoted; Monescillo's trial entry keeps its own "≥20 mmHg" (the decks already say >20 elsewhere)
  P('hvpg', 'slides.hvpg.notes', 'an HVPG ≥20 mmHg is one of the criteria for preemptive TIPS', 'an HVPG >20 mmHg is one of the criteria for preemptive TIPS'),
  // C2: both post-cure rules stay; each says which question it answers
  P('cause-treated', 'slides.year2.notes', 'and counts it as resolved at an HVPG <10 mmHg', 'and, to decide whether carvedilol can stop, counts it as resolved at an HVPG <10 mmHg'),
  P('cause-treated', 'slides.year2.notes', 'Repeat the LSM and platelet count if a new cause of liver injury appears.', 'If a new cause of liver injury appears, repeat the LSM and platelet count. The LSM <12 kPa with platelets >150,000/µL on this slide answers a different question: whether CSPH is ruled out after cure.'),
  P('cause-treated', 'slides.path-stopcarv.notes', 'so the HVPG decides.', 'so the HVPG alone decides. These are the rules for stopping carvedilol; the LSM <12 kPa with platelets >150,000/µL rule answers a different question, whether CSPH is ruled out after cure.'),
  P('cause-treated', 'slides.relation.notes', 'Baveno VIII counts CSPH as resolved at an HVPG', 'Baveno VIII counts CSPH as resolved, for the decision to stop carvedilol, at an HVPG'),
  // C3: erythromycin before endoscopy
  P('variceal-bleed', 'slides.oct.notes', 'Erythromycin 250 mg IV, 30 to 90 minutes before endoscopy', 'Erythromycin 250 mg IV, 30 to 120 minutes before endoscopy'),
  // C4: the late-TIPS windows had no source
  P('variceal-bleed', 'slides.tips.notes', ' A patient who misses the 72-hour window can still benefit from a TIPS placed later, up to about 1 week in Child–Pugh B and 2 weeks in Child–Pugh C.', ''),
];

/** P-23, the owner's pick (28 Nov 2026): the daily dose of albumin with terlipressin was never confirmed, so the notes stop giving it; the author's note goes with it. */
export const ALBUMIN_28NOV = [
  P('albumin', 'slides.ind.notes', 'and 1 g/kg on day 1 then 40 to 50 g a day with terlipressin in HRS-AKI (that last figure is not confirmed here; check it against the source before teaching it).', 'and 1 g/kg on day 1 then a daily dose with terlipressin in HRS-AKI.'),
  P('albumin', 'slides.terli.notes', 'the dose of 1 g/kg on day 1 and then 40 to 50 g a day for the duration of therapy is AASLD 2021.', 'the dose of 1 g/kg on day 1 and then a daily dose for the duration of therapy is AASLD 2021.'),
  P('albumin', 'slides.terli-alb.notes', '1 g/kg on day 1, then 40 to 50 g a day for the duration of therapy.', '1 g/kg on day 1, then a daily dose for the duration of therapy.'),
  P('albumin', 'slides.summary.notes', '1 g/kg then 40 to 50 g a day with terlipressin in HRS-AKI.', '1 g/kg then a daily dose with terlipressin in HRS-AKI.'),
];

/** The owner's rulings C5 and C6 (28 Nov 2026, card answers: option A each). */
export const CLINICAL_28NOV_B = [
  // C5: one wording on primary SBP prophylaxis at an ascitic protein <1.5 g/dL: Baveno VIII 4.12 first, AASLD named in the notes only (the tipping notes already read so)
  P('ascites', 'slides.saag.notes', 'higher risk of spontaneous bacterial peritonitis (SBP), so antibiotic prophylaxis is considered.', 'higher risk of spontaneous bacterial peritonitis (SBP). Baveno VIII 4.12 does not recommend long-term primary antibiotic prophylaxis to prevent further decompensation after the first decompensating event. Whether a low-protein ascites puts a patient at high risk of a first SBP is a different question: AASLD 2021 says prophylaxis may be considered in selected patients with low-protein ascites and advanced liver failure or impaired renal function.'),
  P('tipping', 'slides.antibiotic-card.line', 'so primary SBP prophylaxis is considered if liver or kidney function is poor.', 'so primary SBP prophylaxis may be considered in selected patients with poor liver or kidney function.'),
  // C6: 2.5 mm is no cut-off; small against large stays at 5 mm
  P('varices', 'slides.relation.notes', 'The amber 2.5 and red 5 on the left scale are the small and large varix cut-offs, in mm.', 'On the left scale the amber 2.5 mm is where the model\'s varix rises above the vein\'s own caliber, and the red 5 mm is the cut-off between a small and a large varix.'),
];
