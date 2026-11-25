// Baveno VIII is the only guideline the talks name on screen (Mohammad, project rule; review recs-22nov/deck-slides.md D1, option 1).
// The 2D decks also quote AASLD 2021 and 2024, EASL 2025 and WSACS. Where Baveno VIII is silent (doses, red wale signs, recanalization rates, SBP prophylaxis, the
// no-beta-blocker-after-TIPS gradient) the claim stays but its source is named in the speaker notes only. Every deck generator reaches this through bavenoEdits()
// (scripts/baveno-edits.mjs), so a re-copy from 2D keeps it. tests/guideline-names.test.ts fails when a guideline other than Baveno VIII is named in any
// field of a talk except `notes`.
//
// Each patch addresses one field of one talk: `deck` is the talk id, `at` a path in it ("slides.<slide id>.line", "checks.3.1", "objectives.2", "slides.a3.sides.1.who").
//   { from, to }  replaces that text inside the field (the field must hold `from`, or the generator stops: the 2D text moved and the patch has to be looked at again)
//   { set }       replaces the whole field          { drop: true } removes the field          { append } adds a sentence to the end of the field
const P = (deck, at, from, to) => ({ deck, at, from, to });
const SET = (deck, at, set) => ({ deck, at, set });
const DROP = (deck, at) => ({ deck, at, drop: true });
const APPEND = (deck, at, append) => ({ deck, at, append });
/** Put a whole new item into a list, right after the one `at` names (a slide of a talk: `slides.<id>`). */
const AFTER = (deck, at, set) => ({ deck, at, set, after: true });

const AASLD_RULE = 'AASLD 2024 (guidance statement 7) uses a different rule of five from the same two numbers: CSPH is presumed at an LSM ≥25 kPa regardless of the platelet count, at 20 to 24.9 kPa with platelets <150,000/µL, or at 15 to 19.9 kPa with platelets <110,000/µL; it is excluded at an LSM <15 kPa with platelets ≥150,000/µL; all other combinations are indeterminate, and SSM or the HVPG can decide. So AASLD presumes CSPH where Baveno VIII stays indeterminate at 20 to 25 kPa with platelets <150,000/µL and at 15 to 20 kPa with platelets <110,000/µL, and at exactly 15 kPa Baveno VIII rules CSPH out where AASLD does not. AASLD advises caution with its rule in MASLD with obesity, an ALT >3 times the upper limit of normal, and primary sclerosing cholangitis with a dominant stricture, where it is less well calibrated.';


/** The varices talk, review of 24 Nov 2026 (capture 572259fd; Mohammad: "yes" to the suggestions). Applied to the copied file by scripts/apply-varices-review.mjs; a re-copy from 2D applies the same patches. */
const V_TILES = { data: 'tiles', tiles: ['hvpg', 'varix'], kicker: 'Varices', site: 'sin' };
export const VARICES_REVIEW = [
  // 1 [11, question 4]: slide 6 shows the carvedilol patient falling from 11.1 to 8.5 mmHg, and the check said 16 to 11
  SET('varices', 'checks.3.0', 'On carvedilol the HVPG falls from 11.1 to 8.5 mmHg. Is the bleeding risk gone?'),
  SET('varices', 'checks.3.1', 'Much lower, not gone: the fall is ≥10% and the HVPG is now ≤12 mmHg (either meets the Baveno VIII response), a good response, but varices can still bleed at <12 mmHg, so the carvedilol is continued.'),
  // 6 [5]: wall stress as a curve against the HVPG (the summary slide's chart, this one line), not the ring diagram
  SET('varices', 'slides.burst.tool', { kind: 'curve', x: 'hvpg', xCuts: [12], cuts: 'ticks', patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.3, to: 1, step: 0.05, days: 365, lines: ['wall'], dots: [{ slide: 'collat', name: 'CSPH' }] }),
  // 4: gastric varices after the esophageal ones
  AFTER('varices', 'slides.eso', { id: 'gastric', lens: 'flow', cam: 'gej', labels: ['LGV'], terms: ['lgv'], ...V_TILES,
    title: 'Gastric varices bleed less often than esophageal ones, but harder',
    line: 'Gastric varices continue the esophageal ones down the lesser curve (GOV1) or reach the fundus (GOV2 and IGV1); IGV2 lie elsewhere in the stomach. Fundal varices drain through a gastrorenal shunt to the left renal vein.',
    notes: 'GOV1 lie along the lesser curve and are managed like esophageal varices. GOV2 and IGV1 reach the fundus, bleed less often but more severely, and drain through a gastrorenal shunt. Treatment of a bleeding fundal varix is cyanoacrylate injection or a TIPS, with or without embolization; BRTO is used where available (Baveno VII; AASLD 2024).',
    ask: ['Which gastric varices are managed like esophageal varices?', 'GOV1, which continue along the lesser curve.'] }),
  // 4: red wale marks, after the wall-stress slide
  AFTER('varices', 'slides.burst', { id: 'redwale', lens: 'flow', cam: 'varices', labels: ['VAR'], terms: ['varix'], key: ['varix'], ...V_TILES,
    title: 'Size, red wale marks and liver function predict a first bleed',
    line: 'Beyond the HVPG, a large varix, red wale marks (red streaks that show a thin wall) and Child–Pugh B or C each raise the risk of a first bleed.',
    notes: 'Large size, red wale marks and Child–Pugh B or C predict bleeding. About 5% of small varices and 15% of large ones bleed each year (AASLD 2024; Baveno VII).',
    ask: ['What besides the HVPG predicts a first bleed?', 'Varix size, red wale marks and Child–Pugh B or C.'] }),
  // 5: primary prophylaxis, then secondary
  AFTER('varices', 'slides.redwale', { id: 'primary', lens: 'flow', cam: 'varices', labels: ['VAR'], terms: ['varix'], key: ['varix'], ...V_TILES,
    title: 'A beta-blocker or band ligation prevents the first bleed',
    line: 'For medium or large varices, or small varices with red wale marks or Child–Pugh C, carvedilol or another NSBB prevents the first bleed. Endoscopic band ligation is used when an NSBB cannot be given or is not tolerated.',
    notes: 'Primary prophylaxis: an NSBB (carvedilol preferred) or endoscopic variceal ligation (EVL). EVL is the alternative when an NSBB is contraindicated or not tolerated (Baveno VII; AASLD 2024).',
    ask: ['Which treatments prevent the first variceal bleed?', 'An NSBB, preferably carvedilol, or band ligation when an NSBB cannot be given.'] }),
  AFTER('varices', 'slides.primary', { id: 'secondary', lens: 'flow', preset: 'cirr-decomp', cam: 'varices', labels: ['VAR'], terms: ['varix'], key: ['varix'], ...V_TILES,
    title: 'After a bleed, an NSBB and band ligation together prevent rebleeding',
    line: 'After an acute variceal bleed the first-line treatment is an NSBB with band ligation, repeated until the varices are gone. A rebleed on both, or a high-risk bleed, calls for a TIPS.',
    notes: 'Secondary prophylaxis: NSBB plus EVL; a pre-emptive TIPS within 72 hours in high-risk patients and a TIPS for rebleeding despite the combination (Baveno VII; AASLD 2024).',
    ask: ['How is a second variceal bleed prevented?', 'An NSBB with band ligation; a TIPS if it bleeds again or the first bleed was high-risk.'] }),
  SET('varices', 'objectives.3', 'Choose prophylaxis before and after a first variceal bleed'),
  SET('varices', 'checks.4', ['What prevents a first variceal bleed in a patient with large varices, and what prevents rebleeding?', 'A first bleed: carvedilol or another NSBB, or band ligation if an NSBB cannot be given. After a bleed: an NSBB with band ligation, and a TIPS if it bleeds again or the first bleed was high-risk.']),
  // 3 [9, now slide 13]: the chart card is the standard height, and the esophagus stood in its shadow: the view takes in the esophagus' top, in the room below the card
  SET('varices', 'slides.relation.cam', [540, -170, 980, 360]),
  // Mohammad, 25 Nov ("drop it"): the umbilical slide's third view, a recap of the paraumbilical and the rectal veins together, is dropped. It drew a vein 6.5 px wide on a phone (the route is longer than the room the cards leave), and the slide and its first beat already show the two routes one at a time.
  //     (It had been framed [344, 166, 1020, 960]: a slide with beats opens on its LAST view, presenter-machine startPos, so the last beat's cam is what the slide shows when it is reached backwards; that is now the rectal view.)
  DROP('varices', 'slides.umbilical.beats.1'),
  SET('varices', 'minutes', 17),
];

/** The TIPS Doppler deck's review patches (23 Nov 2026), in one list so the copied file can be brought up to date without the 2D checkout. */
export const TIPS_DOPPLER_REVIEW = [
  // 4 [2.2]: the text said "pale", and the figure draws the slow end of the velocity map in indigo and blue (ramp F): the words name what is drawn
  P('tips-doppler', 'slides.before.line', 'so the portal veins are pale on the velocity map', 'so the portal veins are indigo or blue on the velocity map'),
  // 1 [3.1, 3.2]: the first view was centred on the right portal vein alone, a close-up of the bifurcation with the stent above it, under the Doppler card. It is centred between the portal end and the middle of the stent.
  SET('tips-doppler', 'slides.jet.cam', [520, 300, 630, 450]),
  // 2 [4]: the aliasing slide named no lens, so the figure fell back to the pressure look in the middle of a velocity lesson
  SET('tips-doppler', 'slides.alias.lens', 'velocity'),
  // 9 [7]: the jet was only "above 190": the slide says its reading, the model's, as the figure's Dist tag reads it
  P('tips-doppler', 'slides.narrow.line', 'The jet at the stenosis is {>190 cm/s}, the rest of the stent {<90 cm/s}, and the PPG has risen to {ppg}.', 'The jet at the stenosis reads {tipsVel}, past the {190 cm/s} cut-off. The rest of the stent is {<90 cm/s}, and the PPG has risen to {ppg}.'),
  // 10 [10]: the stenosed state of this slide is the one slide 7 stands in (distal, no waist), so the probe samples the same place
  SET('tips-doppler', 'slides.fix.compare.0.params', { stenosis: { TIPS: 0.65 }, stenosisSite: { TIPS: 'distal' }, stentGeom: { TIPS: { red: 0 } } }),
  // 5, 6 [12]: the stenosed row is compared with the patent stent (a worse reading is red, never "better"), the stent's Doppler trace stands in each row (a stent that is not there has no trace),
  //     and the portal vein velocity is a column of its own with its unit in the legend
  SET('tips-doppler', 'slides.summary.cols', ['ppg', 'pvVel', 'wave']),
  SET('tips-doppler', 'slides.summary.wave', 'TIPS'),
  SET('tips-doppler', 'slides.summary.of.0.blank', ['wave']),
  SET('tips-doppler', 'slides.summary.of.2.vs', 'jet'),
  // 14 [11]: the curve swept the stenosis from the slide's own state, six months on, so its 0% was 38.6 cm/s where the patent stent's slide (a month on) reads 36. It runs the jet slide's own patient, a month after the stent,
  //     at every point: 0% is slide 5's 36 and 9.7 mmHg, and 65% is still 16.7 mmHg and 23 cm/s (the ring)
  SET('tips-doppler', 'slides.relation.tool.patient', { preset: 'cirr-decomp', params: { cirrhosis: 0.92, tips: { on: true, d: 10 }, splanchnicTone: 0.7, habrStrength: 1.5, apShunt: 0.5 } }),
  SET('tips-doppler', 'slides.relation.tool.days', 30),
  // 15 [2.2, 5]: the hepatic vein had no trace anywhere in the deck. The Doppler's paired strip puts it under the portal vein's: triphasic before the TIPS (the right atrium's a wave briefly reverses its flow),
  //     flat after a patent one (the stent's flow fills it and nothing reverses). Its a, S, v, D are named in the notes. (The portal vein's own "Phasic" label is src/ui/tests/doppler/phasic-cut.js.)
  SET('tips-doppler', 'slides.before.tool.pair', true),
  SET('tips-doppler', 'slides.mpv.tool.pair', true),
  P('tips-doppler', 'slides.before.line', 'Every follow-up study is compared with this one.', 'Under the trace, the hepatic vein is triphasic. Every follow-up study is compared with this one.'),
  P('tips-doppler', 'slides.before.notes', 'Record these values: after TIPS they should rise.', 'Record these values: after TIPS they should rise. The strip under the trace is the right hepatic vein, which follows the right atrium: a small reversal (a), the forward wave of systole (S), a short pause (v) and the forward wave of diastole (D) make it triphasic.'),
  P('tips-doppler', 'slides.mpv.line', 'A later fall to {<30 cm/s} is one sign of TIPS stenosis.', 'A later fall to {<30 cm/s} is one sign of TIPS stenosis. Under the trace, the hepatic vein is flat: it no longer reverses.'),
  P('tips-doppler', 'slides.mpv.notes', 'A main portal vein velocity that falls again on follow-up points to stenosis downstream.', 'A main portal vein velocity that falls again on follow-up points to stenosis downstream. The strip under the trace is the right hepatic vein: with the stent delivering portal blood into it, its a wave no longer reverses flow and the triphasic pattern flattens (biphasic or monophasic).'),
];


/** The external reviewer's findings on build e4810ea9 (24 Nov 2026), the wording ones, checked against Baveno VIII (guidelines/baveno-viii-2026.pdf: 4.13, 5.35 to 5.37, 6.17, 7.4). Applied to the copied files by scripts/apply-reviewer-edits.mjs; a re-copy applies the same patches. */
export const REVIEWER_24NOV = [
  // After the sinusoids 4: the model's day-30 ascites is still 0.8 L, so "resolves" is not what the graph shows; SOS is not "usually resolves, so watch"
  SET('outflow', 'slides.recover.title', 'As SOS improves, the ascites shrinks and the HVPG falls'),
  SET('outflow', 'slides.recover.line', 'As the endothelium heals, the central veins clear; over the following weeks the ascites shrinks to {asc} and the HVPG falls to {hvpg}.'),
  SET('outflow', 'slides.recover.notes', 'This is one recovery course, not a rule that SOS settles by itself. Mild SOS is managed with supportive care (fluid and sodium management, diuretics, analgesia) and close monitoring, because it can progress; early treatment can be considered as it worsens. Defibrotide is the treatment for severe and very severe SOS, which carries high mortality with renal or respiratory failure. For prevention: reduced-intensity conditioning where possible, and ursodeoxycholic acid prophylaxis in many centers.'),
  // Treating the cause 2: the LSM-only rule does not decide at 23.7 kPa; a model can
  SET('cause-treated', 'slides.before.line', 'His liver stiffness (LSM) of {lsm} is below the 25 kPa that rules CSPH in by stiffness alone, and with platelets of {plt} it leaves him in the indeterminate zone; a model such as ANTICIPATE can still call CSPH, and the HVPG of {hvpg} confirms it, so carvedilol is started with the antivirals.'),
  // Doppler 5: a cut-off is not universal
  SET('doppler', 'slides.slow.line', 'Sinusoidal resistance slows portal flow to {pvVel}. A main portal vein velocity {<15 cm/s}, measured with the angle corrected, supports portal hypertension; read it with the rest of the examination.'),
  APPEND('doppler', 'slides.slow.notes', 'The velocity is the mean (time-averaged) velocity of the main portal vein at an insonation angle <60°, with the angle correction applied. A low velocity supports portal hypertension but is not diagnostic, and a normal one does not exclude it.'),
  // Encephalopathy 14: the HE risk is the model's index, and the comparison is within the modelled cirrhotic patient
  SET('encephalopathy', 'slides.summary.title', 'In this patient every shunt trades a lower gradient for less sinusoidal flow'),
  SET('encephalopathy', 'slides.summary.line', 'The more portal blood bypasses the liver, the lower the gradient and the higher the model\'s HE risk index. The healthy row is the reference; the rows below it are cirrhosis, so their differences are the shunt and the disease together.'),
  // Varix 8: the readout is the HVPG, a gradient
  SET('endoscopy', 'slides.relation.title', 'Insufflation narrows the visible varix while the HVPG stays constant'),
  // Gastric varices 7: the route the title teaches, and the anatomy it needs
  SET('gastric-varices', 'slides.brto.terms', ['gv', 'lrv']),
  SET('gastric-varices', 'slides.brto.mark', { edges: ['C5'], label: 'Gastrorenal shunt', kind: 'note' }),
  SET('gastric-varices', 'slides.brto.line', 'When a TIPS is not suitable and the varix drains through a suitable gastrorenal shunt, a balloon in the left renal vein occludes the shunt and the fundal varix shrinks to {gv}, but the PPG rises to {ppg}. Esophageal varices can grow to {varix}; repeat endoscopy follows.'),
  // Recompensation 7 (the criteria card): each criterion has its own row; the interval belongs to the first four (Baveno VIII 7.4 a to d), liver function (e) is separate
  SET('recompensation', 'slides.recomp.tool', { kind: 'criteria', title: 'Recompensation', lead: 'All five; the first four each for >6 months.', rule: 'Baveno VIII 7.4',
    rows: ['**Cause** removed, controlled or suppressed', ['No **ascites** on imaging, off diuretics', 'asc', '<', 0.15], 'No clinical **HE**, off lactulose, rifaximin or LOLA', 'No recurrent variceal **bleeding**, if a bleed was a decompensating event (carvedilol allowed)', 'Liver function back to **Child–Pugh A5 or A6**'] }),
  SET('recompensation', 'slides.recomp.line', 'He is off diuretics, and ascites has not recurred on imaging. With the cause removed and Child–Pugh A5 or A6, the cause, the ascites and the HE criteria must each last >6 consecutive months for recompensation.'),
  // One patient 15: recurrent or persistent HE; the precipitant and lactulose go together (Baveno VIII 6.17)
  SET('ten-years', 'slides.he-answer.title', 'Treat the precipitant and give lactulose together; reduce the stent only if HE recurs or persists'),
  SET('ten-years', 'slides.he-answer.line', 'Look for infection, GI bleeding, constipation, sedatives, hyponatremia and hypokalemia and treat them while giving lactulose. Add rifaximin after a recurrence. If HE recurs or persists despite this, a large spontaneous shunt can be embolized or the stent reduced or occluded.'),
  SET('ten-years', 'slides.he-answer.tool', { kind: 'criteria', title: 'Encephalopathy after TIPS', short: 'After TIPS', ticks: false, lead: 'Together first; then, if it comes back.', rule: 'Baveno VIII 6.17',
    rows: ['Find and treat the **precipitant**', '**Lactulose** now, and **rifaximin** after a recurrence', { text: 'Recurrent or persistent HE despite both: **embolize** a large spontaneous shunt, or **reduce or occlude** the stent', lit: true }] }),
  SET('tips-complete', 'slides.he.title', 'Treat the precipitant and give lactulose together; reduce the stent only if HE recurs or persists'),
  SET('tips-complete', 'slides.he.line', 'Look for infection, GI bleeding, constipation, sedatives, hyponatremia and hypokalemia and treat them while giving lactulose. Add rifaximin after a recurrence. If HE recurs or persists despite this, a large spontaneous shunt can be embolized or the stent reduced or occluded.'),
  SET('tips-complete', 'slides.he.tool', { kind: 'criteria', title: 'Encephalopathy after TIPS', short: 'After TIPS', ticks: false, lead: 'Together first; then, if it comes back.', rule: 'Baveno VIII 6.17',
    rows: ['Find and treat the **precipitant**', '**Lactulose** now, and **rifaximin** after a recurrence', { text: 'Recurrent or persistent HE despite both: **embolize** a large spontaneous shunt, or **reduce or occlude** the stent', lit: true }] }),
  // Who should get a TIPS 9: isolated congestion raises the free and wedged pressures together, so the HVPG stays near normal; the portal pressure and the right atrium show it
  SET('tips-candidacy', 'slides.heart.title', 'A raised right atrial pressure points to the heart, not the sinusoids'),
  SET('tips-candidacy', 'slides.heart.line', 'His right atrial pressure is {ra}, and the portal vein pressure is {pv}. The HVPG of {hvpg} and the PPG of {ppg} are measured against the same raised pressure, so they understate it: congestion, not only sinusoidal resistance, drives the ascites.'),
  SET('tips-candidacy', 'slides.heart.notes', 'A raised right atrial pressure lifts the free and the wedged hepatic vein pressures together, so in pure congestion the HVPG stays normal or low; here the HVPG is still raised, so the liver is diseased as well as the heart. The PPG is the portal vein pressure minus the IVC pressure, and the IVC rises with the right atrium, so both gradients understate the portal pressure; the portal vein pressure and the right atrium show it. The same constriction is the Constrictive pericarditis patient of the model. Baveno VIII 6.5 names cardiac failure with encephalopathy as the risk of overshunting, and AASLD 2021 lists cardiopulmonary insufficiency among the risks of complications after TIPS. None of the guidelines here gives a right atrial pressure above which a TIPS is refused; the tile\'s rating (above 8 mmHg is high) is the app\'s own.'),
  SET('tips-candidacy', 'slides.heart.ask', ['In ascites, which reading beside the gradients tells you the heart is the cause?', 'The right atrial pressure: it lifts the free and wedged pressures together, so the gradients stay low while the portal pressure is high.']),
  // TIPS follow-up 5: "consider", and the covered stent is preferred (Baveno VIII 4.13, 5.35 to 5.37)
  SET('tips-complete', 'slides.rescue.title', 'Rescue TIPS is considered after a rebleed, and salvage TIPS after a bleed that cannot be controlled'),
  SET('tips-complete', 'slides.rescue.line', 'On carvedilol and three bands her PPG is {ppg}; a rebleed despite both is an indication to consider TIPS. Uncontrolled bleeding is bridged by a covered esophageal stent, preferred over balloon tamponade, then salvage TIPS.'),
  P('tips-complete', 'slides.rescue.tool.rule', 'Baveno VIII 4.13, 5.36, 5.37', 'Baveno VIII 4.13, 5.35 to 5.37'),
];

/** The second reviewer report (iPhone captures of build 43583487, 24 Nov 2026), the wording and chart-binding ones, checked against Baveno VIII (guidelines/baveno-viii-2026.pdf: 4.6, 5.5, 6.15, 6.17, 9.10a) and the engine's own numbers. Applied by scripts/apply-reviewer-edits.mjs. */
export const REVIEWER_24NOV_B = [
  // Choose the treatment 7: a permanent major risk factor (Baveno VIII 9.10a) means long-term therapeutic anticoagulation, not a stop at 6 months
  SET('choose-treatment', 'slides.a4.line', 'Start therapeutic-dose anticoagulation at diagnosis; the earlier it starts, the likelier the vein recanalizes. A transient risk factor means ≥6 months, but her homozygous factor V Leiden is a permanent major risk factor, so it continues long term. Portal flow is now {pvFlow}, the PPG {ppg}.'),
  // The portal circulation 7: the HVPG scope
  SET('circulation', 'slides.define.title', 'In sinusoidal portal hypertension, the HVPG is above 5 mmHg'),
  APPEND('circulation', 'slides.define.notes', 'The HVPG is the pressure drop across the sinusoids, so it defines portal hypertension only where the resistance is sinusoidal, as in this cirrhotic liver. In presinusoidal portal hypertension (portal vein thrombosis, schistosomiasis, portosinusoidal vascular disorder) the resistance lies upstream of the wedged pressure and the HVPG can be normal while the portal pressure is high.'),
  // Portal pressure as a circuit 8: the no-TIPS baseline
  SET('circuit', 'slides.tips.line', 'A covered stent in parallel with the sinusoids has far lower resistance than they or any collateral, so it carries most portal flow: the PPG falls from {ppg@parallel} without a stent to {ppg}.'),
  // Carvedilol 7: the safety conditions (Baveno VIII 4.6, 4.7)
  SET('carvedilol', 'slides.ascites.line', 'Six years in, four on carvedilol, she has {asc} of ascites and varices of {varix}. The ascites came despite carvedilol; Baveno VIII still advises it, to prevent a first bleed, while her blood pressure holds. Persistent systolic pressure <90 mmHg, mean arterial pressure <65 mmHg or HRS-AKI calls for a lower dose or stopping it, and it is restarted once these recover.'),
  // Resuscitating an acute variceal bleed 5: airway and resuscitation first; the drugs at once, in parallel (Baveno VIII 5.5, 5.7, 5.10)
  SET('variceal-bleed', 'slides.oct.title', 'Secure the airway and resuscitate first; give octreotide and antibiotics at once'),
  SET('variceal-bleed', 'slides.oct.tool', { kind: 'criteria', title: 'Before endoscopy', short: 'Before EGD', ticks: false, lead: 'Airway and resuscitation first; the drugs at once.', rule: 'Baveno VIII 5.3, 5.5, 5.7, 5.10, 5.22',
    rows: ['**Airway** and **resuscitation** first: **intubate** before EGD if consciousness is altered or there is active hematemesis', '**Vasoactive drug** and a third-generation **cephalosporin**, at once and together', '**Transfuse** for shock; once stable, at <7 g/dL, aiming for 7 to 8', '**Erythromycin** before EGD', '**Lactulose**, oral or by enema'], verdict: 'Throughout: ICU or step-down unit; monitor sodium on terlipressin.' }),
  // Two lesions 4: both HVPG values
  SET('two-lesions', 'slides.varices.line', 'Behind the clot the portal pressure is {pv}. The HVPG has fallen from {hvpg@base} to {hvpg}, yet the varices reach {varix} and the platelets fall to {plt}.'),
  // One patient 14: grade 2 overt HE needs more than slowing
  SET('ten-years', 'slides.he.line', 'He is disoriented to time, with sleep-wake inversion and psychomotor slowing: grade 2 overt HE. {shunt} of portal blood now bypasses the liver.'),
  // TIPS and shunts 10: the target belongs to this case
  SET('shunts', 'slides.tips.title', 'TIPS lowers the PPG below the 12 mmHg bleeding target'),
  SET('shunts', 'slides.tips.line', 'A covered 8 to 10 mm stent runs from a hepatic vein to the portal vein. The PPG falls to {ppg}, under the 12 mmHg target for preventing rebleeding in this patient.'),
  // Stiffness 14: the cirrhosis zones do not apply to this presinusoidal patient, so the instrument classifies nothing
  SET('stiffness', 'slides.a5.tool', { kind: 'plane', plane: { base: 'csph', noWords: true, zoneNote: 'Criteria don\'t apply in this case' } }),
  // TIPS follow-up 12: individualized (Baveno VIII 6.15)
  SET('tips-complete', 'slides.brain.title', 'A past episode of overt encephalopathy calls for an individualized decision, not a refusal'),
  SET('tips-complete', 'slides.brain.line', 'Baveno VIII asks for the decision to be individualized: her encephalopathy history and medicines are reviewed, and rifaximin is considered before the stent. The model\'s encephalopathy index with the stent is {he}.'),
  // TIPS follow-up 25: bleeding cardiofundal varices, acute control then definitive therapy, the shunt anatomy
  SET('tips-complete', 'slides.gastric.title', 'For a bleeding gastric varix, TIPS or BRTO depends on the liver and the shunt'),
  SET('tips-complete', 'slides.gastric.line', 'Cyanoacrylate controls the bleed; then a TIPS lowers the PPG to {ppg} and the fundal varix to {gv}. BRTO shrinks the varix but raises the PPG, and needs an accessible gastrorenal shunt. Liver function, encephalopathy and ascites decide.'),
  // Dual blood supply 10: the chart is the clot slide's own patient, so its end points are the line's 79% and 44%
  SET('two-inflows', 'slides.relation.tool', { kind: 'curve', x: 'clot', xFrom: 0, xTo: 100, patient: { preset: 'pvt-acute' }, param: 'thrombus.PV_TRUNK', from: 0, to: 1, step: 0.1, lines: ['liver'], against: { label: 'No buffer', params: { habrStrength: 0 }, own: 'With the buffer' } }),
  P('two-inflows', 'slides.relation.notes', 'at the end of the lines, a normal liver with the vein closed keeps 71% with the buffer and 38% without.', 'the lines end at this patient\'s own values, 79% with the buffer and 44% without; a normal liver with the vein closed would keep 71% and 38%.'),
];

/** The hepatic artery's resistive index (Mohammad, 25 Nov 2026: "mention and show hepatic artery resistive index"): the Doppler tile shows it (src/ui/tests/doppler/model.ts, HA_RI 0.55 to 0.80); the talk names it. Applied to the copied deck by scripts/apply-ha-ri.mjs. */
export const HA_RI_REVIEW = [
  APPEND('two-inflows', 'slides.dual.notes', 'The resistive index, RI = (peak systolic − end-diastolic velocity) / peak systolic, measures that low resistance; the usual hepatic artery value is 0.55 to 0.80.'),
  APPEND('two-inflows', 'slides.clot.line', 'The dilated artery offers less resistance, so its resistive index falls below the usual 0.55 to 0.80.'),
  APPEND('two-inflows', 'slides.clot.notes', 'On the Doppler the resistive index, (peak systolic − end-diastolic velocity) / peak systolic, falls below the usual 0.55 to 0.80 as the buffer dilates the arterioles and diastolic flow rises.'),
  APPEND('two-inflows', 'slides.artery.notes', 'With no arterial signal the resistive index cannot be read. In a graft that still has flow, a high index early after transplant or a low one (under 0.5) with a slow systolic upstroke (tardus parvus) calls for a look at the artery.'),
  APPEND('two-inflows', 'slides.cirr.notes', 'The Doppler gives the artery\'s resistive index beside its velocity; the usual hepatic artery range is 0.55 to 0.80, and in real cirrhosis a high index tracks stiff, advanced disease.'),
];

/** The third reviewer report (Hales Engine 3252079e, 440 x 736, 24 Nov 2026): words that say what the model's values show (reduces, not clears; the share of portal blood that bypasses the liver), a cardiac contribution not a proof, Doppler findings as this case's, and no volume grades. Applied by scripts/apply-reviewer-edits.mjs to the copies. */
const BYPASS_NOTE = 'In the model the ascites falls to 0.6 L at two months; it is reduced, not gone. The 28% is the flow through the sinusoids, not the share of portal blood that bypasses the liver: that share is the shunt fraction, 92% here.';
export const REVIEWER_24NOV_C = [
  // TIPS follow-up 7 and TIPS candidacy: "reduces", and the bypass fraction beside the sinusoidal flow
  ...['tips-complete', 'tips-candidacy'].flatMap((d) => [
    SET(d, 'slides.price.title', 'The stent reduces the ascites, but most portal blood now bypasses the sinusoids'),
    SET(d, 'slides.price.line', 'Two months on, the ascites is {asc} and the PPG {ppg}; {shunt} of portal blood bypasses the liver, and sinusoidal flow has fallen to {liver} of normal.'),
    SET(d, 'slides.price.tiles', ['asc', 'shunt', 'liver']),
    P(d, 'slides.price.notes', 'The model clears the ascites in weeks.', 'The model reduces the ascites within weeks.'),
    APPEND(d, 'slides.price.notes', BYPASS_NOTE),
  ]),
  // TIPS follow-up 11: raised right atrial pressure supports a cardiac contribution; it does not prove the ascites is only cardiac
  SET('tips-complete', 'slides.heart.title', 'Markedly elevated right atrial pressure supports a cardiac contribution to the ascites'),
  SET('tips-complete', 'slides.heart.line', 'His right atrial pressure is {ra} and cardiac output {co}, with distended jugular veins and a thickened pericardium. Congestion is adding to the ascites, and a TIPS would raise venous return to a heart that is already full.'),
  P('tips-complete', 'slides.heart.compare.1.line', 'and the cause of the ascites is untouched.', 'and the cardiac contribution to the ascites is untouched.'),
  APPEND('tips-complete', 'slides.heart.notes', 'A raised right atrial pressure supports a cardiac contribution but does not by itself show that the ascites is only cardiac: his cirrhosis adds a sinusoidal part, which is why the hemodynamic study and the echocardiogram decide, not one number.'),
  // (Mohammad picked the suggestion, 24 Nov 2026: the cardiac output stands on the heart, its live value from the same model state as the tile)
  SET('tips-complete', 'slides.heart.mark', { organ: 'heart', label: 'Cardiac output {co}', kind: 'note' }),
  // TIPS follow-up 22: these velocities are this case's findings; criteria vary and venography with pressures evaluates a suspected dysfunction
  SET('tips-complete', 'slides.jet.line', 'At 6 months, {asc} of ascites has reaccumulated. In this case the jet at the stenosis is {>190 cm/s} and the rest of the stent {<90 cm/s}; Doppler criteria vary, and venography with pressure measurements evaluates a suspected dysfunction (PPG {ppg}).'),
  APPEND('tips-complete', 'slides.jet.notes', 'The velocities on this slide are this case\'s findings, not thresholds that every center uses: Doppler criteria vary, and a suspected TIPS dysfunction is evaluated by venography with pressure measurements across the stent.'),
  // Ascites 22 and 21: the TIPS lowers the ascites to the model's own value; the chart has no grade lines on the volume axis, the grades are taught by their definitions
  SET('ascites', 'slides.relation.line', 'LVP empties the abdomen, but the ascites is back to {asc@back} by week 2. Diuretics reduce it to {asc@diuretics} by week 6, and adding a TIPS reduces it further, to {asc} at the end of the chart.'),
  SET('ascites', 'slides.relation.tool.zones', false),
  P('ascites', 'slides.relation.notes', "The zones are the app's own grades (its data card uses them too): grade 1 ≥0.15 L, grade 2 ≥1.5 L, grade 3 ≥5 L; at the bedside the grade comes from the examination, not from the volume.", 'The scale is plain liters because the grades of ascites are not volumes: grade 1 is ascites seen only on ultrasound, grade 2 is moderate symmetric abdominal distension, and grade 3 is marked abdominal distension (AASLD 2021), so the chart draws no grade lines.'),
  P('ascites', 'slides.summary.notes', 'diuretics clear it more slowly and prevent recurrence; a TIPS clears it by lowering', 'diuretics reduce it more slowly and prevent recurrence; a TIPS reduces it by lowering'),
  P('ascites', 'slides.tips.line', 'and here the ascites resolves over weeks.', 'and here the ascites falls over weeks to {asc}.'),
];

/** The reviewer's fourth report (build 45948199, 24 Nov 2026): the measurement wording, tables that show each treatment against the state before it, plain names for the model's own index, and the wording of the TIPS timing, terlipressin and albumin claims. */
export const REVIEWER_24NOV_E = [
  // Measuring HVPG and PPG 6: how the wedge is read (stable tracing, last 20 to 30 s, triplicate) and that the drawn tracing is shortened
  SET('hvpg', 'slides.wedge.line', 'Balloon inflation stops flow, so the static column of blood equilibrates with the pressure of the upstream sinusoids. Record it once the tracing is stable, after ≥1 minute, from its last 20 to 30 seconds, in triplicate. The tracing drawn here is time-compressed.'),
  // Kidney 12: the APP table shows what sets it (MAP, IAP, APP), each row against the state before it
  SET('kidney', 'slides.summary.cols', ['map', 'iap', 'rpp']),
  SET('kidney', 'slides.summary.of.1', { id: 'tense', kicker: 'Tense ascites', title: 'Four months off diuretics', vs: 'arteries' }),
  SET('kidney', 'slides.summary.of.2', { id: 'tap', kicker: 'LVP', title: 'Paracentesis with albumin', vs: 'tense' }),
  SET('kidney', 'slides.summary.of.3', { id: 'carv', kicker: 'Drug', title: 'Carvedilol', vs: 'arteries' }),
  SET('kidney', 'slides.summary.of.4', { id: 'hold', kicker: 'Hemorrhage', title: 'Large hemorrhage on carvedilol', vs: 'carv' }),
  SET('kidney', 'slides.summary.of.5', { id: 'terli', kicker: 'HRS-AKI', title: 'Terlipressin and albumin', vs: 'hold' }),
  SET('kidney', 'slides.summary.line', 'The MAP and the IAP set the APP (MAP − IAP). Each row is compared with the state named under it: large-volume paracentesis and terlipressin raise the APP; carvedilol and hemorrhage lower it.'),
  // Albumin 13: each scenario against its own starting point; long-term albumin only for selected patients
  SET('albumin', 'slides.summary.of.1', { id: 'tap', kicker: 'LVP', title: 'Paracentesis with albumin', vs: 'ind' }),
  SET('albumin', 'slides.summary.of.2', { id: 'long', kicker: 'Long term', title: 'Long-term albumin, 8 weeks', vs: 'ind' }),
  SET('albumin', 'slides.summary.of.3', { id: 'terli', kicker: 'HRS-AKI', title: 'Terlipressin', ref: true }),
  SET('albumin', 'slides.summary.of.4', { id: 'terli-alb', kicker: 'HRS-AKI', title: 'Terlipressin and one infusion', vs: 'terli' }),
  SET('albumin', 'slides.summary.of.5', { id: 'more', kicker: 'HRS-AKI', title: 'Three infusions', vs: 'terli-alb' }),
  SET('albumin', 'slides.summary.line', 'Albumin protects the circulation after LVP, may improve ascites control in selected patients who cannot have a TIPS, and goes with terlipressin in HRS-AKI. More volume raises the portal pressure. Each row is compared with the row named under it.'),
  // Circuit 6: only the cirrhotic patient is plotted, so the title says what the plot shows
  SET('circuit', 'slides.both.title', 'In cirrhosis a meal raises the gradient and the flow'),
  SET('circuit', 'slides.both.line', 'The gradient rises although the flow rises only modestly, because the extra flow now crosses a higher resistance. Only this patient, with cirrhosis, is plotted.'),
  // Choose the treatment 5 and 6: anticoagulation does not stop at recanalization
  SET('choose-treatment', 'slides.a3-lumen.line', 'In cross-section, the thrombus that occluded >50% of the lumen has resolved. Anticoagulation continues after recanalization while the prothrombotic cause persists, with follow-up imaging to decide the rest.'),
  // Same gradient 4 and 6: the model's own resistance and its own index
  SET('same-gradient', 'slides.flow.line', 'In another patient with CSPH, the portal vein carries {pvFlow}, against {pvFlow@ref} in the first. The HVPG is {hvpg}: the same pressure drop across more flow means the model\'s sinusoidal resistance (gradient ÷ flow) is lower.'),
  SET('same-gradient', 'slides.cost.line', 'The varices are {varix} and the platelets {plt}, better than in the first man. The liver gets {liver} of its normal flow, and the model\'s HE index (0 to 1) is in its high range.'),
  // Lowering portal pressure 7: terlipressin in HRS-AKI goes with albumin; in variceal bleeding it is given without albumin as part of that regimen
  SET('treatment', 'slides.terli.line', 'Terlipressin, a vasopressin analog, constricts the splanchnic arterioles, so portal inflow falls to {pvFlow}. In HRS-AKI it is given with albumin, and the abdominal perfusion pressure (APP) rises to {rpp}. In an acute variceal bleed it is given for the bleed itself, and albumin is not part of that regimen.'),
  // Collaterals and varices 9: a rescue TIPS and a preemptive TIPS are two different indications
  SET('varices', 'slides.secondary.line', 'After an acute variceal bleed the first-line treatment is an NSBB with band ligation, repeated until the varices are gone. A TIPS has two separate indications: a rebleed despite both (rescue), and a high-risk bleed at presentation, when a preemptive TIPS within 72 hours, ideally 24, is advised (Baveno VIII).'),
  // Preventing the next variceal bleed 2
  P('next-bleed', 'slides.after.line', 'up to 60% rebleed within a year, most within 6 weeks.', 'up to 60% rebleed within a year, and the risk is highest in the first 6 weeks.'),
];

/** The reviewer's reports on build 3252079e, rounds 4 and 5 (24 Nov 2026): the bridge is the covered stent first, endoscopy follows resuscitation, tables carry a decision and a purpose per row and compare each row with its own scenario, one baseline number, the SAAG's two albumins, ascites that is stable says so. */
export const REVIEWER_24NOV_D = [
  // Resuscitating an acute variceal bleed 15: the preferred bridge (Baveno VIII 5.35), balloon tamponade the fallback
  SET('variceal-bleed', 'slides.bridge.title', 'A covered esophageal stent is the preferred bridge to a TIPS; balloon tamponade is the fallback'),
  SET('variceal-bleed', 'slides.bridge.line', 'A covered esophageal stent is the preferred bridge (Baveno VIII 5.35); balloon tamponade is the fallback when the stent is unavailable or unsuitable. Here the gastric balloon is inflated first, against the cardia, and the bleeding stops. Blood pressure recovers to {map}.'),
  SET('variceal-bleed', 'slides.bridge.mark', { edges: ['C1a', 'C1b'], label: 'Balloon tamponade (fallback)', kind: 'treat' }),
  // endoscopy follows the first resuscitation; instability that persists calls for it as soon as feasible (Baveno VIII 5.x, AASLD 2024)
  P('variceal-bleed', 'slides.band.line', 'Endoscopy within 12 hours, once hemodynamically stable.', 'Endoscopy within 12 hours of presentation, after initial resuscitation, and as soon as feasible if instability persists.'),
  P('gastric-varices', 'slides.bleed.line', 'restrictive transfusion and endoscopy within 12 hours.', 'restrictive transfusion and, after initial resuscitation, endoscopy within 12 hours of presentation (as soon as feasible if instability persists).'),
  // Lowering portal pressure 12: one baseline value, the table's own
  SET('treatment', 'slides.summary.of.0.note', 'Large varices, ascites'),
  // Who should get a TIPS 13: one decision and its reason on every row
  SET('tips-candidacy', 'slides.summary.note', 'Decision and reason'),
  SET('tips-candidacy', 'slides.summary.of.1.note', 'Preemptive TIPS: controlled bleed, Child–Pugh C 11'),
  SET('tips-candidacy', 'slides.summary.of.2.note', 'Rescue TIPS: rebleed despite carvedilol and banding'),
  SET('tips-candidacy', 'slides.summary.of.3.note', 'Consider TIPS: recurrent ascites, MELD 11'),
  SET('tips-candidacy', 'slides.summary.of.4.note', 'Transplant evaluation first: MELD 22'),
  SET('tips-candidacy', 'slides.summary.of.5.note', 'Cardiac evaluation first: constrictive pericarditis'),
  // Gastric varices 13: two scenarios, each row against its own starting point, acute hemostasis apart from definitive prevention of rebleeding
  SET('gastric-varices', 'slides.summary.title', 'Gastric varices: each treatment against its own starting point'),
  SET('gastric-varices', 'slides.summary.line', 'In cirrhosis, cyanoacrylate stops a fundal bleed and a TIPS or BRTO prevents the next one. With an isolated splenic vein thrombosis, coils with glue stop it and splenectomy removes the cause. Each row is compared with the first row of its own scenario.'),
  SET('gastric-varices', 'slides.summary.note', 'Aim of the treatment'),
  SET('gastric-varices', 'slides.summary.of.1.note', 'Cirrhosis, bleeding: acute hemostasis'),
  SET('gastric-varices', 'slides.summary.of.2', { id: 'tips', kicker: 'Cirrhosis', title: 'TIPS', vs: 'classes', note: 'Definitive: prevents rebleeding' }),
  SET('gastric-varices', 'slides.summary.of.3', { id: 'brto', kicker: 'Cirrhosis', title: 'BRTO', vs: 'classes', note: 'Definitive: prevents rebleeding, keeps portal flow' }),
  SET('gastric-varices', 'slides.summary.of.4', { id: 'svt', kicker: 'Splenic vein', title: 'Splenic vein thrombosis', site: 'pre', note: 'No cirrhosis: the baseline of this scenario' }),
  SET('gastric-varices', 'slides.summary.of.5', { id: 'eusglue', kicker: 'Splenic vein', title: 'EUS coils and cyanoacrylate', site: 'pre', vs: 'svt', note: 'Acute hemostasis' }),
  SET('gastric-varices', 'slides.summary.of.6', { preset: 'svt', params: { occluded: { C2: true }, splenicRx: 2 }, kicker: 'Splenic vein', title: 'Splenectomy', site: 'pre', vs: 'svt', note: 'Definitive: removes the cause' }),
  // Portal vein thrombosis 6 and 16 (the reviewer's suggestion, built: each recanalized vein says whose liver it is and why its velocity differs)
  APPEND('prehepatic', 'slides.anticoag-lumen.line', 'In this patient, who has a normal liver, the portal flow velocity is {pvVel}.'),
  APPEND('prehepatic', 'slides.pvt-anticoag-lumen.line', 'In this patient, who has cirrhosis, the recanalized vein flows slower, at {pvVel}, because the cirrhotic liver resists portal inflow.'),
  // Encephalopathy 8 (the reviewer's suggestion, built): the embolization site is marked on the anatomy
  SET('encephalopathy', 'slides.embolize.mark', { edges: ['C6'], label: 'Embolized splenorenal shunt', kind: 'treat' }),
  // TIPS Doppler 9 (the reviewer's suggestion, built): the three main portal vein velocities side by side, from the model's own slides
  SET('tips-doppler', 'slides.backup.line', 'Upstream of the stenosed stent, main portal vein velocity falls again, to {pvVel}: it was {pvVel@mpv} with the patent stent and {pvVel@before} before the TIPS, and the varices refill.'),
  // Lowering portal pressure 5 (the reviewer's suggestion, built): the before and the after HVPG in the words, whichever drug is on
  P('treatment', 'slides.prop.line', 'the HVPG to {hvpg}.', 'the HVPG from {hvpg@target} to {hvpg}.'),
  P('treatment', 'slides.carv.line', 'the HVPG falls further, to {hvpg},', 'the HVPG falls further, from {hvpg@target} to {hvpg},'),
  P('treatment', 'slides.carv-sin.line', 'so the HVPG falls to {hvpg}.', 'so the HVPG falls from {hvpg@target} to {hvpg}.'),
  // Albumin 3: the threshold and the dose rule stand apart from the serum albumin (AASLD 2021)
  SET('albumin', 'slides.tap.line', 'LVP drains the ascites to {asc}. After a paracentesis of more than 5 L, albumin is recommended at {6 to 8 g} per liter removed. His serum albumin ({salb}) is a separate reading and does not set the dose.'),
  // Ascites 6: combined lymph, and a balance that holds
  SET('ascites', 'slides.balance.line', 'At two months, lymph production (hepatic and intestinal together) exceeds lymphatic capacity. The leak beyond it enters the peritoneum, and peritoneal reabsorption returns almost all of it, so the ascites grows only slowly at this point.'),
  APPEND('ascites', 'slides.balance.notes', 'At this time point the two nearly match, so the ascites grows only slowly; a wider gap between them, as after a paracentesis, is what makes it grow or shrink fast.'),
  // Ascites 7: both albumins from the same sampling, the SAAG as supporting portal hypertensive physiology, the protein as the cardiac pointer
  SET('ascites', 'slides.saag.line', 'On one diagnostic paracentesis the serum albumin is {salb} and the ascitic albumin {aalb}, so the serum–ascites albumin gradient (SAAG) is {saag}. A SAAG ≥1.1 g/dL supports portal hypertensive physiology as the cause, and the ascitic total protein ({tp}) helps tell cirrhotic ascites from cardiac.'),
  SET('ascites', 'slides.saag.title', 'A SAAG ≥1.1 g/dL supports portal hypertension as the cause'),
];

/** Capture 6ec6d323 (24 Nov 2026): the words match what the figure draws. */
export const CAPTURE_6EC6D323 = [
  // Stiffness 5: the normal spleen's line is thin and solid in 3D, not dashed
  P('stiffness', 'slides.spleen.line', 'The dashed outline is a normal spleen.', 'The thin outline is a normal spleen.'),
];

// ---- capture af88a9c2 / 2b947e48 slide review (25 Nov 2026) ----
export const CAPTURE_AF88A9C2 = [
  // the clot slides name the junction, the right hepatic vein and the wedge, show the full clot, and read both ends of each line off the chart
  SET('prehepatic', 'slides.relation.labels', ['CONF', 'RHV', 'SIN_R']),
  SET('prehepatic', 'slides.relation.params', { thrombus: { PV_TRUNK: 1 } }),
  SET('prehepatic', 'slides.relation.tool.ends', true),
  SET('two-inflows', 'slides.relation.params', { thrombus: { PV_TRUNK: 1 } }),
  SET('two-inflows', 'slides.relation.tool.ends', true),
  // the carvedilol slide quotes the EVL-alone varix on its chart
  SET('next-bleed', 'slides.held.tool.refs', [{ line: 'varix', from: 'slough', text: 'EVL alone' }]),
  SET('treatment', 'slides.relation.tool.title', 'HVPG on the drug by HVPG before it'),
  SET('gastric-varices', 'slides.tips.cam', 'fit'),
  SET('variceal-bleed', 'slides.path.mark', { edges: ['C1a', 'C1b'], label: 'Banded varices', kind: 'treat' }),
  SET('two-inflows', 'slides.artery.mark', [{ edges: ['A_HEP'], label: 'Clot' }, { organ: 'liver', label: 'Sinusoidal flow {liver}', kind: 'note' }]),
  // the lobule two years after cure can be set against the lobule before it (the same cure's two states, on the slide's own camera)
  SET('cause-treated', 'slides.year2-lobule.compare', [{ label: 'Two years after', short: 'After', own: true }, { label: 'Before the cure', short: 'Before', preset: 'csph' }]),
  // the right atrium's reading is on the figure already: the cardiac output note repeated the instrument
  DROP('tips-complete', 'slides.heart.mark'),
];

/** Capture 52ef8e63 (24 Nov 2026): the figure carries the numbers and places the slide's words are about. */
export const CAPTURE_52EF8E63 = [
  // Landmark 12: the slide is about litres; the figure carried none
  SET('landmark-trials', 'slides.covered.mark', { organ: 'ascites', label: 'Ascites {asc}' }),
  // Tipping 6: the 12.4 on the card is the HVPG; the figure now reads it at the hepatic vein
  SET('tipping', 'slides.nocsph.mark', { edges: ['RHV_IVC'], label: 'HVPG {hvpg}' }),
  // TIPS complete 3: the four points on the figure, two places (the bleed's three, the ascites)
  // Variceal bleed 3: "blood pressure has fallen only slightly" needs the pressure on the monitor beside the heart rate
  SET('variceal-bleed', 'slides.tear.tool.bp', true),
  // Choose treatment 6: the thrombus that has resolved is drawn as the dashed outline of what the slide before had (its 60%)
  SET('choose-treatment', 'slides.a3-lumen.tool.was', 'a3'),
  SET('tips-complete', 'slides.indications.ghostStent', true),   // (the slide asks when to place a stent: the stent in the figure is drawn as a ghost, capture 52ef8e63 #17)
  SET('tips-complete', 'slides.indications.marks', [{ edges: ['C1a'], label: 'Bleed: preemptive, rescue, salvage' }, { organ: 'ascites', label: 'Ascites: elective' }]),
];

/** Capture 2a54261a (25 Nov 2026, iPhone): a beat monitor whose slide's words give the blood pressure shows it beside the heart rate, as Variceal bleed 3 does (tool.bp). The words said "blood pressure falls to 99/65 (76)" over a monitor with the heart rate alone. */
export const CAPTURE_2A54261A = [
  SET('variceal-bleed', 'slides.minutes.tool.bp', true),
  SET('variceal-bleed', 'slides.rebleed.tool.bp', true),
  SET('variceal-bleed', 'slides.failure.tool.bp', true),
  SET('variceal-bleed', 'slides.bridge.tool.bp', true),
  SET('gastric-varices', 'slides.bleed.tool.bp', true),
];

/** The wedge slide's lobule (25 Nov 2026, Mohammad, capture of slide 5/15 of Measuring HVPG and PPG): the Sinusoids name carries the sinusoidal pressure (`reads`, figure-calls.ts), and a callout
 *  on a sinusoid carries the wedged pressure the slide says approximates it, read from the same fingerprint as the patient card's WHVP tile. The callout's kind `wedge` is the colour the slide's own words give the sinusoids and the WHVP (amber), and the
 *  Sinusoids name beside it takes the same colour, so the two read together (Mohammad, 25 Nov: "both callouts highlighting the sinusoid pressure label with the number and the WHVP callout"). */
export const WEDGE_LOBULE_25NOV = [
  SET('hvpg', 'slides.wedge-sinusoid.callout', { at: 'sin', kind: 'wedge', label: 'WHVP {whvp}', reads: ['sin', 'cv'], lit: ['sin'] }),
];

/** Capture 15c31759 (24 Nov 2026, Mohammad: "do all review findings"). */
export const CAPTURE_15C31759 = [
  // Two lesions 5 ran the congestion 60 days, still easing (right atrium 26.7), and slide 9 holds the same two lesions at 90 (26.2): the same state read two numbers. Both now stand at the 90-day state.
  SET('two-lesions', 'slides.both.days', 90),
  // Two lesions 9 teaches "measure the IVC and right atrial pressures beside the gradients": the figure named the right atrium and the hepatic vein only
  // slide 9 is slide 5's patient: one state, one set of numbers (the engine's restoreStep), not the same lesions reached by another history
  SET('two-lesions', 'slides.together.sameAs', 'both'),
  SET('two-lesions', 'slides.measure.labels', ['CONF', 'RHV', 'IVCS', 'RA']),
];

export const SOURCE_PATCHES = [
  P('landmark-trials', 'slides.earlytips.line', 'to {ppg}, {<12 mmHg}, the reference after a TIPS', 'to {ppg}, under the {12 mmHg} reference after a TIPS'),
  P('tips-complete', 'slides.dysfunction.line', 'climbs back past {>=12 mmHg}, the variceal reference, and', 'climbs back past the {12 mmHg} variceal reference, and'),
  // ---- encephalopathy: "{ppg}, {<12 mmHg}, the variceal reference" read as a list of two readings; the cut-off is named as what it is (capture 572259fd, slides 10 and 13) ----
  P('encephalopathy', 'slides.tips.line', 'lowers the PPG to {ppg}, {<12 mmHg}, the variceal reference, and', 'lowers the PPG to {ppg}, under the {12 mmHg} variceal reference, and'),
  P('encephalopathy', 'slides.relation.line', 'the PPG is {ppg}, {<12 mmHg}, the variceal reference, and', 'the PPG is {ppg}, under the {12 mmHg} variceal reference, and'),
  // ---- stiffness: the two slides that set AASLD against Baveno VIII, rewritten as Baveno VIII alone (the comparison moves to the notes) ----
  SET('stiffness', 'slides.aasld.tool', { kind: 'path', of: 'first-visit', short: 'First-visit path', patient: { bmi: false, ant: false } }),
  SET('stiffness', 'slides.aasld.title', 'Between the two rules, her LSM and platelets leave her indeterminate'),
  SET('stiffness', 'slides.aasld.line', 'Her LSM is {lsm} and her platelet count {plt}: neither the rule-out nor the rule-in of Baveno VIII applies, so she is in the indeterminate zone until ANTICIPATE, NICER or an SSM >55 kPa decides.'),
  SET('stiffness', 'slides.aasld.notes', `This is the Baveno VIII first-visit algorithm again (Fig. 1, 1.15 to 1.17), lit for the same patient. CSPH is ruled out at an LSM ≤15 kPa with platelets ≥150,000/µL and ruled in at an LSM ≥25 kPa in viral and alcohol-associated disease and in MASLD with a BMI <30; between them, or with platelets <150,000/µL, is the indeterminate zone, until ANTICIPATE, NICER or an SSM >55 kPa decides (1.14, 1.16, 1.17). On the slide her LSM is about 21 kPa and her platelet count about 160,000/µL, so she is indeterminate. Case 3 below has the same LSM with platelets near 100,000/µL, and he is indeterminate too. For the speaker only, if asked about the US guidance: ${AASLD_RULE}`),
  SET('stiffness', 'slides.aasld.ask', ['A patient has an LSM of 22 kPa and platelets of 120,000/µL. Where does Baveno VIII place him?', 'In the indeterminate zone: it is not ≤15 kPa and not ≥25 kPa. ANTICIPATE ≥75%, NICER ≥75% or an SSM >55 kPa decides; if none does, re-evaluate in 12 months.']),
  SET('stiffness', 'slides.a3.title', 'Case 3: Baveno VIII leaves him indeterminate'),
  SET('stiffness', 'slides.a3.line', 'LSM is {lsm}, platelets {plt}. Neither Baveno VIII rule applies, so he is in the indeterminate zone.'),
  SET('stiffness', 'slides.a3.sides.1', { who: 'What decides it', text: 'ANTICIPATE ≥75% or an SSM >55 kPa rules CSPH in (1.14, 1.16), and an SSM <40 kPa spares the screening endoscopy (1.19). If none of them decides, re-evaluate in 12 months (1.17).' }),
  SET('stiffness', 'slides.a3.ask', ['An LSM of 21 kPa with platelets of 99,000/µL: what does Baveno VIII do?', 'He is indeterminate: re-evaluate in 12 months or add ANTICIPATE or an SSM; endoscopy only if he cannot take a beta-blocker (1.17, 1.19).']),

  // ---- cites and lines on screen: the source name leaves the slide (the notes already name it, or get it appended here) ----
  DROP('kidney', 'slides.arteries.cite'),
  P('kidney', 'slides.carv.cite', ' · AASLD 2024', ''),
  P('pregnancy', 'slides.before.ask.1', '; AASLD 2024 statement 55)', ')'),
  APPEND('pregnancy', 'slides.before.notes', 'AASLD 2024 statement 55 gives the EGD within the year before conception.'),
  P('pregnancy', 'checks.1.1', ' (AASLD 2024)', ''),
  P('pregnancy', 'slides.scope.cite', 'AASLD 2024 55, 56 · ', ''),
  P('pregnancy', 'slides.propranolol.cite', 'AASLD 2024 · ', ''),

  P('prehepatic', 'slides.anticoag.line', ' EASL 2025 reports recanalization in 39% of patients without cirrhosis.', ''),
  P('prehepatic', 'slides.anticoag-lumen.line', ' EASL 2025 reports recanalization in only 39% of patients without cirrhosis.', ''),
  P('prehepatic', 'slides.anticoag-lumen.ask.1', 'EASL 2025 reports the portal vein reopened in 39% of anticoagulated patients without cirrhosis.', 'in a minority of anticoagulated patients without cirrhosis does the portal vein reopen completely.'),
  P('prehepatic', 'slides.pvt-anticoag.line', ' EASL 2025 cites recanalization in 71% with anticoagulation and 42% without.', ''),

  P('albumin', 'objectives.2', 'give the AASLD 2021 doses', 'give the doses'),
  P('albumin', 'checks.3.1', ' (AASLD 2021, expert opinion)', ''),
  P('albumin', 'checks.4.1', ' (AASLD 2021)', ''),
  P('albumin', 'checks.5.1', ' (AASLD 2021)', ''),
  P('albumin', 'slides.ind.tool.verdict', ' Doses: AASLD 2021.', ''),
  P('albumin', 'slides.tap.ask.1', ' (AASLD 2021)', ''),
  P('albumin', 'slides.terli.ask.1', ' (AASLD 2021)', ''),
  APPEND('albumin', 'slides.terli.notes', 'Baveno VIII gives no albumin dose here; the dose of 1 g/kg on day 1 and then 40 to 50 g a day for the duration of therapy is AASLD 2021.'),
  P('ascites', 'slides.diuretics.ask.1', ' (EASL advises spironolactone alone for a first episode)', ''),

  P('carvedilol', 'slides.tips.line', 'AASLD 2024 then does not require a beta-blocker.', 'a beta-blocker is then no longer required.'),
  P('carvedilol', 'slides.tips.ask.1', 'Not by AASLD 2024: a beta-blocker', 'No: a beta-blocker'),
  P('endoscopy', 'slides.red.ask.1', ' (AASLD 2024)', ''),
  P('gastric-varices', 'slides.tips.ask.1', 'AASLD 2024 does not require a beta-blocker once', 'A beta-blocker is not required once'),
  P('gradients', 'checks.4.1', 'AASLD 2024 gives <12 mmHg as the gradient at which', 'A PPG <12 mmHg is the gradient at which'),

  P('same-gradient', 'checks.3.0', 'what does AASLD 2024 accept', 'what is accepted'),
  P('same-gradient', 'checks.3.1', ' (statement 6)', ''),
  P('two-lesions', 'checks.3.0', 'Which two pressures does AASLD 2024 add', 'Which two pressures are added'),
  P('two-lesions', 'slides.measure.ask.0', 'Which two pressures does AASLD 2024 add', 'Which two pressures are added'),

  P('tipping', 'slides.antibiotic.line', 'and the AASLD 2021 question his protein raises.', 'and the question his protein raises.'),
  APPEND('tipping', 'slides.antibiotic.notes', 'The question his ascitic protein raises, primary SBP prophylaxis, is covered by AASLD 2021 and is taken up on the next slide.'),
  P('tipping', 'slides.antibiotic-card.line', ': AASLD 2021 considers primary SBP prophylaxis if liver or kidney function is poor.', ', so primary SBP prophylaxis is considered if liver or kidney function is poor.'),
  P('tips-candidacy', 'checks.1.1', 'AASLD 2021 considers a MELD ≥18 a marker of poor outcome after TIPS.', 'a MELD ≥18 marks a poor outcome after TIPS.'),
  P('tips-candidacy', 'slides.rescue.ask.0', ' in AASLD 2024?', '?'),
  P('tips-complete', 'checks.3.1', ' (AASLD 2021)', ''),
  P('tips-complete', 'slides.baseline.cite', ' or AASLD 2024', ''),
  P('variceal-bleed', 'slides.path2.ask.1', '(AASLD 2024).', '(Baveno VIII 5.35, 5.36, 4.13).'),
  P('varices', 'slides.summary.ask.1', ' (AASLD 2024)', ''),

  // ---- the velocity lens's colours (ramp F, 22 Nov 2026: scripts/../src/scene/lenses/velocity-ramp.ts): the note names what the figure draws now ----
  P('tips-doppler', 'slides.before.notes', 'pale sand when slower, teal when normal and violet when faster', 'indigo when slower, teal when normal and coral when faster'),

  // ---- the outflow deck, SOS wedge slide (23 Nov 2026, Outflow review item 3): the line read "the HVPG is 10.3 mmHg, ≥10 mmHg." (a reading, then a cut-off with no word between them). Said once, in words. ----
  P('outflow', 'slides.soswedge.line', 'the HVPG is {hvpg}, {>=10 mmHg}.', 'the HVPG is {hvpg}, above the {10 mmHg} cut-off.'),

  // ---- the prehepatic deck, review of 23 Nov 2026 (capture 58722f12) ----
  // 3: the PPG curve started from the healthy patient (no volume expansion), so it ended near 26 while the slide's own reading, and every slide's text, say 27.3 at complete occlusion. With no
  //    patient of its own the curve runs on the slide's own state (pvt-acute), so its last point IS the reading the words print. The words no longer claim one HVPG value for three different
  //    model states (acute 1.9, recanalized 2.2, healthy 2.3): the HVPG stays normal, and the text says what it reads where it is read.
  DROP('prehepatic', 'slides.relation.tool.patient'),
  P('prehepatic', 'slides.relation.line', 'The HVPG stays near {hvpg} throughout.', 'The HVPG stays normal throughout, and is {hvpg} at occlusion.'),
  P('prehepatic', 'checks.3.0', 'and the HVPG stays at {hvpg@anticoag}.', 'and the HVPG stays normal, {hvpg@clot} before and {hvpg@anticoag} after.'),
  P('prehepatic', 'checks.3.1', 'so the HVPG did not change.', 'so the HVPG did not respond.'),
  // 4: the title said "unchanged" over numbers that fall from 11.1 to 8.7 (carvedilol, then the vein reopening)
  P('prehepatic', 'slides.course.title', 'Portal pressure tracked the thrombus while the HVPG was unchanged', 'Portal pressure tracked the thrombus; the HVPG did not follow it'),
  // 1: the summary table's finding line under each name (the approved one-line-per-case layout), one short finding per case
  SET('prehepatic', 'slides.summary.note', ['Finding']),
  SET('prehepatic', 'slides.summary.of.0.note', ['Normal portal flow']),
  SET('prehepatic', 'slides.summary.of.1.note', ['Portal vein occluded']),
  SET('prehepatic', 'slides.summary.of.2.note', ['Collaterals around the occlusion']),
  SET('prehepatic', 'slides.summary.of.3.note', ['CSPH, slow portal flow']),
  SET('prehepatic', 'slides.summary.of.4.note', ['Thrombus over half the lumen']),
  SET('prehepatic', 'slides.summary.of.5.note', ['Portal vein recanalized']),
  // 5: the criteria card's title ran to three lines and crowded the card
  P('prehepatic', 'slides.untreated.title', 'Untreated PVT is monitored, then anticoagulated or treated with TIPS', 'Untreated PVT is monitored, then treated'),
  // 6: what the speaker notes carried and the screen never said (all from the deck's own notes: Baveno VIII 9.4, 9.5, 9.11 and the anticoagulant choice)
  APPEND('prehepatic', 'slides.path-pvtdur.line', 'Finding them is the work-up of a first PVT: a myeloproliferative neoplasm (test for JAK2), an inherited thrombophilia, local inflammation or surgery, and cirrhosis (9.4, 9.5).'),
  APPEND('prehepatic', 'slides.carv.line', 'Then choose the anticoagulant by liver function: low-molecular-weight heparin or a vitamin K antagonist, or a DOAC in Child-Pugh A and with caution in B, not in C.'),
  P('prehepatic', 'slides.course.ask.1', 'not by the HVPG, which is unchanged.', 'not by the HVPG, which does not follow the thrombus.'),
  P('prehepatic', 'slides.cavernoma.line', 'Varices develop.', 'Varices develop: look for them with endoscopy and treat them as in cirrhosis, with a nonselective beta-blocker or band ligation.'),
  // ---- the lobule's schistosomiasis slide (23 Nov 2026, Lobule deck review): the sinusoidal pressure there reads 9.4 to 9.5 mmHg, which the gauge rates High (9 and over, the sinusoids' own cut-off, table-marks.js RATE.sin),
  //      so a title saying it "stays normal" contradicted the card beside it. The slide's point is the contrast with the portal vein (20 mmHg), and the words now say that. The speaker notes keep the teaching sentence. ----
  P('lobule', 'slides.wedge-sinusoid.title', 'the sinusoidal pressure stays normal', 'the sinusoidal pressure stays well below the portal pressure'),
  P('lobule', 'slides.wedge-sinusoid.line', 'keeps the sinusoidal pressure at {sin} while the portal pressure is high.', 'holds the sinusoidal pressure to {sin} while the portal pressure is {pv}.'),

  // ---- hvpg, 23 Nov 2026 (Mohammad: "slide 8/15 in HVPG PPG is missing a case card?", then "sure" to these words): the portal vein thrombosis slide changes patient and had no case card
  SET('hvpg', 'slides.ppg.vignette', 'A 41-year-old man has had variceal bleeding. His liver tests are normal, and imaging shows a chronic portal vein thrombus.'),
  P('hvpg', 'slides.ppg.line', 'In another patient, imaging shows a portal vein thrombus. The HVPG stays normal', 'The HVPG stays normal'),   // (the case card now says it: 23 Nov, "Yes")

  // ---- the TIPS Doppler deck, review of 23 Nov 2026 (capture 5f2dbfd3). The same patches are also applied to the copied file by scripts/apply-tips-doppler-review.mjs, so the copy and a re-copy agree. ----
  ...TIPS_DOPPLER_REVIEW,
  ...VARICES_REVIEW,
  ...HA_RI_REVIEW,
  ...REVIEWER_24NOV,
  ...REVIEWER_24NOV_B,
  ...REVIEWER_24NOV_C,
  ...REVIEWER_24NOV_D,
  ...REVIEWER_24NOV_E,
  ...CAPTURE_6EC6D323,
  ...CAPTURE_AF88A9C2,
  ...CAPTURE_52EF8E63,
  ...CAPTURE_15C31759,
  ...CAPTURE_2A54261A,
  ...WEDGE_LOBULE_25NOV,
];

function step(node, key) {
  if (Array.isArray(node)) return /^\d+$/.test(key) ? +key : node.findIndex((x) => x && x.id === key);
  return key;
}

/** The deck's JSON text with the source patches of its talk applied (a talk that has none comes back as it was). */
export function sourceEdits(json, patches = SOURCE_PATCHES) {
  const probe = JSON.parse(json);
  const mine = patches.filter((p) => p.deck === probe.id);
  if (!mine.length) return json;
  const indent = /^\{\n( +)/.exec(json)?.[1].length ?? 1;
  const deck = probe;
  for (const p of mine) {
    const keys = p.at.split('.');
    let node = deck;
    for (const k of keys.slice(0, -1)) {
      const i = step(node, k);
      if (i === -1 || node[i] === undefined) throw new Error(`source-edits: ${p.deck} has nothing at ${p.at} (the 2D deck moved; look at this patch again)`);
      node = node[i];
    }
    const last = step(node, keys[keys.length - 1]);
    if (last === -1 || (node[last] === undefined && !('set' in p))) throw new Error(`source-edits: ${p.deck} has nothing at ${p.at} (the 2D deck moved; look at this patch again)`);
    if (p.after) { if (!Array.isArray(node)) throw new Error(`source-edits: ${p.deck} ${p.at} is not in a list`); node.splice(last + 1, 0, p.set); }
    else if ('set' in p) node[last] = p.set;
    else if (p.drop) { if (Array.isArray(node)) node.splice(last, 1); else delete node[last]; }
    else if (p.append !== undefined) node[last] = `${node[last]}${/[.!?]$/.test(node[last]) ? ' ' : '. '}${p.append}`;
    else {
      if (typeof node[last] !== 'string' || !node[last].includes(p.from)) throw new Error(`source-edits: ${p.deck} ${p.at} does not hold ${JSON.stringify(p.from)} (the 2D text moved; look at this patch again)`);
      node[last] = node[last].split(p.from).join(p.to);
    }
  }
  return JSON.stringify(deck, null, indent);
}

// ---- the app's own words (About, the menu's thresholds line, the tile help, the chart gallery) ----
// Same rule as the talks: Baveno VIII is the only guideline named on screen. The generators of those files call uiTextEdits() on the text they are about to write
// (gen-ui-strings, copy-about, copy-presenter, copy-b11, copy-chart-catalog, copy-chart-path). About's reference list keeps its citations (a citation is not guidance).
const UI_EDITS = [
  // (the dye was taken out of the 3D app, 24 Nov 2026, docs/approved/dye.md: its shortcut row and its sentence in the Blood help go)
  [' Tap a vessel and use Inject dye on its card (or press J; hold for longer) to watch dye travel and split.', ''],
  ['  {\n   "group": "Run the model",\n   "keys": "J",\n   "what": "Inject dye (hold for longer)"\n  },\n', ''],
  ['the directly measured portosystemic gradient (AASLD 2024).', 'the directly measured portosystemic gradient.'],
  ['The presentations follow Baveno VIII (J Hepatol, 2026), with AASLD guidance where US practice differs, for example the vasoactive drug and the antibiotic in variceal bleeding.', 'The presentations follow Baveno VIII (J Hepatol, 2026). Where it is silent, for example on doses, the speaker notes name the source.'],
  ['Baveno VIII consensus on portal hypertension (2026); AASLD guidance on risk stratification and management of portal hypertension and varices in cirrhosis (2024). Thresholds', 'Baveno VIII consensus on portal hypertension (2026). Thresholds'],
  ['the WSACS definition.', 'the definition used for the abdominal compartment syndrome.'],
  ['  {"id":"path/aasld",', null],   // (a gallery row: the whole line goes)
  ["import aasld from './algos/aasld.generated.js';\n", ''],
  [' pvtdur, aasld, psvdscore,', ' pvtdur, psvdscore,'],
  [" aasld: 'Rule of five',", ''],
  ["tup('mid', 'cACLD')", "tup('mid', 'Suggests cACLD')"],
  // (the ascites grades are clinical, from the examination, not from a volume: the tile, the gauge and the About table say the size of the volume only; the reviewer, 24 Nov 2026)
  ["tup('mid', 'Grade 1')", "tup('mid', 'Small')"],
  ["tup('hi', 'Grade 2')", "tup('hi', 'Moderate')"],
  ["tup('hi', 'Grade 3')", "tup('hi', 'Large')"],
  ["so \"5.0 L\" is Grade 3 and", "so \"5.0 L\" is Large and"],
  ["Free intraperitoneal fluid. Grade 1 is detectable only on ultrasound, grade 2 is moderate, grade 3 is tense.", "Free intraperitoneal fluid. The word is the size of the volume only: the clinical grade (1 on ultrasound only, 2 moderate symmetric distension, 3 marked distension) comes from the examination, not from the volume."],
  ["const ASCITES_WORDS = ['None', 'Grade 1', 'Grade 2', 'Grade 3'];", "const ASCITES_WORDS = ['None', 'Small', 'Moderate', 'Large'];"],
  ["export const GRADE = ['None', 'Grade 1', 'Grade 2', 'Grade 3'];", "export const GRADE = ['None', 'Small', 'Moderate', 'Large'];"],
  ["export const GRADE_TIP = ['No free fluid', 'Grade 1: seen on ultrasound only', 'Grade 2: moderate, symmetric distension', 'Grade 3: tense, marked distension'];", "export const GRADE_TIP = ['No free fluid', 'A small volume of free fluid', 'A moderate volume of free fluid', 'A large volume of free fluid'];"],
  ["\"Grade 1\"\n", "\"Small\"\n"],
  ["\"Grade 2 or 3\"\n", "\"Moderate or large\"\n"],
  [", varix: 'Varix', gv: 'Fundal',", ", varix: 'Esophageal varix', gv: 'Fundal varix',"],   // (two varices in one table: each header names its site; Gastric varices 13, reviewer 24 Nov 2026)
  ["n: 'HE risk index'", "n: 'Model HE index'"],
  ["he: { t: 'Encephalopathy risk', n: 'Model HE index'", "he: { t: 'Model HE index', n: 'Model HE index'"],   // (the reading's own name too: "Model HE index, 0–1", never a clinical-sounding "risk"; reviewer 24 Nov 2026, Same gradient 6)
  ["he: 'HE risk'", "he: 'Model HE index'"],
  [", rpp: 'APP',", ", rpp: 'APP', iap: 'IAP',"],   // (Kidney 12: the abdominal perfusion pressure table shows MAP, IAP and APP)
  [" rpp: 0, hr: 0,", " rpp: 0, iap: 1, hr: 0,"],   // (the model's own index, said so: Encephalopathy 8, reviewer 24 Nov 2026)
  ["tup('mid', 'Borderline')", "tup('mid', 'Likely cACLD')"],   // (an LSM of 15 to 25 kPa makes cACLD highly likely, Baveno VIII 1.3; "Borderline" did not say what; the reviewer, 24 Nov 2026)
  ["lsm: { t: 'Liver stiffness', n: 'Stiffness',", "lsm: { t: 'Liver stiffness', n: 'Liver stiffness',"],
  ["lsm: '↑ 10 to 25, ↑↑ ≥25 kPa'", "lsm: '↑ 10 to 25, ↑↑ ≥25 kPa (rules in CSPH; in MASLD only with BMI <30)'"],   // (an LSM of 10 to 15 kPa suggests cACLD, Baveno VIII 1.3; the reviewer, 24 Nov 2026)
];
/** Charts the 3D app does not carry because they teach a guideline other than Baveno VIII (a path algorithm file of 2D's path-algos). */
export const RETIRED_PATH_ALGOS = ['aasld'];

/** A generated UI file's text with the Baveno-only edits put in (an edit the file does not hold is skipped). */
export function uiTextEdits(text) {
  let out = text;
  for (const [from, to] of UI_EDITS) {
    if (to !== null) { out = out.split(from).join(to); continue; }
    out = out.split('\n').filter((l) => !l.startsWith(from)).join('\n');
  }
  return out;
}
