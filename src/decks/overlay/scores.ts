// The slides that show the liver-function card under their criteria, as facts a slide carries in its `scores` field (overlay.ts merges this table onto the slides). A slide's own `tool`
// stays what the 2D deck gave it; the card is added. The case facts are the slide's vignette's where it gives them; INR, ascites and the like that a vignette leaves out are chosen here so the total
// is the one its words name (tests/scores-card.test.ts checks every "Child–Pugh X n" and "MELD n" a slide says against the card). Albumin is the model's (fp.salb) except where a fact is given.
import type { Focus, ScoreFacts } from '../../ui/charts/scores/model.ts';

export type SlideScores = ScoreFacts & { focus: Focus };

const BLED_C11: SlideScores = { bili: 5.2, inr: 2.4, creatinine: 1.1, ascites: 'mild', he: 'none', focus: 'preemptive' };

export const SCORES: Readonly<Record<string, SlideScores>> = Object.freeze({
  // Child–Pugh C 12, bilirubin 5.2, MELD 23, creatinine 1.1; the preset's albumin 2.25 (3 points; 2.8 and 2 points before 28 Nov, C7), ascites held by the preset's diuretics
  'tips-candidacy/pre': BLED_C11,
  'tips-complete/pre': BLED_C11,
  // (Choose treatment 2 has no card: its case already says Child–Pugh B 8, and the criteria card is read at full size
  //  without the tally under it, which stood at 6 to 8 px; owner W19, 27 Nov, review C-D11)
  // bilirubin 4.1, INR 1.8, creatinine 1.4: MELD 22; refractory ascites; the slide sets the albumin 2.5
  'tips-candidacy/meld': { bili: 4.1, inr: 1.8, creatinine: 1.4, albumin: 2.5, ascites: 'moderate', he: 'none', focus: 'elective' },
  // the liver back to Child–Pugh A5 or A6: no ascites off diuretics, no HE, the model's albumin
  'recompensation/recomp': { bili: 0.9, inr: 1.1, creatinine: 0.9, ascites: 'none', he: 'none', focus: 'recompensation' },
});
