// Three kinds of slide change, three motions (2D slide-motion.js, first-principles item 14, 11 Nov 2026), and how long the figure's own change takes.
//   new patient   a slide that loads a preset: the figure dips, the patient is changed unseen, and the figure comes back as someone else (an eased opacity change, never a morph between two people)
//   time passing  a slide with a time-lapse: its days play on the live figure
//   same patient treated (params, an action, a procedure): the model eases to the slide's state
// (lap: the slide plays its time-lapse; pre: it plays a procedure from the state before it. Both keep their own ways in.) Pure, so a test reads it.
import type { CopiedSlide } from './types.ts';

export const MORPH_ONE_MS = 1200;   // the patient's change under a camera glide (2D presenter.js MORPH_ONE_MS)
export const MORPH_CATH_MS = 2000;  // ... on a catheter or an instrument slide, which has its own pace (2D MORPH_MS)

export const freshPatient = (s: Pick<CopiedSlide, 'preset'> | null | undefined, lap: boolean, pre: boolean): boolean => !!s?.preset && !lap && !pre;

export function changeKind(s: Pick<CopiedSlide, 'preset' | 'lapse' | 'params' | 'action' | 'procedure'> | null | undefined, lap: boolean, pre: boolean): 'patient' | 'time' | 'treat' | 'same' {
  if (freshPatient(s, lap, pre)) return 'patient';
  if (lap || s?.lapse) return 'time';
  return s?.params || s?.action || s?.procedure ? 'treat' : 'same';
}

/** How long the figure takes to ease to a slide's state when the patient stays (2D: MORPH_ONE_MS under a glide; a slide with a catheter or an instrument keeps the longer one). */
export const morphMsFor = (s: Pick<CopiedSlide, 'cath' | 'tool'> | null | undefined): number => (s?.cath || s?.tool ? MORPH_CATH_MS : MORPH_ONE_MS);

/** Back from the slide after lands on a slide done (2D presenter.js `done = back && lastAt === to + 1`); any other way in is a forward arrival. */
export const landsDone = (from: number, stop: number): boolean => from === stop + 1;

/** Whether a slide lands on its state BEFORE its procedure (2D presenter.js `pre`): it plays a procedure, has changes of its own that hold the procedure's result, and is not a time-lapse nor
 *  reached by Back from the next slide. The patient then has no TIPS yet, the shunt still open, the balloon down; only the run's `apply` gives the result, and the words keep the numbers it ends on.
 *  (`hasBefore`: the deck's states hold a before-state for the slide.) */
export const opensBefore = (s: Pick<CopiedSlide, 'procedure' | 'lapse'> | null | undefined, hasBefore: boolean, done: boolean, lap = false): boolean => !!s?.procedure && !s.lapse && !lap && !done && hasBefore;
