// The twelve model patients' courses (the Histories tab), written as the steps a clinician takes, in Baveno VIII's order: what is tried first, what is added when it fails, what is done
// when that is not enough. Each is played on the real engine by scripts/gen-histories.mjs (play.ts): the numbers, the events and the days are the model's, never typed here.
//   Bleed: carvedilol once portal hypertension is clinically significant; a bleed despite it is a vasoactive drug and a band the same day; a pre-emptive TIPS within 72 hours for a patient at
//          high risk of rebleeding.
//   Ascites: diuretics, then large-volume paracentesis with albumin, and a TIPS when the fluid keeps coming back (refractory ascites).
//   Acute portal vein thrombosis: anticoagulation at once.
//   Budd-Chiari: anticoagulation, then angioplasty of a hepatic vein that can be opened (a TIPS only when that is not enough).
//   TIPS that has narrowed: the stent's lumen closes over months, the gradient and the fluid come back; Doppler shows it.
//   Bleed, TIPS in 24 hours: a Child-Pugh B patient with active bleeding at endoscopy: a vasoactive drug, a band, and a pre-emptive TIPS within 72 hours (the sooner the better).
//   Hepatitis C cured: carvedilol for clinically significant portal hypertension, a direct-acting antiviral, a sustained response; the gradient eases but stays over 10, so the beta-blocker goes on.
//   Alcohol, abstinent: the cause removed, the fibrosis regresses, the fluid goes, diuretics stop, and a year without complications is recompensation.
//   PSVD: large varices and a first bleed with a normal HVPG; the gradient from the portal vein, not the wedged pressure, tells the story. Secondary prophylaxis: a beta-blocker and banding to eradication.
//   BRTO: a bleeding gastric varix, the shunt it drains by closed; the esophageal varices that follow are the price, treated like any other.
//   Pregnancy: portal pressure rises with the blood volume; a beta-blocker and banding in the second trimester, delivery at term.
//   Cardiac cirrhosis: congestion from a failing right heart; diuretics, then the valve and the heart treated; the HVPG stays normal throughout.
//   (A course's `still` look is on for those where the fluid must follow only the disease and the treatments: types.ts.)
import type { Course } from './types.ts';
import type { CaseLook } from '../case/types.ts';

/** Antibiotic prophylaxis is part of every variceal bleed's first hour (Baveno VIII: ceftriaxone, 1 g a day, for up to 7 days), whoever bleeds and wherever: each course's vasoactive step says it, and
 *  tests/bleed-bundle.test.ts keeps that true of every course that has a bleed. */
export const ANTIBIOTICS = 'Antibiotic prophylaxis from the start: ceftriaxone, 1 g a day, for up to 7 days.';

/** "Look closer here" at a stop (ui/case): the Tests cards a course opens (tests/panes.ts PaneId; tests/case-shots.test.ts keeps every one real). */
const L = {
  endoscopy: { tool: 'endoscopy', label: 'Endoscopy' },
  hvpg: { tool: 'hvpg', label: 'HVPG' },
  hvpgNormal: { tool: 'hvpg', label: 'HVPG, normal here' },
  acrossStent: { tool: 'hvpg', label: 'Pressures across the stent' },
  stiffness: { tool: 'fibroscan', label: 'Liver stiffness' },
  ascites: { tool: 'abdomen', label: 'Ascites' },
  doppler: { tool: 'doppler', label: 'Doppler' },
  dopplerPv: { tool: 'doppler', label: 'Doppler of the portal vein' },
  along: { tool: 'profile', label: 'Pressure along the circuit' },
  overTime: { tool: 'scope', label: 'Pressure over time' },
} satisfies Record<string, CaseLook>;

export const COURSES: readonly Course[] = [
  {
    id: 'hist-bleed', name: 'Cirrhosis, first bleed', group: 'After a bleed', where: 'Varices and banding',
    chapters: [{ label: 'Before treatment' }, { at: 'carvedilol', label: 'On carvedilol' }, { at: 'bleed', label: 'The bleed' }, { at: 'tips', label: 'After the TIPS' }],
    preset: 'cirr-comp', days: 120, init: { nsbbGain: 0.45 },
    ramps: [{ key: 'cirrhosis', from: 0, to: 55, a: 0.4, b: 0.86 }],
    quiet: ['cirrhosis', 'albumin'],
    steps: [
      { day: 19, id: 'carvedilol', set: { drugs: { carvedilol: true } }, detail: 'Started once the portal hypertension was clinically significant.' },
      { day: 70, id: 'bleed', act: 'bleed' },
      { day: 70, id: 'vasoactive', set: { drugs: { terlipressin: true } }, label: 'Terlipressin', detail: `A vasoactive drug for the bleed, for three days. ${ANTIBIOTICS}` },
      { day: 70, id: 'band', act: 'band', detail: 'Endoscopic band ligation at the first endoscopy.' },
      { day: 73, id: 'tips', set: { drugs: { terlipressin: false, carvedilol: false }, tips: { on: true, d: 8 } },
        detail: 'Pre-emptive, within 72 hours of the bleed: a patient at high risk of rebleeding. The beta-blocker is not needed with a TIPS.' },
    ],
    story: 'On carvedilol from Day {carvedilol}, the patient bled on Day {bleed}. A vasoactive drug and a band the same day, then a pre-emptive TIPS on Day {tips}.',
    path: 'Carvedilol, a bleed, banding, TIPS',
    state: ['tips', 'ppg', 'meds'],
    // (the case: an HVPG and a stiffness for the gradient crossing 10, the scope for the varices and the bleed, the pressure along the circuit and the stent's Doppler at the TIPS)
    play: { stops: [
      { at: { day: 18 }, look: [L.hvpg, L.stiffness] },
      { at: { day: 40 }, look: [L.endoscopy] },
      { at: 'tips', look: [L.along, L.doppler] },
    ] },
  },
  {
    id: 'hist-ascites', name: 'Refractory ascites', group: 'Ascites', where: 'Fluid in the abdomen',
    chapters: [{ label: 'On diuretics' }, { at: 'tap1', label: 'Taps, and the fluid returns' }, { at: 'tips', label: 'After the TIPS' }],
    preset: 'cirr-decomp', days: 150,
    quiet: ['albumin'],
    settle: 14,
    steps: [
      { day: 35, id: 'tap1', act: 'paracentesis' },
      { day: 65, id: 'tap2', act: 'paracentesis' },
      { day: 95, id: 'tap3', act: 'paracentesis' },
      { day: 110, id: 'tips', set: { tips: { on: true, d: 8 } }, detail: 'The fluid came back after every tap, on diuretics: refractory ascites.' },
    ],
    story: 'Diuretics from the start, and the fluid still came back: a large tap with albumin on Day {tap1}, {tap2} and {tap3}. A TIPS on Day {tips}.',
    path: 'Diuretics, paracentesis, TIPS',
    state: ['tips', 'ascites', 'meds'],
    // (a tap stays on the whole body, as its default does: the Ascites card says how much fluid there is and how fast it comes back)
    play: { stops: [
      { at: { day: 0 }, look: [L.ascites] },
      { at: 'tap1', look: [L.ascites] },
      { at: 'tap2', look: [L.ascites] },
      { at: 'tap3', look: [L.ascites] },
      { at: 'tips', look: [L.ascites, L.along] },
    ] },
  },
  {
    id: 'hist-pvt', name: 'Acute portal vein thrombosis', group: 'Clots and outflow', where: 'Portal vein and hepatic veins',
    chapters: [{ label: 'A fresh clot' }, { at: 'anticoag', label: 'On anticoagulation, the clot clears' }],
    preset: 'pvt-acute', days: 105,
    quiet: ['thr:'],
    steps: [
      { day: 1, id: 'anticoag', set: { anticoag: true }, detail: 'Started at once, and kept up while the clot clears.' },
    ],
    story: 'A fresh clot in the main portal vein. Anticoagulation from Day {anticoag}; the clot slowly clears and the pressure comes down.',
    path: 'Anticoagulation, the clot clears',
    state: ['clot', 'ppg', 'meds'],
    // (the clot is in the main portal vein: the case looks at it from the start, through the anticoagulation, to today, when it has cleared)
    play: { stops: [
      { at: { day: 0 }, cam: 'portal', look: [L.dopplerPv] },
      { at: 'anticoag', cam: 'portal', look: [L.dopplerPv] },
      { at: { day: 4 }, look: [L.endoscopy] },
      { at: { day: 105 }, cam: 'portal', look: [L.dopplerPv] },
    ] },
  },
  {
    id: 'hist-bcs', name: 'Budd-Chiari syndrome', group: 'Clots and outflow', where: 'Portal vein and hepatic veins',
    chapters: [{ label: 'Three hepatic veins blocked' }, { at: 'anticoag', label: 'On anticoagulation' }, { at: 'angioplasty', label: 'After the angioplasty' }],
    preset: 'budd-chiari', days: 150,
    quiet: ['thr:', 'albumin'],
    settle: 14,
    steps: [
      { day: 2, id: 'anticoag', set: { anticoag: true }, detail: 'Started at once.' },
      { day: 60, id: 'angioplasty', set: { thrombus: { RHV_IVC: 0 } }, label: 'Angioplasty, right hepatic vein', detail: 'A short block opened with a balloon; the other two hepatic veins stay blocked.' },
    ],
    story: 'All three hepatic veins blocked. Anticoagulation from Day {anticoag}, then an angioplasty of the right hepatic vein on Day {angioplasty}.',
    path: 'Anticoagulation, angioplasty',
    state: ['ascites', 'ppg', 'meds'],
    // (the block is in the hepatic veins: the case looks at them, not at the portal flow, from the start to today)
    play: { stops: [
      { at: { day: 0 }, cam: 'hepatic', look: [L.doppler, L.ascites] },
      { at: 'anticoag', cam: 'hepatic', look: [L.doppler] },
      { at: 'angioplasty', look: [L.doppler, L.ascites] },
      { at: { day: 150 }, cam: 'hepatic', look: [L.doppler, L.ascites] },
    ] },
  },
  {
    id: 'hist-tips-narrowed', name: 'TIPS that has narrowed', group: 'After a TIPS', where: 'Follow-up',
    chapters: [
      { label: 'Ascites on diuretics' },
      { at: 'tips', label: 'The TIPS holds the fluid' },
      { at: { ramp: 'stenosis.TIPS' }, label: 'The stent narrows' },
      { at: 'doppler', label: 'Doppler finds it' },
    ],
    preset: 'cirr-decomp', days: 190,
    // (0.65, not 0.5, since hales-engine b95ecb5: the shunts of advanced cirrhosis stay open months after a TIPS, so a stent narrowed by half left the
    // gradient at 11.3; narrowed by about two thirds it is back over 12 at the end, as the course says.)
    ramps: [{ key: 'stenosis.TIPS', from: 50, to: 185, a: 0, b: 0.65 }],
    quiet: ['sten:', 'albumin'],
    settle: 14,
    steps: [
      { day: 10, id: 'tips', set: { tips: { on: true, d: 8 } }, detail: 'For ascites that diuretics did not control.' },
      { day: 140, id: 'doppler', note: { title: 'Doppler shows a narrowed TIPS', detail: 'Slow flow through the stent, and the fluid is coming back.', sev: 'caution' } },
    ],
    story: 'A TIPS on Day {tips} for fluid that diuretics did not control. Months later the stent narrows and the pressure and the fluid climb back; Doppler shows it on Day {doppler}.',
    path: 'TIPS, then the stent narrows',
    state: ['tips', 'ppg', 'ascites'],
    // (the Doppler's day opens the Doppler and the pressures across the stent; today stands on the narrowed stent)
    play: { stops: [
      { at: 'tips', look: [L.ascites, L.along] },
      { at: 'doppler', look: [L.doppler, L.acrossStent] },
      { at: { day: 190 }, view: 'circuit', cam: 'tips', look: [L.doppler, L.acrossStent] },
    ] },
  },

  {
    id: 'hist-bleed-tips', name: 'Bleed, TIPS in 24 hours', group: 'After a bleed', where: 'Varices and banding',
    chapters: [{ label: 'Before the bleed' }, { at: 'bleed', label: 'The bleed' }, { at: 'tips', label: 'After the TIPS' }, { at: 'confusion', label: 'Confusion, treated' }],
    preset: 'cirr-decomp', days: 150, init: { albumin: 3.1 },
    quiet: ['albumin'], still: true, settle: 8,
    steps: [
      { day: 10, id: 'bleed', act: 'bleed' },
      { day: 10, id: 'vasoactive', set: { drugs: { terlipressin: true } }, label: 'Terlipressin', detail: `2 mg every 4 hours for the first 48 hours, then 1 mg every 4 hours, for up to 5 days. ${ANTIBIOTICS} A restrictive transfusion (hemoglobin 7 to 8 g/dL) alongside.` },
      { day: 10, id: 'band', act: 'band', detail: 'Endoscopy within 12 hours: a spurting varix, banded. Active bleeding at endoscopy in a Child-Pugh B patient is a reason for a pre-emptive TIPS.' },
      { day: 11, id: 'tips', set: { drugs: { terlipressin: false }, tips: { on: true, d: 8 } },
        detail: 'A covered 8 mm TIPS within 24 hours of the bleed (Baveno VIII: within 72 hours, the sooner the better) for a Child-Pugh B patient who was bleeding at endoscopy. The vasoactive drug stops; no beta-blocker is needed with a TIPS.' },
      { day: 45, id: 'confusion', note: { title: 'Confusion after the TIPS', detail: 'Hepatic encephalopathy, grade 2, in the first weeks: lactulose, titrated to two or three soft stools a day. The stent stays at 8 mm because it cleared.', sev: 'caution' } },
    ],
    story: 'A first variceal bleed, Child-Pugh B, still bleeding at endoscopy. A vasoactive drug and a band on Day {bleed}, a covered TIPS on Day {tips}. Confusion on Day {confusion} cleared with lactulose.',
    path: 'Bleed, band, TIPS the next day',
    state: ['tips', 'ppg', 'ascites'],
    // (the confusion is the gut's blood going round the liver through the stent: the slides' own first-pass shot of the liver, as the encephalopathy deck takes it)
    play: { stops: [
      { at: 'tips', look: [L.along, L.doppler] },
      { at: 'confusion', cam: 'liver', lens: 'firstpass' },
    ] },
  },
  {
    id: 'hist-hcv', name: 'Hepatitis C cured, pressure persists', short: 'HCV cured, PH persists', group: 'Cause removed', where: 'After the cause is treated',
    chapters: [{ label: 'Before treatment' }, { at: 'carvedilol', label: 'On carvedilol' }, { at: 'daa', label: 'Antiviral treatment' }, { at: 'svr', label: 'Cured, the pressure persists' }],
    preset: 'csph', days: 600, init: { cirrhosis: 0.7, nsbbGain: 0.5 },
    ramps: [{ key: 'cirrhosis', from: 90, to: 480, a: 0.7, b: 0.62 }],
    quiet: ['cirrhosis', 'albumin'], still: true, settle: 14,
    steps: [
      { day: 14, id: 'carvedilol', set: { drugs: { carvedilol: true } }, detail: 'Compensated cirrhosis with clinically significant portal hypertension: 6.25 mg a day, then 6.25 mg twice a day (12.5 mg a day) after three days, if the systolic pressure stays above 90.' },
      { day: 60, id: 'daa', note: { title: 'Antiviral treatment started', detail: 'Sofosbuvir and velpatasvir, once a day for 12 weeks. A direct-acting antiviral is safe in compensated cirrhosis.', sev: 'ok' } },
      { day: 228, id: 'svr', note: { title: 'Cured (SVR12)', detail: 'No virus in the blood 12 weeks after the last dose. The cause is gone and the liver slowly softens, but the portal pressure can stay raised.', sev: 'ok' } },
    ],
    story: 'Compensated hepatitis C cirrhosis with clinically significant portal hypertension, on carvedilol from Day {carvedilol}. Cured by Day {svr}. The gradient eases but stays over 10, so the carvedilol goes on.',
    path: 'Carvedilol, a cure, the pressure stays',
    state: ['hvpg', 'ppg', 'meds'],
    // (the antiviral treats the liver; the cure is seen where the pressure persists, the sinusoid in its lobule; the HVPG and the stiffness say how far it eased)
    play: { stops: [
      { at: { day: 0 }, look: [L.hvpg, L.stiffness] },
      { at: 'daa', cam: 'liver', look: [L.stiffness] },
      { at: 'svr', view: 'lobule', cam: 'lobule:sinusoid', look: [L.hvpg, L.stiffness] },
      { at: { day: 600 }, look: [L.hvpg, L.stiffness] },
    ] },
  },
  {
    id: 'hist-alcohol', name: 'Alcohol cirrhosis, recompensated', short: 'Alcohol, recompensated', group: 'Cause removed', where: 'After the cause is treated',
    chapters: [{ label: 'Decompensated' }, { at: 'abstain', label: 'Abstinent, on carvedilol' }, { at: 'diurOff', label: 'Diuretics stopped' }, { at: 'recomp', label: 'Recompensated' }],
    preset: 'cirr-decomp', days: 720,
    ramps: [{ key: 'cirrhosis', from: 0, to: 420, a: 0.85, b: 0.6 }, { key: 'albumin', from: 0, to: 420, a: 2.8, b: 3.9 }],
    quiet: ['cirrhosis', 'albumin'], still: true, settle: 14,
    steps: [
      { day: 1, id: 'abstain', note: { title: 'Abstinent from alcohol', detail: 'The cause is removed. The fibrosis can start to regress, and the liver to work better.', sev: 'ok' } },
      { day: 10, id: 'carvedilol', set: { drugs: { carvedilol: true } }, detail: 'Portal hypertension with ascites: 6.25 mg a day, then 12.5 mg a day, while the systolic pressure stays above 90 and the kidneys hold.' },
      { day: 250, id: 'diurOff', set: { diuretics: false }, label: 'Diuretics stopped', detail: 'The ascites has been gone for weeks: spironolactone and furosemide are stopped, and the fluid does not come back.' },
      { day: 620, id: 'recomp', note: { title: 'Recompensated', detail: 'Over a year without alcohol, with no ascites off diuretics, no bleed and no confusion, and the albumin back up (Baveno VIII). Carvedilol goes on while the portal hypertension lasts.', sev: 'ok' } },
    ],
    story: 'Decompensated alcohol cirrhosis with ascites. Abstinent from Day {abstain}, carvedilol from Day {carvedilol}. The fluid is gone by Day {diurOff} and diuretics stop; a year later, on Day {recomp}, the patient is recompensated.',
    path: 'Abstinence, carvedilol, diuretics stop',
    state: ['hvpg', 'ascites', 'meds'],
    // (abstinence is the liver's own change; recompensation is the sinusoid's resistance falling as the fibrosis regresses)
    play: { stops: [
      { at: { day: 0 }, look: [L.ascites] },
      { at: 'abstain', cam: 'liver', look: [L.stiffness] },
      { at: 'diurOff', look: [L.ascites] },
      { at: 'recomp', view: 'lobule', cam: 'lobule:sinusoid', look: [L.hvpg, L.stiffness] },
    ] },
  },
  {
    id: 'hist-psvd', name: 'PSVD: a bleed with a normal HVPG', short: 'PSVD bleed, normal HVPG', group: 'Without cirrhosis', where: 'Porto-sinusoidal vascular disorder',
    chapters: [{ label: 'Large varices, normal HVPG' }, { at: 'bleed', label: 'The bleed' }, { at: 'carvedilol', label: 'Carvedilol and bands' }, { at: 'band3', label: 'After the last band' }],
    preset: 'psvd', days: 300,
    quiet: ['albumin'], still: true,
    steps: [
      { day: 20, id: 'bleed', act: 'bleed' },
      { day: 20, id: 'vasoactive', set: { drugs: { terlipressin: true } }, label: 'Terlipressin', detail: `A vasoactive drug for the bleed, for four days. ${ANTIBIOTICS}` },
      { day: 20, id: 'band', act: 'band', detail: 'Banding at endoscopy: large varices, and no cirrhosis on the biopsy. The HVPG is normal because the block is before the sinusoids, and it says nothing of the bleeding risk (Baveno VIII).' },
      { day: 24, id: 'carvedilol', set: { drugs: { terlipressin: false, carvedilol: true } }, detail: 'Secondary prophylaxis: a beta-blocker with banding, 12.5 mg a day.' },
      { day: 48, id: 'band2', act: 'band', detail: 'Banding again, every 2 to 4 weeks, until the varices are gone.' },
      { day: 76, id: 'band3', act: 'band', detail: 'The third session: the varices are small and the program ends. Endoscopy again at 3 to 6 months, then every year.' },
    ],
    story: 'Large varices bleed on Day {bleed} with an HVPG that is normal. A band and a vasoactive drug that day, carvedilol from Day {carvedilol}, and two more bands, to Day {band3}. The HVPG stays low, and the PPG, from the portal vein, stays high.',
    path: 'Bleed, band, carvedilol, more bands',
    state: ['hvpg', 'ppg', 'meds'],
    // (the block is before the sinusoids, at the portal triad: the HVPG is normal there and says nothing of the risk, which is the case's point)
    play: { stops: [
      { at: { day: 0 }, view: 'lobule', cam: 'lobule:triad', look: [L.hvpg, L.endoscopy] },
      { at: 'bleed', look: [L.endoscopy, L.hvpgNormal] },
      { at: 'band2', look: [L.endoscopy] },
      { at: 'band3', look: [L.endoscopy] },
      { at: { day: 300 }, look: [L.hvpg, L.along] },
    ] },
  },
  {
    id: 'hist-brto', name: 'Gastric varix bleed, BRTO', group: 'After a bleed', where: 'Varices and banding',
    chapters: [{ label: 'Before the bleed' }, { at: 'bleed', label: 'The gastric bleed' }, { at: 'brto', label: 'After BRTO' }, { at: 'carvedilol', label: 'New esophageal varices' }],
    preset: 'gastric-varix', days: 240,
    quiet: ['albumin'], still: true, settle: 14,
    steps: [
      { day: 20, id: 'bleed', act: 'bleed', site: 'GV' },
      { day: 20, id: 'vasoactive', set: { drugs: { terlipressin: true } }, label: 'Terlipressin', detail: `A vasoactive drug for the bleed from a gastric varix, for up to 5 days. ${ANTIBIOTICS}` },
      { day: 20, id: 'glue', set: { occluded: { C2: true } }, stopsBleed: 'Bleeding controlled by EUS coils and glue', label: 'EUS coils and glue',
        detail: 'Endoscopy within 12 hours. A band cannot close a varix this large: EUS-guided coils hold cyanoacrylate glue in it, the varix is obliterated and the bleeding stops (Baveno VIII). The gastrorenal shunt stays open, so it is closed next.' },
      { day: 23, id: 'brto', set: { drugs: { terlipressin: false }, occluded: { C5: true } }, label: 'BRTO', detail: 'Balloon-occluded retrograde transvenous obliteration of the gastrorenal shunt, three days after the bleed. The varix thromboses; the portal pressure and the ascites can rise afterwards.' },
      { day: 40, id: 'carvedilol', set: { drugs: { carvedilol: true } }, detail: 'Endoscopy after the BRTO finds new large esophageal varices: carvedilol, 12.5 mg a day.' },
      { day: 47, id: 'band', act: 'band', detail: 'The first band session on the new esophageal varices.' },
      { day: 75, id: 'band2', act: 'band', detail: 'A second session, a month on.' },
      { day: 103, id: 'band3', act: 'band', detail: 'The third session, to eradicate them.' },
    ],
    story: 'A fundal varix bleeds on Day {bleed}. A vasoactive drug and antibiotics, EUS-guided coils and glue the same day, then BRTO on Day {brto}. The shunt that fed it is closed, the portal pressure rises, and new esophageal varices need carvedilol from Day {carvedilol} and bands to Day {band3}.',
    path: 'Bleed, BRTO, then the esophageal varices',
    state: ['ppg', 'meds'],
    // (the fundal varix and its shunt on the fundus, as the gastric varices deck frames BRTO; the esophageal varices after it at endoscopy. The bleed stops are the bleed's own: it bleeds at the
    // fundus, where the esophageal scope has nothing to see, and the glue that stops it is watched on the figure: case/looks.ts GLUE_LOOK, the stops' default for a fundal bleed)
    play: { stops: [
      { at: 'brto', look: [L.along, L.endoscopy] },
      { at: { day: 29 }, look: [L.endoscopy] },
      { at: 'carvedilol', look: [L.endoscopy] },
    ] },
  },
  {
    id: 'hist-pregnancy', name: 'Cirrhosis in pregnancy', group: 'Pregnancy', where: 'Varices in pregnancy',
    chapters: [{ label: 'Before pregnancy' }, { at: 'preg', label: 'Pregnant' }, { at: 'prop', label: 'Second trimester: propranolol and bands' }, { at: 'delivery', label: 'After delivery' }],
    preset: 'csph', days: 330, init: { cirrhosis: 0.65 },
    ramps: [{ key: 'gestation', from: 30, to: 254, a: 6, b: 38 }],
    quiet: ['cirrhosis', 'gestation'], still: true,
    steps: [
      { day: 30, id: 'preg', set: { gestation: 6 }, label: 'Pregnant, 6 weeks', detail: 'Compensated cirrhosis with small varices, a planned pregnancy.' },
      { day: 114, id: 'prop', set: { drugs: { propranolol: true } }, detail: 'Endoscopy at 18 weeks: large varices with red signs. Propranolol, 20 mg twice a day, raised to a heart rate of 55 to 60. It is the usual beta-blocker in pregnancy.' },
      { day: 128, id: 'band', act: 'band', detail: 'Banding at 20 weeks, because the varices are large and high risk.' },
      { day: 156, id: 'band2', act: 'band', detail: 'A second session at 24 weeks. The varices stay small for the delivery.' },
      { day: 254, id: 'delivery', set: { gestation: 0 }, label: 'Delivery', detail: 'Vaginal delivery at 38 weeks with a short second stage. The propranolol goes on after, as it is safe in breastfeeding.' },
    ],
    story: 'Compensated cirrhosis; pregnant on Day {preg}. The blood volume and the portal flow rise and the varices grow, so propranolol from Day {prop} and bands on Day {band} and {band2}. Delivery on Day {delivery}.',
    path: 'Pregnancy, propranolol, bands, delivery',
    state: ['hvpg', 'meds'],
    // (pregnancy raises the blood volume and the flow into the gut and the spleen, and delivery lets it fall: both on the Circuit's splanchnic inflow, in the flow lens)
    play: { stops: [
      { at: 'preg', view: 'circuit', cam: 'splanchnic', lens: 'flow', look: [L.overTime] },
      { at: { day: 58 }, look: [L.endoscopy] },
      { at: 'prop', look: [L.endoscopy] },
      { at: 'delivery', view: 'circuit', cam: 'splanchnic', lens: 'flow', look: [L.overTime] },
    ] },
  },
  {
    id: 'hist-cardiac', name: 'Cardiac cirrhosis', group: 'Clots and outflow', where: 'Portal vein and hepatic veins',
    chapters: [{ label: 'Congestion from the right heart' }, { at: 'diur', label: 'On diuretics' }, { at: 'hf', label: 'After the tricuspid repair' }],
    preset: 'rhf', days: 300, init: { cirrhosis: 0.2 },
    quiet: ['cirrhosis', 'albumin'], still: true, settle: 14,
    steps: [
      { day: 20, id: 'diur', set: { diuretics: true }, detail: 'A loop diuretic with spironolactone for the fluid. The liver is congested by the failing right heart, not blocked.' },
      { day: 120, id: 'hf', set: { tr: 0.15, contractility: 0.8 }, label: 'Tricuspid repair and heart failure treatment', detail: 'A transcatheter repair of the tricuspid valve, and treatment of the failing heart: the right atrial pressure falls and the liver decongests.' },
    ],
    story: 'Years of right heart failure and tricuspid regurgitation have congested the liver. Diuretics from Day {diur}, a tricuspid repair on Day {hf}. The HVPG stays normal throughout: both wedged and free pressures are high.',
    path: 'Diuretics, then the valve is repaired',
    state: ['hvpg', 'ascites', 'meds'],
    // (the congestion runs back from the right heart through the hepatic veins, the liver to the right atrium; the diuretics are for the fluid; the HVPG stays normal)
    play: { stops: [
      { at: { day: 0 }, cam: 'route', look: [L.hvpg, L.along] },
      { at: 'diur', cam: 'fit', look: [L.ascites] },
      { at: 'hf', look: [L.hvpg, L.along] },
      { at: { day: 300 }, cam: 'route', look: [L.hvpg, L.ascites] },
    ] },
  },
];

export const courseOf = (id: string): Course | undefined => COURSES.find((c) => c.id === id);
/** The day of each named step. */
export const dayOfStep = (c: Course, id: string): number => c.steps.find((s) => s.id === id)?.day ?? NaN;
/** The story with each {id} put to its step's day. */
export const storyOf = (c: Course): string => c.story.replace(/\{(\w+)\}/g, (_, id: string) => String(dayOfStep(c, id)));
