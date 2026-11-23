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

const AASLD_RULE = 'AASLD 2024 (guidance statement 7) uses a different rule of five from the same two numbers: CSPH is presumed at an LSM ≥25 kPa regardless of the platelet count, at 20 to 24.9 kPa with platelets <150,000/µL, or at 15 to 19.9 kPa with platelets <110,000/µL; it is excluded at an LSM <15 kPa with platelets ≥150,000/µL; all other combinations are indeterminate, and SSM or the HVPG can decide. So AASLD presumes CSPH where Baveno VIII stays indeterminate at 20 to 25 kPa with platelets <150,000/µL and at 15 to 20 kPa with platelets <110,000/µL, and at exactly 15 kPa Baveno VIII rules CSPH out where AASLD does not. AASLD advises caution with its rule in MASLD with obesity, an ALT >3 times the upper limit of normal, and primary sclerosing cholangitis with a dominant stricture, where it is less well calibrated.';


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

export const SOURCE_PATCHES = [
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

  // ---- the TIPS Doppler deck, review of 23 Nov 2026 (capture 5f2dbfd3). The same patches are also applied to the copied file by scripts/apply-tips-doppler-review.mjs, so the copy and a re-copy agree. ----
  ...TIPS_DOPPLER_REVIEW,
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
    if ('set' in p) node[last] = p.set;
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
  ['the directly measured portosystemic gradient (AASLD 2024).', 'the directly measured portosystemic gradient.'],
  ['The presentations follow Baveno VIII (J Hepatol, 2026), with AASLD guidance where US practice differs, for example the vasoactive drug and the antibiotic in variceal bleeding.', 'The presentations follow Baveno VIII (J Hepatol, 2026). Where it is silent, for example on doses, the speaker notes name the source.'],
  ['Baveno VIII consensus on portal hypertension (2026); AASLD guidance on risk stratification and management of portal hypertension and varices in cirrhosis (2024). Thresholds', 'Baveno VIII consensus on portal hypertension (2026). Thresholds'],
  ['the WSACS definition.', 'the definition used for the abdominal compartment syndrome.'],
  ['  {"id":"path/aasld",', null],   // (a gallery row: the whole line goes)
  ["import aasld from './algos/aasld.generated.js';\n", ''],
  [' pvtdur, aasld, psvdscore,', ' pvtdur, psvdscore,'],
  [" aasld: 'Rule of five',", ''],
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
