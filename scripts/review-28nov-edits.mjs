// The clear defects of the 28 Nov 2026 all-decks review (reports /mnt/project-files/reviews/2026-11-28-decks/RECS.md section 1b) and the owner's 13 clinical rulings of section 3, as source patches
// for the copied decks. Registered in scripts/source-edits.mjs (SOURCE_PATCHES, so a re-copy from 2D keeps them) and in scripts/apply-reviewer-edits.mjs (brings the copied files up to date). Same grammar as source-edits.mjs.
const P = (deck, at, from, to) => ({ deck, at, from, to });
/** A rewrite of words an earlier patch of source-edits.mjs put there: a deck that was never given them (a fresh copy from 2D) has nothing to rewrite, so it is skipped, not an error. */
const Q = (deck, at, from, to) => ({ deck, at, from, to, soft: true });
const SET = (deck, at, set) => ({ deck, at, set });
const MOVE_AFTER = (deck, at, target) => ({ deck, at, moveAfter: target });

export const REVIEW_28NOV = [
  // ---- the clear defects of section 1b ----
  // ascites: the TIPS slide for refractory ascites follows the algorithm slide (his ruling, 28 Nov: move it)
  MOVE_AFTER('ascites', 'slides.tips', 'slides.path-asc'),
  // albumin: the two long-term trials come together (ANSWER, MACHT), then the short-term one (ATTIRE), as the outline says
  MOVE_AFTER('albumin', 'slides.macht', 'slides.answer'),
  // ascites: the TIPS slide for refractory ascites says "if" (his ascites is not refractory on slide 15)
  SET('ascites', 'slides.tips.title', 'If his ascites becomes refractory, a TIPS can control it'),
  // day: "barely moves, from 17.7 to 17.7" read as a mistake
  P('day', 'slides.breath.line', 'The mean portal pressure barely moves, from {pv@fasting} to {pv}, and neither does the HVPG, from {hvpg@fasting} to {hvpg}.', 'The mean portal pressure stays at {pv}, and the HVPG barely moves, from {hvpg@fasting} to {hvpg}.'),
  // circuit 5: the meal is compared on the PPG, as the healthy meal and the table are
  SET('circuit', 'slides.both.tiles', ['pvFlow', 'ppg']),
  SET('circuit', 'slides.both.tool.lines', ['ppg', 'pvFlow']),
  SET('circuit', 'slides.both.tool.title', 'PPG and portal flow around a meal'),
  // cause-treated: the HVPG is measured off carvedilol on both slides (rulings 7); the summary says what the slides show
  P('cause-treated', 'slides.year2.line', 'His HVPG is {hvpg}, which is {<10 mmHg}. By Baveno VIII CSPH has resolved, though the HVPG is not normal. LSM {lsm} and platelets {plt} would not show this.', 'His HVPG, measured off carvedilol, is {hvpg}, which is {<10 mmHg}. By Baveno VIII CSPH has resolved, though the HVPG is not normal. An LSM of {lsm} with platelets of {plt} does not yet reach the LSM <12 kPa with platelets >150,000/µL that rules CSPH out after cure.'),
  SET('cause-treated', 'slides.allpatients.line', 'Two years on, only the patient who started at {hvpg@high} is still {>=10 mmHg}. The alcohol patient, after one year, is at {hvpg@alcohol}, also {>=10 mmHg}.'),
  SET('cause-treated', 'slides.allpatients.ask', ['Which patients still have CSPH, and why?', 'The woman who started at 14.3 mmHg: cure lowered her HVPG only to 10.5 mmHg, which is ≥10. The alcohol patient is also at 10.0 mmHg after a year of abstinence.']),
  P('cause-treated', 'slides.path-stopcarv.ask.1', 'Not on stiffness: 12 kPa is not <10, and <15 kPa counts only with an SSM <25 kPa. Measure the HVPG off carvedilol;', 'Not on stiffness: an LSM of 12 kPa is not <12, so CSPH is not ruled out. Measure the HVPG off carvedilol;'),
  SET('cause-treated', 'checks.0', ['After hepatitis C is cured, which LSM and platelet count rule out CSPH?', 'An LSM <12 kPa with platelets >150,000/µL (Baveno VIII). An HVPG <10 mmHg shows that CSPH has resolved.']),
  P('cause-treated', 'checks.3.1', 'Yes: by Baveno VIII, an LSM <10 kPa after cure means CSPH has resolved.', 'Yes: by Baveno VIII, an LSM <12 kPa with platelets >150,000/µL rules CSPH out.'),
  // gastric varices: the esophageal varix floor is not a size; the case says the model's size
  P('gastric-varices', 'slides.classes.vignette', 'has an 8 to 9 mm fundal varix', 'has a 9 mm fundal varix'),
  SET('gastric-varices', 'slides.brto.line', "When a TIPS is not suitable and the varix drains through a suitable gastrorenal shunt, a balloon in the left renal vein occludes the shunt and the fundal varix reads {gv} afterward, but the PPG rises to {ppg}. Esophageal varices can grow as the PPG rises; repeat endoscopy follows."),
  SET('gastric-varices', 'slides.brto.lineAhead', "When a TIPS is not suitable and the varix drains through a suitable gastrorenal shunt, a balloon in the left renal vein will occlude the shunt. The fundal varix will shrink, but the PPG will rise. Esophageal varices can grow as the PPG rises; repeat endoscopy follows."),
  SET('gastric-varices', 'slides.bato.lineAhead', "Obliterated from the portal side, the fundal varix will shrink, as after BRTO. The PPG will rise and esophageal varices can grow as it does."),
  SET('stiffness', 'slides.a3.ask', ["An LSM of 21 kPa with platelets of 99,000/µL: what does Baveno VIII do?", "He is indeterminate: re-evaluate in 12 months or add ANTICIPATE or an SSM; otherwise endoscopy or an HVPG decides (1.17, 1.19). No beta-blocker is indicated until CSPH is shown."]),
  P('gastric-varices', 'slides.bato.line', 'and esophageal varices can grow to {varix}.', 'and esophageal varices can grow as it does.'),
  // carvedilol 1, ncph 7, masld 5: the case says what the slide's tiles say
  P('carvedilol', 'slides.first.vignette', 'Her platelets are 160,000/µL.', 'Her platelets are 161,000/µL.'),
  P('ncph', 'slides.psvd.vignette', 'his liver stiffness is 6 kPa', 'his liver stiffness is 5.6 kPa'),
  P('masld', 'slides.start.vignette', 'has an LSM of 14 kPa and platelets of 151,000/µL', 'has an LSM of 13.6 kPa and platelets of 152,000/µL'),
  P('masld', 'slides.start.line', 'In another patient, an LSM of {lsm}', 'An LSM of {lsm}'),
  // landmark-trials: the case and the slide say the same thing; two rows of the summary are named apart
  P('landmark-trials', 'slides.covered.vignette', 'needs large-volume paracentesis (LVP) every two weeks despite diuretics', 'refills within a week of every large-volume paracentesis (LVP) despite diuretics'),
  SET('landmark-trials', 'slides.summary.of.5.title', 'Early covered TIPS'),
  SET('landmark-trials', 'slides.summary.of.7.title', 'Covered TIPS for ascites'),
  // meso-rex: the shunt is "about 5"
  P('meso-rex', 'checks.2.0', 'Another lowers it to about 4 mmHg', 'Another lowers it to about 5 mmHg'),
  // prehepatic: ruling 1, a recent trunk thrombus over half the lumen is anticoagulated; only a smaller one is monitored
  SET('prehepatic', 'slides.untreated.title', 'A recent thrombus over half the lumen is anticoagulated; a smaller one is monitored'),
  SET('prehepatic', 'slides.untreated.line', 'This thrombus fills more than half the trunk, so anticoagulate at once. Only a smaller thrombus is left untreated: repeat imaging within 6 weeks, then every 3 months, and start anticoagulation if it progresses; main portal vein thrombosis that does not improve may need TIPS.'),
  SET('prehepatic', 'slides.untreated.tool.lead', 'In cirrhosis, a recent thrombus under half the lumen with no anticoagulant.'),
  SET('prehepatic', 'slides.untreated.ask', ['A patient with cirrhosis has a recent portal trunk thrombus filling more than half the lumen. What is done, and what if it fills less?', 'Anticoagulate: Baveno VIII advises it for a recent complete or >50% trunk thrombus. A smaller thrombus is monitored: imaging within 6 weeks, then every 3 months, and anticoagulation if it progresses (9.22).']),
  SET('prehepatic', 'slides.summary.title', 'Across six patients, PVT raises the PPG and not the HVPG'),
  // shunts 11: the pressure it was before the TIPS is the pre-TIPS PPG (slide 3), not the diuretic baseline
  // ten-years: the post-TIPS pressure is the PPG, the gradient that is read
  P('ten-years', 'slides.relation.line', 'and the TIPS from {hvpg@rebleed} to {hvpg@tips}.', 'and the TIPS the PPG from {ppg@rebleed} to {ppg@tips}.'),
  P('ten-years', 'slides.summary.ask.0', 'Which treatment lowered the HVPG the most in this case?', 'Which treatment lowered the portal pressure the most in this case?'),
  // encephalopathy 9: the title agrees with its own table
  SET('encephalopathy', 'slides.tips.title', 'The 8 mm stent lowers the PPG, and sinusoidal flow falls'),

  // the case's ascitic labs are the model patient's own (baked states: Budd-Chiari 1.6 and 4.0, right heart failure 1.3 and 4.5, IVC web 1.4 and 4.4)
  P('sites', 'slides.post.vignette', 'a SAAG of 1.4 g/dL and a total protein of 4.3 g/dL', 'a SAAG of 1.6 g/dL and a total protein of 4.0 g/dL'),
  P('sites', 'slides.cardiac.vignette', 'a SAAG of 1.4 g/dL and a total protein of 4.3 g/dL', 'a SAAG of 1.3 g/dL and a total protein of 4.5 g/dL'),
  P('where-resistance', 'slides.a6.vignette', 'a SAAG of 1.4 g/dL and a total protein of 4.3 g/dL', 'a SAAG of 1.4 g/dL and a total protein of 4.4 g/dL'),

  // every typed number of a case card is the model patient's own number on the slide it opens (tests/review-28nov.test.ts walks every deck)
  P('stiffness', 'slides.fibrosis.vignette', 'his platelets are 160,000/µL', 'his platelets are 161,000/µL'),
  P('where-resistance', 'slides.a1.vignette', 'his liver stiffness is 24 kPa', 'his liver stiffness is 23.7 kPa'),
  P('two-lesions', 'slides.base.vignette', 'a liver stiffness of 24 kPa', 'a liver stiffness of 23.7 kPa'),
  P('ten-years', 'slides.d0.vignette', 'his platelets are 160,000/µL', 'his platelets are 161,000/µL'),
  P('same-gradient', 'slides.ref.vignette', 'platelets of 84,000/µL', 'platelets of 85,000/µL'),

  // ---- ruling 2: age alone does not exclude a TIPS; the preemptive trials enrolled patients under 75 ----
  SET('tips-candidacy', 'slides.pre-age.title', 'The preemptive TIPS also weighs kidney function and the heart; age alone does not exclude it'),
  SET('tips-candidacy', 'slides.pre-age.line', 'She qualifies on Child–Pugh, kidney and heart. Age alone does not exclude a TIPS, but the trials enrolled patients <75, so for now she has carvedilol and banding. Her PPG is {ppg}.'),
  SET('tips-candidacy', 'slides.pre-age.tool.rows.0', { text: 'Age: the trials enrolled patients <75', note: '79', lit: true }),
  SET('tips-candidacy', 'slides.pre-age.tool.verdict', 'Age alone does not exclude a TIPS; here carvedilol with banding is chosen for now.'),
  SET('tips-candidacy', 'slides.pre-age.ask', ['Name the conditions beside the Child–Pugh criteria for a preemptive TIPS.', 'Creatinine <3 mg/dL and no heart failure. Age alone does not exclude a TIPS, though the preemptive trials enrolled patients <75 (Baveno VIII Figure 3).']),
  P('tips-complete', 'slides.pre.tool.rows.3.text', 'Also **age** <75, creatinine <3 mg/dL, no heart failure', 'Also creatinine <3 mg/dL and no heart failure'),
  P('tips-complete', 'slides.pre.tool.rows.3.note', '54, 1.1, none', '1.1, none'),
  P('treatment', 'slides.carv-sin.line', 'is thought to relax stellate cells, so the HVPG falls from {hvpg@target} to {hvpg}. In primary prophylaxis, a fall of ≥10% or an HVPG ≤12 mmHg responds.', 'may relax stellate cells, so the HVPG falls from {hvpg@target} to {hvpg}. A fall of ≥10% or an HVPG ≤12 mmHg responds.'),
  P('treatment', 'slides.oct.line', 'Octreotide, a somatostatin analog, inhibits the release of splanchnic vasodilatory peptides, so', 'Octreotide, a somatostatin analog, blocks splanchnic vasodilatory peptides, so'),
  SET('tips-complete', 'slides.pre.line', 'Place a covered TIPS within 72 hours, ideally within 24, to lower the PPG of {ppg}. Once he meets the criteria, bilirubin, MELD and age alone do not exclude it.'),
  P('variceal-bleed', 'slides.path.ask.1', 'in a patient aged <75 with a creatinine <3 mg/dL and no heart failure', 'with a creatinine <3 mg/dL and no heart failure (trials enrolled patients <75; age alone does not exclude a TIPS)'),
  P('variceal-bleed', 'slides.tips.ask.1', 'in a patient aged <75 with a creatinine <3 mg/dL and no heart failure', 'with a creatinine <3 mg/dL and no heart failure (trials enrolled patients <75)'),
  P('gastric-varices', 'slides.gastric.ask.1', 'Child–Pugh C <14, age <75, creatinine <3 mg/dL and no heart failure.', 'Child–Pugh C <14, creatinine <3 mg/dL and no heart failure (trials enrolled patients <75; age alone does not exclude a TIPS).'),

  // ---- ruling 3: the treatment patient has never bled, so her response is the primary prophylaxis one (a fall of 10% or an HVPG of 12 or less; decks/overlay/controls.ts RESPONSE_RULE) ----
  SET('treatment', 'slides.relation.tool.zone.fall', 10),
  Q('treatment', 'slides.prop.line', ' For this decompensated patient a response is a fall of ≥20% or an HVPG ≤12 mmHg.', ''),
  Q('treatment', 'slides.carv.line', ' In this decompensated patient a fall of ≥20% or an HVPG ≤12 mmHg is the response.', ''),
  Q('treatment', 'slides.carv-sin.line', ' After a bleed, ≥20% or ≤12 mmHg responds.', ''),
  Q('treatment', 'slides.relation.line', 'a response in this decompensated patient (a fall of ≥20% or an HVPG ≤12 mmHg), and propranolol only to {hvpg@prop}, short of it.', 'and propranolol only to {hvpg@prop}. Both are a response in primary prophylaxis (a fall of ≥10% or an HVPG ≤12 mmHg), carvedilol by more.'),
  Q('treatment', 'slides.relation.ask.1', 'in a decompensated patient a response needs a fall of ≥20% or a gradient ≤12 mmHg.', 'in primary prophylaxis a response needs a fall of ≥10% or a gradient ≤12 mmHg.'),
  Q('treatment', 'slides.relation.notes', 'a fall of 20% or more from baseline, or to 12 mmHg or less, the rule after a bleed and in a decompensated patient (secondary prophylaxis); in primary prophylaxis a fall of 10% or more counts (Baveno VIII Table 3).', 'a fall of 10% or more from baseline, or to 12 mmHg or less, the rule in primary prophylaxis, which this never-bled patient is in (Baveno VIII Table 3); after a bleed, in secondary prophylaxis, the fall must be 20% or more.'),
  Q('treatment', 'slides.prop.notes', 'for this decompensated patient (secondary prophylaxis) ≥20%, or an HVPG ≤12 mmHg, marks a response; ≥10% is the rule for primary prophylaxis.', 'for this never-bled patient (primary prophylaxis) ≥10%, or an HVPG ≤12 mmHg, marks a response; ≥20% is the rule after a bleed.'),
  // ruling 13: the schistosomiasis question has an answer that agrees with the numbers
  SET('treatment', 'checks.3', ['On carvedilol the HVPG barely changes in schistosomiasis, yet the portal pressure falls. Which reading shows the response?', 'The portal pressure. The HVPG reflects sinusoidal pressure, which is normal here, so it misses a fall in portal pressure that is about as large as on propranolol.']),

  // ---- ruling 4 and 5: PSVD ----
  SET('ncph', 'slides.path-psvdscope.title', 'In PSVD the cirrhosis stiffness rules do not apply: screen with EGD'),
  SET('ncph', 'slides.path-psvdscope.line', 'A spleen stiffness of {ssm} does not spare the endoscopy: the stiffness and platelet rules for compensated cirrhosis do not apply to PSVD, so screen with EGD at diagnosis.'),
  SET('ncph', 'slides.path-psvdscope.ask', ['A patient with PSVD has a spleen stiffness of 35 kPa and a bilirubin of 1.3 mg/dL. Does he need screening EGD?', 'Yes. Baveno VIII’s stiffness rules for sparing endoscopy are for compensated cirrhosis; in PSVD, screen with EGD at diagnosis.']),
  SET('ncph', 'slides.path-psvdscore.title', 'PSVD is diagnosed by specific signs or histology, not by a score'),
  SET('ncph', 'slides.path-psvdscore.line', 'A spleen stiffness of {ssm} is not a specific sign. By the VALDIG criteria in Baveno VIII, PSVD needs a specific sign of portal hypertension (varices, a portal hypertensive bleed or portosystemic collaterals) or histology consistent with it, with cirrhosis excluded. Non-specific signs support the diagnosis only alongside histology.'),
  SET('ncph', 'slides.path-psvdscore.ask', ['A patient with no cirrhosis has portosystemic collaterals on imaging and platelets of 120,000/µL. Is PSVD established?', 'Yes. A specific sign of portal hypertension with cirrhosis excluded is enough. Platelets alone are a non-specific sign and would need histology.']),

  // ---- ruling 6: primary prophylaxis is a beta-blocker or banding, not both; red wale signs mark high risk ----
  SET('pregnancy', 'slides.propranolol.title', 'Red wale signs mark a high-risk varix, and propranolol lowers the HVPG'),
  P('pregnancy', 'slides.propranolol.line', 'Red wale signs favor band ligation, so her varix is banded. Propranolol, which her CSPH calls for, lowers', 'Red wale signs mark a varix at high risk of bleeding. In primary prophylaxis she has a beta-blocker or band ligation, not both. Propranolol, which her CSPH calls for, lowers'),
  P('pregnancy', 'checks.1.1', 'Band ligation is preferred when red wale signs are present; propranolol is the beta-blocker, and fetal growth is monitored.', 'In primary prophylaxis a beta-blocker or band ligation is used, not both; red wale signs mark a high-risk varix and are not a reason to choose banding over the beta-blocker. Propranolol is the beta-blocker, and fetal growth is monitored.'),

  // ---- ruling 8: the Doppler pulsatility cut-off ----
  Q('doppler', 'slides.a4.line', 'of {>=0.30} is abnormal.', 'of {>=0.30} is mildly abnormal, and many centres use ≥0.5; this index and its cut-off are not in Baveno VIII.'),

  // ---- ruling 9: the grey zone is settled by endoscopy or an HVPG ----
  P('stiffness', 'slides.a3.sides.0.text', 'Screening endoscopy only if he cannot take a beta-blocker (1.19).', 'Endoscopy or an HVPG settles the grey zone; there is no beta-blocker indication until CSPH is shown (1.19).'),

  // ---- ruling 10: primary SBP prophylaxis ----
  SET('tipping', 'slides.antibiotic-card.tool.rows.2', 'with **Child–Pugh ≥9** and **bilirubin ≥3 mg/dL**'),
  SET('tipping', 'slides.antibiotic-card.tool.rows.3', 'or **sodium ≤130 mEq/L** or **creatinine ≥1.2 mg/dL**'),

  // ---- ruling 12: the constrictive patient keeps 800 mL, so the right atrium reads about 16 mmHg and the portal vein about 30 mmHg (it read 24.5 and 38.9 at 1,150 mL) ----
  // (the pericardial constraint barely moves the right atrium; the retained volume sets it: pericardial 0.5 to 0.9 all gave 24.7 at 1,150 mL. The same constrictive patient is on tips-complete's heart slide.)
  SET('two-lesions', 'slides.both.action', { kind: 'retain', mL: 800 }),
  SET('two-lesions', 'slides.unsqueeze.action', { kind: 'retain', mL: -800 }),
  SET('two-lesions', 'slides.together.action', { kind: 'retain', mL: 800 }),
  SET('tips-candidacy', 'slides.heart.action', { kind: 'retain', mL: 800 }),
  SET('tips-complete', 'slides.heart.action', { kind: 'retain', mL: 800 }),
];
