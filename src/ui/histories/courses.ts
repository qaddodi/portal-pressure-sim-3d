// The five model patients' courses (the Histories tab), written as the steps a clinician takes, in Baveno VIII's order: what is tried first, what is added when it fails, what is done
// when that is not enough. Each is played on the real engine by scripts/gen-histories.mjs (play.ts): the numbers, the events and the days are the model's, never typed here.
//   Bleed: carvedilol once portal hypertension is clinically significant; a bleed despite it is a vasoactive drug and a band the same day; a pre-emptive TIPS within 72 hours for a patient at
//          high risk of rebleeding.
//   Ascites: diuretics, then large-volume paracentesis with albumin, and a TIPS when the fluid keeps coming back (refractory ascites).
//   Acute portal vein thrombosis: anticoagulation at once.
//   Budd-Chiari: anticoagulation, then angioplasty of a hepatic vein that can be opened (a TIPS only when that is not enough).
//   TIPS that has narrowed: the stent's lumen closes over months, the gradient and the fluid come back; Doppler shows it.
import type { Course } from './types.ts';

export const COURSES: readonly Course[] = [
  {
    id: 'hist-bleed', name: 'Cirrhosis, first bleed', group: 'After a bleed', where: 'Varices and banding',
    preset: 'cirr-comp', days: 120, init: { nsbbGain: 0.45 },
    ramps: [{ key: 'cirrhosis', from: 0, to: 55, a: 0.4, b: 0.86 }],
    quiet: ['cirrhosis', 'albumin'],
    steps: [
      { day: 19, id: 'carvedilol', set: { drugs: { carvedilol: true } }, detail: 'Started once the portal hypertension was clinically significant.' },
      { day: 70, id: 'bleed', act: 'bleed' },
      { day: 70, id: 'vasoactive', set: { drugs: { terlipressin: true } }, label: 'Terlipressin', detail: 'A vasoactive drug for the bleed, for three days.' },
      { day: 70, id: 'band', act: 'band', detail: 'Endoscopic band ligation at the first endoscopy.' },
      { day: 73, id: 'tips', set: { drugs: { terlipressin: false, carvedilol: false }, tips: { on: true, d: 8 } },
        detail: 'Pre-emptive, within 72 hours of the bleed: a patient at high risk of rebleeding. The beta-blocker is not needed with a TIPS.' },
    ],
    story: 'On carvedilol from Day {carvedilol}, the patient bled on Day {bleed}. A vasoactive drug and a band the same day, then a pre-emptive TIPS on Day {tips}.',
    path: 'Carvedilol, a bleed, banding, TIPS',
    state: ['tips', 'ppg', 'meds'],
  },
  {
    id: 'hist-ascites', name: 'Refractory ascites', group: 'Ascites', where: 'Fluid in the abdomen',
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
  },
  {
    id: 'hist-pvt', name: 'Acute portal vein thrombosis', group: 'Clots and outflow', where: 'Portal vein and hepatic veins',
    preset: 'pvt-acute', days: 105,
    quiet: ['thr:'],
    steps: [
      { day: 1, id: 'anticoag', set: { anticoag: true }, detail: 'Started at once, and kept up while the clot clears.' },
    ],
    story: 'A fresh clot in the main portal vein. Anticoagulation from Day {anticoag}; the clot slowly clears and the pressure comes down.',
    path: 'Anticoagulation, the clot clears',
    state: ['clot', 'ppg', 'meds'],
  },
  {
    id: 'hist-bcs', name: 'Budd-Chiari syndrome', group: 'Clots and outflow', where: 'Portal vein and hepatic veins',
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
  },
  {
    id: 'hist-tips-narrowed', name: 'TIPS that has narrowed', group: 'After a TIPS', where: 'Follow-up',
    preset: 'cirr-decomp', days: 190,
    ramps: [{ key: 'stenosis.TIPS', from: 50, to: 185, a: 0, b: 0.5 }],
    quiet: ['sten:', 'albumin'],
    settle: 14,
    steps: [
      { day: 10, id: 'tips', set: { tips: { on: true, d: 8 } }, detail: 'For ascites that diuretics did not control.' },
      { day: 140, id: 'doppler', note: { title: 'Doppler shows a narrowed TIPS', detail: 'Slow flow through the stent, and the fluid is coming back.', sev: 'caution' } },
    ],
    story: 'A TIPS on Day {tips} for fluid that diuretics did not control. Months later the stent narrows and the pressure and the fluid climb back; Doppler shows it on Day {doppler}.',
    path: 'TIPS, then the stent narrows',
    state: ['tips', 'ppg', 'ascites'],
  },
];

export const courseOf = (id: string): Course | undefined => COURSES.find((c) => c.id === id);
/** The day of each named step. */
export const dayOfStep = (c: Course, id: string): number => c.steps.find((s) => s.id === id)?.day ?? NaN;
/** The story with each {id} put to its step's day. */
export const storyOf = (c: Course): string => c.story.replace(/\{(\w+)\}/g, (_, id: string) => String(dayOfStep(c, id)));
