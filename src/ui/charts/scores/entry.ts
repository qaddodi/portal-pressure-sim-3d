// The registry entry of the liver-function card: Child–Pugh and MELD / MELD-Na (tool kind 'scores'). Specimens are made-up cases, not a patient.
import type { ChartKind } from '../registry.ts';
import { scoresFrame } from './frame.ts';
import { scoresOf } from './model.ts';

export const scoresEntry: ChartKind = {
  kind: 'scores', what: 'Child–Pugh and MELD: each component, the total and class, MELD and MELD-Na', slides: 5, status: 'done',
  specimens: [
    { id: 'c11', label: 'Child–Pugh C 11, MELD 23, for a preemptive TIPS', build: (c) => scoresFrame(scoresOf({ bili: 5.2, inr: 2.4, creatinine: 1.1, ascites: 'mild', he: 'none', focus: 'preemptive' }, 2.8), c) },
    { id: 'a5', label: 'Child–Pugh A5, with a sodium (MELD-Na)', build: (c) => scoresFrame(scoresOf({ bili: 0.9, inr: 1.1, creatinine: 0.9, na: 138, ascites: 'none', he: 'none', focus: 'recompensation' }, 4), c) },
    { id: 'missing', label: 'A component not given: no total is guessed', build: (c) => scoresFrame(scoresOf({ bili: 1, inr: 1.2, creatinine: 1 }, 3.9), c) },
  ],
};
