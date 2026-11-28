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
  P('encephalopathy', 'slides.tips.notes', ' The rifaximin trial is Bureau, Ann Intern Med 2021.', ''),
  P('treatment', 'slides.carv-sin.line', 'A fall of ≥10% or an HVPG ≤12 mmHg responds. In primary prophylaxis, a fall', 'In primary prophylaxis, a fall'),
  // P-27: the fundal varix after obliteration reads "None", which mid-sentence read as a fault ("shrinks to None"); the sentence now says the varix reads it
  P('gastric-varices', 'slides.brto.line', 'the fundal varix shrinks to {gv}, but the PPG', 'the fundal varix reads {gv} afterward, but the PPG'),
  P('gastric-varices', 'slides.bato.line', 'the fundal varix shrinks to {gv}, as after BRTO.', 'the fundal varix reads {gv} afterward, as after BRTO.'),
];
